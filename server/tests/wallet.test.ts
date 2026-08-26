import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db';
import { callerWithSession } from './testContext';
import { sweepWithdrawals } from '../src/walletSweep';

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

  it('rejects a deposit below the minimum', async () => {
    const caller = await signedInCaller();
    await expect(caller.wallet.deposit({ amount: 1, provider: 'momo' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('rejects a deposit above the maximum', async () => {
    const caller = await signedInCaller();
    await expect(caller.wallet.deposit({ amount: 999999, provider: 'momo' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
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

  it('rejects an amount below the minimum', async () => {
    const caller = await signedInCaller();
    await caller.wallet.deposit({ amount: 100, provider: 'momo' });
    const result = await caller.wallet.requestWithdrawal({ amount: 5, momoNumber: '0244567890' });
    expect(result.error).toMatch(/must be between/);
  });

  it('rejects an amount above the maximum', async () => {
    const caller = await signedInCaller();
    // The min/max bounds check runs before the balance/transaction check,
    // so no deposit is needed here — an over-the-max amount is rejected
    // regardless of balance.
    const result = await caller.wallet.requestWithdrawal({ amount: 99999, momoNumber: '0244567890' });
    expect(result.error).toMatch(/must be between/);
  });

  it('rejects one of two concurrent withdrawal requests that together exceed the balance', async () => {
    const caller = await signedInCaller();
    await caller.wallet.deposit({ amount: 100, provider: 'momo' });
    // Balance is 100. Two concurrent withdrawals of 60 each would both pass
    // a balance check taken from a stale pre-transaction read. The row lock
    // must serialize them so only one succeeds.
    const [a, b] = await Promise.all([
      caller.wallet.requestWithdrawal({ amount: 60, momoNumber: '0244567890' }),
      caller.wallet.requestWithdrawal({ amount: 60, momoNumber: '0244567891' }),
    ]);
    const results = [a, b];
    expect(results.filter((r) => r.txn)).toHaveLength(1);
    expect(results.filter((r) => r.error)).toHaveLength(1);
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

  it('resolves exactly once when an admin rejection races the auto-approve sweep on the same withdrawal', async () => {
    const caller = await signedInCaller();
    await caller.wallet.deposit({ amount: 100, provider: 'momo' });
    const { txn } = await caller.wallet.requestWithdrawal({ amount: 40, momoNumber: '0244567890' });
    // Backdate the txn so the sweep considers it eligible for auto-approval,
    // then race the admin's reject-and-refund against the sweep's approval.
    // Exactly one of the two writes must win: either the txn ends up
    // 'failed' with a matching refund, or 'success' with no refund — never
    // both a refund AND a success status.
    await db.txn.update({ where: { id: txn!.id }, data: { createdAt: new Date(Date.now() - 200_000) } });

    const admin = await adminCaller();
    await Promise.allSettled([
      admin.wallet.resolveWithdrawal({ txnId: txn!.id, approve: false }),
      sweepWithdrawals(db),
    ]);

    const txns = await caller.wallet.listTxns();
    const resolved = txns.find((t) => t.id === txn!.id)!;
    const refunds = txns.filter((t) => t.type === 'refund');

    // Whichever write won the race, the ledger must be internally
    // consistent and each outcome must occur exactly once: a 'failed'
    // status always has exactly one refund, and a 'success' status never
    // has one — never both.
    expect(['failed', 'success']).toContain(resolved.status);
    if (resolved.status === 'failed') {
      expect(refunds).toHaveLength(1);
    } else {
      expect(refunds).toHaveLength(0);
    }
  });
});

describe('wallet.listPendingWithdrawals', () => {
  it('rejects a non-admin caller', async () => {
    const caller = await signedInCaller();
    await expect(caller.wallet.listPendingWithdrawals()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('shows a pending withdrawal belonging to a different user', async () => {
    const caller = await signedInCaller();
    await caller.wallet.deposit({ amount: 100, provider: 'momo' });
    const { txn } = await caller.wallet.requestWithdrawal({ amount: 40, momoNumber: '0244567890' });

    const admin = await adminCaller();
    const pending = await admin.wallet.listPendingWithdrawals();
    expect(pending.find((t) => t.id === txn!.id)?.userId).toBe(txn!.userId);
    expect(pending.find((t) => t.id === txn!.id)?.userId).not.toBe((await admin.auth.me())!.id);
  });
});

describe('wallet.balancesFor', () => {
  it('rejects a non-admin caller', async () => {
    const caller = await signedInCaller();
    await expect(caller.wallet.balancesFor({ userIds: [(await caller.auth.me())!.id] })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('returns correct balance/locked figures for multiple users including one that is not the caller', async () => {
    const caller = await signedInCaller();
    await caller.wallet.deposit({ amount: 100, provider: 'momo' });
    await caller.wallet.requestWithdrawal({ amount: 30, momoNumber: '0244567890' });

    const admin = await adminCaller();
    const callerId = (await caller.auth.me())!.id;
    const adminId = (await admin.auth.me())!.id;

    const balances = await admin.wallet.balancesFor({ userIds: [callerId, adminId] });
    const callerBalance = balances.find((b) => b.userId === callerId);
    const adminBalance = balances.find((b) => b.userId === adminId);

    expect(callerBalance).toMatchObject({ balance: 100, locked: 30 });
    expect(adminBalance).toMatchObject({ balance: 0, locked: 0 });
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
