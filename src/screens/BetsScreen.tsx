import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ticket, TrendingUp, TrendingDown, ArrowDownLeft, ArrowUpRight, Zap, Gift, Settings2 } from 'lucide-react';
import clsx from 'clsx';
import type { Txn } from '@/lib/types';
import { useBets } from '@/store/bets';
import { useAuth } from '@/store/auth';
import { useWallet } from '@/store/wallet';
import { Tabs, EmptyState, Button } from '@/components/ui';
import { PageTitle } from '@/components/pieces';
import { money, dateTimeLabel } from '@/lib/format';
import { BetCard, SettledList } from './BetPieces';
import { useDocumentMeta } from '@/lib/seo';

type BetsTab = 'open' | 'settled' | 'transactions';

const TXN_META: Record<string, { icon: typeof Ticket; color: string; label: string }> = {
  deposit: { icon: ArrowDownLeft, color: 'text-success-500 bg-success-500/10', label: 'Deposit' },
  withdrawal: { icon: ArrowUpRight, color: 'text-error-500 bg-error-500/10', label: 'Withdrawal' },
  stake: { icon: Ticket, color: 'text-ink-200 bg-ink-500/40', label: 'Bet Stake' },
  payout: { icon: TrendingUp, color: 'text-success-500 bg-success-500/10', label: 'Winnings' },
  cashout: { icon: Zap, color: 'text-secondary-400 bg-secondary-500/10', label: 'Cash Out' },
  bonus: { icon: Gift, color: 'text-primary-600 bg-primary-500/10', label: 'Bonus' },
  refund: { icon: TrendingDown, color: 'text-secondary-300 bg-secondary-500/10', label: 'Refund' },
  adjustment: { icon: Settings2, color: 'text-ink-200 bg-ink-500/40', label: 'Adjustment' },
};

function TxnList({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const txns = useWallet((s) => s.txns[userId]) ?? [];
  const [filter, setFilter] = useState<'all' | Txn['type']>('all');
  const filtered = useMemo(() => (filter === 'all' ? txns : txns.filter((t) => t.type === filter)), [txns, filter]);

  if (txns.length === 0) {
    return (
      <EmptyState
        icon={<Ticket className="w-6 h-6" />}
        title="No transactions yet"
        body="Deposits, withdrawals, stakes and payouts all appear in this ledger."
        action={<Button onClick={() => navigate('/account/deposit')}>Make a Deposit</Button>}
      />
    );
  }

  return (
    <>
      <div className="scroll-x gap-2 px-3 py-2.5">
        {(['all', 'deposit', 'withdrawal', 'stake', 'payout', 'cashout'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={clsx('shrink-0 rounded-full px-3 py-2 text-xs font-bold capitalize transition-all', filter === f ? 'bg-primary-500 text-white' : 'bg-ink-600 text-ink-200')}
          >
            {f}
          </button>
        ))}
      </div>
      <div className="mx-3 rounded-xl overflow-hidden border border-ink-500/30 divide-y divide-ink-500/20">
        {filtered.map((t) => {
          const meta = TXN_META[t.type] ?? TXN_META.adjustment;
          const Icon = meta.icon;
          return (
            <div key={t.id} className="flex items-center gap-3 px-3 py-2.5 bg-ink-600">
              <span className={clsx('w-8 h-8 rounded-full flex items-center justify-center shrink-0', meta.color)}>
                <Icon className="w-4 h-4" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold text-ink-50">
                  {meta.label}
                  {t.status !== 'success' && (
                    <span className={clsx('ml-1.5 text-[9px] font-bold uppercase', t.status === 'pending' ? 'text-secondary-400' : 'text-error-500')}>{t.status}</span>
                  )}
                </div>
                <div className="text-[10px] text-ink-300 truncate">{dateTimeLabel(t.createdAt)} · {t.ref}</div>
              </div>
              <div className={clsx('text-sm font-extrabold tnum shrink-0', t.amount >= 0 ? 'text-success-500' : 'text-error-500')}>
                {t.amount >= 0 ? '+' : ''}{money(t.amount)}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-center text-[10px] text-ink-300 pt-3">Balance is derived from this immutable ledger.</p>
    </>
  );
}

export function BetsScreen() {
  const navigate = useNavigate();
  const profile = useAuth((s) => s.profile);
  const betsCount = useBets((s) => s.bets.filter((b) => b.userId === profile?.id && b.status === 'open').length);
  const [tab, setTab] = useState<BetsTab>('open');
  useDocumentMeta('My Bets');

  if (!profile) {
    return (
      <EmptyState
        icon={<Ticket className="w-6 h-6" />}
        title="Sign in to view your bets"
        body="Track open bets with live progress, cash out early and review your full history."
        action={<Button onClick={() => navigate('/auth')}>Login / Register</Button>}
      />
    );
  }

  return (
    <div className="pb-4">
      <PageTitle title="My Bets" />
      <Tabs
        tabs={[
          { id: 'open', label: 'Open', badge: betsCount },
          { id: 'settled', label: 'Settled' },
          { id: 'transactions', label: 'Transactions' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'open' && <OpenBetsList userId={profile.id} />}
      {tab === 'settled' && <SettledList userId={profile.id} />}
      {tab === 'transactions' && <TxnList userId={profile.id} />}
    </div>
  );
}

function OpenBetsList({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const bets = useBets((s) => s.bets);
  const open = useMemo(() => bets.filter((b) => b.userId === userId && b.status === 'open'), [bets, userId]);

  if (open.length === 0) {
    return (
      <EmptyState
        icon={<Ticket className="w-6 h-6" />}
        title="No open bets"
        body="Your active bets appear here with live progress and cashout values."
        action={<Button onClick={() => navigate('/')}>Place a Bet</Button>}
      />
    );
  }
  return (
    <div className="space-y-2.5 px-3 pt-3 pb-4">
      {open.map((b) => (
        <BetCard key={b.id} bet={b} />
      ))}
    </div>
  );
}
