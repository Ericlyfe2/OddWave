import { create } from 'zustand';
import type { Bet, BetLeg } from '@/lib/types';
import { loadJson, saveJson } from '@/lib/storage';
import { uid, seededRng } from '@/lib/rng';
import { round2 } from '@/lib/format';
import { LIMITS } from '@/lib/config';
import { useWallet } from './wallet';
import { useAuth } from './auth';
import { useNotifs } from './notifs';
import { liveEngine } from '@/lib/liveEngine';
import { validateStake, potentialFor } from '@/lib/betsMath';
import { cashoutValue } from '@/lib/cashout';
import { settleBetAgainstMatch } from '@/lib/settlement';
import { logger } from '@/lib/logger';

interface PlaceInput {
  type: Bet['type'];
  stakePerCombo: number;
  legs: BetLeg[];
  systemPicks?: number;
  useBonus?: number;
}

interface BetsState {
  bets: Bet[];
  placing: boolean;
  lastPlacedIds: string[];
  placeBet: (input: PlaceInput) => Promise<{ ok: boolean; error?: string; betIds?: string[] }>;
  cashOut: (betId: string, portion: number) => Promise<{ ok: boolean; error?: string; amount?: number }>;
  settleOnMatchFinish: (matchId: string) => void;
  voidBet: (betId: string, reason: string) => void;
}

const codeRng = seededRng('booking-seed');

function newBookingCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 8; i++) {
    const n = Math.floor((codeRng() + Date.now() % 97 / 97) * alphabet.length);
    out += alphabet[n % alphabet.length];
  }
  return out;
}

function persist(bets: Bet[]): void {
  saveJson('bets', bets);
}

/** Human-readable, still-unique bet id, e.g. BET-20260824-8F72A1. */
function newBetId(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const suffix = uid('').toUpperCase().slice(-6);
  return `BET-${ymd}-${suffix}`;
}

export const useBets = create<BetsState>((set, get) => ({
  bets: loadJson<Bet[]>('bets', []),
  placing: false,
  lastPlacedIds: [],

  placeBet: async ({ type, stakePerCombo, legs, systemPicks = 3, useBonus = 0 }) => {
    const profile = useAuth.getState().profile;
    if (!profile) return { ok: false, error: 'Please sign in to place a bet' };
    if (profile.suspended) return { ok: false, error: 'Account suspended. Contact support.' };
    if (profile.rgLimits.selfExcludedUntil && profile.rgLimits.selfExcludedUntil > Date.now()) {
      return { ok: false, error: 'You are self-excluded from betting' };
    }
    if (legs.length === 0) return { ok: false, error: 'Add at least one selection' };

    // Structural checks the client is expected to have already enforced via
    // validateSlipSelections, re-run here because the client can't be trusted:
    // a stale UI, a hand-built request, or a race with a mode switch could all
    // submit legs that never should have reached this point.
    if (type === 'multi' && legs.length < 2) return { ok: false, error: 'Multi bets need at least 2 selections' };
    if (type === 'system' && legs.length < 3) return { ok: false, error: 'System bets need at least 3 selections' };
    if (type === 'builder') {
      const matchIds = new Set(legs.map((l) => l.matchId));
      if (matchIds.size !== 1) return { ok: false, error: 'Bet Builder combines markets from one match only' };
      if (legs.length < 2) return { ok: false, error: 'Bet Builder needs at least 2 markets' };
      const marketKeys = new Set<string>();
      for (const leg of legs) {
        if (marketKeys.has(leg.marketKey)) return { ok: false, error: `Only one selection per market allowed in Bet Builder (${leg.marketName})` };
        marketKeys.add(leg.marketKey);
      }
    }
    const seenLegs = new Set<string>();
    for (const leg of legs) {
      const legKey = `${leg.matchId}:${leg.marketKey}:${leg.outcomeCode}`;
      if (seenLegs.has(legKey)) return { ok: false, error: 'Duplicate selection found' };
      seenLegs.add(legKey);
    }
    if (type === 'multi' || type === 'system') {
      const matchIds = new Set<string>();
      for (const leg of legs) {
        if (matchIds.has(leg.matchId)) {
          return { ok: false, error: `Multiple selections from ${leg.matchName} can't be combined — use Bet Builder instead` };
        }
        matchIds.add(leg.matchId);
      }
    }

    const stakeVal = round2(stakePerCombo);
    const stakeCheck = validateStake(stakeVal);
    if (!stakeCheck.ok) return { ok: false, error: stakeCheck.error };

    for (const leg of legs) {
      const match = liveEngine.get(leg.matchId);
      if (!match || match.status === 'cancelled' || match.status === 'postponed') {
        return { ok: false, error: `Event unavailable: ${leg.matchName}` };
      }
      if (match.status === 'finished') {
        return { ok: false, error: `Event already finished: ${leg.matchName}` };
      }
      const market = match.markets.find((mk) => mk.key === leg.marketKey);
      if (!market || market.suspended) return { ok: false, error: `Market suspended: ${leg.marketName}` };
      const outcome = market.outcomes.find((o) => o.code === leg.outcomeCode);
      if (!outcome || outcome.suspended) return { ok: false, error: `Selection unavailable: ${leg.outcomeLabel}` };
      leg.odds = outcome.odds;
    }

    const picksForSystem = Math.min(systemPicks, Math.max(2, legs.length - 1));
    const totals = potentialFor(type, stakeVal, legs, picksForSystem);
    const totalStake = round2(totals.comboCount * stakeVal);
    if (totals.potential > LIMITS.maxPayout) return { ok: false, error: `Maximum payout is ${LIMITS.maxPayout.toLocaleString()}` };

    const wallet = useWallet.getState();
    const available = wallet.balanceOf(profile.id);
    const bonusToUse = Math.min(round2(useBonus), profile.bonusBalance, totalStake);
    const cashNeeded = round2(totalStake - bonusToUse);

    if (cashNeeded > available) {
      return { ok: false, error: `Insufficient balance. Available: ${available.toFixed(2)}` };
    }

    if (profile.rgLimits.lossLimit !== null) {
      const todayStart = new Date().setHours(0, 0, 0, 0);
      const todaysNet = wallet
        .userTxns(profile.id)
        .filter((t) => t.status === 'success' && t.createdAt >= todayStart)
        .reduce((s, t) => s + t.amount, 0);
      if (-todaysNet + cashNeeded > profile.rgLimits.lossLimit) {
        return { ok: false, error: 'Daily loss limit reached. Visit Responsible Gaming.' };
      }
    }

    set({ placing: true });
    await new Promise((r) => setTimeout(r, 450));

    const bookingCode = newBookingCode();
    const newBets: Bet[] = [];

    if (type === 'single') {
      legs.forEach((leg, idx) => {
        newBets.push({
          id: newBetId(),
          userId: profile.id,
          bookingCode,
          type: 'single',
          stake: stakeVal,
          totalOdds: round2(leg.odds),
          potential: round2(stakeVal * leg.odds),
          legs: [{ ...leg }],
          status: 'open',
          usedBonus: idx === 0 ? bonusToUse : 0,
          placedAt: Date.now(),
        });
      });
    } else {
      newBets.push({
        id: newBetId(),
        userId: profile.id,
        bookingCode,
        type,
        stake: totalStake,
        totalOdds: totals.totalOdds,
        potential: totals.potential,
        comboCount: type === 'system' ? totals.comboCount : undefined,
        systemConfig: type === 'system' ? { picksPerCombo: picksForSystem } : undefined,
        legs: legs.map((l) => ({ ...l })),
        status: 'open',
        usedBonus: bonusToUse,
        placedAt: Date.now(),
      });
    }

    const next = [...newBets, ...get().bets];
    const betIds = newBets.map((b) => b.id);
    set({ bets: next, placing: false, lastPlacedIds: betIds });
    persist(next);

    wallet.applyStake(profile.id, totalStake, bookingCode, bonusToUse);
    if (bonusToUse > 0) {
      // spendBonus, not updateProfile: the server no longer accepts a
      // client-supplied bonusBalance (that was a mintable-balance hole),
      // and updateProfile's response would otherwise overwrite the local
      // profile with the un-debited balance, making bonus stakes free and
      // infinitely reusable.
      useAuth.getState().spendBonus(bonusToUse);
    }

    useNotifs.getState().push({
      userId: profile.id,
      kind: 'bet_placed',
      title: 'Bet placed successfully',
      body: `${type === 'single' ? `${legs.length} single${legs.length > 1 ? 's' : ''}` : `${type.toUpperCase()} · ${totals.comboCount} combo`} · Stake ${totalStake.toFixed(2)} → Win ${totals.potential.toFixed(2)} · Code ${bookingCode}`,
    }, profile.notifPrefs);

    logger.info('bet.placed', { userId: profile.id, betIds, totalStake, type });
    return { ok: true, betIds };
  },

  cashOut: async (betId, portion) => {
    const bet = get().bets.find((b) => b.id === betId);
    if (!bet || bet.status !== 'open') return { ok: false, error: 'Bet not active' };
    const value = cashoutValue(bet);
    if (!value.available) return { ok: false, error: value.reason || 'Cash out unavailable' };

    set({ placing: true });
    await new Promise((r) => setTimeout(r, 500));

    const amount = round2(value.amount * portion);
    let updated: Bet[];
    if (portion < 1) {
      updated = get().bets.map((b) =>
        b.id === betId
          ? {
              ...b,
              stake: round2(b.stake * (1 - portion)),
              potential: round2(b.potential * (1 - portion)),
              cashoutHistory: [...(b.cashoutHistory ?? []), { amount, portion, at: Date.now() }],
            }
          : b
      );
    } else {
      updated = get().bets.map((b) =>
        b.id === betId ? { ...b, status: 'cashed_out' as const, cashoutAmount: amount, payout: amount, settledAt: Date.now() } : b
      );
    }
    set({ bets: updated, placing: false });
    persist(updated);

    const profile = useAuth.getState().profile;
    if (profile) {
      useWallet.getState().credit(profile.id, amount, 'cashout', `CO-${bet.bookingCode}`);
      useNotifs.getState().push({
        userId: profile.id,
        kind: 'cashout',
        title: 'Cash out successful',
        body: `${amount.toFixed(2)} credited to your wallet`,
      }, profile.notifPrefs);
    }
    logger.info('bet.cashout', { betId, amount, portion });
    return { ok: true, amount };
  },

  settleOnMatchFinish: (matchId) => {
    const snapshot = liveEngine.get(matchId);
    if (!snapshot) return;

    let changed = false;
    const settledResults: Array<{ bet: Bet; payout: number }> = [];
    const updated = get().bets.map((bet) => {
      if (bet.status !== 'open') return bet;
      const next = settleBetAgainstMatch(bet, snapshot);
      if (!next) return bet;
      changed = true;
      if (next.status !== 'open' && next.payout && next.payout > 0) {
        settledResults.push({ bet: next, payout: next.payout - (next.usedBonus ?? 0) });
      }
      return next;
    });

    if (!changed) return;
    set({ bets: updated });
    persist(updated);

    const wallet = useWallet.getState();
    const notifs = useNotifs.getState();

    for (const { bet, payout } of settledResults) {
      if (payout > 0) {
        wallet.credit(bet.userId, payout, 'payout', `WIN-${bet.bookingCode}`);
        if (useAuth.getState().profile?.id === bet.userId) {
          notifs.push({
            userId: bet.userId,
            kind: 'bet_won',
            title: 'Bet won!',
            body: `${bet.bookingCode} paid out ${payout.toFixed(2)}`,
            link: '/bets',
          }, useAuth.getState().profile!.notifPrefs);
        }
      } else if (useAuth.getState().profile?.id === bet.userId) {
        notifs.push({
          userId: bet.userId,
          kind: 'bet_lost',
          title: 'Bet settled',
          body: `${bet.bookingCode} did not win. Check details.`,
          link: '/bets',
        }, useAuth.getState().profile!.notifPrefs);
      }
    }
  },

  voidBet: (betId, reason) => {
    const bet = get().bets.find((b) => b.id === betId);
    if (!bet || bet.status !== 'open') return;
    const refund = Math.max(0, bet.stake - (bet.usedBonus ?? 0));
    const updated = get().bets.map((b) => (b.id === betId ? { ...b, status: 'void' as const, payout: b.stake, settledAt: Date.now(), cashoutAmount: undefined } : b));
    set({ bets: updated });
    persist(updated);
    useWallet.getState().credit(bet.userId, refund, 'refund', `VOID-${reason}`);
    logger.info('bet.voided', { betId, reason });
  },
}));
