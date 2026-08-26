import { describe, it, expect } from 'vitest';
import {
  accaBonusPct,
  combinations,
  systemCombos,
  computeTotalOdds,
  potentialFor,
  validateStake,
  validateSlipSelections,
} from '../src/lib/betsMath';
import { LIMITS } from '../src/lib/limits';
import type { SlipItem } from '../src/lib/types';

function item(overrides: Partial<SlipItem> = {}): SlipItem {
  return {
    outcomeId: overrides.outcomeId ?? `${overrides.matchId ?? 'm1'}:${overrides.outcomeCode ?? '1'}`,
    matchId: 'm1',
    matchName: 'Arsenal vs Chelsea',
    leagueName: 'Test League',
    marketKey: '1x2',
    marketName: 'Match Result',
    outcomeLabel: 'Arsenal',
    outcomeCode: '1',
    odds: 1.8,
    oddsSnapshot: 1.8,
    kickoff: Date.now() + 3_600_000,
    addedAt: Date.now(),
    ...overrides,
  };
}

describe('accaBonusPct', () => {
  it('returns 0 below the first tier', () => {
    expect(accaBonusPct(1)).toBe(0);
    expect(accaBonusPct(4)).toBe(0);
  });

  it('matches the configured tiers', () => {
    for (const tier of [5, 10, 15, 20, 25]) {
      expect(accaBonusPct(tier)).toBeGreaterThan(0);
    }
  });

  it('is monotonic non-decreasing', () => {
    let prev = 0;
    for (let n = 1; n <= 30; n++) {
      const pct = accaBonusPct(n);
      expect(pct).toBeGreaterThanOrEqual(prev);
      prev = pct;
    }
  });
});

describe('combinations', () => {
  it('computes C(n,k)', () => {
    expect(combinations(5, 3)).toBe(10);
    expect(combinations(4, 2)).toBe(6);
    expect(combinations(6, 6)).toBe(1);
    expect(combinations(6, 1)).toBe(6);
  });

  it('handles k > n as 0', () => {
    expect(combinations(3, 4)).toBe(0);
  });
});

describe('systemCombos', () => {
  it('produces all k-sized subsets', () => {
    const items = ['a', 'b', 'c', 'd'];
    const combos = systemCombos(items, 3);
    expect(combos).toHaveLength(combinations(4, 3));
    for (const combo of combos) {
      expect(combo).toHaveLength(3);
      combo.forEach((item) => expect(items).toContain(item));
    }
  });

  it('never repeats an item inside a combo', () => {
    const combos = systemCombos([1, 2, 3, 4, 5], 2);
    for (const combo of combos) {
      expect(new Set(combo).size).toBe(combo.length);
    }
  });
});

describe('computeTotalOdds', () => {
  it('multiplies leg odds', () => {
    expect(computeTotalOdds([{ odds: 1.5 }, { odds: 2.0 }, { odds: 1.25 }])).toBeCloseTo(3.75);
  });

  it('returns 1 for empty legs', () => {
    expect(computeTotalOdds([])).toBe(1);
  });
});

describe('potentialFor', () => {
  it('single mode sums per-leg returns', () => {
    const res = potentialFor('single', 10, [{ odds: 2 }, { odds: 3 }]);
    expect(res.comboCount).toBe(2);
    expect(res.potential).toBeCloseTo(50);
  });

  it('multi mode applies acca bonus to product', () => {
    const legs = Array.from({ length: 5 }, (_, i) => ({ odds: 1 + (i + 1) / 10 }));
    const res = potentialFor('multi', 10, legs);
    const product = Math.round(legs.reduce((a, l) => a * l.odds, 1) * 100) / 100;
    const bonus = accaBonusPct(5) / 100;
    expect(res.potential).toBeCloseTo(10 * product * (1 + bonus), 2);
    expect(res.comboCount).toBe(1);
    expect(res.totalOdds).toBeCloseTo(product, 2);
  });
});

describe('validateStake', () => {
  it('rejects stakes below minimum', () => {
    expect(validateStake(LIMITS.minStake - 0.01).ok).toBe(false);
  });

  it('rejects stakes above maximum', () => {
    expect(validateStake(LIMITS.maxStake + 1).ok).toBe(false);
  });

  it('accepts a sane stake', () => {
    expect(validateStake(50).ok).toBe(true);
  });
});

describe('validateSlipSelections', () => {
  it('rejects an empty slip', () => {
    expect(validateSlipSelections([], 'single').ok).toBe(false);
  });

  it('requires at least 2 legs for a multi', () => {
    expect(validateSlipSelections([item()], 'multi').ok).toBe(false);
    expect(validateSlipSelections([item({ matchId: 'm1' }), item({ matchId: 'm2', outcomeId: 'm2:1' })], 'multi').ok).toBe(true);
  });

  it('requires at least 3 legs for a system', () => {
    const two = [item({ matchId: 'm1' }), item({ matchId: 'm2', outcomeId: 'm2:1' })];
    expect(validateSlipSelections(two, 'system').ok).toBe(false);
    const three = [...two, item({ matchId: 'm3', outcomeId: 'm3:1' })];
    expect(validateSlipSelections(three, 'system').ok).toBe(true);
  });

  it('a single never needs more than one leg', () => {
    expect(validateSlipSelections([item()], 'single').ok).toBe(true);
  });

  it('rejects duplicate selections', () => {
    const dup = [item({ outcomeId: 'x' }), item({ outcomeId: 'x' })];
    const res = validateSlipSelections(dup, 'single');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/duplicate/i);
  });

  it('rejects a suspended (odds <= 1.001) selection', () => {
    const res = validateSlipSelections([item({ odds: 1.0 })], 'single');
    expect(res.ok).toBe(false);
  });

  it('rejects two outcomes from the same match in a multi (mutually exclusive, e.g. Arsenal win + Chelsea win)', () => {
    const res = validateSlipSelections(
      [
        item({ matchId: 'm1', outcomeId: 'm1:1', outcomeCode: '1', outcomeLabel: 'Arsenal' }),
        item({ matchId: 'm1', outcomeId: 'm1:2', outcomeCode: '2', outcomeLabel: 'Chelsea' }),
      ],
      'multi'
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/can't be combined/i);
  });

  it('rejects two outcomes from the same match in a system, the same way', () => {
    const res = validateSlipSelections(
      [
        item({ matchId: 'm1', outcomeId: 'm1:1' }),
        item({ matchId: 'm1', outcomeId: 'm1:2' }),
        item({ matchId: 'm2', outcomeId: 'm2:1' }),
      ],
      'system'
    );
    expect(res.ok).toBe(false);
  });

  it('allows same-match legs in Bet Builder mode, where that is the whole point', () => {
    const res = validateSlipSelections(
      [
        item({ matchId: 'm1', outcomeId: 'm1:1', marketKey: '1x2' }),
        item({ matchId: 'm1', outcomeId: 'm1:ou', marketKey: 'ou' }),
      ],
      'builder'
    );
    expect(res.ok).toBe(true);
  });

  it('rejects two outcomes from the same market in Bet Builder (e.g. Home Win + Away Win)', () => {
    const res = validateSlipSelections(
      [
        item({ matchId: 'm1', outcomeId: 'm1:1', marketKey: '1x2', outcomeLabel: 'Arsenal', outcomeCode: '1' }),
        item({ matchId: 'm1', outcomeId: 'm1:2', marketKey: '1x2', outcomeLabel: 'Chelsea', outcomeCode: '2' }),
      ],
      'builder'
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/one selection per market/i);
  });

  it('rejects Bet Builder legs spanning more than one match', () => {
    const res = validateSlipSelections(
      [item({ matchId: 'm1', outcomeId: 'm1:1' }), item({ matchId: 'm2', outcomeId: 'm2:1' })],
      'builder'
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/one match only/i);
  });

  it('single mode tolerates multiple different matches (each becomes its own bet)', () => {
    const res = validateSlipSelections(
      [item({ matchId: 'm1', outcomeId: 'm1:1' }), item({ matchId: 'm2', outcomeId: 'm2:1' })],
      'single'
    );
    expect(res.ok).toBe(true);
  });
});
