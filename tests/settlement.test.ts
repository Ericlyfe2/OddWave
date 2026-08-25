import { describe, it, expect } from 'vitest';
import { outcomeResult } from '../src/lib/outcomes';
import type { Match } from '../src/lib/types';

function finishedMatch(home: number, away: number): Match {
  return {
    id: 'test:1',
    sportId: 'football',
    leagueId: 'ghpl',
    leagueName: 'Ghana Premier League',
    country: 'Ghana',
    home: { id: 'h', name: 'Home FC', short: 'HFC', color: '#00a565' },
    away: { id: 'a', name: 'Away United', short: 'AUN', color: '#f79009' },
    kickoff: Date.now() - 7200000,
    status: 'finished',
    score: { home, away },
    markets: [],
  };
}

describe('outcomeResult', () => {
  it('resolves 1x2 correctly', () => {
    const m = finishedMatch(2, 1);
    expect(outcomeResult(m, '1x2', '1')).toBe('won');
    expect(outcomeResult(m, '1x2', 'X')).toBe('lost');
    expect(outcomeResult(m, '1x2', '2')).toBe('lost');
  });

  it('resolves draws', () => {
    const m = finishedMatch(1, 1);
    expect(outcomeResult(m, '1x2', 'X')).toBe('won');
    expect(outcomeResult(m, 'dc', '1X')).toBe('won');
    expect(outcomeResult(m, 'dc', 'X2')).toBe('won');
    expect(outcomeResult(m, 'dc', '12')).toBe('lost');
  });

  it('resolves double chance with away win', () => {
    const m = finishedMatch(0, 2);
    expect(outcomeResult(m, 'dc', 'X2')).toBe('won');
    expect(outcomeResult(m, 'dc', '1X')).toBe('lost');
    expect(outcomeResult(m, 'dc', '12')).toBe('won');
  });

  it('resolves over/under totals', () => {
    const m = finishedMatch(2, 1);
    expect(outcomeResult(m, 'ou', 'over_2.5')).toBe('won');
    expect(outcomeResult(m, 'ou', 'under_2.5')).toBe('lost');

    const low = finishedMatch(1, 0);
    expect(outcomeResult(low, 'ou', 'under_2.5')).toBe('won');
    expect(outcomeResult(low, 'ou', 'over_2.5')).toBe('lost');
  });

  it('resolves BTTS', () => {
    const yes = finishedMatch(2, 1);
    expect(outcomeResult(yes, 'btts', 'btts_yes')).toBe('won');
    expect(outcomeResult(yes, 'btts', 'btts_no')).toBe('lost');

    const no = finishedMatch(2, 0);
    expect(outcomeResult(no, 'btts', 'btts_no')).toBe('won');
    expect(outcomeResult(no, 'btts', 'btts_yes')).toBe('lost');
  });

  it('voids handicap when adjusted result is a push', () => {
    const m = finishedMatch(2, 1);
    expect(outcomeResult(m, 'hcp', 'hcp_1')).toBe('void');
    expect(outcomeResult(m, 'hcp', 'hcp_2')).toBe('void');

    const big = finishedMatch(3, 1);
    expect(outcomeResult(big, 'hcp', 'hcp_1')).toBe('won');

    const tight = finishedMatch(1, 0);
    expect(outcomeResult(tight, 'hcp', 'hcp_2')).toBe('void');
  });

  it('treats unknown codes as void', () => {
    const m = finishedMatch(1, 0);
    expect(outcomeResult(m, 'unknown_market', 'zzz')).toBe('void');
  });
});
