import { create } from 'zustand';
import type { DeviceSession, Profile } from '@/lib/types';
import { loadJson, saveJson, removeKey } from '@/lib/storage';
import { uid } from '@/lib/rng';
import { SESSION_DAYS } from '@/lib/config';
import { logger } from '@/lib/logger';

interface StoredUser {
  profile: Profile;
  salt: string;
  hash: string;
}

interface Session {
  userId: string;
  exp: number;
  sessionId: string;
}

const SESSION_MS = SESSION_DAYS * 86400000;

/** Best-effort device label from the real user agent — never invented. */
function describeDevice(): string {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  if (!ua) return 'Unknown device';
  const os =
    /Windows NT/.test(ua) ? 'Windows' :
    /Android/.test(ua) ? 'Android' :
    /iPhone|iPad|iPod/.test(ua) ? 'iOS' :
    /Mac OS X/.test(ua) ? 'macOS' :
    /Linux/.test(ua) ? 'Linux' : 'Unknown OS';
  const browser =
    /Edg\//.test(ua) ? 'Edge' :
    /OPR\//.test(ua) ? 'Opera' :
    /Firefox\//.test(ua) ? 'Firefox' :
    /Chrome\//.test(ua) ? 'Chrome' :
    /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return `${browser} on ${os}`;
}

type SessionRegistry = Record<string, DeviceSession[]>;

function loadRegistry(): SessionRegistry {
  return loadJson<SessionRegistry>('device_sessions', {});
}

function saveRegistry(registry: SessionRegistry): void {
  saveJson('device_sessions', registry);
}

/** Drops expired records so the security screen only ever lists live sessions. */
function activeSessions(userId: string): DeviceSession[] {
  const registry = loadRegistry();
  const live = (registry[userId] ?? []).filter((entry) => entry.exp > Date.now());
  if (live.length !== (registry[userId] ?? []).length) {
    saveRegistry({ ...registry, [userId]: live });
  }
  return live.sort((a, b) => b.lastSeenAt - a.lastSeenAt);
}

function openSession(userId: string): Session {
  const now = Date.now();
  const record: DeviceSession = {
    id: uid('sess-'),
    userId,
    device: describeDevice(),
    createdAt: now,
    lastSeenAt: now,
    exp: now + SESSION_MS,
  };
  const registry = loadRegistry();
  const live = (registry[userId] ?? []).filter((entry) => entry.exp > now);
  saveRegistry({ ...registry, [userId]: [...live, record] });
  return { userId, exp: record.exp, sessionId: record.id };
}

function closeSession(session: Session | null): void {
  if (!session) return;
  const registry = loadRegistry();
  const remaining = (registry[session.userId] ?? []).filter((entry) => entry.id !== session.sessionId);
  saveRegistry({ ...registry, [session.userId]: remaining });
}

interface AuthState {
  profile: Profile | null;
  ready: boolean;
  users: Record<string, StoredUser>;
  init: () => Promise<void>;
  signUp: (email: string, password: string, phone: string, fullName: string) => Promise<{ error?: string; needsVerification?: boolean }>;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  updateProfile: (patch: Partial<Profile>) => void;
  requestPasswordReset: (email: string) => Promise<{ ok: boolean; resetCode?: string; error?: string }>;
  resetPassword: (email: string, code: string, newPassword: string) => Promise<{ error?: string }>;
  listProfiles: () => Profile[];
  adminUpdateUser: (userId: string, patch: Partial<Profile>) => void;
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ error?: string }>;
  listSessions: () => Array<DeviceSession & { current: boolean }>;
  revokeSession: (sessionId: string) => Promise<{ signedOut: boolean }>;
  revokeOtherSessions: () => number;
  requestVerification: (channel: 'email' | 'phone') => { code: string };
  confirmVerification: (channel: 'email' | 'phone', code: string) => { error?: string };
}

async function hashPassword(password: string, salt: string): Promise<string> {
  try {
    const data = new TextEncoder().encode(`${salt}:${password}`);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    let h = 0;
    const s = `${salt}:${password}`;
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return `fallback${h >>> 0}`;
  }
}

function defaultLimits() {
  return { depositLimit: null, lossLimit: null, sessionReminderMin: null, selfExcludedUntil: null };
}

function persistUsers(users: Record<string, StoredUser>): void {
  saveJson('users', users);
}

function persistSession(session: Session | null): void {
  if (session) saveJson('session', session);
  else removeKey('session');
}

export function seedDemoAccounts(): Record<string, StoredUser> {
  const existing = loadJson<Record<string, StoredUser>>('users', {});
  const emails = Object.keys(existing);
  if (!emails.includes('admin@oddwave.demo')) {
    existing['admin@oddwave.demo'] = {
      profile: {
        id: 'u-admin',
        email: 'admin@oddwave.demo',
        phone: '+233200000001',
        fullName: 'Control Room Admin',
        role: 'admin',
        createdAt: Date.now(),
        bonusBalance: 0,
        claimedPromos: [],
        rgLimits: defaultLimits(),
        notifPrefs: { betUpdates: true, promotions: true, liveEvents: true },
      },
      salt: 's1',
      hash: '',
    };
  }
  if (!emails.includes('fan@oddwave.demo')) {
    existing['fan@oddwave.demo'] = {
      profile: {
        id: 'u-fan',
        email: 'fan@oddwave.demo',
        phone: '+233244567890',
        fullName: 'Kwame Fan',
        role: 'user',
        createdAt: Date.now(),
        bonusBalance: 25,
        claimedPromos: ['welcome'],
        rgLimits: defaultLimits(),
        notifPrefs: { betUpdates: true, promotions: true, liveEvents: true },
      },
      salt: 's2',
      hash: '',
    };
  }
  for (const key of ['admin@oddwave.demo', 'fan@oddwave.demo']) {
    const u = existing[key];
    if (!u.hash) u.hash = '';
  }
  persistUsers(existing);
  return existing;
}

export async function ensureDemoPasswords(users: Record<string, StoredUser>): Promise<Record<string, StoredUser>> {
  let changed = false;
  const pairs: Array<[string, string, string]> = [
    ['admin@oddwave.demo', 'Admin123!', 's1'],
    ['fan@oddwave.demo', 'Fan12345', 's2'],
  ];
  for (const [email, pw, salt] of pairs) {
    const u = users[email];
    if (u && !u.hash) {
      u.salt = salt;
      u.hash = await hashPassword(pw, salt);
      changed = true;
    }
  }
  if (changed) persistUsers(users);
  return users;
}

export const useAuth = create<AuthState>((set, get) => ({
  profile: null,
  ready: false,
  users: {},

  init: async () => {
    let users = seedDemoAccounts();
    users = await ensureDemoPasswords(users);
    const session = loadJson<Session | null>('session', null);
    if (session && session.exp > Date.now()) {
      // A session revoked from another device is gone from the registry, so the
      // stored token no longer resolves and this device lands signed out.
      const live = activeSessions(session.userId).find((entry) => entry.id === session.sessionId);
      const user = Object.values(users).find((u) => u.profile.id === session.userId);
      if (live && user) {
        const registry = loadRegistry();
        saveRegistry({
          ...registry,
          [session.userId]: (registry[session.userId] ?? []).map((entry) =>
            entry.id === session.sessionId ? { ...entry, lastSeenAt: Date.now() } : entry
          ),
        });
        set({ profile: user.profile });
      } else {
        persistSession(null);
      }
    }
    set({ users, ready: true });
  },

  signUp: async (email, password, phone, fullName) => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password || !phone.trim() || !fullName.trim()) return { error: 'Please fill in all fields' };
    if (password.length < 6) return { error: 'Password must be at least 6 characters' };
    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) return { error: 'Enter a valid email address' };
    const users = get().users;
    if (users[cleanEmail]) return { error: 'An account with this email already exists' };

    const salt = uid('salt');
    const hash = await hashPassword(password, salt);
    const profile: Profile = {
      id: uid('u-'),
      email: cleanEmail,
      phone: phone.trim(),
      fullName: fullName.trim(),
      role: 'user',
      createdAt: Date.now(),
      bonusBalance: 0,
      claimedPromos: [],
      rgLimits: defaultLimits(),
      notifPrefs: { betUpdates: true, promotions: true, liveEvents: true },
    };
    const next = { ...users, [cleanEmail]: { profile, salt, hash } };
    persistUsers(next);
    persistSession(openSession(profile.id));
    set({ users: next, profile });
    logger.info('auth.sign_up', { userId: profile.id });
    return {};
  },

  signIn: async (email, password) => {
    const cleanEmail = email.trim().toLowerCase();
    const user = get().users[cleanEmail];
    if (!user) return { error: 'No account found with this email' };
    const hash = await hashPassword(password, user.salt);
    if (hash !== user.hash) return { error: 'Incorrect email or password' };
    if (user.profile.rgLimits.selfExcludedUntil && user.profile.rgLimits.selfExcludedUntil > Date.now()) {
      return { error: 'Account is under self-exclusion until further notice' };
    }
    persistSession(openSession(user.profile.id));
    set({ profile: user.profile });
    logger.info('auth.sign_in', { userId: user.profile.id });
    return {};
  },

  signOut: async () => {
    closeSession(loadJson<Session | null>('session', null));
    persistSession(null);
    set({ profile: null });
  },

  updateProfile: (patch) => {
    const current = get().profile;
    if (!current) return;
    const updated = { ...current, ...patch };
    const users = get().users;
    const entry = Object.entries(users).find(([, u]) => u.profile.id === updated.id);
    if (entry) {
      const next = { ...users, [entry[0]]: { ...entry[1], profile: updated } };
      persistUsers(next);
      set({ users: next, profile: updated });
    }
  },

  requestPasswordReset: async (email) => {
    const cleanEmail = email.trim().toLowerCase();
    const user = get().users[cleanEmail];
    if (!user) return { ok: false, error: 'No account found with this email' };
    const code = String(Math.floor(100000 + Math.random() * 900000));
    saveJson(`reset_${user.profile.id}`, { code, createdAt: Date.now() });
    logger.info('auth.reset_requested', { userId: user.profile.id });
    return { ok: true, resetCode: code };
  },

  resetPassword: async (email, code, newPassword) => {
    const cleanEmail = email.trim().toLowerCase();
    const user = get().users[cleanEmail];
    if (!user) return { error: 'No account found with this email' };
    const stored = loadJson<{ code: string; createdAt: number } | null>(`reset_${user.profile.id}`, null);
    if (!stored || stored.code !== code.trim()) return { error: 'Invalid reset code' };
    if (Date.now() - stored.createdAt > 15 * 60_000) return { error: 'Reset code expired, request a new one' };
    if (newPassword.length < 6) return { error: 'Password must be at least 6 characters' };
    const salt = uid('salt');
    const next = {
      ...get().users,
      [cleanEmail]: { ...user, salt, hash: await hashPassword(newPassword, salt) },
    };
    persistUsers(next);
    removeKey(`reset_${user.profile.id}`);
    set({ users: next });
    return {};
  },

  changePassword: async (currentPassword, newPassword) => {
    const profile = get().profile;
    if (!profile) return { error: 'Not signed in' };
    const entry = Object.entries(get().users).find(([, u]) => u.profile.id === profile.id);
    if (!entry) return { error: 'Account not found' };
    const [email, user] = entry;

    if ((await hashPassword(currentPassword, user.salt)) !== user.hash) {
      return { error: 'Current password is incorrect' };
    }
    if (newPassword.length < 6) return { error: 'New password must be at least 6 characters' };
    if (newPassword === currentPassword) return { error: 'New password must be different' };

    const salt = uid('salt');
    const next = { ...get().users, [email]: { ...user, salt, hash: await hashPassword(newPassword, salt) } };
    persistUsers(next);
    set({ users: next });
    logger.info('auth.password_changed', { userId: profile.id });
    return {};
  },

  listSessions: () => {
    const profile = get().profile;
    if (!profile) return [];
    const current = loadJson<Session | null>('session', null);
    return activeSessions(profile.id).map((entry) => ({ ...entry, current: entry.id === current?.sessionId }));
  },

  revokeSession: async (sessionId) => {
    const profile = get().profile;
    if (!profile) return { signedOut: false };
    const current = loadJson<Session | null>('session', null);
    const registry = loadRegistry();
    saveRegistry({
      ...registry,
      [profile.id]: (registry[profile.id] ?? []).filter((entry) => entry.id !== sessionId),
    });
    logger.info('auth.session_revoked', { userId: profile.id, sessionId });

    if (current?.sessionId === sessionId) {
      persistSession(null);
      set({ profile: null });
      return { signedOut: true };
    }
    return { signedOut: false };
  },

  revokeOtherSessions: () => {
    const profile = get().profile;
    if (!profile) return 0;
    const current = loadJson<Session | null>('session', null);
    const registry = loadRegistry();
    const all = registry[profile.id] ?? [];
    const kept = all.filter((entry) => entry.id === current?.sessionId);
    saveRegistry({ ...registry, [profile.id]: kept });
    const removed = all.length - kept.length;
    if (removed > 0) logger.info('auth.sessions_revoked', { userId: profile.id, removed });
    return removed;
  },

  requestVerification: (channel) => {
    const profile = get().profile;
    const code = String(Math.floor(100000 + Math.random() * 900000));
    if (profile) saveJson(`verify_${channel}_${profile.id}`, { code, createdAt: Date.now() });
    return { code };
  },

  confirmVerification: (channel, code) => {
    const profile = get().profile;
    if (!profile) return { error: 'Not signed in' };
    const stored = loadJson<{ code: string; createdAt: number } | null>(`verify_${channel}_${profile.id}`, null);
    if (!stored || stored.code !== code.trim()) return { error: 'Invalid verification code' };
    if (Date.now() - stored.createdAt > 15 * 60_000) return { error: 'Code expired, request a new one' };
    removeKey(`verify_${channel}_${profile.id}`);
    get().updateProfile(channel === 'email' ? { emailVerified: true } : { phoneVerified: true });
    logger.info('auth.verified', { userId: profile.id, channel });
    return {};
  },

  listProfiles: () => Object.values(get().users).map((u) => u.profile),

  adminUpdateUser: (userId, patch) => {
    const users = get().users;
    const entry = Object.entries(users).find(([, u]) => u.profile.id === userId);
    if (!entry) return;
    const next = {
      ...users,
      [entry[0]]: { ...entry[1], profile: { ...entry[1].profile, ...patch } },
    };
    persistUsers(next);
    const cur = get().profile;
    set({ users: next, profile: cur && cur.id === userId ? next[entry[0]].profile : cur });
    logger.info('auth.admin_update_user', { userId, keys: Object.keys(patch) });
  },
}));

export function findProfileById(id: string): Profile | undefined {
  return Object.values(useAuth.getState().users).find((u) => u.profile.id === id)?.profile;
}
