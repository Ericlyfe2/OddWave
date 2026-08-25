import { describe, it, expect } from 'vitest';
import { cashoutValue } from '../src/lib/cashout';
import type { Bet } from '../src/lib/types';

function openSingle(overrides: Partial<Bet> = {}): Bet {
  return {
    id: 'b1',
    userId: 'u1',
    bookingCode: 'ABC12345',
    type: 'single',
    stake: 10,
    totalOdds: 2,
    potential: 20,
    usedBonus: 0,
    legs: [
      {
        matchId: 'm1',
        matchName: 'Home vs Away',
        leagueName: 'Test League',
        marketKey: '1x2',
        marketName: 'Match Result',
        outcomeCode: '1',
        outcomeLabel: 'Home',
        odds: 2,
        kickoff: Date.now() - 600_000,
        status: 'open',
      },
    ],
    status: 'open',
    placedAt: Date.now(),
    ...overrides,
  };
}

describe('cashoutValue', () => {
  it('is unavailable once the bet is no longer open', () => {
    const bet = openSingle({ status: 'won' });
    const result = cashoutValue(bet, {});
    expect(result.available).toBe(false);
  });

  it('is unavailable when the referenced match is missing from the snapshot map', () => {
    const bet = openSingle();
    const result = cashoutValue(bet, {});
    // No snapshot at all reads as "awaiting settlement" (finishedOrMissing branch),
    // matching today's behavior when liveEngine.get() returns undefined.
    expect(result.available).toBe(false);
  });

  it('offers a value for a live match with matching market/outcome data', () => {
    const bet = openSingle();
    const result = cashoutValue(bet, {
      m1: {
        id: 'm1',
        status: 'live',
        score: { home: 1, away: 0 },
        minute: 60,
        markets: [
          { key: '1x2', suspended: false, outcomes: [{ code: '1', odds: 1.5, suspended: false }] },
        ],
      },
    });
    expect(result.available).toBe(true);
    expect(result.amount).toBeGreaterThan(0);
  });
});
