import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SlipItem } from '../src/lib/types';

function installLocalStorageMock(): void {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  });
}

function pick(id: string, odds = 2): SlipItem {
  return {
    outcomeId: id,
    matchId: `m-${id}`,
    matchName: `Home ${id} vs Away ${id}`,
    leagueName: 'Test League',
    marketKey: '1x2',
    marketName: 'Match Result',
    outcomeLabel: 'Home',
    outcomeCode: '1',
    odds,
    oddsSnapshot: odds,
    kickoff: Date.now() + 3_600_000,
    addedAt: Date.now(),
  } as SlipItem;
}

async function freshSlipStore() {
  installLocalStorageMock();
  vi.resetModules();
  const { useSlip } = await import('../src/store/slip');
  return useSlip;
}

describe('betslip ownership', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps each account’s selections separate', async () => {
    const useSlip = await freshSlipStore();

    useSlip.getState().setOwner('u-alice', false);
    useSlip.getState().add(pick('alice-1'));
    expect(useSlip.getState().items).toHaveLength(1);

    useSlip.getState().setOwner('u-bob', false);
    expect(useSlip.getState().items).toEqual([]);

    useSlip.getState().add(pick('bob-1'));
    useSlip.getState().setOwner('u-alice', false);
    expect(useSlip.getState().items.map((i) => i.outcomeId)).toEqual(['alice-1']);
  });

  it('leaves nothing behind for the next visitor after signing out', async () => {
    const useSlip = await freshSlipStore();

    useSlip.getState().setOwner('u-alice', false);
    useSlip.getState().add(pick('alice-1'));
    useSlip.getState().setOwner(null);

    expect(useSlip.getState().items).toEqual([]);
    expect(localStorage.getItem('oddwave:v1:slip_items')).toBe('[]');
  });

  it('hands a signed-out slip to the account that signs in', async () => {
    const useSlip = await freshSlipStore();

    useSlip.getState().add(pick('guest-1'));
    useSlip.getState().setOwner('u-alice');

    expect(useSlip.getState().items.map((i) => i.outcomeId)).toEqual(['guest-1']);
    expect(localStorage.getItem('oddwave:v1:slip_items')).toBeNull();
  });

  it('does not hand a stale signed-out slip to a restored session', async () => {
    const useSlip = await freshSlipStore();

    useSlip.getState().add(pick('guest-1'));
    useSlip.getState().setOwner('u-alice', false);

    expect(useSlip.getState().items).toEqual([]);
  });
});

describe('bet builder same-market conflicts', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('swaps rather than stacks two outcomes from the same market', async () => {
    const useSlip = await freshSlipStore();
    useSlip.getState().setMode('builder');

    const home = pick('m1:1', 1.8);
    home.matchId = 'm1';
    home.marketKey = '1x2';
    home.outcomeLabel = 'Arsenal';
    useSlip.getState().add(home, true);

    const away = pick('m1:2', 4.2);
    away.matchId = 'm1';
    away.marketKey = '1x2';
    away.outcomeLabel = 'Chelsea';
    useSlip.getState().add(away, true);

    expect(useSlip.getState().items.map((i) => i.outcomeId)).toEqual(['m1:2']);
  });

  it('keeps a different market from the same match alongside an existing one', async () => {
    const useSlip = await freshSlipStore();
    useSlip.getState().setMode('builder');

    const home = pick('m1:1', 1.8);
    home.matchId = 'm1';
    home.marketKey = '1x2';
    useSlip.getState().add(home, true);

    const over = pick('m1:ou', 1.7);
    over.matchId = 'm1';
    over.marketKey = 'ou';
    useSlip.getState().add(over, true);

    expect(useSlip.getState().items.map((i) => i.outcomeId).sort()).toEqual(['m1:1', 'm1:ou']);
  });

  it('applies the builder conflict rule from the add() argument even if `mode` has drifted away from builder', async () => {
    // Regression: `mode` used to be the only signal `add()` looked at, and it
    // can legitimately be something other than 'builder' for a tick (e.g. the
    // UI resets it once selections no longer form a valid combo) while the
    // caller is still mid-way through building one. The explicit argument
    // must be authoritative, not the store's `mode` field.
    const useSlip = await freshSlipStore();
    useSlip.getState().setMode('multi');

    const home = pick('m1:1', 1.8);
    home.matchId = 'm1';
    home.marketKey = '1x2';
    useSlip.getState().add(home, true);

    const away = pick('m1:2', 4.2);
    away.matchId = 'm1';
    away.marketKey = '1x2';
    useSlip.getState().add(away, true);

    expect(useSlip.getState().items.map((i) => i.outcomeId)).toEqual(['m1:2']);
  });

  it('does not apply builder rules to an ordinary add just because `mode` is stuck on builder', async () => {
    const useSlip = await freshSlipStore();
    useSlip.getState().setMode('builder');

    useSlip.getState().add(pick('m1:1'));
    useSlip.getState().add(pick('m2:1'));

    // Ordinary (non-builder) adds still append across different matches —
    // they must not be funnelled through the builder's "one match only"
    // same-market swap just because a stale `mode` says 'builder'.
    expect(useSlip.getState().items.map((i) => i.outcomeId).sort()).toEqual(['m1:1', 'm2:1']);
  });
});
