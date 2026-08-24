import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Gift, Zap, Percent, RotateCcw, Bell, Trash2, CheckCheck, Radio, Gamepad2, Timer, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import type { AppNotification } from '@/lib/types';
import { claimPromotion } from '@/lib/promotions';
import { usePromotions } from '@/store/promotions';
import { useAuth } from '@/store/auth';
import { useNotifs } from '@/store/notifs';
import { useUI } from '@/store/ui';
import { useMatches } from '@/store/matches';
import { MatchCard } from '@/components/MatchCard';
import { Button, EmptyState, InfoNote } from '@/components/ui';
import { useDocumentMeta } from '@/lib/seo';
import { PageTitle } from '@/components/pieces';
import { dateTimeLabel } from '@/lib/format';

const KIND_ICONS = {
  welcome: Gift,
  freebet: Gift,
  boost: Percent,
  cashback: RotateCcw,
};

export function PromotionsScreen() {
  const navigate = useNavigate();
  const profile = useAuth((s) => s.profile);
  const toast = useUI((s) => s.toast);
  const allPromotions = usePromotions((s) => s.promotions);
  const promotions = useMemo(() => allPromotions.filter((p) => p.active), [allPromotions]);
  useDocumentMeta('Promotions & Bonuses', 'OddWave promotions — welcome bonus, free bets, acca boosts and cashback offers.');

  const claim = (id: string) => {
    if (!profile) {
      navigate('/auth');
      return;
    }
    const res = claimPromotion(id);
    if (res.ok) toast('success', res.message ?? 'Claimed!');
    else toast('error', res.error ?? 'Could not claim');
  };

  if (promotions.length === 0) {
    return (
      <div className="pb-4">
        <PageTitle title="Promotions" />
        <EmptyState icon={<Gift className="w-6 h-6" />} title="No promotions right now" body="Check back soon — new campaigns show up here as they go live." />
      </div>
    );
  }

  return (
    <div className="pb-4">
      <PageTitle title="Promotions" />
      <div className="px-3 space-y-3">
        {promotions.map((p) => {
          const Icon = KIND_ICONS[p.kind];
          const claimed = profile?.claimedPromos.includes(p.id);
          return (
            <div key={p.id} className="rounded-2xl overflow-hidden border" style={{ borderColor: `${p.accent}40`, background: `linear-gradient(135deg, ${p.accent}14 0%, #ffffff 65%)` }}>
              <div className="p-4">
                <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wide rounded px-1.5 py-0.5" style={{ backgroundColor: `${p.accent}33`, color: p.accent }}>
                  <Icon className="w-3 h-3" /> {p.kind}
                </span>
                <h2 className="text-base font-extrabold text-ink-50 mt-2">{p.title}</h2>
                <p className="text-xs text-ink-200 mt-1">{p.blurb}</p>
                {p.value > 0 && (
                  <div className="mt-2 inline-flex items-baseline gap-1">
                    <span className="text-2xl font-extrabold tnum" style={{ color: p.accent }}>{p.value}</span>
                    <span className="text-xs font-bold text-ink-200">GH₵ value</span>
                  </div>
                )}
                <ul className="mt-3 space-y-1">
                  {p.terms.map((t) => (
                    <li key={t} className="text-[11px] text-ink-300 flex items-start gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-ink-400 mt-1.5 shrink-0" /> {t}
                    </li>
                  ))}
                </ul>
                <Button
                  size="sm"
                  variant={claimed ? 'outline' : 'primary'}
                  className="mt-4 w-full"
                  disabled={!!claimed}
                  onClick={() => claim(p.id)}
                >
                  {claimed ? 'Already Claimed' : p.kind === 'boost' ? 'How It Works' : 'Claim Now'}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="px-4 mt-4">
        <InfoNote>Acca Boost applies automatically at settlement — no opt-in needed.</InfoNote>
      </div>
    </div>
  );
}

export function NotificationsScreen() {
  const navigate = useNavigate();
  const profile = useAuth((s) => s.profile);
  const items = useNotifs((s) => s.items);
  const markAllRead = useNotifs((s) => s.markAllRead);

  if (!profile) {
    return (
      <EmptyState
        icon={<Bell className="w-6 h-6" />}
        title="Sign in for notifications"
        body="Bet settlements, cashouts, deposits and promos land here."
        action={<Button onClick={() => navigate('/auth')}>Login / Register</Button>}
      />
    );
  }

  const mine = items.filter((i) => i.userId === profile.id);

  return (
    <div className="pb-4">
      <PageTitle
        title="Notifications"
        right={
          mine.some((i) => !i.read) ? (
            <button onClick={markAllRead} className="link-action flex items-center gap-1 text-xs font-bold text-primary-600">
              <CheckCheck className="w-3.5 h-3.5" /> Mark all read
            </button>
          ) : undefined
        }
      />
      {mine.length === 0 ? (
        <EmptyState icon={<Bell className="w-6 h-6" />} title="No notifications yet" body="Place a bet or make a deposit to start receiving updates." />
      ) : (
        <div className="divide-y divide-ink-500/25 mx-3 rounded-xl overflow-hidden border border-ink-500/40">
          {mine.slice(0, 50).map((n: AppNotification) => (
            <button
              key={n.id}
              onClick={() => n.link && navigate(n.link)}
              className={clsx('w-full flex items-start gap-3 px-3 py-3 text-left transition-colors hover:bg-ink-600', !n.read && 'bg-primary-500/5')}
            >
              <span className={clsx('w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5', toneFor(n.kind))}>
                <NotifIcon kind={n.kind} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-bold text-ink-50 truncate">{n.title}{!n.read && <span className="ml-2 inline-block w-2 h-2 rounded-full bg-error-500 align-middle" />}</span>
                <span className="block text-xs text-ink-200 mt-0.5">{n.body}</span>
                <span className="block text-[10px] text-ink-300 mt-1">{dateTimeLabel(n.createdAt)}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      {mine.length > 0 && (
        <button
          onClick={() => useNotifs.getState().clear(profile.id)}
          className="link-action mx-auto mt-4 flex items-center gap-1.5 text-[11px] font-bold text-error-500"
        >
          <Trash2 className="w-3.5 h-3.5" /> Clear all notifications
        </button>
      )}
    </div>
  );
}

function toneFor(kind: AppNotification['kind']): string {
  switch (kind) {
    case 'bet_won':
    case 'deposit':
      return 'bg-success-500/15 text-success-500';
    case 'bet_lost':
    case 'withdrawal':
      return 'bg-error-500/15 text-error-500';
    case 'cashout':
    case 'promo':
      return 'bg-secondary-500/15 text-secondary-400';
    default:
      return 'bg-primary-500/15 text-primary-600';
  }
}

function NotifIcon({ kind }: { kind: AppNotification['kind'] }) {
  switch (kind) {
    case 'bet_won':
    case 'bet_lost':
      return <Zap className="w-4 h-4" />;
    case 'deposit':
      return <ArrowDownLeft className="w-4 h-4" />;
    case 'withdrawal':
      return <ArrowUpRight className="w-4 h-4" />;
    case 'cashout':
      return <Percent className="w-4 h-4" />;
    case 'promo':
      return <Gift className="w-4 h-4" />;
    case 'live':
      return <Radio className="w-4 h-4" />;
    default:
      return <Bell className="w-4 h-4" />;
  }
}

export function VirtualsScreen() {
  const navigate = useNavigate();
  const all = useMatches((s) => s.byId);
  const virtuals = Object.values(all).filter((m) => m.virtual);
  const liveVirtuals = virtuals.filter((m) => m.status === 'live');
  const upcomingVirtuals = virtuals.filter((m) => m.status === 'upcoming');

  return (
    <div className="pb-4">
      <PageTitle title="Virtuals" subtitle="Simulated leagues · instant action" />
      <div className="mx-3 mb-4 rounded-xl border border-secondary-500/40 bg-secondary-500/10 p-3 flex gap-2">
        <Timer className="w-4 h-4 text-secondary-400 shrink-0 mt-0.5" />
        <p className="text-xs text-secondary-200">Virtual matches run on a fast clock (full match ≈ 30 seconds). Odds and scores update live — bet like normal with your real wallet balance.</p>
      </div>

      {virtuals.length === 0 ? (
        <EmptyState icon={<Gamepad2 className="w-6 h-6" />} title="No virtual rounds running" body="Virtual football leagues restart every few minutes." />
      ) : (
        <>
          {liveVirtuals.length > 0 && (
            <>
              <div className="px-4 pb-1 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-error-500 animate-pulse-live" />
                <span className="text-[11px] font-bold text-error-500 uppercase">In Play Now</span>
              </div>
              <div className="space-y-2 px-3 pb-2">
                {liveVirtuals.map((m) => (
                  <MatchCard key={m.id} match={m} onOpen={(id) => navigate(`/match/${encodeURIComponent(id)}`)} showLeague />
                ))}
              </div>
            </>
          )}
          {upcomingVirtuals.length > 0 && (
            <>
              <div className="px-4 pb-1 pt-2 text-[11px] font-bold text-ink-300 uppercase">Next Rounds</div>
              <div className="space-y-2 px-3">
                {upcomingVirtuals.map((m) => (
                  <MatchCard key={m.id} match={m} compact onOpen={(id) => navigate(`/match/${encodeURIComponent(id)}`)} showLeague={false} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
