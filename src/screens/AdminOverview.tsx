import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  Users, Wallet, Activity, TrendingUp, Clock3, Ban, FastForward,
  PauseCircle, XCircle, Search, ChevronLeft, ShieldAlert,
} from 'lucide-react';
import { useAuth } from '@/store/auth';
import { useWallet } from '@/store/wallet';
import { useBets } from '@/store/bets';
import { useMatches } from '@/store/matches';
import { liveEngine } from '@/lib/liveEngine';
import { StatCard } from '@/components/ui';
import { money, round2 } from '@/lib/format';
import { trpc } from '@/lib/trpc';

export function AdminOverview() {
  const navigate = useNavigate();
  const profile = useAuth((s) => s.profile);
  const { data: profiles = [] } = trpc.admin.listUsers.useQuery();
  const wallet = useWallet();
  const bets = useBets((s) => s.bets);
  const matchesById = useMatches((s) => s.byId);

  const [query, setQuery] = useState('');
  const [, force] = useState(0);

  if (!profile || profile.role !== 'admin') {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-error-500/40 bg-error-500/10 p-4 flex gap-2">
          <ShieldAlert className="w-5 h-5 text-error-500 shrink-0" />
          <p className="text-sm text-error-500 font-semibold">Admin access required.</p>
        </div>
      </div>
    );
  }

  const stats = useMemo(() => {
    const open = bets.filter((b) => b.status === 'open');
    const turnover = round2(bets.filter((b) => b.status !== 'open').reduce((s, b) => s + b.stake, 0));
    const payouts = round2(bets.reduce((s, b) => s + (b.payout ?? 0), 0));
    const exposure = round2(open.reduce((s, b) => s + (b.potential || b.stake * Math.max(b.totalOdds, 1)), 0));
    return {
      users: profiles.length,
      openCount: open.length,
      stakedOpen: round2(open.reduce((s, b) => s + b.stake, 0)),
      turnover,
      payouts,
      ggr: round2(turnover - payouts),
      exposure,
      pendingWd: wallet.pendingWithdrawals(),
    };
  }, [bets, wallet.txns, profiles]);

  const manageable = useMemo(() => {
    const q = query.trim().toLowerCase();
    return Object.values(matchesById)
      .filter((m) => ['upcoming', 'live'].includes(m.status))
      .filter((m) => !q || `${m.home.name} ${m.away.name} ${m.leagueName}`.toLowerCase().includes(q))
      .sort((a, b) => a.kickoff - b.kickoff)
      .slice(0, 25);
  }, [matchesById, query]);

  const act = (id: string, action: 'end' | 'postpone' | 'cancel') => {
    if (action === 'end') liveEngine.endNow(id);
    else if (action === 'postpone') liveEngine.postpone(id);
    else liveEngine.cancel(id);
    force((n) => n + 1);
  };

  return (
    <div className="pb-8">
      <div className="flex items-center gap-2 px-3 pt-3">
        <button onClick={() => navigate('/')} aria-label="Back" className="p-1.5 rounded-lg hover:bg-ink-600 text-ink-200">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-extrabold text-ink-50">Admin Console</h1>
      </div>

      <div className="px-3 mt-3 grid grid-cols-2 lg:grid-cols-4 gap-2">
        <StatCard icon={<Users className="w-4 h-4" />} label="Users" value={String(stats.users)} tone="default" />
        <StatCard icon={<Activity className="w-4 h-4" />} label="Open bets" value={`${stats.openCount} · ${money(stats.stakedOpen)}`} tone="primary" />
        <StatCard icon={<TrendingUp className="w-4 h-4" />} label="GGR (settled)" value={money(stats.ggr)} tone={stats.ggr >= 0 ? 'success' : 'error'} />
        <StatCard
          icon={<Clock3 className="w-4 h-4" />}
          label="Pending withdrawals"
          value={`${stats.pendingWd.length} · ${money(round2(Math.abs(stats.pendingWd.reduce((s, t) => s + t.amount, 0))))}`}
          tone={stats.pendingWd.length > 0 ? 'warning' : 'default'}
          onClick={() => navigate('/admin?tab=withdrawals')}
        />
      </div>

      <div className="px-3 mt-2 grid grid-cols-2 gap-2 text-[11px] text-ink-300">
        <div className="rounded-lg bg-ink-600 border border-ink-500/40 px-3 py-2">Turnover settled: <b className="text-ink-100">{money(stats.turnover)}</b></div>
        <div className="rounded-lg bg-ink-600 border border-ink-500/40 px-3 py-2">Paid out: <b className="text-ink-100">{money(stats.payouts)}</b></div>
        <div className="rounded-lg bg-ink-600 border border-ink-500/40 px-3 py-2">Open exposure: <b className="text-secondary-400">{money(stats.exposure)}</b></div>
        <div className="rounded-lg bg-ink-600 border border-ink-500/40 px-3 py-2 flex items-center gap-1"><Wallet className="w-3 h-3" /> Locked funds tracked per user</div>
      </div>

      <h2 className="px-4 mt-6 mb-2 text-[11px] font-bold text-ink-300 uppercase tracking-wide">Event Control</h2>
      <div className="mx-3 mb-2 flex items-center gap-2 bg-ink-600 border border-ink-400/40 focus-within:border-primary-500 rounded-xl px-3 transition-colors">
        <Search className="w-4 h-4 text-ink-300" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search live & upcoming events"
          aria-label="Search events"
          className="flex-1 bg-transparent py-2.5 text-sm text-ink-50 placeholder-ink-300 outline-none"
        />
      </div>

      <div className="mx-3 space-y-2">
        {manageable.map((m) => (
          <div key={m.id} className="rounded-xl border border-ink-500/40 bg-ink-600 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-bold text-ink-50 truncate">
                  {m.home.name} vs {m.away.name}
                  {m.status === 'live' && m.minute != null && <span className="ml-1.5 text-error-500 font-extrabold">LIVE {m.minute}′</span>}
                </p>
                <p className="text-[10px] text-ink-300 truncate">{m.leagueName}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <IconBtn title="End now (settles bets)" onClick={() => act(m.id, 'end')}><FastForward className="w-3.5 h-3.5" /></IconBtn>
                <IconBtn title="Postpone" onClick={() => act(m.id, 'postpone')}><PauseCircle className="w-3.5 h-3.5" /></IconBtn>
                <IconBtn title="Cancel (void)" onClick={() => act(m.id, 'cancel')}><XCircle className="w-3.5 h-3.5" /></IconBtn>
              </div>
            </div>
            {m.markets.some((mk) => mk.suspended) && (
              <p className="mt-1 text-[10px] text-secondary-400 inline-flex items-center gap-1"><Ban className="w-3 h-3" /> Some markets suspended</p>
            )}
            <MarketSuspendRow matchId={m.id} onDone={() => force((n) => n + 1)} />
          </div>
        ))}
        {manageable.length === 0 && <p className="text-xs text-ink-300 px-1 py-3">No matching events.</p>}
      </div>
    </div>
  );
}

function IconBtn({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button onClick={onClick} title={title} aria-label={title} className="p-2 rounded-lg bg-ink-700 border border-ink-500/50 text-ink-100 hover:border-primary-500/60 active:scale-95 transition-all">
      {children}
    </button>
  );
}

function MarketSuspendRow({ matchId, onDone }: { matchId: string; onDone: () => void }) {
  const match = useMatches.getState().byId[matchId];
  const markets = match?.markets.slice(0, 3) ?? [];
  if (markets.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {markets.map((mk) => (
        <button
          key={mk.key}
          onClick={() => {
            liveEngine.setMarketSuspended(matchId, mk.key, !mk.suspended);
            onDone();
          }}
          className={clsx(
            'text-[10px] font-bold rounded-md px-2 py-1 border transition-colors',
            mk.suspended ? 'bg-secondary-500/20 border-secondary-500/60 text-secondary-400' : 'bg-ink-700 border-ink-500/50 text-ink-300'
          )}
        >
          {mk.name} {mk.suspended ? '· suspended' : ''}
        </button>
      ))}
    </div>
  );
}
