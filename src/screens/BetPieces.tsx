import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Ticket, DollarSign, Zap, Loader2, AlertTriangle } from 'lucide-react';
import type { Bet } from '@/lib/types';
import { useBets } from '@/store/bets';
import { useUI } from '@/store/ui';
import { cashoutValueLive } from '@/lib/cashoutLive';
import { money } from '@/lib/format';

export function statusStyle(status: Bet['status']): string {
  switch (status) {
    case 'open':
      return 'bg-primary-500/15 text-primary-600';
    case 'won':
      return 'bg-success-500/15 text-success-500';
    case 'lost':
      return 'bg-error-500/15 text-error-500';
    case 'cashed_out':
      return 'bg-secondary-500/20 text-secondary-400';
    default:
      return 'bg-ink-500 text-ink-200';
  }
}

function liveLabel(status: string) {
  if (status === 'open') return null;
  return (
    <span className={clsx('text-[9px] font-bold uppercase', status === 'won' ? 'text-success-500' : status === 'void' ? 'text-ink-300' : 'text-error-500')}>
      · {status}
    </span>
  );
}

function MiniStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <div className="text-[10px] text-ink-300">{label}</div>
      <div className={clsx('text-xs font-extrabold tnum', highlight ? 'text-primary-600' : 'text-ink-50')}>{value}</div>
    </div>
  );
}

export function BetCard({ bet }: { bet: Bet }) {
  const navigate = useNavigate();
  const cashOut = useBets((s) => s.cashOut);
  const toast = useUI((s) => s.toast);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(bet.legs.length <= 2);
  const co = cashoutValueLive(bet);

  const doCashout = async (portion: number) => {
    setBusy(true);
    const res = await cashOut(bet.id, portion);
    setBusy(false);
    if (res.ok) toast('success', `Cashed out ${money(res.amount ?? 0)} GH₵`);
    else toast('error', res.error ?? 'Cash out failed');
  };

  return (
    <div className="bg-ink-600 rounded-xl overflow-hidden">
      <div className="px-3 py-2 flex items-center justify-between gap-2 border-b border-ink-500/30 bg-ink-700/50">
        <span className={clsx('px-2 py-0.5 rounded text-[10px] font-bold uppercase shrink-0', statusStyle(bet.status))}>
          {bet.status.replace('_', ' ')}
          {bet.type !== 'single' && bet.status === 'open' ? ` · ${bet.type}` : ''}
        </span>
        <button onClick={() => setExpanded(!expanded)} className="link-action text-[11px] text-primary-600 font-bold ml-auto mr-1 whitespace-nowrap">
          {expanded ? 'Hide legs' : `${bet.legs.length} legs`}
        </button>
        <span className="text-[10px] text-ink-300 font-mono shrink-0">{bet.bookingCode}</span>
      </div>

      <div className={clsx('divide-y divide-ink-500/20', !expanded && 'max-h-[84px] overflow-hidden')}>
        {bet.legs.map((leg) => (
          <button
            key={`${leg.matchId}:${leg.outcomeCode}`}
            onClick={() => navigate(`/match/${encodeURIComponent(leg.matchId)}`)}
            className="w-full text-left px-3 py-2 hover:bg-ink-500/40 transition-colors flex items-center justify-between gap-2"
          >
            <div className="min-w-0">
              <div className="text-xs font-bold text-primary-700 truncate">
                {leg.outcomeLabel} <span className="font-normal text-ink-300">· {leg.marketName}</span>
              </div>
              <div className="text-[11px] text-ink-200 truncate">{leg.matchName}</div>
              {liveLabel(leg.status)}
            </div>
            <span className="text-sm font-extrabold text-ink-50 tnum shrink-0">{leg.odds.toFixed(2)}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2 px-3 py-2.5 border-t border-ink-500/30 bg-ink-700/40">
        <MiniStat label="Stake" value={money(bet.stake)} />
        <MiniStat label={bet.type === 'system' ? 'Combos' : 'Odds'} value={bet.type === 'system' ? String(bet.comboCount ?? '') : bet.totalOdds.toFixed(2)} />
        <MiniStat label={bet.status === 'lost' ? 'Returned' : bet.status === 'open' ? 'To win' : 'Paid'} value={money(bet.payout ?? bet.potential)} highlight={bet.status !== 'lost'} />
      </div>

      {bet.systemConfig && (
        <div className="px-3 pb-1 text-[10px] text-ink-300">
          System {bet.systemConfig.picksPerCombo}/{bet.legs.length} — {bet.comboCount} combos × {money(bet.stake)} each
        </div>
      )}

      {bet.status === 'open' && bet.cashoutHistory && bet.cashoutHistory.length > 0 && (
        <div className="mx-3 mb-1 flex items-center gap-1.5 bg-secondary-500/15 border border-secondary-500/30 rounded px-2 py-1">
          <Zap className="w-3 h-3 text-secondary-400 shrink-0" />
          <span className="text-[10px] text-secondary-300">
            Partially cashed out: {money(bet.cashoutHistory.reduce((s, c) => s + c.amount, 0))} · remaining stake {money(bet.stake)}
          </span>
        </div>
      )}

      {bet.status === 'open' && (
        <div className="px-3 pb-3 pt-1 space-y-2">
          {co.available ? (
            <>
              <button
                onClick={() => doCashout(1)}
                disabled={busy}
                className="w-full bg-secondary-500/20 border border-secondary-500/50 text-secondary-300 rounded-lg py-2.5 text-sm font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
                Cash Out · {money(co.amount)}
              </button>
              <div className="flex gap-2">
                {[0.25, 0.5].map((p) => (
                  <button
                    key={p}
                    onClick={() => doCashout(p)}
                    disabled={busy}
                    className="flex-1 bg-ink-500 border border-ink-400/40 text-ink-100 rounded-lg py-1.5 text-[11px] font-bold active:scale-[0.98] disabled:opacity-50"
                  >
                    Cash out {p * 100}%
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-1.5 text-[11px] text-ink-300 py-1">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              {co.reason ?? 'Cash out unavailable'}
            </div>
          )}
        </div>
      )}
      {bet.status === 'cashed_out' && (
        <div className="flex items-center justify-center gap-1.5 py-2 text-xs font-bold text-secondary-400">
          <Zap className="w-3.5 h-3.5" /> Cashed out at {money(bet.cashoutAmount ?? 0)}
        </div>
      )}
    </div>
  );
}

const SETTLED_FILTERS = ['all', 'won', 'lost', 'cashed_out', 'void'] as const;
type SettledFilter = (typeof SETTLED_FILTERS)[number];

export function SettledList({ userId }: { userId: string }) {
  const bets = useBets((s) => s.bets);
  const [filter, setFilter] = useState<SettledFilter>('all');
  const settled = bets.filter((b) => b.userId === userId && b.status !== 'open');
  const filtered = filter === 'all' ? settled : settled.filter((b) => b.status === filter);

  return (
    <>
      <div className="scroll-x gap-2 px-3 py-2.5">
        {SETTLED_FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={clsx(
              'shrink-0 rounded-full px-3 py-2 text-xs font-bold capitalize transition-all',
              filter === f ? 'bg-primary-500 text-white' : 'bg-ink-600 text-ink-200'
            )}
          >
            {f.replace('_', ' ')}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <EmptyInline icon={<Ticket className="w-6 h-6" />} title="Nothing here yet" body="Settled bets matching this filter will appear here." />
      ) : (
        <div className="space-y-2.5 px-3 pb-3">
          {filtered.map((b) => (
            <BetCard key={b.id} bet={b} />
          ))}
        </div>
      )}
    </>
  );
}

function EmptyInline({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
      <div className="w-12 h-12 rounded-full bg-ink-600 flex items-center justify-center text-ink-300 mb-3">{icon}</div>
      <p className="text-sm font-bold text-ink-100">{title}</p>
      <p className="text-xs text-ink-300 mt-1 max-w-xs">{body}</p>
    </div>
  );
}
