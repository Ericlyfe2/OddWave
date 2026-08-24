import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db';
import { callerWithSession } from './testContext';

beforeEach(async () => {
  await db.deviceSession.deleteMany();
  await db.rgLimits.deleteMany();
  await db.notificationPrefs.deleteMany();
  await db.user.deleteMany();
});

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
