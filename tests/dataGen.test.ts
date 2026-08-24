import { describe, it, expect } from 'vitest';
import { buildMatchesForDay, buildVirtualMatches, getLeagues, VIRTUAL_LEAGUE_ID } from '../src/lib/dataGen';

describe('getLeagues', () => {
  it('lists all leagues', () => {
    expect(getLeagues().length).toBeGreaterThanOrEqual(10);
  });

  it('filters by sport', () => {
    const football = getLeagues('football');
    expect(football.length).toBeGreaterThan(0);
    expect(football.every((l) => l.sportId === 'football')).toBe(true);
  });

  it('returns empty for unknown sport', () => {
    expect(getLeagues('hockey')).toHaveLength(0);
  });
});

describe('buildMatchesForDay', () => {
  const matches = buildMatchesForDay(1750000000000);

  it('generates a healthy slate of fixtures', () => {
    expect(matches.length).toBeGreaterThan(20);
  });

  it('is deterministic for the same day', () => {
    const again = buildMatchesForDay(1750000000000);
    expect(again.map((m) => m.id)).toEqual(matches.map((m) => m.id));
    expect(again[0].markets[0].outcomes[0].odds).toBeCloseTo(matches[0].markets[0].outcomes[0].odds, 6);
  });

  it('produces valid odds on every outcome', () => {
    for (const m of matches) {
      for (const market of m.markets) {
        for (const o of market.outcomes) {
          expect(o.odds).toBeGreaterThanOrEqual(1.01);
          expect(Number.isFinite(o.odds)).toBe(true);
        }
      }
    }
  });

  it('mixes live, upcoming and finished states', () => {
    const statuses = new Set(matches.map((m) => m.status));
    expect(statuses.has('live')).toBe(true);
    expect(statuses.has('upcoming')).toBe(true);
    expect(statuses.has('finished')).toBe(true);
  });

  it('never pairs a team with itself and every league has fixtures', () => {
    const leaguesWithMatches = new Set<string>();
    for (const m of matches) {
      expect(m.home.id).not.toBe(m.away.id);
      leaguesWithMatches.add(m.leagueId);
    }
    for (const lg of getLeagues()) {
      expect(leaguesWithMatches.has(lg.id)).toBe(true);
    }
  });

  it('finished and live matches always carry a score', () => {
    for (const m of matches) {
      if (m.status === 'finished' || m.status === 'live') {
        expect(m.score).toBeDefined();
      }
    }
  });
});

describe('buildVirtualMatches', () => {
  const virtuals = buildVirtualMatches(1750000000000);

  it('creates a round of virtual fixtures flagged as virtual', () => {
    expect(virtuals.length).toBeGreaterThan(0);
    expect(virtuals.every((m) => m.virtual === true)).toBe(true);
    expect(virtuals.every((m) => m.leagueId === VIRTUAL_LEAGUE_ID)).toBe(true);
  });

  it('has staggered kickoffs with at least one live match', () => {
    expect(virtuals.some((m) => m.status === 'live')).toBe(true);
    const kickoffs = new Set(virtuals.map((m) => m.kickoff));
    expect(kickoffs.size).toBe(virtuals.length);
  });
});
