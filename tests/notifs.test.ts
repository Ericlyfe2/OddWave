import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NotificationPrefs } from '../src/lib/types';

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

const FAN_ID = 'u-fan';
const ADMIN_ID = 'u-admin';
const DEFAULT_PREFS: NotificationPrefs = { betUpdates: true, promotions: true, liveEvents: true };

async function freshNotifsStore() {
  installLocalStorageMock();
  vi.resetModules();
  const { useNotifs } = await import('../src/store/notifs');
  return useNotifs;
}

describe('notification preferences', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('delivers a bet-update notification when the toggle is on (the default)', async () => {
    const useNotifs = await freshNotifsStore();
    useNotifs.getState().push({ userId: FAN_ID, kind: 'bet_placed', title: 'Bet placed', body: 'x' }, DEFAULT_PREFS);
    expect(useNotifs.getState().itemsFor(FAN_ID)).toHaveLength(1);
  });

  it('suppresses bet-update notifications once the toggle is switched off', async () => {
    const useNotifs = await freshNotifsStore();
    const prefs: NotificationPrefs = { ...DEFAULT_PREFS, betUpdates: false };
    for (const kind of ['bet_placed', 'bet_won', 'bet_lost', 'cashout'] as const) {
      useNotifs.getState().push({ userId: FAN_ID, kind, title: 'x', body: 'x' }, prefs);
    }
    expect(useNotifs.getState().itemsFor(FAN_ID)).toHaveLength(0);
  });

  it('suppresses only promo notifications when promotions are off, leaving bet updates alone', async () => {
    const useNotifs = await freshNotifsStore();
    const prefs: NotificationPrefs = { ...DEFAULT_PREFS, promotions: false };
    useNotifs.getState().push({ userId: FAN_ID, kind: 'promo', title: 'Promo', body: 'x' }, prefs);
    useNotifs.getState().push({ userId: FAN_ID, kind: 'bet_won', title: 'Won', body: 'x' }, prefs);
    const items = useNotifs.getState().itemsFor(FAN_ID);
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('bet_won');
  });

  it('suppresses live-event notifications independently of the other two toggles', async () => {
    const useNotifs = await freshNotifsStore();
    const prefs: NotificationPrefs = { ...DEFAULT_PREFS, liveEvents: false };
    useNotifs.getState().push({ userId: FAN_ID, kind: 'live', title: 'Live', body: 'x' }, prefs);
    useNotifs.getState().push({ userId: FAN_ID, kind: 'promo', title: 'Promo', body: 'x' }, prefs);
    const items = useNotifs.getState().itemsFor(FAN_ID);
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('promo');
  });

  it('never suppresses wallet-movement or system notices — those have no toggle', async () => {
    const useNotifs = await freshNotifsStore();
    const prefs: NotificationPrefs = { betUpdates: false, promotions: false, liveEvents: false };
    useNotifs.getState().push({ userId: FAN_ID, kind: 'deposit', title: 'Deposit', body: 'x' }, prefs);
    useNotifs.getState().push({ userId: FAN_ID, kind: 'withdrawal', title: 'Withdrawal', body: 'x' }, prefs);
    useNotifs.getState().push({ userId: FAN_ID, kind: 'system', title: 'System', body: 'x' }, prefs);
    expect(useNotifs.getState().itemsFor(FAN_ID)).toHaveLength(3);
  });

  it('checks the recipient’s own prefs, not whoever passed them in', async () => {
    const useNotifs = await freshNotifsStore();
    const adminPrefsPromosOff: NotificationPrefs = { ...DEFAULT_PREFS, promotions: false };
    useNotifs.getState().push({ userId: ADMIN_ID, kind: 'promo', title: 'Promo', body: 'x' }, adminPrefsPromosOff);
    useNotifs.getState().push({ userId: FAN_ID, kind: 'promo', title: 'Promo', body: 'x' }, DEFAULT_PREFS);
    expect(useNotifs.getState().itemsFor(ADMIN_ID)).toHaveLength(0);
    expect(useNotifs.getState().itemsFor(FAN_ID)).toHaveLength(1);
  });
});
