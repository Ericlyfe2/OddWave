import { create } from 'zustand';
import type { SlipItem } from '@/lib/types';
import { loadJson, saveJson, removeKey } from '@/lib/storage';
import { useAuth } from '@/store/auth';
import { useUI } from '@/store/ui';
import { round2 } from '@/lib/format';
import { potentialFor, accaBonusPct } from '@/lib/betsMath';

export type SlipMode = 'single' | 'multi' | 'system' | 'builder';

interface SlipState {
  items: SlipItem[];
  mode: SlipMode;
  stake: string;
  systemPicks: number;
  acceptChanges: boolean;
  open: boolean;
  lastAddedAt: number;
  /** Profile id the in-memory slip belongs to; null while signed out. */
  owner: string | null;
  add: (item: SlipItem, builderMode?: boolean) => void;
  remove: (outcomeId: string) => void;
  clear: () => void;
  setMode: (mode: SlipMode) => void;
  setStake: (stake: string) => void;
  setSystemPicks: (n: number) => void;
  setAcceptChanges: (v: boolean) => void;
  /** Re-price every selection to the odds the user just accepted. */
  acceptOdds: (live: Record<string, number>) => void;
  setOpen: (open: boolean) => void;
  hasOddsChanged: () => boolean;
  /**
   * Swap the slip to another account's saved selections. `adoptGuestSlip` hands
   * a signed-out slip to the account being signed into; it must stay false when
   * merely restoring a session at boot, where the two are unrelated.
   */
  setOwner: (owner: string | null, adoptGuestSlip?: boolean) => void;
}

/**
 * Selections are stored per account so one user's slip never shows up for the
 * next person on the same device. The unsuffixed key is the signed-out slip,
 * which also carries any selections saved before slips were namespaced.
 */
function slipKey(owner: string | null): string {
  return owner ? `slip_items:${owner}` : 'slip_items';
}

function persist(items: SlipItem[], owner: string | null): void {
  saveJson(slipKey(owner), items);
}

export const useSlip = create<SlipState>((set, get) => ({
  items: loadJson<SlipItem[]>(slipKey(null), []),
  mode: 'multi',
  stake: '',
  systemPicks: 3,
  acceptChanges: false,
  open: false,
  lastAddedAt: 0,
  owner: null,

  add: (item, builderMode = false) => {
    const current = get().items;
    const existingSameMatch = current.filter((i) => i.matchId === item.matchId);
    const exists = current.find((i) => i.outcomeId === item.outcomeId);

    if (exists && !builderMode) {
      const next = current.filter((i) => i.outcomeId !== item.outcomeId);
      set({ items: next });
      persist(next, get().owner);
      return;
    }
    if (exists && builderMode) {
      const next = current.filter((i) => i.outcomeId !== item.outcomeId);
      set({ items: next });
      persist(next, get().owner);
      return;
    }

    // Whether this pick belongs to a Bet Builder combo comes from the caller
    // (the match screen's own toggle), not from the slip's `mode` field —
    // `mode` can lag a render behind (e.g. right after Builder is switched
    // on, before any pick has landed) and must never be the thing that
    // decides which conflict rule applies to this specific add.
    let next: SlipItem[];
    if (builderMode) {
      const sameMarket = existingSameMatch.find((i) => i.marketKey === item.marketKey);
      if (sameMarket) {
        // Two outcomes from the same market (e.g. "Home Win" + "Away Win") are
        // mutually exclusive — swap rather than stack, same as the same-match
        // rule below, but scoped to the market so other markets from this
        // match stay in the combo.
        useUI.getState().toast('info', `Replaced "${sameMarket.outcomeLabel}" with "${item.outcomeLabel}" — one selection per market in Bet Builder`);
        next = [...current.filter((i) => i.outcomeId !== sameMarket.outcomeId), item];
      } else if (existingSameMatch.length > 0) {
        next = [...current, item];
      } else {
        // Starting a fresh combo for a different match drops whatever was there.
        next = [item];
      }
    } else if (existingSameMatch.length > 0) {
      // Two outcomes from the same match can't share a normal slip (they're
      // often mutually exclusive, and even when not, pricing them together
      // needs Bet Builder's same-game-parlay math). Swapping instead of
      // stacking is the right call, but it must not happen silently — the
      // punter just watched their previous pick vanish.
      useUI.getState().toast('info', `Replaced "${existingSameMatch[0].outcomeLabel}" with "${item.outcomeLabel}" — one selection per match outside Bet Builder`);
      next = [...current.filter((i) => i.matchId !== item.matchId), item];
    } else {
      next = [...current, item];
    }
    set({ items: next, lastAddedAt: Date.now() });
    persist(next, get().owner);
  },

  remove: (outcomeId) => {
    const next = get().items.filter((i) => i.outcomeId !== outcomeId);
    set({ items: next });
    persist(next, get().owner);
  },

  clear: () => {
    set({ items: [], stake: '' });
    persist([], get().owner);
  },

  setMode: (mode) => set({ mode }),

  setStake: (stake) => set({ stake }),

  setSystemPicks: (n) => set({ systemPicks: Math.max(2, Math.min(n, get().items.length - 1)) }),

  setAcceptChanges: (v) => set({ acceptChanges: v }),

  acceptOdds: (live) => {
    const next = get().items.map((i) =>
      live[i.outcomeId] === undefined ? i : { ...i, odds: live[i.outcomeId], oddsSnapshot: live[i.outcomeId] }
    );
    set({ items: next, acceptChanges: true });
    persist(next, get().owner);
  },

  setOpen: (open) => set({ open }),

  setOwner: (owner, adoptGuestSlip = true) => {
    const previous = get().owner;
    if (previous === owner) return;

    const current = get().items;
    persist(current, previous);

    // Signing in mid-slip keeps what the visitor was building; otherwise their
    // own saved selections come back.
    const adopt = adoptGuestSlip && previous === null && owner !== null && current.length > 0;
    const next = adopt ? current : loadJson<SlipItem[]>(slipKey(owner), []);
    if (adopt) removeKey(slipKey(null));

    set({ items: next, owner, stake: '', acceptChanges: false, mode: 'multi', systemPicks: 3 });
    persist(next, owner);
  },

  hasOddsChanged: () => {
    return (
      !get().acceptChanges &&
      get().items.some((i) => round2(i.odds) !== round2(i.oddsSnapshot))
    );
  },
}));

export function slipTotals(items: SlipItem[], mode: SlipMode, stake: number, systemPicks: number): { totalOdds: number; comboCount: number; totalStake: number; potential: number; bonusPct: number } {
  if (items.length === 0) return { totalOdds: 0, comboCount: 0, totalStake: 0, potential: 0, bonusPct: 0 };
  if (mode === 'single') {
    const t = potentialFor('single', stake, items);
    return { totalOdds: t.totalOdds, comboCount: t.comboCount, totalStake: round2(stake * items.length), potential: t.potential, bonusPct: 0 };
  }
  if (mode === 'multi') {
    const t = potentialFor('multi', stake, items);
    return { totalOdds: t.totalOdds, comboCount: 1, totalStake: round2(stake), potential: t.potential, bonusPct: accaBonusPct(items.length) };
  }
  if (mode === 'builder') {
    const t = potentialFor('builder', stake, items);
    return { totalOdds: t.totalOdds, comboCount: 1, totalStake: round2(stake), potential: t.potential, bonusPct: 0 };
  }
  const picks = Math.max(2, Math.min(systemPicks, items.length - 1));
  const t = potentialFor('system', stake, items, picks);
  return { totalOdds: t.totalOdds, comboCount: t.comboCount, totalStake: round2(stake * t.comboCount), potential: t.potential, bonusPct: 0 };
}

let ownerSyncInstalled = false;

/**
 * Keeps the slip pointed at whoever is signed in. Covers session restore at
 * boot as well as later sign-in / sign-out / account switches.
 */
export function installSlipOwnerSync(): void {
  if (ownerSyncInstalled) return;
  ownerSyncInstalled = true;

  let lastOwner = useAuth.getState().profile?.id ?? null;
  useSlip.getState().setOwner(lastOwner, false);

  useAuth.subscribe((state) => {
    const owner = state.profile?.id ?? null;
    if (owner === lastOwner) return;
    lastOwner = owner;
    useSlip.getState().setOwner(owner);
  });
}
