import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, Zap, Copy, Check, Search as SearchIcon } from 'lucide-react';
import { useMatches } from '@/store/matches';
import type { SlipItem } from '@/lib/types';
import { MatchCard } from '@/components/MatchCard';
import { PageTitle, SportTabs } from '@/components/pieces';
import { EmptyState, Button } from '@/components/ui';
import { SPORTS } from '@/lib/catalog';
import { dayLabel, timeLabel } from '@/lib/format';
import { loadBookingCode } from '@/lib/booking';
import { useSlip } from '@/store/slip';

export function TodayScreen() {
  const navigate = useNavigate();
  const [sport, setSport] = useState<string | null>(null);
  const all = useMatches((s) => s.byId);

  const todays = useMemo(() => {
    const now = new Date();
    return Object.values(all)
      .filter((m) => m.status === 'upcoming' && !m.virtual)
      .filter((m) => new Date(m.kickoff).toDateString() === new Date(now).toDateString())
      .filter((m) => !sport || m.sportId === sport)
      .sort((a, b) => a.kickoff - b.kickoff);
  }, [all, sport]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof todays>();
    for (const m of todays) map.set(m.leagueName, [...(map.get(m.leagueName) || []), m]);
    return [...map.entries()];
  }, [todays]);

  return (
    <div className="pb-4">
      <PageTitle title="Today's Events" right={<CalendarDays className="w-5 h-5 text-ink-300" />} />
      <SportTabs sports={SPORTS} selected={sport} onSelect={setSport} />
      {grouped.map(([league, list]) => (
        <div key={league}>
          <div className="px-4 pt-4 pb-1 text-[11px] font-bold text-ink-300 uppercase tracking-wide">{league}</div>
          <div className="space-y-2 px-3">
            {list.map((m) => (
              <MatchCard key={m.id} match={m} onOpen={(id) => navigate(`/match/${encodeURIComponent(id)}`)} showLeague={false} />
            ))}
          </div>
        </div>
      ))}
      {todays.length === 0 && (
        <EmptyState
          icon={<CalendarDays className="w-6 h-6" />}
          title="Nothing more today"
          body="Check Tomorrow for the next round of fixtures."
          action={<Button onClick={() => navigate('/sports')}>All Fixtures</Button>}
        />
      )}
    </div>
  );
}

export function BookingScreen() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<null | { code: string; count: number; totalOdds: number; expiresLabel: string }>(null);
  const [copied, setCopied] = useState(false);
  const addSelections = useSlip((s) => s.add);

  const handleLoad = () => {
    setError(null);
    setLoaded(null);
    const res = loadBookingCode(code);
    if (!res.ok || !res.payload) {
      setError(res.error ?? 'Invalid booking code');
      return;
    }
    const items: SlipItem[] = [];
    for (const p of res.payload.items) {
      const match = Object.values(useMatches.getState().byId).find((m) => m.id === p.matchId);
      if (!match || ['finished', 'cancelled'].includes(match.status)) continue;
      const market = match.markets.find((mk) => mk.key === p.marketKey);
      const outcome = market?.outcomes.find((o) => o.code === p.outcomeCode);
      if (!market || !outcome) continue;
      items.push({
        outcomeId: `${match.id}:${outcome.id}`,
        matchId: match.id,
        matchName: `${match.home.name} vs ${match.away.name}`,
        leagueName: match.leagueName,
        marketKey: market.key,
        marketName: market.name,
        outcomeLabel: outcome.label,
        outcomeCode: outcome.code,
        odds: outcome.odds,
        oddsSnapshot: outcome.odds,
        kickoff: match.kickoff,
        addedAt: Date.now(),
      });
    }
    if (items.length === 0) {
      setError('None of the selections in this code are still available');
      return;
    }
    items.forEach((i) => addSelections(i));
    const totalOdds = Math.round(items.reduce((a, i) => a * i.odds, 1) * 100) / 100;
    setLoaded({
      code: code.trim().toUpperCase(),
      count: items.length,
      totalOdds,
      expiresLabel: `Valid until ${dayLabel(res.payload.createdAt + 24 * 3600000)} ${timeLabel(res.payload.createdAt + 24 * 3600000)}`,
    });
  };

  return (
    <div className="pb-4">
      <PageTitle title="Booking Code" subtitle="Share & load selections" />
      <div className="mx-4 mb-3 rounded-xl border border-primary-500/40 bg-primary-500/10 p-3 flex gap-2">
        <Zap className="w-4 h-4 text-primary-600 shrink-0 mt-0.5" />
        <p className="text-xs text-primary-700">Generate codes from your betslip (Save button). Codes stay valid for 24 hours and can be shared with friends.</p>
      </div>

      <div className="mx-4 flex gap-2">
        <div className="flex-1 flex items-center gap-2 bg-ink-600 border border-ink-400/40 focus-within:border-primary-500 rounded-xl px-3 transition-colors">
          <SearchIcon className="w-4 h-4 text-ink-300" />
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ENTER CODE"
            aria-label="Booking code"
            className="flex-1 bg-transparent py-3 font-mono text-sm font-bold tracking-[0.2em] text-ink-50 placeholder-ink-300 outline-none"
          />
        </div>
        <Button onClick={handleLoad}>Load</Button>
      </div>

      {error && (
        <p className="mx-4 mt-3 text-xs text-error-500 bg-error-500/10 border border-error-500/30 rounded-lg px-3 py-2 animate-shake">{error}</p>
      )}

      {loaded && (
        <div className="mx-4 mt-4 rounded-xl border border-success-500/40 bg-success-500/10 p-4 animate-scale-in">
          <div className="flex items-center justify-between">
            <span className="text-sm font-extrabold text-success-500">Code loaded!</span>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(loaded.code).catch(() => undefined);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              aria-label="Copy code"
              className="text-ink-200"
            >
              {copied ? <Check className="w-4 h-4 text-success-500" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
          <p className="font-mono text-lg font-bold tracking-[0.25em] text-ink-50 mt-1">{loaded.code}</p>
          <p className="text-xs text-ink-200 mt-1">{loaded.count} selections · Combined odds {loaded.totalOdds.toFixed(2)}</p>
          <p className="text-[11px] text-ink-300 mt-0.5">{loaded.expiresLabel}</p>
          <Button size="sm" className="mt-3 w-full" onClick={() => navigate('/')}>
            Review in Betslip →
          </Button>
        </div>
      )}
    </div>
  );
}
