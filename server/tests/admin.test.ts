import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db';
import type { SessionData } from '../src/session';
import { callerWithSession } from './testContext';

beforeEach(async () => {
  await db.deviceSession.deleteMany();
  await db.rgLimits.deleteMany();
  await db.notificationPrefs.deleteMany();
  await db.user.deleteMany();
});

async function signUpAs(role: 'user' | 'admin', email: string) {
  const session: SessionData = {};
  const caller = callerWithSession(session);
  await caller.auth.signUp({ email, password: 'correcthorse', phone: '+233200000009', fullName: 'Test User' });
  if (role === 'admin') await db.user.update({ where: { email }, data: { role: 'admin' } });
  return caller;
}

describe('admin.listUsers / updateUser', () => {
  it('rejects a non-admin caller', async () => {
    const caller = await signUpAs('user', 'plain@example.com');
    await expect(caller.admin.listUsers()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('rejects an unauthenticated caller', async () => {
    await expect(callerWithSession().admin.listUsers()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('lists every user for an admin caller', async () => {
    await signUpAs('user', 'one@example.com');
    const admin = await signUpAs('admin', 'the-admin@example.com');
    const users = await admin.admin.listUsers();
    expect(users.map((u) => u.email).sort()).toEqual(['one@example.com', 'the-admin@example.com']);
  });

  it('lets an admin suspend and un-suspend another user', async () => {
    await signUpAs('user', 'target@example.com');
    const admin = await signUpAs('admin', 'the-admin2@example.com');
    const target = (await admin.admin.listUsers()).find((u) => u.email === 'target@example.com')!;

    const suspended = await admin.admin.updateUser({ userId: target.id, patch: { suspended: true } });
    expect(suspended?.suspended).toBe(true);

    const restored = await admin.admin.updateUser({ userId: target.id, patch: { suspended: false } });
    expect(restored?.suspended).toBe(false);
  });

  it('lets an admin promote another user to admin', async () => {
    await signUpAs('user', 'promote-me@example.com');
    const admin = await signUpAs('admin', 'the-admin3@example.com');
    const target = (await admin.admin.listUsers()).find((u) => u.email === 'promote-me@example.com')!;

    const promoted = await admin.admin.updateUser({ userId: target.id, patch: { role: 'admin' } });
    expect(promoted?.role).toBe('admin');
  });
});
