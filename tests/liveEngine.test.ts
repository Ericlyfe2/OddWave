import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { liveEngine } from '../src/lib/liveEngine';
import { buildVirtualMatches } from '../src/lib/dataGen';
import type { Match } from '../src/lib/types';

function runToFullTime(match: Match, maxTicks = 400): void {
  liveEngine.registerAll([match]);
  match.status = 'live';
  match.minute = 0;
  match.score = { home: 0, away: 0 };
  for (let i = 0; i < maxTicks && match.status === 'live'; i++) {
    liveEngine.tick();
  }
}

describe('live engine scoring', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('produces realistic football scorelines over a full virtual round', () => {
    const totals: number[] = [];
    for (const match of buildVirtualMatches(1750000000000)) {
      runToFullTime(match);
      expect(match.status).toBe('finished');
      totals.push((match.score?.home ?? 0) + (match.score?.away ?? 0));
    }
    expect(totals.length).toBeGreaterThan(0);
    // A per-tick goal roll used to produce double-digit football scores.
    for (const total of totals) expect(total).toBeLessThanOrEqual(8);
    const average = totals.reduce((a, b) => a + b, 0) / totals.length;
    expect(average).toBeLessThan(6);
  });

  it('restarts virtual rounds after the interval so live betting never runs dry', () => {
    const [match] = buildVirtualMatches(1750000000000);
    runToFullTime(match);
    expect(match.status).toBe('finished');

    vi.advanceTimersByTime(60_000);
    expect(match.status).toBe('live');
    expect(match.score).toEqual({ home: 0, away: 0 });
    expect(match.markets.every((mk) => !mk.suspended)).toBe(true);
  });
});
