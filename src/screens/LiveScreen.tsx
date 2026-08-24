import { useNavigate } from 'react-router-dom';
import { Radio } from 'lucide-react';
import { useMatches, useLiveMatches } from '@/store/matches';
import { MatchCard } from '@/components/MatchCard';
import { SportTabs, ListSkeleton } from '@/components/pieces';
import { SPORTS } from '@/lib/catalog';
import { useMemo, useState } from 'react';
import { EmptyState } from '@/components/ui';

export function LiveScreen() {
  const navigate = useNavigate();
  const [sport, setSport] = useState<string | null>(null);
  const live = useLiveMatches();
  const loaded = useMatches((s) => s.loaded);

  const filtered = useMemo(() => live.filter((m) => !sport || m.sportId === sport).sort((a, b) => (b.minute ?? 0) - (a.minute ?? 0)), [live, sport]);

  if (!loaded) return <ListSkeleton count={5} />;

  const byLeague = new Map<string, typeof filtered>();
  for (const m of filtered) {
    byLeague.set(m.leagueName, [...(byLeague.get(m.leagueName) || []), m]);
  }

  return (
    <div className="pb-4">
      <SportTabs sports={SPORTS} selected={sport} onSelect={setSport} />

      <div className="px-3 pt-3 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-error-500 animate-pulse-live" />
        <span className="text-xs font-bold text-error-500 uppercase tracking-wide">{filtered.length} Live Events</span>
        <span className="text-[10px] text-ink-300">Odds update in real time</span>
      </div>

      {[...byLeague.entries()].map(([league, list]) => (
        <div key={league}>
          <div className="px-4 pt-4 pb-1 text-[11px] font-bold text-ink-300 uppercase tracking-wide">{league}</div>
          <div className="space-y-2 px-3">
            {list.map((m) => (
              <MatchCard key={m.id} match={m} onOpen={(id) => navigate(`/match/${encodeURIComponent(id)}`)} showLeague={false} />
            ))}
          </div>
        </div>
      ))}

      {filtered.length === 0 && (
        <EmptyState
          icon={<Radio className="w-6 h-6" />}
          title="No live events right now"
          body="Live betting opens shortly before kickoff. Browse upcoming events meanwhile."
          action={
            <button onClick={() => navigate('/sports')} className="bg-primary-500 text-white text-sm font-bold px-5 py-2.5 rounded-xl">
              Browse Sports
            </button>
          }
        />
      )}
    </div>
  );
}
