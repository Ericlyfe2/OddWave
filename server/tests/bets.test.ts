import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db';
import { callerWithSession } from './testContext';

beforeEach(async () => {
  await db.bet.deleteMany();
  await db.txn.deleteMany();
  await db.deviceSession.deleteMany();
  await db.rgLimits.deleteMany();
  await db.notificationPrefs.deleteMany();
  await db.user.deleteMany();
});

async function signedInCaller() {
  const caller = callerWithSession();
  await caller.auth.signUp({
    email: 'bets-user@example.com',
    password: 'correcthorse',
    phone: '+233200000009',
    fullName: 'Bets User',
  });
  await caller.wallet.deposit({ amount: 100, provider: 'momo' });
  return caller;
}

function openLeg(overrides: Record<string, unknown> = {}) {
  return {
    matchId: 'm1',
    matchName: 'Home vs Away',
    leagueName: 'Test League',
    marketKey: '1x2',
    marketName: 'Match Result',
    outcomeCode: '1',
    outcomeLabel: 'Home',
    odds: 2,
    kickoff: Date.now() + 3_600_000,
    status: 'open' as const,
    matchStatus: 'upcoming' as const,
    marketSuspended: false,
    outcomeSuspended: false,
    ...overrides,
  };
}

describe('bets.place', () => {
  it('places a single bet and debits the stake', async () => {
    const caller = await signedInCaller();
    const result = await caller.bets.place({ type: 'single', stakePerCombo: 10, legs: [openLeg()] });
    expect(result.ok).toBe(true);
    expect(result.betIds).toHaveLength(1);

    const txns = await caller.wallet.listTxns();
    expect(txns.find((t) => t.type === 'stake')?.amount).toBe(-10);
  });

  it('rejects a stake exceeding available balance', async () => {
    const caller = await signedInCaller();
    const result = await caller.bets.place({ type: 'single', stakePerCombo: 500, legs: [openLeg()] });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Insufficient balance/);
  });

  it('rejects a leg reported as suspended', async () => {
    const caller = await signedInCaller();
    const result = await caller.bets.place({
      type: 'single',
      stakePerCombo: 10,
      legs: [openLeg({ outcomeSuspended: true })],
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/unavailable/i);
  });

  it('rejects a duplicate selection', async () => {
    const caller = await signedInCaller();
    const leg = openLeg();
    const result = await caller.bets.place({ type: 'multi', stakePerCombo: 10, legs: [leg, leg] });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Duplicate/);
  });

  it('debits bonus balance before cash, and never below zero', async () => {
    const caller = await signedInCaller();
    await db.user.update({ where: { email: 'bets-user@example.com' }, data: { bonusBalance: 5 } });
    const result = await caller.bets.place({
      type: 'single',
      stakePerCombo: 10,
      legs: [openLeg()],
      useBonus: 5,
    });
    expect(result.ok).toBe(true);
    const me = await caller.auth.me();
    expect(me?.bonusBalance).toBe(0);
    const txns = await caller.wallet.listTxns();
    // Only the cash portion (10 - 5 bonus) is debited from the wallet.
    expect(txns.find((t) => t.type === 'stake')?.amount).toBe(-5);
  });

  it('rejects the request entirely — and writes nothing — when validation fails before any DB write', async () => {
    const caller = await signedInCaller();
    // A stake whose potential payout exceeds LIMITS.maxPayout fails that
    // pre-transaction check and returns before `$transaction` is ever
    // entered, so no Bet row (or Txn) should exist afterward.
    const result = await caller.bets.place({
      type: 'single',
      stakePerCombo: 90,
      legs: [openLeg({ odds: 6000 })],
    });
    expect(result.ok).toBe(false);
    const bets = await db.bet.findMany({ where: { userId: (await caller.auth.me())!.id } });
    expect(bets).toHaveLength(0);
  });

  it('rejects both concurrent requests rather than overdrawing when two place calls race on the same balance', async () => {
    const caller = await signedInCaller();
    // Balance is 100. Two concurrent single bets at 60 each would both pass
    // a balance check taken from a stale pre-transaction read, overdrawing
    // to -20. The balance must be re-verified inside the transaction so at
    // most one of the two succeeds.
    const [a, b] = await Promise.all([
      caller.bets.place({ type: 'single', stakePerCombo: 60, legs: [openLeg()] }),
      caller.bets.place({ type: 'single', stakePerCombo: 60, legs: [openLeg({ matchId: 'm2' })] }),
    ]);
    const results = [a, b];
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toHaveLength(1);
    const txns = await caller.wallet.listTxns();
    const stakeTotal = txns.filter((t) => t.type === 'stake').reduce((sum, t) => sum + t.amount, 0);
    expect(stakeTotal).toBe(-60);
  });
});

function matchSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm1',
    status: 'live' as const,
    score: { home: 1, away: 0 },
    minute: 60,
    markets: [{ key: '1x2', suspended: false, outcomes: [{ code: '1', odds: 1.5, suspended: false }] }],
    ...overrides,
  };
}

describe('bets.listBets', () => {
  it('returns only the caller\'s own bets, newest first', async () => {
    const caller = await signedInCaller();
    await caller.bets.place({ type: 'single', stakePerCombo: 10, legs: [openLeg()] });
    const bets = await caller.bets.listBets();
    expect(bets).toHaveLength(1);
    expect(bets[0].userId).toBe((await caller.auth.me())!.id);
  });
});

describe('bets.cashOut', () => {
  it('credits the wallet and marks the bet cashed out on a full cash-out', async () => {
    const caller = await signedInCaller();
    const placed = await caller.bets.place({ type: 'single', stakePerCombo: 10, legs: [openLeg()] });
    const result = await caller.bets.cashOut({
      betId: placed.betIds![0],
      portion: 1,
      matches: [matchSnapshot()],
    });
    expect(result.ok).toBe(true);
    expect(result.amount).toBeGreaterThan(0);

    const bets = await caller.bets.listBets();
    expect(bets[0].status).toBe('cashed_out');
    const txns = await caller.wallet.listTxns();
    expect(txns.find((t) => t.type === 'cashout')?.amount).toBe(result.amount);
  });

  it('rejects cashing out a bet that is not open', async () => {
    const caller = await signedInCaller();
    const placed = await caller.bets.place({ type: 'single', stakePerCombo: 10, legs: [openLeg()] });
    await caller.bets.cashOut({ betId: placed.betIds![0], portion: 1, matches: [matchSnapshot()] });
    const second = await caller.bets.cashOut({ betId: placed.betIds![0], portion: 1, matches: [matchSnapshot()] });
    expect(second.ok).toBe(false);
  });

  it('rejects one of two concurrent cash-outs on the same bet rather than double-crediting the wallet', async () => {
    const caller = await signedInCaller();
    const placed = await caller.bets.place({ type: 'single', stakePerCombo: 10, legs: [openLeg()] });
    // Two truly concurrent cashOut calls for the SAME bet must not both see
    // status 'open': the row lock must serialize them so only one commits.
    const [a, b] = await Promise.all([
      caller.bets.cashOut({ betId: placed.betIds![0], portion: 1, matches: [matchSnapshot()] }),
      caller.bets.cashOut({ betId: placed.betIds![0], portion: 1, matches: [matchSnapshot()] }),
    ]);
    const results = [a, b];
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const failed = results.find((r) => !r.ok);
    expect(failed?.ok).toBe(false);
    expect((failed as { ok: false; error: string }).error).toMatch(/not active/i);

    const txns = await caller.wallet.listTxns();
    expect(txns.filter((t) => t.type === 'cashout')).toHaveLength(1);
  });
});

describe('bets.settle', () => {
  it('settles a won single and credits the payout', async () => {
    const caller = await signedInCaller();
    const placed = await caller.bets.place({ type: 'single', stakePerCombo: 10, legs: [openLeg()] });

    await caller.bets.settle({
      match: { id: 'm1', status: 'finished', score: { home: 1, away: 0 }, markets: [] },
    });

    const bets = await caller.bets.listBets();
    expect(bets.find((b) => b.id === placed.betIds![0])?.status).toBe('won');
    const txns = await caller.wallet.listTxns();
    expect(txns.find((t) => t.type === 'payout')?.amount).toBe(20);
  });

  it('ignores bets that reference a different match', async () => {
    const caller = await signedInCaller();
    const placed = await caller.bets.place({ type: 'single', stakePerCombo: 10, legs: [openLeg({ matchId: 'other-match' })] });
    await caller.bets.settle({ match: { id: 'm1', status: 'finished', score: { home: 1, away: 0 }, markets: [] } });
    const bets = await caller.bets.listBets();
    expect(bets.find((b) => b.id === placed.betIds![0])?.status).toBe('open');
  });

  it('rejects double-crediting a payout when two settle calls race on the same match', async () => {
    const caller = await signedInCaller();
    const placed = await caller.bets.place({ type: 'single', stakePerCombo: 10, legs: [openLeg()] });
    const match = { id: 'm1', status: 'finished' as const, score: { home: 1, away: 0 }, markets: [] };
    // Two truly concurrent settle calls covering the same finished match must
    // not both observe the bet's status as 'open': the row lock must
    // serialize them so only one creates a payout Txn.
    await Promise.all([caller.bets.settle({ match }), caller.bets.settle({ match })]);

    const bets = await caller.bets.listBets();
    expect(bets.find((b) => b.id === placed.betIds![0])?.status).toBe('won');
    const txns = await caller.wallet.listTxns();
    expect(txns.filter((t) => t.type === 'payout')).toHaveLength(1);
  });
});

async function adminCaller() {
  const caller = callerWithSession();
  await caller.auth.signUp({ email: 'bets-admin@example.com', password: 'correcthorse', phone: '+233200000019', fullName: 'Bets Admin' });
  await db.user.update({ where: { email: 'bets-admin@example.com' }, data: { role: 'admin' } });
  return caller;
}

describe('bets.voidBet', () => {
  it('refunds the stake and marks the bet void', async () => {
    const caller = await signedInCaller();
    const placed = await caller.bets.place({ type: 'single', stakePerCombo: 10, legs: [openLeg()] });
    const admin = await adminCaller();

    await admin.bets.voidBet({ betId: placed.betIds![0], reason: 'trading_error' });

    const bets = await caller.bets.listBets();
    expect(bets.find((b) => b.id === placed.betIds![0])?.status).toBe('void');
    const txns = await caller.wallet.listTxns();
    expect(txns.find((t) => t.type === 'refund')?.amount).toBe(10);
  });

  it('rejects a non-admin caller', async () => {
    const caller = await signedInCaller();
    const placed = await caller.bets.place({ type: 'single', stakePerCombo: 10, legs: [openLeg()] });
    await expect(caller.bets.voidBet({ betId: placed.betIds![0], reason: 'x' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('refunds only stake minus usedBonus, not the full stake', async () => {
    const caller = await signedInCaller();
    await db.user.update({ where: { email: 'bets-user@example.com' }, data: { bonusBalance: 5 } });
    const placed = await caller.bets.place({ type: 'single', stakePerCombo: 10, legs: [openLeg()], useBonus: 5 });
    const admin = await adminCaller();

    await admin.bets.voidBet({ betId: placed.betIds![0], reason: 'trading_error' });

    const txns = await caller.wallet.listTxns();
    expect(txns.find((t) => t.type === 'refund')?.amount).toBe(5);
  });

  it('rejects double-refunding when two voidBet calls race on the same bet', async () => {
    const caller = await signedInCaller();
    const placed = await caller.bets.place({ type: 'single', stakePerCombo: 10, legs: [openLeg()] });
    const admin = await adminCaller();
    // Two truly concurrent voidBet calls on the same open bet must not both
    // observe status 'open': the row lock must serialize them so only one
    // succeeds and only one refund Txn is created.
    const results = await Promise.allSettled([
      admin.bets.voidBet({ betId: placed.betIds![0], reason: 'a' }),
      admin.bets.voidBet({ betId: placed.betIds![0], reason: 'b' }),
    ]);

    const bets = await caller.bets.listBets();
    expect(bets.find((b) => b.id === placed.betIds![0])?.status).toBe('void');
    const txns = await caller.wallet.listTxns();
    expect(txns.filter((t) => t.type === 'refund')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  });
});
