import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { ChevronDown, ChevronRight, Globe2, Search as SearchIcon, Star } from 'lucide-react';
import { getLeagues } from '@/lib/dataGen';
import { useMatches } from '@/store/matches';
import { SPORTS, sportName } from '@/lib/catalog';
import { SportTabs, PageTitle } from '@/components/pieces';
import { EmptyState } from '@/components/ui';
import { useFavorites } from '@/store/favorites';

interface CountryGroup {
  country: string;
  leagues: Array<{ id: string; name: string; sportId: string; events: number }>;
  events: number;
}

/** Leagues grouped by country, with live event counts from the matches store. */
function useCountryGroups(sportId: string | null, query: string): CountryGroup[] {
  const byId = useMatches((s) => s.byId);

  return useMemo(() => {
    const counts = new Map<string, number>();
    for (const match of Object.values(byId)) {
      if (match.status === 'finished' || match.status === 'cancelled') continue;
      counts.set(match.leagueId, (counts.get(match.leagueId) ?? 0) + 1);
    }

    const grouped = new Map<string, CountryGroup>();
    for (const league of getLeagues(sportId ?? undefined)) {
      const events = counts.get(league.id) ?? 0;
      const group = grouped.get(league.country) ?? { country: league.country, leagues: [], events: 0 };
      group.leagues.push({ id: league.id, name: league.name, sportId: league.sportId, events });
      group.events += events;
      grouped.set(league.country, group);
    }

    const needle = query.trim().toLowerCase();
    return [...grouped.values()]
      .map((group) => ({
        ...group,
        leagues: [...group.leagues].sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .filter((group) =>
        !needle ||
        group.country.toLowerCase().includes(needle) ||
        group.leagues.some((l) => l.name.toLowerCase().includes(needle))
      )
      .sort((a, b) => a.country.localeCompare(b.country));
  }, [byId, sportId, query]);
}

function LeagueStarButton({ leagueId, leagueName }: { leagueId: string; leagueName: string }) {
  const toggleFav = useFavorites((s) => s.toggle);
  const isFav = useFavorites((s) => s.isFav('leagues', leagueId));
  return (
    <button
      onClick={() => toggleFav('leagues', leagueId)}
      aria-label={isFav ? `Remove ${leagueName} from favorites` : `Add ${leagueName} to favorites`}
      aria-pressed={isFav}
      className="shrink-0 p-2.5"
    >
      <Star className={clsx('w-3.5 h-3.5', isFav ? 'text-secondary-400 fill-secondary-400' : 'text-ink-300')} />
    </button>
  );
}

export function CountriesScreen() {
  const navigate = useNavigate();
  const [sport, setSport] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());

  const groups = useCountryGroups(sport, query);
  const totalLeagues = groups.reduce((sum, g) => sum + g.leagues.length, 0);

  const toggle = (country: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(country)) next.delete(country);
      else next.add(country);
      return next;
    });
  };

  // Letters that actually have a country behind them, for the A–Z rail.
  const letters = useMemo(
    () => [...new Set(groups.map((g) => g.country[0].toUpperCase()))].sort(),
    [groups]
  );

  return (
    <div className="pb-4">
      <SportTabs sports={SPORTS} selected={sport} onSelect={setSport} />

      <div className="px-3 py-2">
        <div className="flex items-center gap-2 bg-ink-600 border border-ink-500 rounded-xl px-3 py-2.5 focus-within:border-primary-500 transition-colors">
          <SearchIcon className="w-4 h-4 text-ink-300" />
          <input
            placeholder="Filter by country or league…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Filter countries"
            className="flex-1 bg-transparent text-sm text-ink-50 placeholder-ink-300 outline-none"
          />
        </div>
      </div>

      <PageTitle
        title="Countries"
        subtitle={`${groups.length} ${groups.length === 1 ? 'country' : 'countries'} · ${totalLeagues} ${totalLeagues === 1 ? 'league' : 'leagues'}`}
      />

      {letters.length > 1 && (
        <div className="scroll-x gap-1 px-3 pb-2" aria-label="Jump to letter">
          {letters.map((letter) => (
            <a
              key={letter}
              href={`#country-${letter}`}
              className="shrink-0 w-7 h-7 rounded-lg bg-ink-600 border border-ink-500 text-[11px] font-bold text-ink-200 hover:border-primary-500 hover:text-primary-600 flex items-center justify-center transition-colors"
            >
              {letter}
            </a>
          ))}
        </div>
      )}

      {groups.length === 0 ? (
        <EmptyState
          icon={<Globe2 className="w-6 h-6" />}
          title="No countries match"
          body={query ? `Nothing for “${query}”. Try another country or league name.` : 'No leagues available for this sport yet.'}
        />
      ) : (
        <div className="divide-y divide-ink-500">
          {groups.map((group, index) => {
            const letter = group.country[0].toUpperCase();
            const isFirstOfLetter = index === 0 || groups[index - 1].country[0].toUpperCase() !== letter;
            const expanded = open.has(group.country);

            return (
              <div key={group.country} id={isFirstOfLetter ? `country-${letter}` : undefined} className="scroll-mt-28">
                <button
                  onClick={() => toggle(group.country)}
                  aria-expanded={expanded}
                  className="w-full flex items-center justify-between px-3 py-3 bg-ink-600 hover:bg-ink-700 transition-colors text-left"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    {expanded ? (
                      <ChevronDown className="w-4 h-4 text-ink-300 shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-ink-300 shrink-0" />
                    )}
                    <span className="min-w-0">
                      <span className="block text-[13px] font-bold text-ink-50 truncate">{group.country}</span>
                      <span className="block text-[10px] text-ink-300">
                        {group.leagues.length} {group.leagues.length === 1 ? 'league' : 'leagues'}
                      </span>
                    </span>
                  </span>
                  <span className="text-xs font-bold text-primary-600 tnum shrink-0 ml-2">{group.events}</span>
                </button>

                {expanded && (
                  <ul className="bg-ink-700 animate-fade-in">
                    {group.leagues.map((league) => (
                      <li key={league.id} className="flex items-center">
                        <button
                          onClick={() => navigate(`/league/${league.id}`)}
                          className="flex-1 flex items-center justify-between pl-9 pr-3 py-2.5 hover:bg-ink-500/40 transition-colors text-left min-w-0"
                        >
                          <span className="min-w-0">
                            <span className="block text-[13px] text-ink-50 truncate">{league.name}</span>
                            <span className="block text-[10px] text-ink-300">{sportName(league.sportId)}</span>
                          </span>
                          <span
                            className={clsx(
                              'text-xs font-bold tnum shrink-0 ml-2',
                              league.events > 0 ? 'text-primary-600' : 'text-ink-300'
                            )}
                          >
                            {league.events}
                          </span>
                        </button>
                        <LeagueStarButton leagueId={league.id} leagueName={league.name} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
