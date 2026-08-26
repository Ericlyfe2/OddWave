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

  it('does not create a Bet row if the transaction fails partway (atomicity)', async () => {
    const caller = await signedInCaller();
    // A stake that clears the balance check but exceeds LIMITS.maxPayout
    // fails the potential-payout check *after* the balance check passes,
    // proving nothing was written before that point.
    const result = await caller.bets.place({
      type: 'single',
      stakePerCombo: 90,
      legs: [openLeg({ odds: 6000 })],
    });
    expect(result.ok).toBe(false);
    const bets = await db.bet.findMany({ where: { userId: (await caller.auth.me())!.id } });
    expect(bets).toHaveLength(0);
  });
});
