import { useMemo, useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search as SearchIcon, X, Clock, TrendingUp } from 'lucide-react';
import { useMatches } from '@/store/matches';
import { useUI } from '@/store/ui';
import { MatchCard } from '@/components/MatchCard';
import { EmptyState, LoadingBlock } from '@/components/ui';
import { dayLabel, timeLabel } from '@/lib/format';

const POPULAR = ['Champions', 'Premier', 'Basketball', 'Tennis', 'Esports', 'Ghana'];

export function SearchScreen() {
  const navigate = useNavigate();
  const all = useMatches((s) => s.byId);
  const recents = useUI((s) => s.recentSearches);
  const addRecent = useUI((s) => s.addRecentSearch);
  const clearRecents = useUI((s) => s.clearRecentSearches);

  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (query === debounced) return;
    setSearching(true);
    const t = setTimeout(() => {
      setDebounced(query);
      setSearching(false);
      if (query.trim().length >= 2) addRecent(query);
    }, 250);
    return () => clearTimeout(t);
  }, [query, debounced, addRecent]);

  const results = useMemo(() => {
    const q = debounced.trim().toLowerCase();
    if (q.length < 2) return [];
    const matches = Object.values(all).filter(
      (m) =>
        m.home.name.toLowerCase().includes(q) ||
        m.away.name.toLowerCase().includes(q) ||
        m.leagueName.toLowerCase().includes(q) ||
        m.country.toLowerCase().includes(q)
    );
    const live = matches.filter((m) => m.status === 'live');
    const upcoming = matches.filter((m) => m.status === 'upcoming').sort((a, b) => a.kickoff - b.kickoff);
    const finished = matches.filter((m) => m.status === 'finished');
    return [...live, ...upcoming.slice(0, 20), ...finished];
  }, [debounced, all]);

  const leagues = useMemo(() => {
    const q = debounced.trim().toLowerCase();
    if (q.length < 2) return [];
    const names = new Set<string>();
    for (const m of Object.values(all)) {
      if (m.leagueName.toLowerCase().includes(q)) names.add(m.leagueId);
    }
    return [...names].slice(0, 6);
  }, [debounced, all]);

  return (
    <div className="pb-4">
      <div className="sticky top-14 z-[25] bg-ink-900 px-3 py-2 border-b border-ink-500/30">
        <div className="flex items-center gap-2 bg-ink-600 rounded-xl px-3 py-2.5 border border-transparent focus-within:border-primary-500/60">
          <SearchIcon className="w-4 h-4 text-ink-300 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search teams, leagues, tournaments…"
            aria-label="Search"
            className="flex-1 bg-transparent text-sm text-ink-50 placeholder-ink-300 outline-none"
          />
          {query && (
            <button onClick={() => setQuery('')} aria-label="Clear search">
              <X className="w-4 h-4 text-ink-300" />
            </button>
          )}
        </div>
      </div>

      {debounced.trim().length < 2 ? (
        <>
          {recents.length > 0 && (
            <div className="px-3 pt-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold text-ink-200 uppercase tracking-wide flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Recent</h3>
                <button onClick={clearRecents} className="link-action text-[11px] text-primary-600 font-bold">Clear all</button>
              </div>
              <div className="flex flex-wrap gap-2">
                {recents.map((r) => (
                  <button key={r} onClick={() => setQuery(r)} className="bg-ink-600 hover:bg-ink-500 rounded-full px-3 py-2 text-xs text-ink-100 transition-colors">
                    {r}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="px-3 pt-4">
            <h3 className="text-xs font-bold text-ink-200 uppercase tracking-wide flex items-center gap-1 mb-2"><TrendingUp className="w-3.5 h-3.5" /> Popular</h3>
            <div className="flex flex-wrap gap-2">
              {POPULAR.map((p) => (
                <button key={p} onClick={() => setQuery(p)} className="bg-ink-600 hover:bg-ink-500 rounded-full px-3 py-2 text-xs text-ink-100 transition-colors">
                  {p}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : searching ? (
        <LoadingBlock label="Searching…" />
      ) : results.length === 0 ? (
        <EmptyState
          icon={<SearchIcon className="w-6 h-6" />}
          title={`No results for "${debounced}"`}
          body="Check the spelling or try a team nickname, league or country."
        />
      ) : (
        <>
          {leagues.length > 0 && (
            <div className="px-3 pt-3 flex gap-2 overflow-x-auto no-scrollbar">
              {leagues.map((id) => (
                <button key={id} onClick={() => navigate(`/league/${id}`)} className="shrink-0 bg-secondary-500/15 border border-secondary-500/40 text-secondary-300 rounded-full px-3 py-2 text-xs font-bold">
                  View league →
                </button>
              ))}
            </div>
          )}
          <div className="space-y-2 px-3 pt-3">
            {results.map((m) => (
              <MatchCard key={m.id} match={m} onOpen={(id) => navigate(`/match/${encodeURIComponent(id)}`)} showLeague />
            ))}
          </div>
        </>
      )}
      {results.length > 0 && (
        <p className="text-center text-[11px] text-ink-300 pt-3">{results.length} result{results.length !== 1 ? 's' : ''} · updated {dayLabel(Date.now())} {timeLabel(Date.now())}</p>
      )}
    </div>
  );
}
