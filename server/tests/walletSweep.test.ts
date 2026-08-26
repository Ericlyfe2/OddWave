import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db';
import { sweepWithdrawals } from '../src/walletSweep';

beforeEach(async () => {
  await db.txn.deleteMany();
  await db.bet.deleteMany();
  await db.deviceSession.deleteMany();
  await db.rgLimits.deleteMany();
  await db.notificationPrefs.deleteMany();
  await db.user.deleteMany();
});

async function makeUser() {
  return db.user.create({
    data: { email: `sweep-${Date.now()}@example.com`, passwordHash: 'x', phone: '+233200000009', fullName: 'Sweep User' },
  });
}

describe('sweepWithdrawals', () => {
  it('approves a pending withdrawal older than the threshold', async () => {
    const user = await makeUser();
    await db.txn.create({
      data: {
        userId: user.id,
        type: 'withdrawal',
        amount: -40,
        status: 'pending',
        ref: 'WD-OLD',
        createdAt: new Date(Date.now() - 200_000),
      },
    });
    const approved = await sweepWithdrawals(db);
    expect(approved).toBe(1);
    const txn = await db.txn.findFirst({ where: { userId: user.id } });
    expect(txn?.status).toBe('success');
  });

  it('leaves a recent pending withdrawal untouched', async () => {
    const user = await makeUser();
    await db.txn.create({
      data: { userId: user.id, type: 'withdrawal', amount: -40, status: 'pending', ref: 'WD-NEW' },
    });
    const approved = await sweepWithdrawals(db);
    expect(approved).toBe(0);
  });
});
