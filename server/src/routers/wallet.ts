import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { adminProcedure, protectedProcedure, router } from '../trpc';
import { mapTxn } from '../mappers';
import { round2 } from '../../../src/lib/format';
import { LIMITS } from '../../../src/lib/limits';
import type { Context } from '../context';

async function balanceOf(db: Context['db'], userId: string): Promise<number> {
  const txns = await db.txn.findMany({ where: { userId, status: 'success' } });
  return round2(txns.reduce((sum, t) => sum + Number(t.amount), 0));
}

async function lockedOf(db: Context['db'], userId: string): Promise<number> {
  const pending = await db.txn.findMany({ where: { userId, type: 'withdrawal', status: 'pending' } });
  return round2(pending.reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0));
}

/** Thrown inside `requestWithdrawal`'s `$transaction` callback to
 *  abort/rollback and signal "insufficient balance" back to the caller as a
 *  normal `{ error }` response. The balance is re-read from the transaction
 *  client (not a pre-transaction snapshot) so this check races correctly
 *  against concurrent withdrawal requests and bet placements on the same
 *  user. */
class InsufficientWithdrawalBalanceError extends Error {}

/** Thrown inside `resolveWithdrawal`'s `$transaction` callback when the
 *  locked withdrawal row is missing or already resolved — guards against a
 *  concurrent `resolveWithdrawal`/`sweepWithdrawals` racing on the same
 *  txn. */
class WithdrawalNotPendingError extends Error {}

export const walletRouter = router({
  deposit: protectedProcedure
    .input(z.object({ amount: z.number().positive(), provider: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const amt = round2(input.amount);
      if (amt < LIMITS.minDeposit || amt > LIMITS.maxDeposit) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Deposit must be between ${LIMITS.minDeposit} and ${LIMITS.maxDeposit}`,
        });
      }
      const txn = await ctx.db.txn.create({
        data: {
          userId: ctx.currentUser.id,
          type: 'deposit',
          amount: amt,
          status: 'success',
          ref: `${input.provider.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`,
        },
      });
      return mapTxn(txn);
    }),

  requestWithdrawal: protectedProcedure
    .input(z.object({ amount: z.number().positive(), momoNumber: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const amt = round2(input.amount);
      if (amt < LIMITS.minWithdrawal || amt > LIMITS.maxWithdrawal) {
        return { error: `Withdrawal must be between ${LIMITS.minWithdrawal} and ${LIMITS.maxWithdrawal}` };
      }
      try {
        const txn = await ctx.db.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${ctx.currentUser.id} FOR UPDATE`;
          const [successTxns, pendingWithdrawals] = await Promise.all([
            tx.txn.findMany({ where: { userId: ctx.currentUser.id, status: 'success' } }),
            tx.txn.findMany({ where: { userId: ctx.currentUser.id, type: 'withdrawal', status: 'pending' } }),
          ]);
          const balance = round2(successTxns.reduce((sum, t) => sum + Number(t.amount), 0));
          const locked = round2(pendingWithdrawals.reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0));
          const available = round2(balance - locked);
          if (amt > available) throw new InsufficientWithdrawalBalanceError();
          return tx.txn.create({
            data: {
              userId: ctx.currentUser.id,
              type: 'withdrawal',
              amount: -amt,
              status: 'pending',
              ref: `WD-${Date.now().toString(36).toUpperCase()}`,
              meta: { momo: input.momoNumber },
            },
          });
        });
        return { txn: mapTxn(txn) };
      } catch (err) {
        if (err instanceof InsufficientWithdrawalBalanceError) return { error: 'Insufficient available balance' };
        throw err;
      }
    }),

  listTxns: protectedProcedure.query(async ({ ctx }) => {
    const txns = await ctx.db.txn.findMany({
      where: { userId: ctx.currentUser.id },
      orderBy: { createdAt: 'desc' },
    });
    return txns.map(mapTxn);
  }),

  // Admin-only, and deliberately separate from listTxns: that query is
  // self-scoped to the caller (protectedProcedure has no way to see another
  // user's ledger, by design), so the admin withdrawals queue needs its own
  // cross-user query rather than reusing listTxns under an admin's own
  // session.
  listPendingWithdrawals: adminProcedure.query(async ({ ctx }) => {
    const txns = await ctx.db.txn.findMany({
      where: { type: 'withdrawal', status: 'pending' },
      orderBy: { createdAt: 'asc' },
    });
    return txns.map(mapTxn);
  }),

  // Admin-only, cross-user — mirrors listPendingWithdrawals/listOpenBets:
  // the admin UsersAdmin screen needs every listed user's balance/locked
  // figures, which a self-scoped `useWallet` store can never provide for
  // anyone but the signed-in admin.
  balancesFor: adminProcedure
    .input(z.object({ userIds: z.array(z.string()) }))
    .query(async ({ ctx, input }) => {
      return Promise.all(
        input.userIds.map(async (userId) => ({
          userId,
          balance: await balanceOf(ctx.db, userId),
          locked: await lockedOf(ctx.db, userId),
        }))
      );
    }),

  resolveWithdrawal: adminProcedure
    .input(z.object({ txnId: z.string(), approve: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await ctx.db.$transaction(async (tx) => {
          const lockedRows = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT "id" FROM "Txn" WHERE "id" = ${input.txnId} FOR UPDATE
          `;
          if (lockedRows.length === 0) throw new WithdrawalNotPendingError();
          const txn = await tx.txn.findUnique({ where: { id: input.txnId } });
          if (!txn || txn.type !== 'withdrawal' || txn.status !== 'pending') {
            throw new WithdrawalNotPendingError();
          }
          await tx.txn.update({
            where: { id: txn.id },
            data: { status: input.approve ? 'success' : 'failed', resolvedAt: new Date() },
          });
          if (!input.approve) {
            await tx.txn.create({
              data: {
                userId: txn.userId,
                type: 'refund',
                amount: Math.abs(Number(txn.amount)),
                status: 'success',
                ref: `REFUND-${txn.ref}`,
                meta: { reason: 'Withdrawal rejected' },
                resolvedAt: new Date(),
              },
            });
          }
        });
        return { ok: true };
      } catch (err) {
        if (err instanceof WithdrawalNotPendingError) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Withdrawal not found or already resolved' });
        }
        throw err;
      }
    }),

  adminAdjust: adminProcedure
    .input(z.object({ userId: z.string(), amount: z.number(), reason: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const txn = await ctx.db.txn.create({
        data: {
          userId: input.userId,
          type: 'adjustment',
          amount: round2(input.amount),
          status: 'success',
          ref: `ADJ-${input.reason}`,
          resolvedAt: new Date(),
        },
      });
      return mapTxn(txn);
    }),
});

export { balanceOf, lockedOf };
