import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  Wallet, ArrowDownLeft, ArrowUpRight, Ticket, Settings, LogOut, User,
  ChevronRight, Loader2, CheckCircle2, X, ShieldCheck, Bell, Gift,
  Star as StarIcon, Zap, Copy, Check,
} from 'lucide-react';
import type { Txn } from '@/lib/types';
import { useAuth } from '@/store/auth';
import { useWallet } from '@/store/wallet';
import { useNotifs } from '@/store/notifs';
import { useFavorites } from '@/store/favorites';
import { useUI } from '@/store/ui';
import { LIMITS, CURRENCY } from '@/lib/config';
import { money, dateTimeLabel } from '@/lib/format';
import { Button, EmptyState, ErrorBox, InfoNote } from '@/components/ui';

export function AccountScreen() {
  const navigate = useNavigate();
  const profile = useAuth((s) => s.profile);
  const signOut = useAuth((s) => s.signOut);
  const balance = useWallet((s) => (profile ? s.balanceOf(profile.id) : 0));
  const locked = useWallet((s) => (profile ? s.lockedOf(profile.id) : 0));
  const unread = useNotifs((s) => (profile ? s.unreadFor(profile.id) : 0));
  const favCount = useFavorites((s) => s.totalCount());
  const toast = useUI((s) => s.toast);

  if (!profile) {
    return (
      <EmptyState
        icon={<User className="w-6 h-6" />}
        title="You are browsing as a guest"
        body="Sign in to manage your wallet, bets, favorites and personal settings."
        action={<Button onClick={() => navigate('/auth')}>Login / Register</Button>}
      />
    );
  }

  const handleSignOut = async () => {
    await signOut();
    toast('info', 'Signed out');
    navigate('/');
  };

  return (
    <div className="pb-4">
      {/* Profile header */}
      <div className="bg-gradient-to-b from-primary-700 to-primary-800 px-4 pt-6 pb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center">
            <User className="w-7 h-7 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-lg font-bold text-white truncate">{profile.fullName}</div>
            <div className="text-xs text-primary-100">{profile.phone || profile.email}</div>
            {profile.role === 'admin' && (
              <span className="inline-flex items-center gap-1 mt-1 bg-secondary-400 text-white text-[9px] font-extrabold rounded px-1.5 py-0.5 uppercase">Admin</span>
            )}
          </div>
        </div>

        <div className="bg-white/10 rounded-xl p-4 backdrop-blur-sm">
          <div className="text-xs text-primary-100 mb-1">Available Balance</div>
          <div className="text-2xl font-extrabold text-white tnum">{money(balance)} <span className="text-sm font-bold">{CURRENCY}</span></div>
          {locked > 0 && <div className="text-xs text-secondary-100 mt-1">{money(locked)} {CURRENCY} locked in pending withdrawals</div>}
          {profile.bonusBalance > 0 && (
            <div className="flex items-center gap-1 text-xs text-secondary-100 mt-1"><Gift className="w-3 h-3" /> Bonus: {money(profile.bonusBalance)} {CURRENCY}</div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3 p-4 pb-3">
        <button onClick={() => navigate('/account/deposit')} className="flex-1 bg-primary-500 active:scale-[0.98] transition-transform rounded-xl py-3 flex flex-col items-center gap-1">
          <ArrowDownLeft className="w-5 h-5 text-white" />
          <span className="text-sm font-bold text-white">Deposit</span>
        </button>
        <button onClick={() => navigate('/account/withdraw')} className="flex-1 bg-ink-600 border border-ink-400/50 active:scale-[0.98] transition-transform rounded-xl py-3 flex flex-col items-center gap-1">
          <ArrowUpRight className="w-5 h-5 text-ink-50" />
          <span className="text-sm font-bold text-ink-50">Withdraw</span>
        </button>
      </div>

      {/* Menu items */}
      <div className="divide-y divide-ink-500/30 px-4 border-t border-ink-500/30">
        <MenuRow icon={Ticket} label="My Bets & Transactions" onClick={() => navigate('/bets')} />
        <MenuRow icon={StarIcon} label={`Favorites (${favCount})`} onClick={() => navigate('/favorites')} />
        <MenuRow icon={Bell} label={`Notifications${unread ? ` (${unread} new)` : ''}`} onClick={() => navigate('/notifications')} />
        <MenuRow icon={Zap} label="Promotions" onClick={() => navigate('/promotions')} />
        <MenuRow icon={ShieldCheck} label="Security & Sessions" onClick={() => navigate('/account/security')} />
        <MenuRow icon={Settings} label="Settings" onClick={() => navigate('/settings')} />
        {profile.role === 'admin' && <MenuRow icon={ShieldCheck} label="Admin Console" accent onClick={() => navigate('/admin')} />}
        <MenuRow icon={LogOut} label="Sign Out" danger onClick={handleSignOut} />
      </div>

      <p className="text-center text-[10px] text-ink-300 pt-4">
        Member since {new Date(profile.createdAt).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })} · ID {profile.id.slice(0, 10)}
      </p>
    </div>
  );
}

function MenuRow({ icon: Icon, label, onClick, danger, accent }: { icon: React.ComponentType<{ className?: string }>; label: string; onClick?: () => void; danger?: boolean; accent?: boolean }) {
  return (
    <button onClick={onClick} className="flex items-center gap-3 py-3.5 w-full active:bg-ink-500/40 transition-colors">
      <Icon className={clsx('w-5 h-5', danger ? 'text-error-500' : accent ? 'text-secondary-400' : 'text-ink-200')} />
      <span className={clsx('flex-1 text-left text-sm font-semibold', danger ? 'text-error-500' : 'text-ink-50')}>{label}</span>
      <ChevronRight className="w-4 h-4 text-ink-300" />
    </button>
  );
}

const PROVIDERS = [
  { id: 'mtn', name: 'MTN MoMo', hint: '024 · 055 · 059', color: '#fdcb4d' },
  { id: 'vod', name: 'Telecel Cash', hint: '020 · 050', color: '#e4002b' },
  { id: 'atl', name: 'AirtelTigo Money', hint: '026 · 056', color: '#3b82f6' },
];

export function DepositScreen() {
  const navigate = useNavigate();
  const profile = useAuth((s) => s.profile);
  const wallet = useWallet();
  const toast = useUI((s) => s.toast);
  const [amount, setAmount] = useState('');
  const [momo, setMomo] = useState('');
  const [provider, setProvider] = useState(PROVIDERS[0]);
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!profile) {
    navigate('/auth');
    return null;
  }

  const amt = Number(amount);

  const submit = async () => {
    setError(null);
    if (!amt || amt <= 0) return setError('Enter a valid amount');
    if (amt < LIMITS.minDeposit) return setError(`Minimum deposit is ${LIMITS.minDeposit} ${CURRENCY}`);
    if (amt > LIMITS.maxDeposit) return setError(`Maximum deposit is ${LIMITS.maxDeposit.toLocaleString()} ${CURRENCY}`);
    if (!/^\d{9,10}$/.test(momo.replace(/\s/g, ''))) return setError('Enter a valid MoMo number');

    if (profile.rgLimits.depositLimit !== null) {
      const todayStart = new Date().setHours(0, 0, 0, 0);
      const depositedToday = wallet
        .userTxns(profile.id)
        .filter((t) => t.type === 'deposit' && t.status === 'success' && t.createdAt >= todayStart)
        .reduce((s, t) => s + t.amount, 0);
      if (depositedToday + amt > profile.rgLimits.depositLimit) {
        setError(`Daily deposit limit of ${money(profile.rgLimits.depositLimit)} would be exceeded. Adjust in Responsible Gaming.`);
        return;
      }
    }
    if (profile.rgLimits.selfExcludedUntil && profile.rgLimits.selfExcludedUntil > Date.now()) {
      setError('Account under self-exclusion — deposits disabled.');
      return;
    }

    setProcessing(true);
    await new Promise((r) => setTimeout(r, 1200));
    try {
      await wallet.deposit(profile.id, amt, provider.id);
      setSuccess(true);
      toast('success', `Deposited ${money(amt)} ${CURRENCY}`);
      setTimeout(() => {
        setSuccess(false);
        setAmount('');
        setMomo('');
        navigate('/account');
      }, 1600);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <SubScreen title="Deposit" onClose={() => navigate('/account')}>
      {success ? (
        <SuccessPanel title="Deposit Successful" body={`${money(amt)} ${CURRENCY} added to your wallet`} />
      ) : (
        <>
          <BalanceCard />
          <SectionLabel>Payment Method</SectionLabel>
          <div className="space-y-2 mb-4 px-4">
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                onClick={() => setProvider(p)}
                aria-pressed={provider.id === p.id}
                className={clsx(
                  'w-full flex items-center gap-3 rounded-xl p-3.5 border transition-all text-left',
                  provider.id === p.id ? 'bg-ink-500 border-primary-500/60' : 'bg-ink-600 border-ink-500/50 hover:border-ink-400/60'
                )}
              >
                <span className="w-9 h-9 rounded-lg flex items-center justify-center text-[10px] font-extrabold text-ink-50" style={{ backgroundColor: `${p.color}55` }}>
                  {p.name.slice(0, 2).toUpperCase()}
                </span>
                <span className="flex-1">
                  <span className="block text-sm font-bold text-ink-50">{p.name}</span>
                  <span className="block text-[11px] text-ink-300">{p.hint}</span>
                </span>
                {provider.id === p.id && <Check className="w-4 h-4 text-primary-600" />}
              </button>
            ))}
            <InfoNote>Demo payment providers — no real money moves.</InfoNote>
          </div>

          <SectionLabel>MoMo Number</SectionLabel>
          <div className="px-4 mb-4">
            <input
              type="tel"
              inputMode="numeric"
              placeholder="e.g. 0241234567"
              value={momo}
              onChange={(e) => setMomo(e.target.value)}
              aria-label="Mobile money number"
              className="w-full bg-ink-600 border border-ink-400/40 focus:border-primary-500 rounded-xl px-4 py-3 text-sm text-ink-50 placeholder-ink-300 outline-none transition-colors"
            />
          </div>

          <SectionLabel>Amount ({CURRENCY})</SectionLabel>
          <div className="px-4 mb-4">
            <input
              type="number"
              inputMode="decimal"
              placeholder="Enter amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-label="Deposit amount"
              className="w-full bg-ink-600 border border-ink-400/40 focus:border-primary-500 rounded-xl px-4 py-3.5 text-lg font-extrabold text-ink-50 placeholder-ink-300 outline-none tnum transition-colors"
            />
            <div className="flex gap-2 mt-2">
              {[20, 50, 100, 200].map((q) => (
                <button key={q} onClick={() => setAmount(String(q))} className="flex-1 bg-ink-600 rounded-lg py-2 text-xs font-bold text-ink-200 active:scale-95 transition-transform">
                  {q}
                </button>
              ))}
            </div>
          </div>

          <div className="px-4">
            {error && <ErrorBox message={error} />}
            <Button size="lg" className="w-full" loading={processing} onClick={submit}>
              {processing ? 'Contacting provider…' : `Deposit ${amt > 0 ? money(amt) + ' ' + CURRENCY : 'Now'}`}
            </Button>
          </div>
        </>
      )}
    </SubScreen>
  );
}

export function WithdrawScreen() {
  const navigate = useNavigate();
  const profile = useAuth((s) => s.profile);
  const wallet = useWallet();
  const balance = useWallet((s) => (profile ? s.balanceOf(profile.id) : 0));
  const locked = useWallet((s) => (profile ? s.lockedOf(profile.id) : 0));
  const toast = useUI((s) => s.toast);
  const [amount, setAmount] = useState('');
  const [momo, setMomo] = useState(profile?.phone.replace('+233', '0') ?? '');
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!profile) {
    navigate('/auth');
    return null;
  }

  const available = Math.round((balance - locked) * 100) / 100;
  const amt = Number(amount);

  const submit = async () => {
    setError(null);
    if (!amt || amt <= 0) return setError('Enter a valid amount');
    if (amt < LIMITS.minWithdrawal) return setError(`Minimum withdrawal is ${LIMITS.minWithdrawal} ${CURRENCY}`);
    if (amt > LIMITS.maxWithdrawal) return setError(`Maximum withdrawal is ${LIMITS.maxWithdrawal.toLocaleString()} ${CURRENCY}`);
    if (amt > available) return setError(`Insufficient available balance (${money(available)})`);
    if (!/^\d{9,10}$/.test(momo.replace(/\s/g, ''))) return setError('Enter a valid MoMo number');
    if (!profile.phone) return setError('Add a phone number to your account first (KYC requirement)');

    setProcessing(true);
    await new Promise((r) => setTimeout(r, 900));
    const res = await wallet.requestWithdrawal(profile.id, amt, momo);
    setProcessing(false);
    if (res.error) return setError(res.error);
    setSuccess(true);
    toast('success', 'Withdrawal requested');
    setTimeout(() => {
      setSuccess(false);
      navigate('/account');
    }, 1800);
  };

  return (
    <SubScreen title="Withdraw" onClose={() => navigate('/account')}>
      {success ? (
        <SuccessPanel
          title="Withdrawal Requested"
          body={`${money(amt)} ${CURRENCY} on the way to ${momo}. Pending admin approval — funds are held as locked until approved.`}
        />
      ) : (
        <>
          <BalanceCard extra={`${money(available)} ${CURRENCY} available · ${money(locked)} locked`} />
          <SectionLabel>MoMo Number</SectionLabel>
          <div className="px-4 mb-4">
            <input
              type="tel"
              inputMode="numeric"
              placeholder="e.g. 0241234567"
              value={momo}
              onChange={(e) => setMomo(e.target.value)}
              aria-label="Mobile money number"
              className="w-full bg-ink-600 border border-ink-400/40 focus:border-primary-500 rounded-xl px-4 py-3 text-sm text-ink-50 placeholder-ink-300 outline-none transition-colors"
            />
          </div>
          <SectionLabel>Amount ({CURRENCY})</SectionLabel>
          <div className="px-4 mb-4">
            <input
              type="number"
              inputMode="decimal"
              placeholder="Enter amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-label="Withdrawal amount"
              className="w-full bg-ink-600 border border-ink-400/40 focus:border-primary-500 rounded-xl px-4 py-3.5 text-lg font-extrabold text-ink-50 placeholder-ink-300 outline-none tnum transition-colors"
            />
            <div className="flex gap-2 mt-2">
              {[50, 100, 200].map((q) => (
                <button key={q} onClick={() => setAmount(String(q))} disabled={available < q} className="flex-1 bg-ink-600 rounded-lg py-2 text-xs font-bold text-ink-200 active:scale-95 transition-transform disabled:opacity-40">
                  {q}
                </button>
              ))}
              <button onClick={() => setAmount(String(Math.floor(available)))} className="flex-1 bg-secondary-500/15 border border-secondary-500/40 rounded-lg py-2 text-xs font-bold text-secondary-200 active:scale-95 transition-transform">
                Max
              </button>
            </div>
            <InfoNote>Requests are reviewed by the payments team before payout.</InfoNote>
          </div>
          <div className="px-4">
            {error && <ErrorBox message={error} />}
            <Button variant="secondary" size="lg" className="w-full" loading={processing} onClick={submit}>
              {processing ? 'Submitting…' : 'Request Withdrawal'}
            </Button>
          </div>
        </>
      )}
    </SubScreen>
  );
}

export function SubScreen({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="pb-6 animate-slide-up">
      <div className="flex items-center px-2 py-3 bg-ink-800 border-b border-ink-500/30 sticky top-14 z-[25]">
        <button onClick={onClose} className="p-2 text-ink-100" aria-label={`Close ${title}`}>
          <X className="w-5 h-5" />
        </button>
        <span className="text-base font-bold text-ink-50 ml-1">{title}</span>
      </div>
      <div className="pt-4">{children}</div>
    </div>
  );
}

function BalanceCard({ extra }: { extra?: string }) {
  const profile = useAuth((s) => s.profile);
  const balance = useWallet((s) => (profile ? s.balanceOf(profile.id) : 0));
  return (
    <div className="mx-4 mb-4 bg-ink-600 rounded-xl p-4 border border-ink-500/40">
      <div className="text-xs text-ink-300 mb-1">Current Balance</div>
      <div className="text-2xl font-extrabold text-ink-50 tnum">{money(balance)} <span className="text-sm text-ink-300">{CURRENCY}</span></div>
      {extra && <div className="text-[11px] text-ink-300 mt-1 tnum">{extra}</div>}
    </div>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-bold text-ink-200 uppercase tracking-wide mb-2 px-4">{children}</div>;
}

function SuccessPanel({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 animate-scale-in px-6 text-center">
      <CheckCircle2 className="w-14 h-14 text-success-500 mb-3" />
      <p className="text-lg font-bold text-ink-50">{title}</p>
      <p className="text-sm text-ink-200 mt-1 max-w-xs">{body}</p>
    </div>
  );
}

const NO_TXNS: Txn[] = [];

export function AccountTransactionsScreen() {
  const navigate = useNavigate();
  const profile = useAuth((s) => s.profile);
  // Selector must return a stable reference: a fresh [] every call makes zustand
  // see a changed snapshot forever and re-render until React gives up.
  const txns = useWallet((s) => (profile ? s.txns[profile.id] : undefined)) ?? NO_TXNS;
  if (!profile) return null;
  return (
    <SubScreen title="Transaction History" onClose={() => navigate('/account')}>
      {txns.length === 0 ? (
        <EmptyState icon={<Wallet className="w-6 h-6" />} title="No transactions yet" />
      ) : (
        <div className="divide-y divide-ink-500/25 mx-4 rounded-xl overflow-hidden border border-ink-500/40">
          {txns.map((t) => (
            <div key={t.id} className="flex items-center justify-between px-3 py-2.5 bg-ink-600">
              <div>
                <div className="text-xs font-bold text-ink-50 capitalize">{t.type}{t.status !== 'success' ? ` (${t.status})` : ''}</div>
                <div className="text-[10px] text-ink-300">{dateTimeLabel(t.createdAt)}</div>
              </div>
              <div className={clsx('text-sm font-extrabold tnum', t.amount >= 0 ? 'text-success-500' : 'text-error-500')}>
                {t.amount >= 0 ? '+' : ''}{money(t.amount)}
              </div>
            </div>
          ))}
        </div>
      )}
      <button onClick={() => navigate('/bets')} className="link-action mt-4 mx-auto block text-xs font-bold text-primary-600 underline underline-offset-2">
        Open full ledger in My Bets → Transactions
      </button>
    </SubScreen>
  );
}

export function AccountFavoritesShortcut() {
  const navigate = useNavigate();
  const favCount = useFavorites((s) => s.totalCount());
  return (
    <button onClick={() => navigate('/favorites')} className="hidden">
      <StarIcon />{favCount}
    </button>
  );
}

export function CopyableId({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(value).catch(() => undefined);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex items-center gap-1 text-[10px] text-ink-300"
    >
      {value.slice(0, 8)}…
      {copied ? <Check className="w-3 h-3 text-success-500" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

export function LoadingSpinnerLine() {
  return (
    <div className="flex justify-center py-2">
      <Loader2 className="w-4 h-4 animate-spin text-primary-600" />
    </div>
  );
}
