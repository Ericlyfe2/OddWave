import type { Bet } from './types';
import { round2, clamp } from './format';
import { liveEngine } from './liveEngine';

export interface CashoutState {
  available: boolean;
  reason?: string;
  amount: number;
}

function impliedProb(odds: number): number {
  return clamp(1 / Math.max(1.01, odds), 0.02, 0.97);
}

export function cashoutValue(bet: Bet): CashoutState {
  if (bet.status !== 'open') return { available: false, amount: 0, reason: 'Bet is not active' };

  const liveLegs = bet.legs.filter((l) => {
    const m = liveEngine.get(l.matchId);
    return m && m.status === 'live';
  });
  const finishedOrMissing = bet.legs.filter((l) => {
    const m = liveEngine.get(l.matchId);
    return !m || m.status === 'finished' || m.status === 'cancelled' || m.status === 'postponed';
  });

  let prob = 1;
  for (const leg of bet.legs) {
    const m = liveEngine.get(leg.matchId);
    if (!m) {
      prob *= 0.9;
      continue;
    }
    if (m.status === 'finished' || m.status === 'cancelled' || m.status === 'postponed') {
      prob *= 0.5;
    } else if (m.status === 'live') {
      const s = m.score ?? { home: 0, away: 0 };
      const diff = s.home - s.away;
      const timeLeft = Math.max(0.05, 1 - (m.minute ?? 0) / 90);
      let p = 0.5;
      const market = m.markets.find((mk) => mk.key === leg.marketKey);
      const outcome = market?.outcomes.find((o) => o.code === leg.outcomeCode);
      if (outcome) p = impliedProb(outcome.odds);
      if (leg.outcomeCode === '1') p = clamp(p + diff * timeLeft * 0.25, 0.02, 0.97);
      else if (leg.outcomeCode === '2') p = clamp(p - diff * timeLeft * 0.25, 0.02, 0.97);
      else if (leg.outcomeCode === 'X') p = clamp(p * timeLeft * 2, 0.02, 0.9);
      else p = clamp(p * timeLeft, 0.03, 0.95);
      prob *= p;
    } else {
      const market = m.markets.find((mk) => mk.key === leg.marketKey);
      const outcome = market?.outcomes.find((o) => o.code === leg.outcomeCode);
      prob *= outcome ? impliedProb(outcome.odds) : 0.45;
    }
  }

  if (bet.type === 'single') {
    const openLegs = bet.legs.filter((l) => l.status === 'open');
    if (openLegs.length !== 1) return { available: false, amount: 0, reason: 'No open legs to cash out' };
  }

  const base = Math.min(bet.potential, bet.stake * Math.max(bet.totalOdds, 1));
  let amount = round2(base * prob * 0.94);
  amount = clamp(amount, round2(base * 0.05), round2(base * 0.97));

  if (amount < 0.1) return { available: false, amount: 0, reason: 'Cash out value too low' };
  if (liveLegs.length > 0 && liveEngine.get(liveLegs[0].matchId)?.markets.every((mk) => mk.suspended)) {
    return { available: false, amount: 0, reason: 'Temporarily suspended' };
  }
  if (finishedOrMissing.length === bet.legs.length) {
    return { available: false, amount: 0, reason: 'Awaiting settlement' };
  }
  return { available: true, amount };
}
