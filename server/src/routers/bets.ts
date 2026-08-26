import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { protectedProcedure, router } from '../trpc';
import { round2 } from '../../../src/lib/format';
import { LIMITS } from '../../../src/lib/limits';
import { validateSlipSelections, validateStake, potentialFor } from '../../../src/lib/betsMath';
import { cashoutValue, type MatchCashoutInput } from '../../../src/lib/cashout';
import { mapBet } from '../mappers';
import type { BetLeg } from '../../../src/lib/types';

/** Thrown inside the `$transaction` callback to abort/rollback and signal
 *  "insufficient balance" back out to the caller as a normal `{ ok: false }`
 *  response rather than an unhandled error. The balance is re-read from the
 *  transaction client (not the pre-transaction snapshot) so this check races
 *  correctly against concurrent `place` calls on the same user. */
class InsufficientBalanceError extends Error {
  constructor(public available: number) {
    super('Insufficient balance');
  }
}

/** Thrown inside `cashOut`'s `$transaction` callback to abort/rollback and
 *  signal a normal `{ ok: false }` response back to the caller. The bet's
 *  status is re-checked from a row locked with `SELECT ... FOR UPDATE`
 *  inside the transaction (not a pre-transaction snapshot), so this guards
 *  correctly against two concurrent `cashOut` calls on the same bet both
 *  reading `status: 'open'` and both crediting the wallet. */
class BetNotActiveError extends Error {}

const matchStatusSchema = z.enum(['upcoming', 'live', 'finished', 'postponed', 'cancelled']);

const matchSnapshotInput = z.object({
  id: z.string(),
  status: matchStatusSchema,
  score: z.object({ home: z.number(), away: z.number() }).optional(),
  minute: z.number().optional(),
  markets: z.array(
    z.object({
      key: z.string(),
      suspended: z.boolean(),
      outcomes: z.array(z.object({ code: z.string(), odds: z.number(), suspended: z.boolean().optional() })),
    })
  ),
});

const legInput = z.object({
  matchId: z.string(),
  matchName: z.string(),
  leagueName: z.string(),
  marketKey: z.string(),
  marketName: z.string(),
  outcomeCode: z.string(),
  outcomeLabel: z.string(),
  odds: z.number().positive(),
  kickoff: z.number(),
  status: z.literal('open'),
  matchStatus: matchStatusSchema,
  marketSuspended: z.boolean(),
  outcomeSuspended: z.boolean(),
});

function newBookingCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 8; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

function newBetId(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `BET-${ymd}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export const betsRouter = router({
  place: protectedProcedure
    .input(
      z.object({
        type: z.enum(['single', 'multi', 'system', 'builder']),
        stakePerCombo: z.number(),
        legs: z.array(legInput).min(1),
        systemPicks: z.number().optional(),
        useBonus: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { type, legs, systemPicks = 3 } = input;
      const useBonus = input.useBonus ?? 0;

      const selectionCheck = validateSlipSelections(legs, type);
      if (!selectionCheck.ok) return { ok: false, error: selectionCheck.error };

      for (const leg of legs) {
        if (leg.matchStatus === 'cancelled' || leg.matchStatus === 'postponed') {
          return { ok: false, error: `Event unavailable: ${leg.matchName}` };
        }
        if (leg.matchStatus === 'finished') {
          return { ok: false, error: `Event already finished: ${leg.matchName}` };
        }
        if (leg.marketSuspended) return { ok: false, error: `Market suspended: ${leg.marketName}` };
        if (leg.outcomeSuspended) return { ok: false, error: `Selection unavailable: ${leg.outcomeLabel}` };
      }

      const stakeVal = round2(input.stakePerCombo);
      const stakeCheck = validateStake(stakeVal);
      if (!stakeCheck.ok) return { ok: false, error: stakeCheck.error };

      const picksForSystem = Math.min(systemPicks, Math.max(2, legs.length - 1));
      const totals = potentialFor(type, stakeVal, legs, picksForSystem);
      const totalStake = round2(totals.comboCount * stakeVal);
      if (totals.potential > LIMITS.maxPayout) {
        return { ok: false, error: `Maximum payout is ${LIMITS.maxPayout.toLocaleString()}` };
      }

      const bookingCode = newBookingCode();
      const storedLegs: BetLeg[] = legs.map((l) => ({
        matchId: l.matchId,
        matchName: l.matchName,
        leagueName: l.leagueName,
        marketKey: l.marketKey as BetLeg['marketKey'],
        marketName: l.marketName,
        outcomeCode: l.outcomeCode,
        outcomeLabel: l.outcomeLabel,
        odds: l.odds,
        kickoff: l.kickoff,
        status: 'open',
      }));

      try {
        const betIds = await ctx.db.$transaction(async (tx) => {
          // Lock the user row first so concurrent `place` calls for the same
          // user serialize on this statement: a second call blocks here
          // until the first commits, then its balance/bonus reads below see
          // the first call's committed Txn/User writes (fresh per-statement
          // read under Postgres's default Read Committed isolation) instead
          // of a stale pre-transaction snapshot. This is what prevents two
          // concurrent bets from both passing the balance check and
          // overdrawing the wallet.
          const lockedUsers = await tx.$queryRaw<Array<{ bonusBalance: unknown }>>`
            SELECT "bonusBalance" FROM "User" WHERE "id" = ${ctx.currentUser.id} FOR UPDATE
          `;
          const currentBonusBalance = Number(lockedUsers[0]?.bonusBalance ?? 0);

          const successTxns = await tx.txn.findMany({ where: { userId: ctx.currentUser.id, status: 'success' } });
          const available = round2(successTxns.reduce((sum, t) => sum + Number(t.amount), 0));

          const bonusToUse = Math.min(round2(useBonus), currentBonusBalance, totalStake);
          const cashNeeded = round2(totalStake - bonusToUse);
          if (cashNeeded > available) {
            throw new InsufficientBalanceError(available);
          }

          const rows: Array<{ legs: BetLeg[]; stake: number; totalOdds: number; potential: number; usedBonus: number }> =
            type === 'single'
              ? storedLegs.map((leg, idx) => ({
                  legs: [leg],
                  stake: stakeVal,
                  totalOdds: round2(leg.odds),
                  potential: round2(stakeVal * leg.odds),
                  usedBonus: idx === 0 ? bonusToUse : 0,
                }))
              : [
                  {
                    legs: storedLegs,
                    stake: totalStake,
                    totalOdds: totals.totalOdds,
                    potential: totals.potential,
                    usedBonus: bonusToUse,
                  },
                ];

          const ids: string[] = [];
          for (const row of rows) {
            const bet = await tx.bet.create({
              data: {
                id: newBetId(),
                userId: ctx.currentUser.id,
                bookingCode,
                type,
                stake: row.stake,
                totalOdds: row.totalOdds,
                potential: row.potential,
                comboCount: type === 'system' ? totals.comboCount : undefined,
                systemConfig: type === 'system' ? { picksPerCombo: picksForSystem } : undefined,
                legs: row.legs as unknown as Prisma.InputJsonValue,
                status: 'open',
                usedBonus: row.usedBonus,
              },
            });
            ids.push(bet.id);
          }
          await tx.txn.create({
            data: {
              userId: ctx.currentUser.id,
              type: 'stake',
              amount: -cashNeeded,
              status: 'success',
              ref: bookingCode,
              meta: bonusToUse > 0 ? { bonusUsed: bonusToUse } : undefined,
            },
          });
          if (bonusToUse > 0) {
            await tx.user.update({
              where: { id: ctx.currentUser.id },
              data: { bonusBalance: round2(currentBonusBalance - bonusToUse) },
            });
          }
          return ids;
        });

        return { ok: true, betIds };
      } catch (err) {
        if (err instanceof InsufficientBalanceError) {
          return { ok: false, error: `Insufficient balance. Available: ${err.available.toFixed(2)}` };
        }
        throw err;
      }
    }),

  listBets: protectedProcedure.query(async ({ ctx }) => {
    const bets = await ctx.db.bet.findMany({
      where: { userId: ctx.currentUser.id },
      orderBy: { placedAt: 'desc' },
    });
    return bets.map(mapBet);
  }),

  cashOut: protectedProcedure
    .input(z.object({ betId: z.string(), portion: z.number().min(0).max(1), matches: z.array(matchSnapshotInput) }))
    .mutation(async ({ ctx, input }) => {
      try {
        const amount = await ctx.db.$transaction(async (tx) => {
          // Lock the bet row first (scoped to this user) so a concurrent
          // cashOut on the same bet blocks here until the first commits,
          // then its status/legs read below sees the first call's
          // committed write instead of a stale pre-transaction snapshot.
          // This is what prevents two concurrent cash-outs from both
          // observing status 'open' and both crediting the wallet.
          const lockedRows = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT "id" FROM "Bet" WHERE "id" = ${input.betId} AND "userId" = ${ctx.currentUser.id} FOR UPDATE
          `;
          if (lockedRows.length === 0) throw new BetNotActiveError('Bet not found');

          const row = await tx.bet.findFirst({ where: { id: input.betId, userId: ctx.currentUser.id } });
          if (!row || row.status !== 'open') throw new BetNotActiveError('Bet not active');
          const bet = mapBet(row);

          const matchesById: Record<string, MatchCashoutInput> = {};
          for (const m of input.matches) matchesById[m.id] = m;
          const value = cashoutValue(bet, matchesById);
          if (!value.available) throw new BetNotActiveError(value.reason || 'Cash out unavailable');

          const amt = round2(value.amount * input.portion);

          if (input.portion < 1) {
            const cashoutHistory = [...(bet.cashoutHistory ?? []), { amount: amt, portion: input.portion, at: Date.now() }];
            await tx.bet.update({
              where: { id: bet.id },
              data: {
                stake: round2(bet.stake * (1 - input.portion)),
                potential: round2(bet.potential * (1 - input.portion)),
                cashoutHistory,
              },
            });
          } else {
            await tx.bet.update({
              where: { id: bet.id },
              data: { status: 'cashed_out', cashoutAmount: amt, payout: amt, settledAt: new Date() },
            });
          }
          await tx.txn.create({
            data: {
              userId: ctx.currentUser.id,
              type: 'cashout',
              amount: amt,
              status: 'success',
              ref: `CO-${bet.bookingCode}`,
              resolvedAt: new Date(),
            },
          });
          return amt;
        });

        return { ok: true, amount };
      } catch (err) {
        if (err instanceof BetNotActiveError) {
          return { ok: false, error: err.message || 'Bet not active' };
        }
        throw err;
      }
    }),
});

export { newBetId, newBookingCode };
