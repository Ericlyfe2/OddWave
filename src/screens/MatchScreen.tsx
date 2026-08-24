import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Star, Share2, ChevronLeft } from 'lucide-react';
import clsx from 'clsx';
import { useMatches } from '@/store/matches';
import type { Match, SlipItem } from '@/lib/types';
import { OddsCell } from '@/components/OddsCell';
import { Accordion, Badge, EmptyState, Button } from '@/components/ui';
import { useSlip } from '@/store/slip';
import { useFavorites } from '@/store/favorites';
import { useUI } from '@/store/ui';
import { dayLabel, timeLabel, initials, money } from '@/lib/format';

export function MatchScreen() {
  const navigate = useNavigate();
  const { matchId } = useParams<{ matchId: string }>();
  const id = decodeURIComponent(matchId ?? '');
  const match = useMatches((s) => s.byId[id]);
  const items = useSlip((s) => s.items);
  const addSelection = useSlip((s) => s.add);
  const setMode = useSlip((s) => s.setMode);
  const favorites = useFavorites();
  const toast = useUI((s) => s.toast);

  const [builderOn, setBuilderOn] = useState(false);

  const groups = useMemo(() => {
    if (!match) return [];
    const map = new Map<string, typeof match.markets>();
    for (const mk of match.markets) {
      map.set(mk.group, [...(map.get(mk.group) || []), mk]);
    }
    return [...map.entries()];
  }, [match]);

  if (!match) {
    return (
      <EmptyState
        title="Event not found"
        body="This event may have been removed or the link is incorrect."
        action={<Button onClick={() => navigate('/')}>Back to Home</Button>}
      />
    );
  }

  const isFav = favorites.isFav('events', match.id);
  const live = match.status === 'live';
  const finished = match.status === 'finished';
  const builderEligible = match.markets.filter((m) => m.builderAllowed).length >= 2;
  const builderItems = items.filter((i) => i.matchId === match.id);

  const selectOutcome = (m: Match['markets'][number], code: string) => {
    if (!builderOn) setMode('multi');
    const outcome = m.outcomes.find((o) => o.code === code);
    if (!outcome) return;
    const item: SlipItem = {
      outcomeId: `${match.id}:${outcome.id}`,
      matchId: match.id,
      matchName: `${match.home.name} vs ${match.away.name}`,
      leagueName: match.leagueName,
      marketKey: m.key,
      marketName: m.name,
      outcomeLabel: outcome.label,
      outcomeCode: outcome.code,
      odds: outcome.odds,
      oddsSnapshot: outcome.odds,
      kickoff: match.kickoff,
      addedAt: Date.now(),
    };
    addSelection(item, builderOn);
  };

  const isSelected = (marketKey: string, code: string) => items.some((i) => i.outcomeId === `${match.id}:${marketKey}:${code}`);

  const related = Object.values(useMatches.getState().byId)
    .filter((m) => m.leagueId === match.leagueId && m.id !== match.id && m.status !== 'finished')
    .slice(0, 5);

  const builderOdds = builderItems.reduce((acc, i) => acc * i.odds, 1);

  return (
    <div className="pb-4">
      <div className="sticky top-14 z-[25] bg-ink-800/95 backdrop-blur border-b border-ink-500/40">
        <div className="flex items-center px-2 h-11">
          <button onClick={() => navigate(-1)} className="p-2 text-ink-100" aria-label="Go back">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="text-xs text-ink-300 truncate flex-1">{match.leagueName}</span>
          <button
            onClick={() => {
              favorites.toggle('events', match.id);
              toast('success', isFav ? 'Removed from favorites' : 'Added to favorites');
            }}
            className="p-2"
            aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Star className={clsx('w-5 h-5', isFav ? 'text-secondary-400 fill-secondary-400' : 'text-ink-200')} />
          </button>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(`${location.origin}/match/${encodeURIComponent(match.id)}`).catch(() => undefined);
              toast('success', 'Link copied');
            }}
            className="p-2 text-ink-100"
            aria-label="Share event"
          >
            <Share2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Event header */}
      <div className="px-4 pt-4 pb-3 bg-gradient-to-b from-ink-700 to-transparent">
        <div className="flex items-start justify-between gap-4">
          <TeamBlock name={match.home.name} short={match.home.short} color={match.home.color} />
          <div className="text-center shrink-0 min-w-[90px]">
            {live || finished ? (
              <>
                <div className="text-2xl font-extrabold text-ink-50 tnum animate-scale-in" key={`${match.score?.home}-${match.score?.away}`}>
                  {match.score?.home ?? 0} - {match.score?.away ?? 0}
                </div>
                {live && (
                  <Badge tone="live" className="mt-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse-live mr-0.5" />
                    {match.minute}&apos; · {match.period}
                  </Badge>
                )}
                {finished && <Badge tone="neutral" className="mt-1.5">Full Time</Badge>}
              </>
            ) : match.status === 'postponed' ? (
              <Badge tone="warning">Postponed</Badge>
            ) : match.status === 'cancelled' ? (
              <Badge tone="error">Cancelled</Badge>
            ) : (
              <>
                <div className="text-xl font-extrabold text-primary-600 tnum">{timeLabel(match.kickoff)}</div>
                <div className="text-[10px] text-ink-300 mt-0.5">{dayLabel(match.kickoff)}</div>
              </>
            )}
          </div>
          <TeamBlock name={match.away.name} short={match.away.short} color={match.away.color} align="right" />
        </div>
        {builderEligible && !finished && match.status !== 'cancelled' && (
          <button
            onClick={() => {
              setBuilderOn(!builderOn);
              setMode(builderOn ? 'multi' : 'builder');
            }}
            className={clsx(
              'mt-4 w-full rounded-xl py-2.5 text-xs font-bold border transition-all',
              builderOn ? 'bg-secondary-500/20 border-secondary-500/60 text-secondary-300' : 'border-ink-400/40 text-ink-100 hover:border-secondary-500/50'
            )}
          >
            {builderOn ? `Bet Builder ON — ${builderItems.length} ${builderItems.length === 1 ? 'market' : 'markets'}` : 'Create Bet Builder'}
          </button>
        )}
        {builderOn && builderItems.length >= 2 && (
          <div className="mt-2 flex items-center justify-between bg-ink-600 rounded-xl px-3 py-2.5">
            <span className="text-[11px] text-ink-200">{builderItems.length} {builderItems.length === 1 ? 'market' : 'markets'} combined</span>
            <span className="text-sm font-extrabold text-secondary-400 tnum">{money(10 * builderOdds)} <span className="text-[10px] text-ink-300">per 10 stake</span></span>
          </div>
        )}
      </div>

      {finished ? (
        <div className="px-3 pt-2 space-y-2">
          {groups.map(([group, markets]) =>
            markets.map((mk) => {
              void group;
              return (
                <div key={mk.key} className="bg-ink-600 rounded-xl p-3">
                  <div className="text-[11px] text-ink-300 mb-2">{mk.name}</div>
                  <div className="grid grid-cols-3 gap-1.5 opacity-40 pointer-events-none">
                    {mk.outcomes.map((o) => (
                      <OddsCell key={o.code} outcome={o} selected={false} suspended onSelect={() => undefined} compact />
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        groups.map(([group, markets]) => (
          <Accordion key={group} title={group} defaultOpen={group === 'Main'} subtitle={`${markets.length} ${markets.length === 1 ? 'market' : 'markets'}`}>
            <div className="space-y-2 px-3 pb-3">
              {markets.map((mk) => (
                <MarketRow key={mk.key} name={mk.name} outcomes={mk.outcomes} suspended={mk.suspended} isSelected={(code) => isSelected(mk.key, code)} onSelect={(code) => selectOutcome(mk, code)} />
              ))}
            </div>
          </Accordion>
        ))
      )}

      {related.length > 0 && (
        <>
          <div className="flex items-center gap-1.5 px-3 pt-5 pb-2">
            <ChevronLeft className="w-4 h-4 text-ink-300 rotate-180" />
            <h3 className="section-title">More from {match.leagueName}</h3>
          </div>
          <div className="scroll-x gap-2 px-3 pb-2">
            {related.map((m) => (
              <button key={m.id} onClick={() => navigate(`/match/${encodeURIComponent(m.id)}`)} className="shrink-0 w-[220px] bg-ink-600 rounded-xl p-3 text-left hover:bg-ink-500/70 transition-colors snap-start">
                <div className="text-[12px] font-bold text-ink-50 truncate">{m.home.name}</div>
                <div className="text-[12px] font-bold text-ink-50 truncate">{m.away.name}</div>
                <div className="text-[10px] text-ink-300 mt-2 tnum">{dayLabel(m.kickoff)} · {timeLabel(m.kickoff)}</div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function TeamBlock({ name, short, color, align = 'left' }: { name: string; short: string; color: string; align?: 'left' | 'right' }) {
  return (
    <div className={clsx('flex items-center gap-2 min-w-0 max-w-[38%]', align === 'right' && 'flex-row-reverse text-right')}>
      <span className="w-9 h-9 rounded-full flex items-center justify-center text-[10px] font-extrabold text-white shrink-0" style={{ backgroundColor: color }}>
        {initials(short)}
      </span>
      <span className="text-sm font-bold text-ink-50 leading-tight line-clamp-2">{name}</span>
    </div>
  );
}

function MarketRow({
  name,
  outcomes,
  suspended,
  isSelected,
  onSelect,
}: {
  name: string;
  outcomes: Match['markets'][number]['outcomes'];
  suspended?: boolean;
  isSelected: (code: string) => boolean;
  onSelect: (code: string) => void;
}) {
  return (
    <div>
      <div className="text-[11px] text-ink-300 mb-1.5">{name}</div>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(4, outcomes.length)}, minmax(0, 1fr))` }}>
        {outcomes.map((o) => (
          <OddsCell key={o.code} outcome={o} selected={isSelected(o.code)} suspended={suspended} onSelect={() => onSelect(o.code)} ariaLabel={`${name}: ${o.label}`} />
        ))}
      </div>
    </div>
  );
}
