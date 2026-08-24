import { useMemo } from 'react';
import { create } from 'zustand';
import type { Match, SportId } from '@/lib/types';
import { buildMatchesForDay, buildVirtualMatches } from '@/lib/dataGen';
import { liveEngine } from '@/lib/liveEngine';

type FinishListener = (matchId: string) => void;

interface MatchesState {
  byId: Record<string, Match>;
  version: number;
  loaded: boolean;
  finishListeners: FinishListener[];
  init: () => void;
  onFinish: (fn: FinishListener) => () => void;
}

function copyMatch(m: Match): Match {
  return {
    ...m,
    score: m.score ? { ...m.score } : undefined,
    markets: m.markets.map((mk) => ({ ...mk, outcomes: mk.outcomes.map((o) => ({ ...o })) })),
  };
}

export const useMatches = create<MatchesState>((set, get) => ({
  byId: {},
  version: 0,
  loaded: false,
  finishListeners: [],

  init: () => {
    if (get().loaded) return;
    const matches = [...buildMatchesForDay(), ...buildVirtualMatches()];
    liveEngine.registerAll(matches);
    const byId: Record<string, Match> = {};
    for (const m of matches) {
      byId[m.id] = copyMatch(m);
      if (m.virtual && m.status === 'upcoming' && m.kickoff < Date.now()) {
        m.status = 'live';
        m.minute = 1;
        byId[m.id].status = 'live';
        byId[m.id].minute = 1;
      }
    }
    set({ byId, loaded: true, version: 1 });

    liveEngine.subscribe((dirtyIds) => {
      const prev = get().byId;
      const next = { ...prev };
      let changed = false;
      for (const id of dirtyIds) {
        const fresh = liveEngine.get(id);
        if (!fresh) continue;
        const before = prev[id];
        next[id] = copyMatch(fresh);
        changed = true;
        if (before && before.status !== 'finished' && fresh.status === 'finished') {
          for (const fn of get().finishListeners) fn(id);
        }
      }
      if (changed) set({ byId: next, version: get().version + 1 });
    });
  },

  onFinish: (fn) => {
    set((s) => ({ finishListeners: [...s.finishListeners, fn] }));
    return () =>
      set((s) => ({ finishListeners: s.finishListeners.filter((f) => f !== fn) }));
  },
}));

/**
 * Derived views are memoised hooks rather than inline store selectors: zustand v5
 * compares snapshots by reference, so a selector that builds a fresh array on every
 * call re-renders forever. Selecting the stable `byId` map and deriving with useMemo
 * keeps the snapshot referentially stable between actual store updates.
 */
export function useLiveMatches(sportId?: SportId | null): Match[] {
  const byId = useMatches((s) => s.byId);
  return useMemo(
    () => Object.values(byId).filter((m) => m.status === 'live' && (!sportId || m.sportId === sportId)),
    [byId, sportId]
  );
}

export function useUpcomingMatches(sportId?: SportId | null): Match[] {
  const byId = useMatches((s) => s.byId);
  return useMemo(
    () =>
      Object.values(byId)
        .filter((m) => m.status === 'upcoming' && (!sportId || m.sportId === sportId))
        .sort((a, b) => a.kickoff - b.kickoff),
    [byId, sportId]
  );
}

export function useFinishedMatches(): Match[] {
  const byId = useMatches((s) => s.byId);
  return useMemo(
    () =>
      Object.values(byId)
        .filter((m) => m.status === 'finished')
        .sort((a, b) => (b.finishedAt ?? b.kickoff) - (a.finishedAt ?? a.kickoff)),
    [byId]
  );
}
