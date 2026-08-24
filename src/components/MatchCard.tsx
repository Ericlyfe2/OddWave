import { memo, useCallback } from 'react';
import { clsx } from 'clsx';
import { Star } from 'lucide-react';
import type { Match, SlipItem } from '@/lib/types';
import { useMatches } from '@/store/matches';
import { useSlip } from '@/store/slip';
import { useFavorites } from '@/store/favorites';
import { OddsCell } from './OddsCell';
import { dayLabel, timeLabel, initials } from '@/lib/format';

interface MatchCardProps {
  match: Match;
  onOpen?: (matchId: string) => void;
  compact?: boolean;
  showLeague?: boolean;
  mainMarketOnly?: boolean;
}

function TeamRow({ name, short, color, score }: { name: string; short: string; color: string; score?: number }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span
        className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-extrabold text-white shrink-0"
        style={{ backgroundColor: color }}
        aria-hidden
      >
        {initials(short)}
      </span>
      <span className="text-[13px] font-medium text-ink-50 truncate">{name}</span>
      {typeof score === 'number' && <span className="ml-auto text-sm font-extrabold text-ink-50 tnum pr-1">{score}</span>}
    </div>
  );
}

export const MatchCard = memo(function MatchCard({ match, onOpen, compact = false, showLeague = true, mainMarketOnly = false }: MatchCardProps) {
  const liveMatch = useMatches((s) => s.byId[match.id]) ?? match;
  const items = useSlip((s) => s.items);
  const addSelection = useSlip((s) => s.add);
  const favorites = useFavorites();

  const isFav = favorites.isFav('events', liveMatch.id);

  const mainMarket =
    liveMatch.markets.find((mk) => mk.key === (liveMatch.sportId === 'football' ? '1x2' : 'moneyline')) ?? liveMatch.markets[0];
  const secondaryMarkets = mainMarketOnly ? [] : liveMatch.markets.filter((mk) => mk !== mainMarket).slice(0, 2);

  const handleSelect = useCallback(
    (marketKey: string, outcomeCode: string) => {
      const market = liveMatch.markets.find((m) => m.key === marketKey);
      if (!market) return;
      const outcome = market.outcomes.find((o) => o.code === outcomeCode);
      if (!outcome) return;
      const item: SlipItem = {
        outcomeId: `${liveMatch.id}:${outcome.id}`,
        matchId: liveMatch.id,
        matchName: `${liveMatch.home.name} vs ${liveMatch.away.name}`,
        leagueName: liveMatch.leagueName,
        marketKey: market.key,
        marketName: market.name,
        outcomeLabel: outcome.label,
        outcomeCode: outcome.code,
        odds: outcome.odds,
        oddsSnapshot: outcome.odds,
        kickoff: liveMatch.kickoff,
        addedAt: Date.now(),
      };
      addSelection(item);
    },
    [liveMatch, addSelection]
  );

  const isSelected = (marketKey: string, code: string) => items.some((i) => i.outcomeId === `${liveMatch.id}:${marketKey}:${code}`);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen?.(liveMatch.id)}
      onKeyDown={(e) => e.key === 'Enter' && onOpen?.(liveMatch.id)}
      className={clsx('bg-ink-600 hover:bg-ink-500/70 transition-colors cursor-pointer', compact ? 'px-3 py-2' : 'rounded-xl px-3 py-2.5 shadow-card')}
    >
      {(showLeague || liveMatch.status === 'live') && (
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5 min-w-0">
            {showLeague && (
              <span className="text-[10px] text-ink-300 truncate max-w-[180px]">
                {liveMatch.leagueName}
              </span>
            )}
            {liveMatch.featured && !showLeague && <Star className="w-3 h-3 text-secondary-400 fill-secondary-400" />}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {isFav && <Star className="w-3 h-3 text-secondary-400 fill-secondary-400" aria-label="Favorite" />}
            {liveMatch.status === 'live' ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-error-500 animate-pulse-live" />
                <span className="text-[10px] font-bold text-error-500 tnum">{liveMatch.minute}&apos;</span>
              </>
            ) : liveMatch.status === 'upcoming' ? (
              <span className="text-[10px] text-ink-300 tnum">
                {dayLabel(liveMatch.kickoff)} · {timeLabel(liveMatch.kickoff)}
              </span>
            ) : (
              <span className="text-[10px] text-ink-300 uppercase font-bold">FT</span>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1 space-y-1" onClick={(e) => { e.stopPropagation(); onOpen?.(liveMatch.id); }}>
          <TeamRow name={liveMatch.home.name} short={liveMatch.home.short} color={liveMatch.home.color} score={liveMatch.score?.home} />
          <TeamRow name={liveMatch.away.name} short={liveMatch.away.short} color={liveMatch.away.color} score={liveMatch.score?.away} />
        </div>

        <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {mainMarket &&
            mainMarket.outcomes.slice(0, liveMatch.sportId === 'football' ? 3 : 2).map((o) => (
              <OddsCell
                key={o.code}
                outcome={o}
                selected={isSelected(mainMarket.key, o.code)}
                suspended={mainMarket.suspended}
                onSelect={() => handleSelect(mainMarket.key, o.code)}
                compact={compact}
              />
            ))}
          {onOpen && (
            <button
              onClick={() => onOpen(liveMatch.id)}
              aria-label={`More markets for ${liveMatch.home.name} vs ${liveMatch.away.name}`}
              className="flex flex-col items-center justify-center rounded-lg bg-ink-500/80 border border-ink-400/30 px-1.5 min-h-[44px] min-w-[32px] active:scale-[0.97] transition-transform"
            >
              <span className="text-xs font-bold text-primary-600 tnum">+{Math.max(0, liveMatch.markets.length - 1)}</span>
            </button>
          )}
        </div>
      </div>

      {!compact && secondaryMarkets.length > 0 && (
        <div className="mt-2 pt-2 border-t border-ink-500/30 grid grid-cols-2 gap-x-4">
          {secondaryMarkets.map((mk) => (
            <div key={mk.key}>
              <div className="text-[10px] text-ink-300 mb-1 truncate">{mk.name}</div>
              <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(3, mk.outcomes.length)}, minmax(0, 1fr))` }}>
                {mk.outcomes.slice(0, 3).map((o) => (
                  <OddsCell key={o.code} outcome={o} selected={isSelected(mk.key, o.code)} suspended={mk.suspended} onSelect={() => handleSelect(mk.key, o.code)} compact />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
