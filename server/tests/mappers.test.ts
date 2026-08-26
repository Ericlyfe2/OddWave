import { describe, it, expect } from 'vitest';
import { mapTxn, mapBet } from '../src/mappers';

describe('mapTxn', () => {
  it('converts Decimal amount to a number and dates to epoch ms', () => {
    const row = {
      id: 't1',
      userId: 'u1',
      type: 'deposit',
      amount: { toString: () => '25.50' } as never, // Prisma.Decimal stand-in
      status: 'success',
      ref: 'MOMO-ABC123',
      meta: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      resolvedAt: null,
    };
    const mapped = mapTxn(row);
    expect(mapped.amount).toBe(25.5);
    expect(mapped.createdAt).toBe(new Date('2026-01-01T00:00:00Z').getTime());
    expect(mapped.resolvedAt).toBeUndefined();
  });
});

describe('mapBet', () => {
  it('converts Decimal fields and passes legs through as-is', () => {
    const legs = [{ matchId: 'm1', outcomeCode: '1', odds: 2, status: 'open' }];
    const row = {
      id: 'b1',
      userId: 'u1',
      bookingCode: 'ABC12345',
      type: 'single',
      stake: { toString: () => '10' } as never,
      totalOdds: { toString: () => '2' } as never,
      potential: { toString: () => '20' } as never,
      comboCount: null,
      systemConfig: null,
      legs,
      status: 'open',
      payout: null,
      cashoutAmount: null,
      cashoutHistory: null,
      usedBonus: { toString: () => '0' } as never,
      placedAt: new Date('2026-01-01T00:00:00Z'),
      settledAt: null,
    };
    const mapped = mapBet(row);
    expect(mapped.stake).toBe(10);
    expect(mapped.legs).toEqual(legs);
    expect(mapped.usedBonus).toBe(0);
  });
});
