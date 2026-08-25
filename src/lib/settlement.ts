import type { Bet, BetLeg, Match } from './types';
import { round2 } from './format';
import { outcomeResult } from './outcomes';

export interface SettledBet extends Bet {
  payout?: number;
}

function kCombinations<T>(items: T[], k: number): T[][] {
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

export function settleBetAgainstMatch(bet: Bet, match: Match): Bet | null {
  if (bet.status !== 'open') return null;
  const relevant = bet.legs.filter((l) => l.matchId === match.id && l.status === 'open');
  if (relevant.length === 0) return null;

  const legs: BetLeg[] = bet.legs.map((l) => {
    if (l.matchId !== match.id || l.status !== 'open') return l;
    if (match.status === 'cancelled' || match.status === 'postponed') {
      return { ...l, status: 'void' as const };
    }
    return { ...l, status: outcomeResult(match, l.marketKey, l.outcomeCode) };
  });

  const allSettled = legs.every((l) => l.status !== 'open');
  const updatedBase = { ...bet, legs };

  if (!allSettled) {
    if (bet.type !== 'single') return updatedBase;
    const settledLeg = legs[0];
    if (settledLeg.status === 'open') return updatedBase;
    const payout =
      settledLeg.status === 'won'
        ? round2(bet.stake * settledLeg.odds)
        : settledLeg.status === 'void'
          ? bet.stake
          : 0;
    const status = settledLeg.status === 'won' ? 'won' : settledLeg.status === 'void' ? 'void' : 'lost';
    return { ...updatedBase, status: status as Bet['status'], payout, settledAt: Date.now() };
  }

  if (bet.type === 'multi' || bet.type === 'builder') {
    const product = legs.reduce((acc, l) => acc * (l.status === 'won' ? l.odds : l.status === 'void' ? 1 : 0), 1);
    const allVoid = legs.every((l) => l.status === 'void');
    const status = allVoid ? 'void' : product > 0 ? 'won' : 'lost';
    const payout = allVoid ? bet.stake : round2(bet.stake * product);
    return { ...updatedBase, status: status as Bet['status'], payout, settledAt: Date.now() };
  }

  if (bet.type === 'single') {
    const leg = legs[0];
    const payout = leg.status === 'won' ? round2(bet.stake * leg.odds) : leg.status === 'void' ? bet.stake : 0;
    const status = leg.status === 'won' ? 'won' : leg.status === 'void' ? 'void' : 'lost';
    return { ...updatedBase, status: status as Bet['status'], payout, settledAt: Date.now() };
  }

  const picks = bet.systemConfig?.picksPerCombo ?? 3;
  const combos = kCombinations(legs, picks);
  let systemReturn = 0;
  for (const c of combos) {
    const product = c.reduce((acc, l) => acc * (l.status === 'won' ? l.odds : l.status === 'void' ? 1 : 0), 1);
    systemReturn += bet.stake * product;
  }
  const payout = round2(systemReturn);
  const allVoid = legs.every((l) => l.status === 'void');
  const status = allVoid ? 'void' : payout > 0 ? 'won' : 'lost';
  return { ...updatedBase, status: status as Bet['status'], payout, settledAt: Date.now() };
}
