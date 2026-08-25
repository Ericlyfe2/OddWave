import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { AlertTriangle, Ban, Save } from 'lucide-react';
import { useAuth } from '@/store/auth';
import { useWallet } from '@/store/wallet';
import { useUI } from '@/store/ui';
import { Button, ErrorBox, InfoNote, Modal } from '@/components/ui';
import { PageTitle } from '@/components/pieces';
import { money } from '@/lib/format';

export function ResponsibleGamingScreen() {
  const navigate = useNavigate();
  const profile = useAuth((s) => s.profile);
  const updateProfile = useAuth((s) => s.updateProfile);
  const wallet = useWallet();
  const toast = useUI((s) => s.toast);

  const [depositLimit, setDepositLimit] = useState(profile?.rgLimits.depositLimit?.toString() ?? '');
  const [lossLimit, setLossLimit] = useState(profile?.rgLimits.lossLimit?.toString() ?? '');
  const [reminder, setReminder] = useState(profile?.rgLimits.sessionReminderMin?.toString() ?? '');
  const [error, setError] = useState<string | null>(null);
  const [excludeOpen, setExcludeOpen] = useState(false);

  // Responsible-gaming guidance must be readable without an account; only the
  // controls that act on a wallet require signing in.
  if (!profile) return <SignedOutGuidance onSignIn={() => navigate('/auth')} />;

  const saveLimits = async () => {
    setError(null);
    const dep = depositLimit === '' ? null : Number(depositLimit);
    const loss = lossLimit === '' ? null : Number(lossLimit);
    const rem = reminder === '' ? null : Math.round(Number(reminder));
    if ((dep !== null && (dep < 10 || !Number.isFinite(dep))) || (loss !== null && (loss < 10 || !Number.isFinite(loss)))) {
      setError('Minimum limit is 10 GH₵');
      return;
    }
    if (rem !== null && (rem < 1 || !Number.isFinite(rem))) {
      setError('Reminder must be at least 1 minute');
      return;
    }
    try {
      await updateProfile({
        rgLimits: {
          ...profile.rgLimits,
          depositLimit: dep,
          lossLimit: loss,
          sessionReminderMin: rem,
        },
      });
      toast('success', 'Limits updated');
    } catch {
      setError('Could not save limits — try again');
    }
  };

  const isExcluded = !!profile.rgLimits.selfExcludedUntil && profile.rgLimits.selfExcludedUntil > Date.now();

  const netToday = (() => {
    const todayStart = new Date().setHours(0, 0, 0, 0);
    return -wallet
      .userTxns(profile.id)
      .filter((t) => t.status === 'success' && t.createdAt >= todayStart)
      .reduce((s, t) => s + t.amount, 0);
  })();

  return (
    <div className="pb-6">
      <PageTitle title="Responsible Gaming" />

      <div className="mx-4 mb-4 rounded-xl border border-secondary-500/40 bg-secondary-500/10 p-3 flex gap-2">
        <AlertTriangle className="w-4 h-4 text-secondary-400 shrink-0 mt-0.5" />
        <p className="text-xs text-secondary-200">
          Betting should be entertainment — never a way to make money. Set limits that protect you and never chase losses.
        </p>
      </div>

      {isExcluded && (
        <div className="mx-4 mb-4 rounded-xl border border-error-500/40 bg-error-500/15 p-3">
          <p className="text-xs font-bold text-error-500">Self-exclusion active</p>
          <p className="text-[11px] text-error-600 mt-0.5">Betting and deposits are disabled until you contact support.</p>
        </div>
      )}

      <div className="mx-4 mb-4 rounded-xl border border-ink-500/40 bg-ink-600 p-3 flex items-center justify-between">
        <span className="text-xs text-ink-200">Net position today</span>
        <span className={clsx('text-sm font-extrabold tnum', netToday > 0 ? 'text-success-500' : 'text-ink-50')}>
          {netToday > 0 ? '+' : ''}{money(netToday)} GH₵
        </span>
      </div>

      <div className="mx-4 space-y-4">
        <LimitInput label="Daily deposit limit (GH₵)" hint="Blocks deposits once your daily total would exceed this." value={depositLimit} onChange={setDepositLimit} placeholder="No limit" disabled={isExcluded} />
        <LimitInput label="Daily loss limit (GH₵)" hint="Stakes are blocked when today's net losses reach this amount." value={lossLimit} onChange={setLossLimit} placeholder="No limit" disabled={isExcluded} />
        <LimitInput label="Reality check reminder (minutes)" hint="A reminder appears after this many minutes in the app." value={reminder} onChange={setReminder} placeholder="Off" />

        {error && <ErrorBox message={error} />}
        <Button className="w-full" onClick={saveLimits}>
          <Save className="w-4 h-4" /> Save Limits
        </Button>

        <button onClick={() => setExcludeOpen(true)} className="w-full rounded-xl border border-error-500/40 bg-error-500/10 px-3 py-3.5 flex items-center gap-3 text-left">
          <Ban className="w-5 h-5 text-error-500 shrink-0" />
          <span>
            <span className="block text-sm font-bold text-error-600">Take a Break / Self-Exclusion</span>
            <span className="block text-[11px] text-ink-200">Block betting for at least 6 months</span>
          </span>
        </button>

        <InfoNote>Need support? National problem gambling services operate free helplines 24/7. Betting is restricted to persons aged 18+.</InfoNote>
      </div>

      <Modal open={excludeOpen} onClose={() => setExcludeOpen(false)} title="Confirm Self-Exclusion">
        <p className="text-sm text-ink-200">
          This immediately disables betting, deposits and gameplay on your account until you contact support to discuss reactivation.
        </p>
        <div className="flex gap-2 mt-4">
          <Button variant="outline" className="flex-1" onClick={() => setExcludeOpen(false)}>Cancel</Button>
          <Button
            variant="danger"
            className="flex-1"
            onClick={async () => {
              try {
                await updateProfile({ rgLimits: { ...profile.rgLimits, selfExcludedUntil: Date.now() + 182 * 86400000 } });
                setExcludeOpen(false);
                toast('info', 'Self-exclusion activated');
                navigate('/');
              } catch {
                toast('error', 'Could not activate self-exclusion — try again');
              }
            }}
          >
            I Understand — Exclude Me
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function SignedOutGuidance({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className="pb-6">
      <PageTitle title="Responsible Gaming" subtitle="Stay in control" />
      <div className="px-4 space-y-3">
        <p className="text-sm text-ink-200 leading-relaxed">
          Betting should be entertainment — never a way to make money. OddWave gives every account deposit
          limits, loss limits, session reminders, cooling-off periods and self-exclusion.
        </p>

        <ul className="rounded-xl border border-ink-500 bg-ink-600 divide-y divide-ink-500 overflow-hidden">
          {[
            ['Deposit limits', 'Cap how much you can add to your wallet each day.'],
            ['Loss limits', 'Stop betting once losses reach an amount you choose.'],
            ['Session reminders', 'Get nudged after a set time of continuous play.'],
            ['Self-exclusion', 'Block betting, deposits and games for at least 6 months.'],
          ].map(([title, body]) => (
            <li key={title} className="px-3 py-3">
              <span className="block text-sm font-bold text-ink-50">{title}</span>
              <span className="block text-[11px] text-ink-300 mt-0.5">{body}</span>
            </li>
          ))}
        </ul>

        <Button className="w-full" onClick={onSignIn}>Sign in to set your limits</Button>

        <InfoNote>
          Need support? National problem gambling services operate free helplines 24/7. Betting is restricted to
          persons aged 18+.
        </InfoNote>
      </div>
    </div>
  );
}

function LimitInput({
  label,
  hint,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-bold text-ink-100">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1.5 w-full bg-ink-600 border border-ink-400/40 focus:border-primary-500 rounded-xl px-3 py-2.5 text-sm text-ink-50 placeholder-ink-300 outline-none transition-colors disabled:opacity-50 tnum"
      />
      <span className="block text-[11px] text-ink-300 mt-1">{hint}</span>
    </label>
  );
}
