import type { Bet } from './types';
import { liveEngine } from './liveEngine';
import { cashoutValue, type CashoutState, type MatchCashoutInput } from './cashout';

/** Cash-out estimate against the live browser-side match simulation. */
export function cashoutValueLive(bet: Bet): CashoutState {
  const matches: Record<string, MatchCashoutInput> = {};
  for (const leg of bet.legs) {
    const m = liveEngine.get(leg.matchId);
    if (m) matches[leg.matchId] = m;
  }
  return cashoutValue(bet, matches);
}
