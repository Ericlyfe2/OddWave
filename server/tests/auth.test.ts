import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db';
import { callerWithSession } from './testContext';
import type { SessionData } from '../src/session';

beforeEach(async () => {
  await db.deviceSession.deleteMany();
  await db.rgLimits.deleteMany();
  await db.notificationPrefs.deleteMany();
  await db.user.deleteMany();
});

async function signedInCaller() {
  const session: SessionData = {};
  const caller = callerWithSession(session);
  await caller.auth.signUp({
    email: 'session-user@example.com',
    password: 'correcthorse',
    phone: '+233200000009',
    fullName: 'Session User',
  });
  return { caller, session };
}

describe('auth.signUp', () => {
  it('creates a user and returns a profile with default limits and prefs', async () => {
    const caller = callerWithSession();
    const result = await caller.auth.signUp({
      email: 'New.Player@Example.com',
      password: 'longenough',
      phone: '+233200000009',
      fullName: 'New Player',
    });

    expect(result.error).toBeUndefined();
    expect(result.profile?.email).toBe('new.player@example.com'); // lowercased
    expect(result.profile?.rgLimits).toEqual({
      depositLimit: null,
      lossLimit: null,
      sessionReminderMin: null,
      selfExcludedUntil: null,
    });
    expect(result.profile?.notifPrefs).toEqual({ betUpdates: true, promotions: true, liveEvents: true });

    const stored = await db.user.findUnique({ where: { email: 'new.player@example.com' } });
    expect(stored).not.toBeNull();
    expect(stored?.passwordHash).not.toBe('longenough'); // hashed, not plaintext
  });

  it('rejects a password under 6 characters', async () => {
    const result = await callerWithSession().auth.signUp({
      email: 'short@example.com',
      password: '123',
      phone: '+233200000009',
      fullName: 'Short Pw',
    });
    expect(result.error).toBe('Password must be at least 6 characters');
  });

  it('rejects a duplicate email', async () => {
    await callerWithSession().auth.signUp({
      email: 'dup@example.com',
      password: 'longenough',
      phone: '+233200000009',
      fullName: 'First',
    });
    const result = await callerWithSession().auth.signUp({
      email: 'DUP@example.com',
      password: 'longenough2',
      phone: '+233200000009',
      fullName: 'Second',
    });
    expect(result.error).toBe('An account with this email already exists');
  });
});

describe('auth.signIn', () => {
  it('signs in with the correct password', async () => {
    await callerWithSession().auth.signUp({
      email: 'login@example.com',
      password: 'correcthorse',
      phone: '+233200000009',
      fullName: 'Login Test',
    });
    const result = await callerWithSession().auth.signIn({ email: 'login@example.com', password: 'correcthorse' });
    expect(result.error).toBeUndefined();
    expect(result.profile?.email).toBe('login@example.com');
  });

  it('rejects the wrong password', async () => {
    await callerWithSession().auth.signUp({
      email: 'wrongpw@example.com',
      password: 'correcthorse',
      phone: '+233200000009',
      fullName: 'Wrong Pw',
    });
    const result = await callerWithSession().auth.signIn({ email: 'wrongpw@example.com', password: 'nope' });
    expect(result.error).toBe('Incorrect email or password');
  });

  it('rejects an unknown email', async () => {
    const result = await callerWithSession().auth.signIn({ email: 'nobody@example.com', password: 'whatever' });
    expect(result.error).toBe('No account found with this email');
  });

  it('rejects a self-excluded account', async () => {
    const signUp = await callerWithSession().auth.signUp({
      email: 'excluded@example.com',
      password: 'correcthorse',
      phone: '+233200000009',
      fullName: 'Excluded',
    });
    await db.rgLimits.update({
      where: { userId: signUp.profile!.id },
      data: { selfExcludedUntil: new Date(Date.now() + 86_400_000) },
    });
    const result = await callerWithSession().auth.signIn({ email: 'excluded@example.com', password: 'correcthorse' });
    expect(result.error).toBe('Account is under self-exclusion until further notice');
  });
});

describe('auth.me / signOut / updateProfile', () => {
  it('me returns null when signed out', async () => {
    const result = await callerWithSession().auth.me();
    expect(result).toBeNull();
  });

  it('me returns the current profile once signed in', async () => {
    const { caller } = await signedInCaller();
    const me = await caller.auth.me();
    expect(me?.email).toBe('session-user@example.com');
  });

  it('signOut clears the session so me returns null again', async () => {
    const { caller } = await signedInCaller();
    await caller.auth.signOut();
    const me = await caller.auth.me();
    expect(me).toBeNull();
  });

  it('updateProfile updates allowed fields but ignores role/suspended', async () => {
    const { caller } = await signedInCaller();
    const updated = await caller.auth.updateProfile({
      fullName: 'Renamed',
      role: 'admin',
      suspended: true,
    } as never);
    expect(updated?.fullName).toBe('Renamed');
    expect(updated?.role).toBe('user');
    expect(updated?.suspended).toBe(false);
  });

  it('updateProfile persists bonusBalance and claimedPromos', async () => {
    const { caller } = await signedInCaller();
    const updated = await caller.auth.updateProfile({
      bonusBalance: 50,
      claimedPromos: ['welcome'],
    });
    expect(updated?.bonusBalance).toBe(50);
    expect(updated?.claimedPromos).toEqual(['welcome']);

    const me = await caller.auth.me();
    expect(me?.bonusBalance).toBe(50);
    expect(me?.claimedPromos).toEqual(['welcome']);
  });
});

describe('auth.changePassword', () => {
  it('rejects the wrong current password', async () => {
    const { caller } = await signedInCaller();
    const result = await caller.auth.changePassword({ currentPassword: 'wrong', newPassword: 'newenough' });
    expect(result.error).toBe('Current password is incorrect');
  });

  it('rejects a new password under 6 characters', async () => {
    const { caller } = await signedInCaller();
    const result = await caller.auth.changePassword({ currentPassword: 'correcthorse', newPassword: 'abc' });
    expect(result.error).toBe('New password must be at least 6 characters');
  });

  it('replaces the password so only the new one signs in', async () => {
    const { caller } = await signedInCaller();
    const result = await caller.auth.changePassword({ currentPassword: 'correcthorse', newPassword: 'newenough' });
    expect(result.error).toBeUndefined();

    const oldPw = await callerWithSession().auth.signIn({ email: 'session-user@example.com', password: 'correcthorse' });
    expect(oldPw.error).toBe('Incorrect email or password');
    const newPw = await callerWithSession().auth.signIn({ email: 'session-user@example.com', password: 'newenough' });
    expect(newPw.error).toBeUndefined();
  });
});

describe('session management', () => {
  it('listSessions marks the current session and includes a second device', async () => {
    const { caller, session } = await signedInCaller();
    const otherSession: SessionData = {};
    await callerWithSession(otherSession).auth.signIn({ email: 'session-user@example.com', password: 'correcthorse' });

    const sessions = await caller.auth.listSessions();
    expect(sessions).toHaveLength(2);
    expect(sessions.filter((s) => s.current)).toHaveLength(1);
    expect(sessions.find((s) => s.current)?.id).toBe(session.sessionId);
  });

  it('revokeSession on another device does not sign the caller out', async () => {
    const { caller } = await signedInCaller();
    const otherSession: SessionData = {};
    await callerWithSession(otherSession).auth.signIn({ email: 'session-user@example.com', password: 'correcthorse' });
    const otherId = otherSession.sessionId!;

    const result = await caller.auth.revokeSession({ sessionId: otherId });
    expect(result.signedOut).toBe(false);
    expect(await caller.auth.me()).not.toBeNull();
    expect(await caller.auth.listSessions()).toHaveLength(1);
  });

  it('revokeSession on your own current session signs you out', async () => {
    const { caller, session } = await signedInCaller();
    const result = await caller.auth.revokeSession({ sessionId: session.sessionId! });
    expect(result.signedOut).toBe(true);
    expect(await caller.auth.me()).toBeNull();
  });

  it('revokeOtherSessions leaves only the caller signed in', async () => {
    const { caller } = await signedInCaller();
    for (let i = 0; i < 2; i++) {
      await callerWithSession({}).auth.signIn({ email: 'session-user@example.com', password: 'correcthorse' });
    }
    expect(await caller.auth.listSessions()).toHaveLength(3);

    const removed = await caller.auth.revokeOtherSessions();
    expect(removed).toBe(2);
    expect(await caller.auth.listSessions()).toHaveLength(1);
    expect(await caller.auth.me()).not.toBeNull();
  });

  it('a revoked session stops working immediately, not just once its cookie eventually expires', async () => {
    // Regression: the session cookie is a self-contained signed blob valid for
    // its own 30-day lifetime independent of the database — revoking a device
    // only used to delete its DeviceSession row, with nothing checking that
    // row's continued existence on later requests, so a "revoked" device kept
    // working (me, and every protectedProcedure call) until its cookie
    // naturally expired.
    const { caller } = await signedInCaller();
    const otherSession: SessionData = {};
    const otherCaller = callerWithSession(otherSession);
    await otherCaller.auth.signIn({ email: 'session-user@example.com', password: 'correcthorse' });
    expect(await otherCaller.auth.me()).not.toBeNull();

    await caller.auth.revokeOtherSessions();

    expect(await otherCaller.auth.me()).toBeNull();
    await expect(otherCaller.auth.changePassword({ currentPassword: 'x', newPassword: 'y' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });
});

describe('password reset', () => {
  it('issues a code and accepts it once', async () => {
    await callerWithSession().auth.signUp({
      email: 'reset-me@example.com',
      password: 'correcthorse',
      phone: '+233200000009',
      fullName: 'Reset Me',
    });
    const req = await callerWithSession().auth.requestPasswordReset({ email: 'reset-me@example.com' });
    expect(req.ok).toBe(true);
    expect(req.resetCode).toMatch(/^\d{6}$/);

    const result = await callerWithSession().auth.resetPassword({
      email: 'reset-me@example.com',
      code: req.resetCode!,
      newPassword: 'brandnewpw',
    });
    expect(result.error).toBeUndefined();

    const signIn = await callerWithSession().auth.signIn({ email: 'reset-me@example.com', password: 'brandnewpw' });
    expect(signIn.error).toBeUndefined();
  });

  it('rejects an invalid code', async () => {
    await callerWithSession().auth.signUp({
      email: 'badcode@example.com',
      password: 'correcthorse',
      phone: '+233200000009',
      fullName: 'Bad Code',
    });
    await callerWithSession().auth.requestPasswordReset({ email: 'badcode@example.com' });
    const result = await callerWithSession().auth.resetPassword({
      email: 'badcode@example.com',
      code: '000000',
      newPassword: 'brandnewpw',
    });
    expect(result.error).toBe('Invalid reset code');
  });
});

describe('contact verification', () => {
  it('marks a channel verified only for the issued code', async () => {
    const { caller } = await signedInCaller();
    const req = await caller.auth.requestVerification({ channel: 'email' });
    expect(req.code).toMatch(/^\d{6}$/);

    const wrong = await caller.auth.confirmVerification({ channel: 'email', code: '000000' });
    expect(wrong.error).toBe('Invalid verification code');

    const right = await caller.auth.confirmVerification({ channel: 'email', code: req.code });
    expect(right.error).toBeUndefined();

    const me = await caller.auth.me();
    expect(me?.emailVerified).toBe(true);
    expect(me?.phoneVerified).toBe(false);
  });
});

describe('notifPrefsFor', () => {
  it('returns another user’s prefs by id for a signed-in caller', async () => {
    const { caller } = await signedInCaller();
    const other = await callerWithSession().auth.signUp({
      email: 'other-prefs@example.com',
      password: 'correcthorse',
      phone: '+233200000009',
      fullName: 'Other Prefs',
    });
    const prefs = await caller.auth.notifPrefsFor({ userId: other.profile!.id });
    expect(prefs).toEqual({ betUpdates: true, promotions: true, liveEvents: true });
  });

  it('returns null for an unknown user id', async () => {
    const { caller } = await signedInCaller();
    const prefs = await caller.auth.notifPrefsFor({ userId: 'does-not-exist' });
    expect(prefs).toBeNull();
  });
});
