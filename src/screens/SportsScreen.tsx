import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronDown, ChevronRight, Search as SearchIcon, Star } from 'lucide-react';
import { useMatches } from '@/store/matches';
import { getLeagues } from '@/lib/dataGen';
import { SPORTS, sportName } from '@/lib/catalog';
import type { Match } from '@/lib/types';
import { MatchCard } from '@/components/MatchCard';
import { SportTabs, PageTitle, Breadcrumbs } from '@/components/pieces';
import { dayLabel, timeLabel } from '@/lib/format';
import { clsx } from 'clsx';
import { useFavorites } from '@/store/favorites';
import { useDocumentMeta } from '@/lib/seo';

export function useGroupedMatches(sportId: string | null): Array<{ leagueId: string; leagueName: string; country: string; sportId: string; matches: Match[] }> {
  const all = useMatches((s) => s.byId);
  return useMemo(() => {
    const groups = new Map<string, Match[]>();
    for (const m of Object.values(all)) {
      if (m.status !== 'upcoming') continue;
      if (sportId && m.sportId !== sportId) continue;
      const arr = groups.get(m.leagueId) || [];
      arr.push(m);
      groups.set(m.leagueId, arr);
    }
    const leagues = getLeagues(sportId ?? undefined);
    return leagues
      .map((lg) => ({
        leagueId: lg.id,
        leagueName: lg.name,
        country: lg.country,
        sportId: lg.sportId,
        matches: (groups.get(lg.id) || []).sort((a, b) => a.kickoff - b.kickoff),
      }))
      .filter((g) => g.matches.length > 0);
  }, [all, sportId]);
}

export function LeagueAccordion({ group, onOpen }: { group: { leagueId: string; leagueName: string; country: string; matches: Match[] }; onOpen: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const toggleFav = useFavorites((s) => s.toggle);
  const isFav = useFavorites((s) => s.isFav('leagues', group.leagueId));

  return (
    <div className="border-b border-ink-500/30">
      <div className="w-full flex items-center gap-1 px-3 py-1">
        <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex-1 flex items-center justify-between py-2 active:bg-ink-500/40 transition-colors min-w-0">
          <div className="flex items-center gap-2 min-w-0 text-left">
            {open ? <ChevronDown className="w-4 h-4 text-ink-300 shrink-0" /> : <ChevronRight className="w-4 h-4 text-ink-300 shrink-0" />}
            <div className="min-w-0">
              <div className="text-[13px] font-bold text-ink-50 truncate">{group.leagueName}</div>
              <div className="text-[10px] text-ink-300">{group.country}</div>
            </div>
          </div>
          <span className="text-xs font-bold text-primary-600 tnum shrink-0 ml-2">{group.matches.length}</span>
        </button>
        <button
          onClick={() => toggleFav('leagues', group.leagueId)}
          aria-label={isFav ? `Remove ${group.leagueName} from favorites` : `Add ${group.leagueName} to favorites`}
          aria-pressed={isFav}
          className="shrink-0 p-2 -m-1"
        >
          <Star className={clsx('w-4 h-4', isFav ? 'text-secondary-400 fill-secondary-400' : 'text-ink-300')} />
        </button>
      </div>
      {open && (
        <div className="space-y-1 px-2 pb-2 animate-fade-in">
          {group.matches.map((m) => (
            <MatchCard key={m.id} match={m} compact onOpen={onOpen} />
          ))}
        </div>
      )}
    </div>
  );
}

export function SportsScreen() {
  const navigate = useNavigate();
  const params = useParams<{ sportId?: string }>();
  const [sport, setSport] = useState<string | null>(params.sportId ?? null);
  const [query, setQuery] = useState('');
  const groups = useGroupedMatches(sport);

  const filtered = query
    ? groups.filter((g) => g.leagueName.toLowerCase().includes(query.toLowerCase()) || g.country.toLowerCase().includes(query.toLowerCase()))
    : groups;

  useDocumentMeta(
    sport ? sportName(sport) : 'All Sports',
    sport
      ? `Bet on ${sportName(sport)} — live odds, fixtures, and leagues on OddWave.`
      : 'Browse every sport on OddWave — football, basketball, tennis, and more, with live odds.'
  );

  return (
    <div className="pb-4">
      <SportTabs sports={SPORTS} selected={sport} onSelect={(id) => setSport(id)} />

      <div className="px-3 py-2">
        <div className="flex items-center gap-2 bg-ink-600 rounded-xl px-3 py-2.5 border border-transparent focus-within:border-primary-500/60 transition-colors">
          <SearchIcon className="w-4 h-4 text-ink-300" />
          <input
            placeholder="Filter by league or country…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Filter leagues"
            className="flex-1 bg-transparent text-sm text-ink-50 placeholder-ink-300 outline-none"
          />
        </div>
      </div>

      <PageTitle title={sport ? `${sportName(sport)} · ${filtered.length} leagues` : `All Sports · ${filtered.length} leagues`} />

      {filtered.map((g) => (
        <LeagueAccordion key={g.leagueId} group={g} onOpen={(id) => navigate(`/match/${encodeURIComponent(id)}`)} />
      ))}

      {filtered.length === 0 && (
        <p className="text-center text-sm text-ink-300 py-10">No events found{query ? ` for "${query}"` : ''}. Try another sport.</p>
      )}
    </div>
  );
}

function LeagueFavoriteButton({ leagueId, leagueName }: { leagueId: string; leagueName: string }) {
  const toggleFav = useFavorites((s) => s.toggle);
  const isFav = useFavorites((s) => s.isFav('leagues', leagueId));
  return (
    <button
      onClick={() => toggleFav('leagues', leagueId)}
      aria-label={isFav ? `Remove ${leagueName} from favorites` : `Add ${leagueName} to favorites`}
      aria-pressed={isFav}
      className="p-2 -m-2"
    >
      <Star className={clsx('w-4 h-4', isFav ? 'text-secondary-400 fill-secondary-400' : 'text-ink-300')} />
    </button>
  );
}

export function LeagueScreen() {
  const navigate = useNavigate();
  const { leagueId } = useParams<{ leagueId: string }>();
  const all = useMatches((s) => s.byId);
  const league = getLeagues().find((l) => l.id === leagueId);

  if (!league) {
    return <p className="text-center text-sm text-ink-300 py-12">League not found.</p>;
  }

  const matches = Object.values(all)
    .filter((m) => m.leagueId === leagueId && m.status !== 'finished')
    .sort((a, b) => a.kickoff - b.kickoff);

  const byDay = new Map<string, Match[]>();
  for (const m of matches) {
    const label = dayLabel(m.kickoff);
    byDay.set(label, [...(byDay.get(label) || []), m]);
  }

  useDocumentMeta(league.name, `${league.name} fixtures and odds — ${league.country}. Bet on ${league.name} matches with live odds on OddWave.`);

  return (
    <div className="pb-4">
      <Breadcrumbs
        items={[
          { label: 'Home', to: '/' },
          { label: sportName(league.sportId), to: `/sport/${league.sportId}` },
          { label: league.name },
        ]}
      />
      <PageTitle
        title={league.name}
        right={
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-300">{league.country}</span>
            <LeagueFavoriteButton leagueId={league.id} leagueName={league.name} />
          </div>
        }
      />
      {[...byDay.entries()].map(([day, list]) => (
        <div key={day}>
          <div className={clsx('px-4 py-1.5 bg-ink-700 border-y border-ink-500/30 sticky top-14 z-[25]')}>
            <span className="text-[11px] font-bold text-ink-200 uppercase tracking-wide">{day}</span>
          </div>
          <div className="divide-y divide-ink-500/20">
            {list.map((m) => (
              <MatchCard key={m.id} match={m} compact showLeague={false} onOpen={(id) => navigate(`/match/${encodeURIComponent(id)}`)} />
            ))}
          </div>
        </div>
      ))}
      {matches.length === 0 && (
        <div className="text-center py-12">
          <p className="text-sm text-ink-300">No upcoming events in this league.</p>
          <p className="text-xs text-ink-300 mt-1">Next fixtures: {timeLabel(Date.now() + 86400000)}</p>
        </div>
      )}
    </div>
  );
}
