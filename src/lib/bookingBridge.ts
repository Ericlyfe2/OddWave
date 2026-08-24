import type { SlipItem } from './types';
import { loadBookingCode } from './booking';
import { useMatches } from '@/store/matches';
import { useSlip } from '@/store/slip';
import { logger } from './logger';

let installed = false;

export function installBookingBridge(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  window.addEventListener('oddwave:load_booking', ((event: CustomEvent) => {
    const payload = event.detail as { items?: Array<{ matchId: string; marketKey: string; outcomeCode: string; odds?: number }> };
    if (!payload?.items?.length) return;

    const byId = useMatches.getState().byId;
    const add = useSlip.getState().add;
    let added = 0;

    for (const raw of payload.items) {
      const match = byId[raw.matchId];
      if (!match || ['finished', 'cancelled', 'postponed'].includes(match.status)) continue;
      const market = match.markets.find((mk) => mk.key === raw.marketKey);
      if (!market || market.suspended) continue;
      const outcome = market.outcomes.find((o) => o.code === raw.outcomeCode);
      if (!outcome || outcome.suspended) continue;
      add({
        outcomeId: `${match.id}:${outcome.id}`,
        matchId: match.id,
        matchName: `${match.home.name} vs ${match.away.name}`,
        leagueName: match.leagueName,
        marketKey: market.key,
        marketName: market.name,
        outcomeLabel: outcome.label,
        outcomeCode: outcome.code,
        // `odds` is what the bet actually prices at (current); `oddsSnapshot`
        // is what the code was booked at. Setting both to the live price would
        // silently swallow any drift since the code was created, defeating the
        // whole point of the "odds changed, review before placing" banner —
        // which then has nothing to compare against and never fires.
        odds: outcome.odds,
        oddsSnapshot: raw.odds ?? outcome.odds,
        kickoff: match.kickoff,
        addedAt: Date.now(),
      } satisfies SlipItem);
      added += 1;
    }

    logger.info('booking.bridge_loaded', { requested: payload.items.length, added });
  }) as EventListener);
}

export function dispatchBookingLoad(code: string): { ok: boolean; error?: string } {
  const res = loadBookingCode(code);
  if (!res.ok || !res.payload) return { ok: false, error: res.error ?? 'Invalid booking code' };
  window.dispatchEvent(new CustomEvent('oddwave:load_booking', { detail: res.payload }));
  return { ok: true };
}
