import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { adminProcedure, protectedProcedure, router } from '../trpc';
import { mapTxn } from '../mappers';
import { round2 } from '../../../src/lib/format';
import type { Context } from '../context';

async function balanceOf(db: Context['db'], userId: string): Promise<number> {
  const txns = await db.txn.findMany({ where: { userId, status: 'success' } });
  return round2(txns.reduce((sum, t) => sum + Number(t.amount), 0));
}

async function lockedOf(db: Context['db'], userId: string): Promise<number> {
  const pending = await db.txn.findMany({ where: { userId, type: 'withdrawal', status: 'pending' } });
  return round2(pending.reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0));
}

export const walletRouter = router({
  deposit: protectedProcedure
    .input(z.object({ amount: z.number().positive(), provider: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const txn = await ctx.db.txn.create({
        data: {
          userId: ctx.currentUser.id,
          type: 'deposit',
          amount: round2(input.amount),
          status: 'success',
          ref: `${input.provider.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`,
        },
      });
      return mapTxn(txn);
    }),

  requestWithdrawal: protectedProcedure
    .input(z.object({ amount: z.number().positive(), momoNumber: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const [balance, locked] = await Promise.all([
        balanceOf(ctx.db, ctx.currentUser.id),
        lockedOf(ctx.db, ctx.currentUser.id),
      ]);
      const available = round2(balance - locked);
      if (round2(input.amount) > available) return { error: 'Insufficient available balance' };
      const txn = await ctx.db.txn.create({
        data: {
          userId: ctx.currentUser.id,
          type: 'withdrawal',
          amount: -round2(input.amount),
          status: 'pending',
          ref: `WD-${Date.now().toString(36).toUpperCase()}`,
          meta: { momo: input.momoNumber },
        },
      });
      return { txn: mapTxn(txn) };
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

  resolveWithdrawal: adminProcedure
    .input(z.object({ txnId: z.string(), approve: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const txn = await ctx.db.txn.findUnique({ where: { id: input.txnId } });
      if (!txn || txn.type !== 'withdrawal' || txn.status !== 'pending') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Withdrawal not found or already resolved' });
      }
      await ctx.db.$transaction(async (tx) => {
        await tx.txn.update({ where: { id: txn.id }, data: { status: input.approve ? 'success' : 'failed', resolvedAt: new Date() } });
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
