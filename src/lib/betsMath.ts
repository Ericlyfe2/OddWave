import { LIMITS } from './config';
import type { Bet, BetLeg, SlipItem } from './types';
import { round2 } from './format';

export function accaBonusPct(picks: number): number {
  const tiers = [
    { picks: 15, pct: 20 },
    { picks: 10, pct: 12 },
    { picks: 8, pct: 8 },
    { picks: 6, pct: 5 },
    { picks: 5, pct: 3 },
  ];
  for (const t of tiers) if (picks >= t.picks) return t.pct;
  return 0;
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

export function validateSlipSelections(items: SlipItem[], mode: 'single' | 'multi' | 'system' | 'builder'): ValidationResult {
  if (items.length === 0) return { ok: false, error: 'Add at least one selection' };
  if (mode === 'multi' && items.length < 2) return { ok: false, error: 'Multi bets need at least 2 selections' };
  if (mode === 'builder') {
    const matchIds = new Set(items.map((i) => i.matchId));
    if (matchIds.size !== 1) return { ok: false, error: 'Bet Builder combines markets from one match only' };
    if (items.length < 2) return { ok: false, error: 'Bet Builder needs at least 2 markets' };
    // Two outcomes from the same market (e.g. "Home Win" + "Away Win") are
    // mutually exclusive within a single match — Bet Builder combines
    // different markets, not conflicting picks within the same one.
    const marketKeys = new Set<string>();
    for (const i of items) {
      if (marketKeys.has(i.marketKey)) return { ok: false, error: `Only one selection per market allowed in Bet Builder (${i.marketName})` };
      marketKeys.add(i.marketKey);
    }
  }
  if (mode === 'system' && items.length < 3) return { ok: false, error: 'System bets need at least 3 selections' };
  const suspended = items.filter((i) => i.odds <= 1.001);
  if (suspended.length > 0) return { ok: false, error: 'Some selections are unavailable' };
  const seen = new Set<string>();
  for (const i of items) {
    if (seen.has(i.outcomeId)) return { ok: false, error: 'Duplicate selection found' };
    seen.add(i.outcomeId);
  }
  // Outside Bet Builder, two outcomes from the same event can't be combined
  // into one accumulator/system line — they're frequently mutually exclusive
  // (e.g. "Arsenal to win" + "Chelsea to win") and even when they aren't,
  // pricing the combination correctly needs the same-game-parlay math Bet
  // Builder exists for, not a plain odds product.
  if (mode === 'multi' || mode === 'system') {
    const matchIds = new Set<string>();
    for (const i of items) {
      if (matchIds.has(i.matchId)) {
        return { ok: false, error: `Multiple selections from ${i.matchName} can't be combined — use Bet Builder instead` };
      }
      matchIds.add(i.matchId);
    }
  }
  return { ok: true };
}

export function validateStake(stake: number): ValidationResult {
  if (!Number.isFinite(stake)) return { ok: false, error: 'Enter a valid stake' };
  if (stake < LIMITS.minStake) return { ok: false, error: `Minimum stake is ${LIMITS.minStake}` };
  if (stake > LIMITS.maxStake) return { ok: false, error: `Maximum stake is ${LIMITS.maxStake}` };
  return { ok: true };
}

export function combinations(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 1; i <= k; i++) result = (result * (n - k + i)) / i;
  return Math.round(result);
}

export function systemCombos<T>(items: T[], k: number): T[][] {
  const results: T[][] = [];
  const recurse = (start: number, current: T[]) => {
    if (current.length === k) {
      results.push([...current]);
      return;
    }
    for (let i = start; i < items.length; i++) {
      current.push(items[i]);
      recurse(i + 1, current);
      current.pop();
    }
  };
  recurse(0, []);
  return results;
}

export function computeTotalOdds(legs: Array<{ odds: number; status?: string }>): number {
  return round2(legs.reduce((acc, l) => acc * (l.status === 'void' ? 1 : l.status === undefined || l.status === 'open' ? l.odds : 1), 1));
}

export function potentialFor(mode: Bet['type'], stakePerCombo: number, legs: Array<{ odds: number }>, systemPicks = 3): { totalOdds: number; comboCount: number; potential: number } {
  const product = round2(legs.reduce((a, l) => a * Math.max(1.001, l.odds), 1));
  switch (mode) {
    case 'single':
      return { totalOdds: round2(legs[0]?.odds ?? 1), comboCount: legs.length, potential: round2(legs.reduce((a, l) => a + stakePerCombo * l.odds, 0)) };
    case 'multi': {
      const bonusMultiplier = 1 + accaBonusPct(legs.length) / 100;
      return { totalOdds: product, comboCount: 1, potential: round2(stakePerCombo * product * bonusMultiplier) };
    }
    case 'builder':
      return { totalOdds: product, comboCount: 1, potential: round2(stakePerCombo * product) };
    case 'system': {
      const combos = systemCombos(legs, Math.min(systemPicks, legs.length));
      const potential = combos.reduce((sum, c) => sum + stakePerCombo * c.reduce((a, l) => a * Math.max(1.001, l.odds), 1), 0);
      return { totalOdds: product, comboCount: combos.length, potential: round2(potential) };
    }
  }
}

export function settleLeg(legStatus: BetLeg['status'], odds: number): number {
  if (legStatus === 'won') return odds;
  if (legStatus === 'void') return 1;
  return 0;
}
