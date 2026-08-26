import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { protectedProcedure, router } from '../trpc';
import { round2 } from '../../../src/lib/format';
import { LIMITS } from '../../../src/lib/limits';
import { validateSlipSelections, validateStake, potentialFor } from '../../../src/lib/betsMath';
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

const matchStatusSchema = z.enum(['upcoming', 'live', 'finished', 'postponed', 'cancelled']);

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
});

export { newBetId, newBookingCode };
