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

async function freshAuth() {
  installLocalStorageMock();
  vi.resetModules();
  const { useAuth } = await import('../src/store/auth');
  await useAuth.getState().init();
  return useAuth;
}

const PLAYER = 'fan@oddwave.demo';
const PASSWORD = 'Fan12345';

describe('device sessions', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens a session on sign-in and closes it on sign-out', async () => {
    const useAuth = await freshAuth();

    expect(useAuth.getState().listSessions()).toHaveLength(0);

    await useAuth.getState().signIn(PLAYER, PASSWORD);
    const sessions = useAuth.getState().listSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].current).toBe(true);
    expect(sessions[0].device).toBeTruthy();

    await useAuth.getState().signOut();
    expect(useAuth.getState().profile).toBeNull();
    expect(useAuth.getState().listSessions()).toHaveLength(0);
  });

  it('does not restore a session that was revoked elsewhere', async () => {
    const useAuth = await freshAuth();
    await useAuth.getState().signIn(PLAYER, PASSWORD);
    expect(useAuth.getState().profile).not.toBeNull();

    // Another device revoking this one empties the registry entry.
    localStorage.setItem('oddwave:v1:device_sessions', JSON.stringify({ 'u-fan': [] }));

    vi.resetModules();
    const { useAuth: reloaded } = await import('../src/store/auth');
    await reloaded.getState().init();
    expect(reloaded.getState().profile).toBeNull();
  });

  it('revoking another session leaves this one signed in', async () => {
    const useAuth = await freshAuth();
    await useAuth.getState().signIn(PLAYER, PASSWORD);

    const raw = JSON.parse(localStorage.getItem('oddwave:v1:device_sessions')!);
    raw['u-fan'].push({
      id: 'sess-other',
      userId: 'u-fan',
      device: 'Safari on iOS',
      createdAt: Date.now(),
      lastSeenAt: Date.now(),
      exp: Date.now() + 86_400_000,
    });
    localStorage.setItem('oddwave:v1:device_sessions', JSON.stringify(raw));

    expect(useAuth.getState().listSessions()).toHaveLength(2);
    const res = await useAuth.getState().revokeSession('sess-other');
    expect(res.signedOut).toBe(false);
    expect(useAuth.getState().profile).not.toBeNull();
    expect(useAuth.getState().listSessions()).toHaveLength(1);
  });

  it('revoking the current session signs out', async () => {
    const useAuth = await freshAuth();
    await useAuth.getState().signIn(PLAYER, PASSWORD);
    const [current] = useAuth.getState().listSessions();

    const res = await useAuth.getState().revokeSession(current.id);
    expect(res.signedOut).toBe(true);
    expect(useAuth.getState().profile).toBeNull();
  });

  it('hides sessions that have already expired', async () => {
    const useAuth = await freshAuth();
    await useAuth.getState().signIn(PLAYER, PASSWORD);

    const raw = JSON.parse(localStorage.getItem('oddwave:v1:device_sessions')!);
    raw['u-fan'].push({
      id: 'sess-stale',
      userId: 'u-fan',
      device: 'Firefox on Linux',
      createdAt: Date.now() - 100_000,
      lastSeenAt: Date.now() - 100_000,
      exp: Date.now() - 1,
    });
    localStorage.setItem('oddwave:v1:device_sessions', JSON.stringify(raw));

    const sessions = useAuth.getState().listSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions.some((s) => s.id === 'sess-stale')).toBe(false);
  });
});

describe('password change', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('requires the correct current password', async () => {
    const useAuth = await freshAuth();
    await useAuth.getState().signIn(PLAYER, PASSWORD);

    const res = await useAuth.getState().changePassword('wrong', 'Newpass123');
    expect(res.error).toMatch(/incorrect/i);
  });

  it('rejects a short or unchanged new password', async () => {
    const useAuth = await freshAuth();
    await useAuth.getState().signIn(PLAYER, PASSWORD);

    expect((await useAuth.getState().changePassword(PASSWORD, 'abc')).error).toMatch(/6 characters/);
    expect((await useAuth.getState().changePassword(PASSWORD, PASSWORD)).error).toMatch(/different/i);
  });

  it('replaces the credential so only the new password works', async () => {
    const useAuth = await freshAuth();
    await useAuth.getState().signIn(PLAYER, PASSWORD);

    expect(await useAuth.getState().changePassword(PASSWORD, 'Rotated456')).toEqual({});
    await useAuth.getState().signOut();

    expect((await useAuth.getState().signIn(PLAYER, PASSWORD)).error).toBeTruthy();
    expect((await useAuth.getState().signIn(PLAYER, 'Rotated456')).error).toBeUndefined();
  });
});

describe('contact verification', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('marks a channel verified only for the issued code', async () => {
    const useAuth = await freshAuth();
    await useAuth.getState().signIn(PLAYER, PASSWORD);
    expect(useAuth.getState().profile?.emailVerified).toBeFalsy();

    const { code } = useAuth.getState().requestVerification('email');
    expect(useAuth.getState().confirmVerification('email', '000000').error).toMatch(/invalid/i);
    expect(useAuth.getState().confirmVerification('email', code)).toEqual({});
    expect(useAuth.getState().profile?.emailVerified).toBe(true);
    expect(useAuth.getState().profile?.phoneVerified).toBeFalsy();
  });
});
