import { describe, it, expect, beforeEach, vi } from 'vitest';

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

async function freshStores() {
  installLocalStorageMock();
  vi.resetModules();
  const { useAuth } = await import('../src/store/auth');
  const { useNotifs } = await import('../src/store/notifs');
  const { useWallet } = await import('../src/store/wallet');
  await useAuth.getState().init();
  await useAuth.getState().signIn('fan@oddwave.demo', 'Fan12345');
  return { useAuth, useNotifs, useWallet };
}

describe('notification preferences', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('delivers a bet-update notification when the toggle is on (the default)', async () => {
    const { useNotifs } = await freshStores();
    useNotifs.getState().push({ userId: FAN_ID, kind: 'bet_placed', title: 'Bet placed', body: 'x' });
    expect(useNotifs.getState().itemsFor(FAN_ID)).toHaveLength(1);
  });

  it('suppresses bet-update notifications once the toggle is switched off', async () => {
    const { useAuth, useNotifs } = await freshStores();
    useAuth.getState().updateProfile({ notifPrefs: { ...useAuth.getState().profile!.notifPrefs, betUpdates: false } });

    for (const kind of ['bet_placed', 'bet_won', 'bet_lost', 'cashout'] as const) {
      useNotifs.getState().push({ userId: FAN_ID, kind, title: 'x', body: 'x' });
    }

    expect(useNotifs.getState().itemsFor(FAN_ID)).toHaveLength(0);
  });

  it('suppresses only promo notifications when promotions are off, leaving bet updates alone', async () => {
    const { useAuth, useNotifs } = await freshStores();
    useAuth.getState().updateProfile({ notifPrefs: { ...useAuth.getState().profile!.notifPrefs, promotions: false } });

    useNotifs.getState().push({ userId: FAN_ID, kind: 'promo', title: 'Promo', body: 'x' });
    useNotifs.getState().push({ userId: FAN_ID, kind: 'bet_won', title: 'Won', body: 'x' });

    const items = useNotifs.getState().itemsFor(FAN_ID);
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('bet_won');
  });

  it('suppresses live-event notifications independently of the other two toggles', async () => {
    const { useAuth, useNotifs } = await freshStores();
    useAuth.getState().updateProfile({ notifPrefs: { ...useAuth.getState().profile!.notifPrefs, liveEvents: false } });

    useNotifs.getState().push({ userId: FAN_ID, kind: 'live', title: 'Live', body: 'x' });
    useNotifs.getState().push({ userId: FAN_ID, kind: 'promo', title: 'Promo', body: 'x' });

    const items = useNotifs.getState().itemsFor(FAN_ID);
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('promo');
  });

  it('never suppresses wallet-movement or system notices — those have no toggle', async () => {
    const { useAuth, useNotifs } = await freshStores();
    useAuth.getState().updateProfile({
      notifPrefs: { betUpdates: false, promotions: false, liveEvents: false },
    });

    useNotifs.getState().push({ userId: FAN_ID, kind: 'deposit', title: 'Deposit', body: 'x' });
    useNotifs.getState().push({ userId: FAN_ID, kind: 'withdrawal', title: 'Withdrawal', body: 'x' });
    useNotifs.getState().push({ userId: FAN_ID, kind: 'system', title: 'System', body: 'x' });

    expect(useNotifs.getState().itemsFor(FAN_ID)).toHaveLength(3);
  });

  it('notifies on a successful deposit (regression: this used to push nothing at all)', async () => {
    const { useWallet, useNotifs } = await freshStores();
    useWallet.getState().deposit(FAN_ID, 100, 'mtn');

    const items = useNotifs.getState().itemsFor(FAN_ID);
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('deposit');
    expect(items[0].title).toMatch(/deposit/i);
  });

  it('checks the recipient profile, not whoever is currently signed in', async () => {
    const { useAuth, useNotifs } = await freshStores();
    // Sign in as fan, but push to the admin account with promos disabled.
    const admin = Object.values(useAuth.getState().users).find((u) => u.profile.email === 'admin@oddwave.demo')!.profile;
    useAuth.getState().adminUpdateUser(admin.id, { notifPrefs: { ...admin.notifPrefs, promotions: false } });

    useNotifs.getState().push({ userId: admin.id, kind: 'promo', title: 'Promo', body: 'x' });
    useNotifs.getState().push({ userId: FAN_ID, kind: 'promo', title: 'Promo', body: 'x' });

    expect(useNotifs.getState().itemsFor(admin.id)).toHaveLength(0);
    expect(useNotifs.getState().itemsFor(FAN_ID)).toHaveLength(1);
  });
});
