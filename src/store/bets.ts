import { create } from 'zustand';
import type { Bet } from '@/lib/types';
import { trpcClient } from '@/lib/trpc';
import { liveEngine } from '@/lib/liveEngine';
import type { MatchCashoutInput } from '@/lib/cashout';
import { useAuth } from './auth';
import { useNotifs } from './notifs';
import { logger } from '@/lib/logger';

interface PlaceInput {
  type: Bet['type'];
  stakePerCombo: number;
  legs: Array<Bet['legs'][number] & { matchStatus: string; marketSuspended: boolean; outcomeSuspended: boolean }>;
  systemPicks?: number;
  useBonus?: number;
}

interface BetsState {
  bets: Bet[];
  placing: boolean;
  lastPlacedIds: string[];
  hydrate: () => Promise<void>;
  clear: () => void;
  placeBet: (input: PlaceInput) => Promise<{ ok: boolean; error?: string; betIds?: string[] }>;
  cashOut: (betId: string, portion: number) => Promise<{ ok: boolean; error?: string; amount?: number }>;
  settleOnMatchFinish: (matchId: string) => Promise<void>;
}

export const useBets = create<BetsState>((set, get) => ({
  bets: [],
  placing: false,
  lastPlacedIds: [],

  hydrate: async () => {
    const bets = await trpcClient.bets.listBets.query();
    set({ bets });
  },

  clear: () => set({ bets: [], lastPlacedIds: [] }),

  placeBet: async (input) => {
    set({ placing: true });
    const result = await trpcClient.bets.place.mutate(input as never);
    set({ placing: false });
    if (!('betIds' in result)) return result;
    await get().hydrate();
    set({ lastPlacedIds: result.betIds ?? [] });

    const profile = useAuth.getState().profile;
    if (profile) {
      useNotifs.getState().push(
        { userId: profile.id, kind: 'bet_placed', title: 'Bet placed successfully', body: `Booking code sent` },
        profile.notifPrefs
      );
    }
    logger.info('bet.placed', { betIds: result.betIds });
    return result;
  },

  cashOut: async (betId, portion) => {
    const bet = get().bets.find((b) => b.id === betId);
    if (!bet) return { ok: false, error: 'Bet not active' };
    const matchIds = [...new Set(bet.legs.map((l) => l.matchId))];
    const matches: MatchCashoutInput[] = matchIds.map((id) => liveEngine.get(id)).filter((m): m is NonNullable<typeof m> => !!m);

    set({ placing: true });
    const result = await trpcClient.bets.cashOut.mutate({ betId, portion, matches });
    set({ placing: false });
    if ('error' in result) return result;
    await get().hydrate();

    const profile = useAuth.getState().profile;
    if (profile) {
      useNotifs.getState().push(
        { userId: profile.id, kind: 'cashout', title: 'Cash out successful', body: `${result.amount!.toFixed(2)} credited to your wallet` },
        profile.notifPrefs
      );
    }
    logger.info('bet.cashout', { betId, amount: result.amount, portion });
    return result;
  },

  settleOnMatchFinish: async (matchId) => {
    const snapshot = liveEngine.get(matchId);
    if (!snapshot) return;
    const before = get().bets;
    const result = await trpcClient.bets.settle.mutate({ match: snapshot });
    if (result.settledCount === 0) return;
    await get().hydrate();

    const profile = useAuth.getState().profile;
    if (!profile) return;
    const after = get().bets;

    for (const bet of after) {
      if (bet.userId !== profile.id) continue;
      const prior = before.find((b) => b.id === bet.id);
      if (!prior || prior.status !== 'open' || bet.status === 'open') continue;

      if (typeof bet.payout === 'number' && bet.payout > 0) {
        useNotifs.getState().push(
          { userId: bet.userId, kind: 'bet_won', title: 'Bet won!', body: `${bet.bookingCode} paid out ${bet.payout.toFixed(2)}`, link: '/bets' },
          profile.notifPrefs
        );
      } else {
        useNotifs.getState().push(
          { userId: bet.userId, kind: 'bet_lost', title: 'Bet settled', body: `${bet.bookingCode} did not win. Check details.`, link: '/bets' },
          profile.notifPrefs
        );
      }
    }
  },
}));
