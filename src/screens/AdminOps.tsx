import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { Check, X, UserCog, Coins, ShieldCheck, Ticket, Ban, Gift, Plus, Pencil, Trash2, EyeOff, Eye } from 'lucide-react';
import { useWallet } from '@/store/wallet';
import { useAuth } from '@/store/auth';
import { usePromotions, type PromotionInput } from '@/store/promotions';
import type { Promotion, PromoKind } from '@/lib/types';
import { money, timeAgoLabel } from '@/lib/format';
import { trpc, trpcClient } from '@/lib/trpc';
import { Button, EmptyState, Modal } from '@/components/ui';

type Tab = 'withdrawals' | 'users' | 'bets' | 'promotions';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'withdrawals', label: 'Withdrawals' },
  { id: 'users', label: 'Users' },
  { id: 'bets', label: 'Bets' },
  { id: 'promotions', label: 'Promotions' },
];

export function AdminOps() {
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const tab: Tab = TABS.some((t) => t.id === requested) ? (requested as Tab) : 'withdrawals';

  return (
    <div className="pb-8">
      <div className="flex border-b border-ink-500/40 sticky top-[56px] z-10 bg-ink-700/95 backdrop-blur">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setParams({ tab: t.id })}
            className={clsx(
              'flex-1 py-3 text-xs font-bold uppercase tracking-wide transition-colors relative',
              tab === t.id ? 'text-primary-600' : 'text-ink-300'
            )}
          >
            {t.label}
            {tab === t.id && <span className="absolute bottom-0 inset-x-6 h-0.5 bg-primary-400 rounded-full" />}
          </button>
        ))}
      </div>
      {tab === 'withdrawals' ? (
        <WithdrawalsQueue />
      ) : tab === 'users' ? (
        <UsersAdmin />
      ) : tab === 'bets' ? (
        <BetsAdmin />
      ) : (
        <PromotionsAdmin />
      )}
    </div>
  );
}

function WithdrawalsQueue() {
  // wallet.pendingWithdrawals() only ever reflects the admin's OWN txns
  // (listTxns is self-scoped server-side, by design — an admin can't just
  // read another user's ledger through the same query a regular user uses),
  // so it can never show a fan's pending withdrawal. Admin needs its own
  // cross-user query.
  const { data: pending = [], refetch } = trpc.wallet.listPendingWithdrawals.useQuery();

  if (pending.length === 0) {
    return (
      <EmptyState
        icon={<ShieldCheck className="w-6 h-6" />}
        title="Queue is clear"
        body="No withdrawal requests awaiting review. New requests appear here in real time."
      />
    );
  }

  return (
    <div className="px-3 pt-3 space-y-2">
      {pending.map((t) => {
        const momo = typeof t.meta?.momo === 'string' ? t.meta.momo : '';
        return (
          <div key={t.id} className="rounded-xl border border-ink-500/40 bg-ink-600 p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-extrabold text-ink-50 tnum">{money(Math.abs(t.amount))} GH₵</p>
                <p className="text-[11px] text-ink-300 mt-0.5">MoMo ····{momo.slice(-4) || '????'}</p>
                <p className="text-[10px] text-ink-300">{t.ref} · Requested {timeAgoLabel(t.createdAt)}</p>
              </div>
              <span className="text-[10px] font-bold text-secondary-400 bg-secondary-500/15 rounded-full px-2 py-1 uppercase">pending</span>
            </div>
            <div className="flex gap-2 mt-2.5">
              <Button
                size="sm"
                className="flex-1"
                onClick={async () => {
                  await trpcClient.wallet.resolveWithdrawal.mutate({ txnId: t.id, approve: true });
                  await refetch();
                }}
              >
                <Check className="w-3.5 h-3.5" /> Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={async () => {
                  await trpcClient.wallet.resolveWithdrawal.mutate({ txnId: t.id, approve: false });
                  await refetch();
                }}
              >
                <X className="w-3.5 h-3.5" /> Reject & Refund
              </Button>
            </div>
          </div>
        );
      })}
      <p className="text-[11px] text-ink-300 px-1 pt-1">
        Requests auto-approve after 2 minutes if untouched (simulated ops team).
      </p>
    </div>
  );
}

function UsersAdmin() {
  const { data: profiles = [] } = trpc.admin.listUsers.useQuery();
  const utils = trpc.useUtils();
  const updateUser = trpc.admin.updateUser.useMutation({
    onSuccess: () => utils.admin.listUsers.invalidate(),
  });
  const wallet = useWallet();
  const profile = useAuth((s) => s.profile);
  const [adjusting, setAdjusting] = useState<string | null>(null);
  const [amount, setAmount] = useState('25');

  return (
    <div className="px-3 pt-3 space-y-2">
      {profiles.map((p) => {
        const bal = wallet.balanceOf(p.id);
        const locked = wallet.lockedOf(p.id);
        return (
          <div key={p.id} className="rounded-xl border border-ink-500/40 bg-ink-600 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-bold text-ink-50 truncate">{p.fullName}</p>
                <p className="text-[11px] text-ink-300 truncate">{p.email}</p>
                <p className="text-[10px] text-ink-300 mt-0.5 tnum">
                  Bal {money(bal)} · Locked {money(locked)}{p.bonusBalance > 0 ? ` · Bonus ${money(p.bonusBalance)}` : ''}
                </p>
              </div>
              <div className="shrink-0 flex flex-col items-end gap-1">
                <span className={clsx(
                  'text-[9px] font-bold uppercase rounded-full px-2 py-0.5',
                  p.role === 'admin' ? 'bg-primary-500/20 text-primary-600' : 'bg-ink-500/40 text-ink-200'
                )}>{p.role}</span>
                {p.suspended && <span className="text-[9px] font-bold uppercase rounded-full px-2 py-0.5 bg-error-500/20 text-error-500">suspended</span>}
              </div>
            </div>

            {adjusting === p.id && (
              <div className="mt-2 flex gap-2 animate-fade-in">
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  aria-label="Adjustment amount (negative to debit)"
                  className="flex-1 bg-ink-700 border border-ink-400/40 focus:border-primary-500 rounded-lg px-2.5 py-2 text-xs text-ink-50 outline-none tnum"
                />
                <Button
                  size="sm"
                  onClick={async () => {
                    const amt = Number(amount) || 0;
                    if (amt !== 0) {
                      await trpcClient.wallet.adminAdjust.mutate({
                        userId: p.id,
                        amount: amt,
                        reason: amt > 0 ? 'Admin credit adjustment' : 'Admin debit adjustment',
                      });
                      // Same listTxns scoping limitation as the withdrawal queue above:
                      // this refreshes the admin's own wallet state, not p.id's — the
                      // Bal/Locked figures shown here for other users don't update live
                      // until that user is hydrated (see UsersAdmin's known-gap note).
                      if (profile) await wallet.hydrate(profile.id);
                    }
                    setAdjusting(null);
                  }}
                >
                  Apply
                </Button>
              </div>
            )}

            <div className="flex flex-wrap gap-1.5 mt-2.5">
              <MiniBtn onClick={() => setAdjusting(adjusting === p.id ? null : p.id)}>
                <Coins className="w-3 h-3" /> Adjust balance
              </MiniBtn>
              <MiniBtn onClick={() => updateUser.mutate({ userId: p.id, patch: { suspended: !p.suspended } })}>
                <UserCog className="w-3 h-3" /> {p.suspended ? 'Unsuspend' : 'Suspend'}
              </MiniBtn>
              <MiniBtn
                disabled={p.role === 'admin'}
                onClick={() => updateUser.mutate({ userId: p.id, patch: { role: p.role === 'admin' ? 'user' : 'admin' } })}
              >
                <ShieldCheck className="w-3 h-3" /> {p.role === 'admin' ? 'Revoke admin' : 'Make admin'}
              </MiniBtn>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MiniBtn({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1 text-[10px] font-bold rounded-md px-2 py-1.5 bg-ink-700 border border-ink-500/50 text-ink-100 hover:border-primary-500/60 active:scale-95 transition-all disabled:opacity-40"
    >
      {children}
    </button>
  );
}

const VOID_REASONS = ['Suspicious activity', 'Trading error', 'Duplicate bet', 'Customer request'] as const;

function BetsAdmin() {
  // useBets's own store is self-scoped to whoever is signed in (listBets is
  // protectedProcedure, by design) — an admin's own bets store never
  // contains other users' bets, so this screen needs the cross-user
  // admin query instead.
  const { data: open = [], refetch } = trpc.bets.listOpenBets.useQuery();
  const { data: profiles = [] } = trpc.admin.listUsers.useQuery();
  const profileById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);

  const [target, setTarget] = useState<string | null>(null);
  const [reason, setReason] = useState<string>(VOID_REASONS[0]);
  const targetBet = open.find((b) => b.id === target) ?? null;

  const confirmVoid = async () => {
    if (!targetBet) return;
    await trpcClient.bets.voidBet.mutate({ betId: targetBet.id, reason });
    await refetch();
    setTarget(null);
  };

  if (open.length === 0) {
    return (
      <EmptyState
        icon={<Ticket className="w-6 h-6" />}
        title="No open bets"
        body="Every placed bet that's still awaiting settlement will appear here."
      />
    );
  }

  return (
    <div className="px-3 pt-3 space-y-2">
      {open.map((bet) => {
        const user = profileById.get(bet.userId);
        return (
          <div key={bet.id} className="rounded-xl border border-ink-500/40 bg-ink-600 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-bold text-ink-50 truncate">{user?.fullName ?? bet.userId}</p>
                <p className="text-[11px] text-ink-300 truncate">{user?.email ?? 'Unknown account'}</p>
                <p className="text-[10px] text-ink-300 mt-0.5 tnum font-mono">
                  {bet.bookingCode} · {bet.legs.length} {bet.legs.length === 1 ? 'pick' : 'picks'} · {bet.type}
                </p>
              </div>
              <span className="shrink-0 text-[9px] font-bold uppercase rounded-full px-2 py-0.5 bg-primary-500/15 text-primary-600">open</span>
            </div>
            <p className="text-[10px] text-ink-300 mt-2 tnum">
              Stake {money(bet.stake)} · Potential {money(bet.potential)} · Placed {timeAgoLabel(bet.placedAt)}
            </p>
            <div className="mt-2.5">
              <MiniBtn onClick={() => { setReason(VOID_REASONS[0]); setTarget(bet.id); }}>
                <Ban className="w-3 h-3" /> Void & refund
              </MiniBtn>
            </div>
          </div>
        );
      })}

      <Modal open={!!targetBet} onClose={() => setTarget(null)} title="Void this bet?">
        {targetBet && (
          <div className="space-y-3">
            <p className="text-sm text-ink-200">
              {money(Math.max(0, targetBet.stake - targetBet.usedBonus))} GH₵ will be refunded to{' '}
              <b className="text-ink-50">{profileById.get(targetBet.userId)?.fullName ?? targetBet.userId}</b>. This cannot be undone.
            </p>
            <div>
              <span className="block text-[11px] font-semibold text-ink-200 mb-1.5">Reason</span>
              <div className="flex flex-wrap gap-1.5">
                {VOID_REASONS.map((r) => (
                  <button
                    key={r}
                    onClick={() => setReason(r)}
                    className={clsx(
                      'text-[11px] font-bold rounded-full px-3 py-1.5 border transition-colors',
                      reason === r ? 'bg-primary-500 border-primary-500 text-white' : 'bg-ink-600 border-ink-500 text-ink-200'
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setTarget(null)}>Cancel</Button>
              <Button variant="danger" className="flex-1" onClick={confirmVoid}>Void & Refund</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

const PROMO_KINDS: PromoKind[] = ['welcome', 'freebet', 'boost', 'cashback'];
const ACCENT_SWATCHES = ['#1d64d8', '#0f4092', '#3b82f6', '#b26a06', '#0a8f5a', '#a4247a'];

function emptyForm(): PromotionInput {
  return { kind: 'welcome', title: '', blurb: '', terms: [], value: 0, accent: ACCENT_SWATCHES[0] };
}

function formFromPromo(p: Promotion): PromotionInput {
  return { kind: p.kind, title: p.title, blurb: p.blurb, terms: p.terms, value: p.value, accent: p.accent };
}

function PromotionsAdmin() {
  const create = usePromotions((s) => s.create);
  const update = usePromotions((s) => s.update);
  const setActive = usePromotions((s) => s.setActive);
  const remove = usePromotions((s) => s.remove);
  // `list()` returns a store method — a stable reference that never changes,
  // so memoizing on it (as an earlier version of this file did) means the
  // component never re-renders when a campaign is actually mutated. Subscribe
  // to the real `promotions` array instead and sort in useMemo off of that.
  const rawPromotions = usePromotions((s) => s.promotions);
  const campaigns = useMemo(() => [...rawPromotions].sort((a, b) => b.createdAt - a.createdAt), [rawPromotions]);

  const [editing, setEditing] = useState<Promotion | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<PromotionInput>(emptyForm());
  const [deleting, setDeleting] = useState<Promotion | null>(null);

  const openCreate = () => {
    setForm(emptyForm());
    setCreating(true);
  };
  const openEdit = (p: Promotion) => {
    setForm(formFromPromo(p));
    setEditing(p);
  };
  const closeForm = () => {
    setCreating(false);
    setEditing(null);
  };

  const save = () => {
    const payload: PromotionInput = {
      ...form,
      title: form.title.trim(),
      blurb: form.blurb.trim(),
      terms: form.terms.map((t) => t.trim()).filter(Boolean),
    };
    if (!payload.title || !payload.blurb) return;
    if (editing) update(editing.id, payload);
    else create(payload);
    closeForm();
  };

  return (
    <div className="px-3 pt-3 space-y-2">
      <Button size="sm" onClick={openCreate}>
        <Plus className="w-3.5 h-3.5" /> New Campaign
      </Button>

      {campaigns.length === 0 && (
        <EmptyState icon={<Gift className="w-6 h-6" />} title="No campaigns yet" body="Create one to see it live on the Promotions page." />
      )}

      {campaigns.map((p) => (
        <div key={p.id} className="rounded-xl border border-ink-500/40 bg-ink-600 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.accent }} />
                <p className="text-sm font-bold text-ink-50 truncate">{p.title}</p>
              </div>
              <p className="text-[11px] text-ink-300 mt-0.5 line-clamp-2">{p.blurb}</p>
              <p className="text-[10px] text-ink-300 mt-1 uppercase tracking-wide">{p.kind}{p.value > 0 ? ` · ${money(p.value)} GH₵` : ''}</p>
            </div>
            <span
              className={clsx(
                'shrink-0 text-[9px] font-bold uppercase rounded-full px-2 py-0.5',
                p.active ? 'bg-success-500/15 text-success-500' : 'bg-ink-500/40 text-ink-200'
              )}
            >
              {p.active ? 'live' : 'hidden'}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            <MiniBtn onClick={() => openEdit(p)}>
              <Pencil className="w-3 h-3" /> Edit
            </MiniBtn>
            <MiniBtn onClick={() => setActive(p.id, !p.active)}>
              {p.active ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />} {p.active ? 'Hide' : 'Publish'}
            </MiniBtn>
            <MiniBtn onClick={() => setDeleting(p)}>
              <Trash2 className="w-3 h-3" /> Delete
            </MiniBtn>
          </div>
        </div>
      ))}

      <Modal open={creating || !!editing} onClose={closeForm} title={editing ? 'Edit Campaign' : 'New Campaign'}>
        <div className="space-y-3">
          <div>
            <span className="block text-[11px] font-semibold text-ink-200 mb-1.5">Kind</span>
            <div className="flex flex-wrap gap-1.5">
              {PROMO_KINDS.map((k) => (
                <button
                  key={k}
                  onClick={() => setForm((f) => ({ ...f, kind: k }))}
                  className={clsx(
                    'text-[11px] font-bold rounded-full px-3 py-1.5 border capitalize transition-colors',
                    form.kind === k ? 'bg-primary-500 border-primary-500 text-white' : 'bg-ink-600 border-ink-500 text-ink-200'
                  )}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="block text-[11px] font-semibold text-ink-200 mb-1">Title</span>
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              aria-label="Campaign title"
              className="w-full bg-ink-600 border border-ink-500 focus:border-primary-500 rounded-xl px-3 py-2.5 text-sm text-ink-50 outline-none transition-colors"
            />
          </label>

          <label className="block">
            <span className="block text-[11px] font-semibold text-ink-200 mb-1">Blurb</span>
            <textarea
              value={form.blurb}
              onChange={(e) => setForm((f) => ({ ...f, blurb: e.target.value }))}
              aria-label="Campaign blurb"
              rows={2}
              className="w-full bg-ink-600 border border-ink-500 focus:border-primary-500 rounded-xl px-3 py-2.5 text-sm text-ink-50 outline-none transition-colors resize-none"
            />
          </label>

          <label className="block">
            <span className="block text-[11px] font-semibold text-ink-200 mb-1">Bonus value (GH₵, 0 if none)</span>
            <input
              type="number"
              min={0}
              value={form.value}
              onChange={(e) => setForm((f) => ({ ...f, value: Math.max(0, Number(e.target.value) || 0) }))}
              aria-label="Bonus value"
              className="w-full bg-ink-600 border border-ink-500 focus:border-primary-500 rounded-xl px-3 py-2.5 text-sm text-ink-50 outline-none transition-colors tnum"
            />
          </label>

          <label className="block">
            <span className="block text-[11px] font-semibold text-ink-200 mb-1">Terms (one per line)</span>
            <textarea
              value={form.terms.join('\n')}
              onChange={(e) => setForm((f) => ({ ...f, terms: e.target.value.split('\n') }))}
              aria-label="Campaign terms"
              rows={4}
              className="w-full bg-ink-600 border border-ink-500 focus:border-primary-500 rounded-xl px-3 py-2.5 text-sm text-ink-50 outline-none transition-colors resize-none"
            />
          </label>

          <div>
            <span className="block text-[11px] font-semibold text-ink-200 mb-1.5">Accent color</span>
            <div className="flex gap-2">
              {ACCENT_SWATCHES.map((c) => (
                <button
                  key={c}
                  onClick={() => setForm((f) => ({ ...f, accent: c }))}
                  aria-label={`Accent ${c}`}
                  aria-pressed={form.accent === c}
                  className={clsx('w-7 h-7 rounded-full border-2 transition-transform', form.accent === c ? 'scale-110 border-ink-50' : 'border-transparent')}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={closeForm}>Cancel</Button>
            <Button className="flex-1" onClick={save} disabled={!form.title.trim() || !form.blurb.trim()}>
              {editing ? 'Save Changes' : 'Create Campaign'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!deleting} onClose={() => setDeleting(null)} title="Delete this campaign?">
        {deleting && (
          <div className="space-y-3">
            <p className="text-sm text-ink-200">
              <b className="text-ink-50">{deleting.title}</b> will be removed permanently. Customers who already claimed it keep what they were credited.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setDeleting(null)}>Cancel</Button>
              <Button
                variant="danger"
                className="flex-1"
                onClick={() => {
                  remove(deleting.id);
                  setDeleting(null);
                }}
              >
                Delete
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
