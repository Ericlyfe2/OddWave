import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import { useMatches } from '@/store/matches';
import { useFavorites } from '@/store/favorites';
import { getLeagues } from '@/lib/dataGen';
import { MatchCard } from '@/components/MatchCard';
import { PageTitle, SectionHeader } from '@/components/pieces';
import { EmptyState, Button } from '@/components/ui';

export function FavoritesScreen() {
  const navigate = useNavigate();
  const all = useMatches((s) => s.byId);
  const favEventIds = useFavorites((s) => s.listFor('events'));
  const favLeagueIds = useFavorites((s) => s.listFor('leagues'));
  const toggleFav = useFavorites((s) => s.toggle);

  const matches = useMemo(() => {
    const order = { live: 0, upcoming: 1, finished: 2, postponed: 3, cancelled: 4 } as Record<string, number>;
    return Object.values(all)
      .filter((m) => favEventIds.includes(m.id))
      .sort((a, b) => (order[a.status] ?? 5) - (order[b.status] ?? 5) || a.kickoff - b.kickoff);
  }, [all, favEventIds]);

  const leagues = useMemo(() => {
    const byId = new Map(getLeagues().map((l) => [l.id, l]));
    return favLeagueIds.map((id) => byId.get(id)).filter((l): l is NonNullable<typeof l> => !!l);
  }, [favLeagueIds]);

  if (matches.length === 0 && leagues.length === 0) {
    return (
      <EmptyState
        icon={<Star className="w-6 h-6" />}
        title="No favorites yet"
        body="Tap the star on any event or league to follow it here. Live favorites update in real time."
        action={<Button onClick={() => navigate('/sports')}>Browse Sports</Button>}
      />
    );
  }

  return (
    <div className="pb-4">
      <PageTitle title="Favorites" subtitle={`${leagues.length} ${leagues.length === 1 ? 'league' : 'leagues'} · ${matches.length} ${matches.length === 1 ? 'event' : 'events'}`} />

      {leagues.length > 0 && (
        <>
          <SectionHeader title="Leagues" />
          <div className="divide-y divide-ink-500/20 mx-3 rounded-xl overflow-hidden border border-ink-500/30 mb-4">
            {leagues.map((league) => (
              <div key={league.id} className="flex items-center bg-ink-600">
                <button
                  onClick={() => navigate(`/league/${league.id}`)}
                  className="flex-1 flex items-center justify-between px-3 py-3 hover:bg-ink-500/40 transition-colors min-w-0 text-left"
                >
                  <span className="min-w-0">
                    <span className="block text-[13px] font-bold text-ink-50 truncate">{league.name}</span>
                    <span className="block text-[10px] text-ink-300">{league.country}</span>
                  </span>
                  <ChevronRight className="w-4 h-4 text-ink-300 shrink-0 ml-2" />
                </button>
                <button
                  onClick={() => toggleFav('leagues', league.id)}
                  aria-label={`Remove ${league.name} from favorites`}
                  className="shrink-0 p-3"
                >
                  <Star className="w-4 h-4 text-secondary-400 fill-secondary-400" />
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {matches.length > 0 && (
        <>
          <SectionHeader title="Events" />
          <div className={clsx('space-y-2 px-3', leagues.length === 0 && 'mt-2')}>
            {matches.map((m) => (
              <MatchCard key={m.id} match={m} onOpen={(id) => navigate(`/match/${encodeURIComponent(id)}`)} showLeague />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function ResultsScreen() {
  const navigate = useNavigate();
  const all = useMatches((s) => s.byId);

  const finished = useMemo(
    () =>
      Object.values(all)
        .filter((m) => m.status === 'finished')
        .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0)),
    [all]
  );

  const byLeague = new Map<string, typeof finished>();
  for (const m of finished) {
    byLeague.set(m.leagueName, [...(byLeague.get(m.leagueName) || []), m]);
  }

  if (finished.length === 0) {
    return <EmptyState title="No results yet" body="Finished events will appear here with final scores." />;
  }

  return (
    <div className="pb-4">
      <PageTitle title="Results" subtitle={`${finished.length} finished events`} />
      {[...byLeague.entries()].map(([league, list]) => (
        <div key={league}>
          <div className="px-4 pt-4 pb-1 text-[11px] font-bold text-ink-300 uppercase tracking-wide">{league}</div>
          <div className="mx-3 rounded-xl overflow-hidden border border-ink-500/30">
            {list.slice(0, 8).map((m) => (
              <button key={m.id} onClick={() => navigate(`/match/${encodeURIComponent(m.id)}`)} className="w-full flex items-center justify-between px-3 py-2.5 bg-ink-600 hover:bg-ink-500/70 transition-colors border-b border-ink-500/20 last:border-b-0">
                <span className="text-xs font-medium text-ink-50 truncate">{m.home.name} — {m.away.name}</span>
                <span className="text-sm font-extrabold text-primary-600 tnum ml-2 shrink-0">{m.score?.home ?? 0}:{m.score?.away ?? 0}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
