import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Radio, Star, Flame, Megaphone, Zap } from 'lucide-react';
import { useMatches, useLiveMatches } from '@/store/matches';
import { getLeagues } from '@/lib/dataGen';
import { MatchCard } from '@/components/MatchCard';
import { MatchCardSkeleton } from '@/components/ui';
import { SectionHeader } from '@/components/pieces';
import { usePromotions } from '@/store/promotions';
import { dayLabel, timeLabel } from '@/lib/format';
import { sportName } from '@/lib/catalog';

export function HomeScreen() {
  const navigate = useNavigate();
  const version = useMatches((s) => s.version);
  void version;
  const live = useLiveMatches();
  const all = useMatches((s) => s.byId);
  const loaded = useMatches((s) => s.loaded);
  // .filter() (inside activeList()) allocates a new array every call; selecting
  // the stable `promotions` array and filtering in useMemo keeps the snapshot
  // referentially stable between real store updates (see matches.ts for the
  // same pattern, and the fix history in favorites.ts / AccountScreens.tsx).
  const allPromotions = usePromotions((s) => s.promotions);
  const promotions = useMemo(() => allPromotions.filter((p) => p.active), [allPromotions]);

  const featured = useMemo(
    () =>
      Object.values(all)
        .filter((m) => m.featured && m.status === 'upcoming')
        .sort((a, b) => a.kickoff - b.kickoff)
        .slice(0, 12),
    [all]
  );

  const footballToday = useMemo(() => {
    const leagues = getLeagues('football').slice(0, 3);
    return leagues
      .map((lg) => ({
        league: lg,
        matches: Object.values(all)
          .filter((m) => m.leagueId === lg.id && m.status === 'upcoming')
          .sort((a, b) => a.kickoff - b.kickoff),
      }))
      .filter((g) => g.matches.length > 0);
  }, [all]);

  if (!loaded) {
    return (
      <div className="p-3 space-y-3">
        <MatchCardSkeleton />
        <MatchCardSkeleton />
        <MatchCardSkeleton />
      </div>
    );
  }

  return (
    <div className="pb-4">
      <SectionHeader title="Highlights" icon={<Flame className="w-4 h-4 text-secondary-400" />} />
      <div className="scroll-x gap-2 px-3 pb-1">
        {featured.map((m) => (
          <button
            key={m.id}
            onClick={() => navigate(`/match/${encodeURIComponent(m.id)}`)}
            className="shrink-0 w-[230px] bg-ink-600 rounded-xl p-3 text-left hover:bg-ink-500/70 transition-colors snap-start"
          >
            <div className="text-[10px] text-ink-300 truncate mb-2">{m.leagueName}</div>
            <div className="text-[13px] font-bold text-ink-50 truncate">{m.home.name}</div>
            <div className="text-[13px] font-bold text-ink-50 truncate">{m.away.name}</div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-[10px] text-ink-300 tnum">{dayLabel(m.kickoff)} {timeLabel(m.kickoff)}</span>
              <span className="text-[10px] font-bold text-primary-600">{sportName(m.sportId)}</span>
            </div>
          </button>
        ))}
        {featured.length === 0 && (
          <p className="text-xs text-ink-300 px-1 py-4">No featured events right now — check the Sports page.</p>
        )}
      </div>

      {live.length > 0 && (
        <>
          <SectionHeader
            title="Live Now"
            icon={<Radio className="w-4 h-4 text-error-500" />}
            action={
              <button onClick={() => navigate('/live')} className="link-action flex items-center gap-0.5 text-xs font-bold text-primary-600">
                All live ({live.length}) <ChevronRight className="w-3.5 h-3.5" />
              </button>
            }
          />
          <div className="space-y-2 px-3">
            {live.slice(0, 5).map((m) => (
              <MatchCard key={m.id} match={m} onOpen={(id) => navigate(`/match/${encodeURIComponent(id)}`)} showLeague />
            ))}
          </div>
        </>
      )}

      <SectionHeader title="Promotions" icon={<Megaphone className="w-4 h-4 text-primary-600" />} action={<button onClick={() => navigate('/promotions')} className="link-action text-xs font-bold text-primary-600">See all</button>} />
      <div className="scroll-x gap-2 px-3 pb-1">
        {promotions.map((p) => (
          <button
            key={p.id}
            onClick={() => navigate('/promotions')}
            className="shrink-0 w-[260px] rounded-xl p-4 text-left relative overflow-hidden"
            style={{ background: `linear-gradient(135deg, ${p.accent}1a 0%, #ffffff 65%)`, border: `1px solid ${p.accent}40` }}
          >
            <Zap className="w-4 h-4 mb-2" style={{ color: p.accent }} />
            <div className="text-sm font-extrabold text-ink-50">{p.title}</div>
            <div className="text-[11px] text-ink-200 mt-1 line-clamp-2">{p.blurb}</div>
          </button>
        ))}
      </div>

      {footballToday.map(({ league, matches }) => (
        <div key={league.id}>
          <SectionHeader
            title={league.name}
            subtitle={`${league.country} · ${matches.length} events`}
            action={
              <button onClick={() => navigate(`/league/${league.id}`)} className="link-action flex items-center gap-0.5 text-xs font-bold text-primary-600">
                All <ChevronRight className="w-3.5 h-3.5" />
              </button>
            }
          />
          <div className="space-y-2 px-3">
            {matches.slice(0, 4).map((m) => (
              <MatchCard key={m.id} match={m} onOpen={(id) => navigate(`/match/${encodeURIComponent(id)}`)} />
            ))}
          </div>
        </div>
      ))}

      <SectionHeader title="Top Leagues" icon={<Star className="w-4 h-4 text-secondary-400" />} />
      <div className="grid grid-cols-2 gap-2 px-3">
        {getLeagues()
          .filter((l) => l.featured)
          .map((l) => {
            const count = Object.values(all).filter((m) => m.leagueId === l.id && m.status !== 'finished').length;
            return (
              <button key={l.id} onClick={() => navigate(`/league/${l.id}`)} className="bg-ink-600 hover:bg-ink-500/70 rounded-xl p-3 text-left transition-colors">
                <div className="text-[13px] font-bold text-ink-50 leading-tight">{l.name}</div>
                <div className="text-[11px] text-ink-300 mt-1">{l.country}</div>
                <div className="text-xs font-bold text-primary-600 mt-2 tnum">{count} events</div>
              </button>
            );
          })}
      </div>
    </div>
  );
}
