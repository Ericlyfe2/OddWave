import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db';
import { callerWithSession } from './testContext';

beforeEach(async () => {
  await db.txn.deleteMany();
  await db.bet.deleteMany();
  await db.deviceSession.deleteMany();
  await db.rgLimits.deleteMany();
  await db.notificationPrefs.deleteMany();
  await db.user.deleteMany();
});

async function signedInCaller() {
  const caller = callerWithSession();
  await caller.auth.signUp({
    email: 'wallet-user@example.com',
    password: 'correcthorse',
    phone: '+233200000009',
    fullName: 'Wallet User',
  });
  return caller;
}

describe('wallet.deposit', () => {
  it('creates a successful deposit txn', async () => {
    const caller = await signedInCaller();
    const txn = await caller.wallet.deposit({ amount: 100, provider: 'momo' });
    expect(txn.type).toBe('deposit');
    expect(txn.status).toBe('success');
    expect(txn.amount).toBe(100);
  });
});

describe('wallet.requestWithdrawal', () => {
  it('rejects a withdrawal larger than the available balance', async () => {
    const caller = await signedInCaller();
    await caller.wallet.deposit({ amount: 50, provider: 'momo' });
    const result = await caller.wallet.requestWithdrawal({ amount: 100, momoNumber: '0244567890' });
    expect(result.error).toBe('Insufficient available balance');
  });

  it('creates a pending withdrawal within the available balance', async () => {
    const caller = await signedInCaller();
    await caller.wallet.deposit({ amount: 100, provider: 'momo' });
    const result = await caller.wallet.requestWithdrawal({ amount: 40, momoNumber: '0244567890' });
    expect(result.txn?.status).toBe('pending');
    expect(result.txn?.amount).toBe(-40);
  });

  it('excludes an already-pending withdrawal from the next available-balance check', async () => {
    const caller = await signedInCaller();
    await caller.wallet.deposit({ amount: 100, provider: 'momo' });
    await caller.wallet.requestWithdrawal({ amount: 60, momoNumber: '0244567890' });
    const second = await caller.wallet.requestWithdrawal({ amount: 60, momoNumber: '0244567890' });
    expect(second.error).toBe('Insufficient available balance');
  });
});

describe('wallet.listTxns', () => {
  it('returns only the caller\'s own txns, newest first', async () => {
    const caller = await signedInCaller();
    const other = callerWithSession();
    await other.auth.signUp({ email: 'other@example.com', password: 'correcthorse', phone: '+233200000009', fullName: 'Other' });
    await other.wallet.deposit({ amount: 999, provider: 'momo' });

    await caller.wallet.deposit({ amount: 10, provider: 'momo' });
    await caller.wallet.deposit({ amount: 20, provider: 'momo' });

    const txns = await caller.wallet.listTxns();
    expect(txns).toHaveLength(2);
    expect(txns[0].amount).toBe(20);
    expect(txns.every((t) => t.userId === txns[0].userId)).toBe(true);
  });
});

async function adminCaller() {
  const caller = callerWithSession();
  await caller.auth.signUp({ email: 'wallet-admin@example.com', password: 'correcthorse', phone: '+233200000009', fullName: 'Wallet Admin' });
  await db.user.update({ where: { email: 'wallet-admin@example.com' }, data: { role: 'admin' } });
  return caller;
}

describe('wallet.resolveWithdrawal', () => {
  it('approving marks the txn successful with no refund', async () => {
    const caller = await signedInCaller();
    await caller.wallet.deposit({ amount: 100, provider: 'momo' });
    const { txn } = await caller.wallet.requestWithdrawal({ amount: 40, momoNumber: '0244567890' });

    const admin = await adminCaller();
    await admin.wallet.resolveWithdrawal({ txnId: txn!.id, approve: true });

    const txns = await caller.wallet.listTxns();
    const resolved = txns.find((t) => t.id === txn!.id);
    expect(resolved?.status).toBe('success');
  });

  it('rejecting marks the txn failed and refunds the amount', async () => {
    const caller = await signedInCaller();
    await caller.wallet.deposit({ amount: 100, provider: 'momo' });
    const { txn } = await caller.wallet.requestWithdrawal({ amount: 40, momoNumber: '0244567890' });

    const admin = await adminCaller();
    await admin.wallet.resolveWithdrawal({ txnId: txn!.id, approve: false });

    const txns = await caller.wallet.listTxns();
    expect(txns.find((t) => t.id === txn!.id)?.status).toBe('failed');
    const refund = txns.find((t) => t.type === 'refund');
    expect(refund?.amount).toBe(40);
  });

  it('rejects a non-admin caller', async () => {
    const caller = await signedInCaller();
    await caller.wallet.deposit({ amount: 100, provider: 'momo' });
    const { txn } = await caller.wallet.requestWithdrawal({ amount: 40, momoNumber: '0244567890' });
    await expect(caller.wallet.resolveWithdrawal({ txnId: txn!.id, approve: true })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('wallet.adminAdjust', () => {
  it('creates an adjustment txn on the target user', async () => {
    const caller = await signedInCaller();
    const admin = await adminCaller();
    await admin.wallet.adminAdjust({ userId: (await caller.auth.me())!.id, amount: 15, reason: 'goodwill' });

    const txns = await caller.wallet.listTxns();
    expect(txns.find((t) => t.type === 'adjustment')?.amount).toBe(15);
  });
});
