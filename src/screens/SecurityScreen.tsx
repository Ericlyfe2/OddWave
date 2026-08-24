import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { KeyRound, Monitor, ShieldCheck, MailCheck, PhoneCall, Loader2, LogOut, Check } from 'lucide-react';
import type { DeviceSession } from '@/lib/types';
import { useAuth } from '@/store/auth';
import { useUI } from '@/store/ui';
import { Button, ErrorBox, InfoNote } from '@/components/ui';
import { SubScreen, SectionLabel } from './AccountScreens';
import { dateTimeLabel } from '@/lib/format';

export function SecurityScreen() {
  const navigate = useNavigate();
  const profile = useAuth((s) => s.profile);

  if (!profile) return null;

  return (
    <SubScreen title="Security" onClose={() => navigate('/account')}>
      <ChangePassword />
      <VerificationPanel />
      <SessionsPanel />
    </SubScreen>
  );
}

function ChangePassword() {
  const changePassword = useAuth((s) => s.changePassword);
  const toast = useUI((s) => s.toast);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setError(null);
    if (next !== confirm) {
      setError('New passwords do not match');
      return;
    }
    setSaving(true);
    const res = await changePassword(current, next);
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setCurrent('');
    setNext('');
    setConfirm('');
    toast('success', 'Password updated');
  };

  return (
    <section className="mb-6">
      <SectionLabel>Change Password</SectionLabel>
      <div className="px-4 space-y-2">
        <PasswordField label="Current password" value={current} onChange={setCurrent} autoComplete="current-password" />
        <PasswordField label="New password" value={next} onChange={setNext} autoComplete="new-password" />
        <PasswordField label="Confirm new password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
        {error && <ErrorBox message={error} />}
        <Button className="w-full" loading={saving} onClick={submit} disabled={!current || !next || !confirm}>
          <KeyRound className="w-4 h-4" /> Update Password
        </Button>
        <p className="text-[11px] text-ink-300">
          Minimum 6 characters. Other devices stay signed in — revoke them below if needed.
        </p>
      </div>
    </section>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold text-ink-200 mb-1">{label}</span>
      <input
        type="password"
        value={value}
        autoComplete={autoComplete}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-ink-600 border border-ink-500 focus:border-primary-500 rounded-xl px-3 py-2.5 text-sm text-ink-50 outline-none transition-colors"
      />
    </label>
  );
}

function VerificationPanel() {
  const profile = useAuth((s) => s.profile)!;
  const requestVerification = useAuth((s) => s.requestVerification);
  const confirmVerification = useAuth((s) => s.confirmVerification);
  const toast = useUI((s) => s.toast);
  const [channel, setChannel] = useState<'email' | 'phone' | null>(null);
  const [issued, setIssued] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const start = async (next: 'email' | 'phone') => {
    setError(null);
    setCode('');
    setChannel(next);
    const result = await requestVerification(next);
    setIssued(result.code);
  };

  const confirm = async () => {
    if (!channel) return;
    const res = await confirmVerification(channel, code);
    if (res.error) {
      setError(res.error);
      return;
    }
    toast('success', `${channel === 'email' ? 'Email' : 'Phone'} verified`);
    setChannel(null);
    setIssued('');
    setCode('');
  };

  return (
    <section className="mb-6">
      <SectionLabel>Verification</SectionLabel>
      <div className="px-4 space-y-2">
        <VerifyRow
          icon={<MailCheck className="w-4 h-4" />}
          label={profile.email}
          verified={!!profile.emailVerified}
          onVerify={() => start('email')}
        />
        <VerifyRow
          icon={<PhoneCall className="w-4 h-4" />}
          label={profile.phone}
          verified={!!profile.phoneVerified}
          onVerify={() => start('phone')}
        />

        {channel && (
          <div className="rounded-xl border border-ink-500 bg-ink-600 p-3 space-y-2 animate-fade-in">
            <InfoNote>
              Demo mode sends nothing — your code is <b className="font-mono">{issued}</b>.
            </InfoNote>
            <input
              inputMode="numeric"
              value={code}
              aria-label="Verification code"
              placeholder="6-digit code"
              onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
              className="w-full bg-ink-700 border border-ink-500 focus:border-primary-500 rounded-lg px-3 py-2.5 text-sm font-mono tracking-[0.3em] text-ink-50 outline-none transition-colors"
            />
            {error && <ErrorBox message={error} />}
            <div className="flex gap-2">
              <Button size="sm" className="flex-1" onClick={confirm} disabled={code.length !== 6}>
                Confirm
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setChannel(null);
                  setError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function VerifyRow({
  icon,
  label,
  verified,
  onVerify,
}: {
  icon: React.ReactNode;
  label: string;
  verified: boolean;
  onVerify: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-ink-500 bg-ink-600 px-3 py-3">
      <span className={clsx('shrink-0', verified ? 'text-success-500' : 'text-ink-300')}>{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold text-ink-50 truncate">{label}</span>
        <span className={clsx('block text-[11px]', verified ? 'text-success-500' : 'text-ink-300')}>
          {verified ? 'Verified' : 'Not verified'}
        </span>
      </span>
      {verified ? (
        <Check className="w-4 h-4 text-success-500 shrink-0" aria-hidden />
      ) : (
        <Button size="sm" variant="outline" onClick={onVerify}>
          Verify
        </Button>
      )}
    </div>
  );
}

function SessionsPanel() {
  const listSessions = useAuth((s) => s.listSessions);
  const revokeSession = useAuth((s) => s.revokeSession);
  const revokeOtherSessions = useAuth((s) => s.revokeOtherSessions);
  const toast = useUI((s) => s.toast);
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Array<DeviceSession & { current: boolean }>>([]);
  const [revision, setRevision] = useState(0);

  // Sessions come from the server rather than store state, so a counter drives re-fetches.
  useEffect(() => {
    let cancelled = false;
    listSessions().then((next) => {
      if (!cancelled) setSessions(next);
    });
    return () => {
      cancelled = true;
    };
  }, [listSessions, revision]);

  const revoke = async (id: string) => {
    setBusy(id);
    const res = await revokeSession(id);
    setBusy(null);
    if (res.signedOut) {
      toast('info', 'Signed out on this device');
      navigate('/auth');
      return;
    }
    toast('success', 'Session revoked');
    setRevision((n) => n + 1);
  };

  const revokeOthers = async () => {
    const removed = await revokeOtherSessions();
    toast(
      removed > 0 ? 'success' : 'info',
      removed > 0 ? `${removed} other session${removed === 1 ? '' : 's'} revoked` : 'No other active sessions'
    );
    setRevision((n) => n + 1);
  };

  return (
    <section>
      <SectionLabel>Active Sessions</SectionLabel>
      <div className="px-4 space-y-2">
        {sessions.map((session) => (
          <div key={session.id} className="flex items-center gap-3 rounded-xl border border-ink-500 bg-ink-600 px-3 py-3">
            <Monitor className={clsx('w-4 h-4 shrink-0', session.current ? 'text-primary-600' : 'text-ink-300')} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-ink-50 truncate">{session.device}</span>
                {session.current && (
                  <span className="shrink-0 text-[9px] font-extrabold uppercase rounded bg-primary-500/15 text-primary-700 px-1.5 py-0.5">
                    This device
                  </span>
                )}
              </div>
              <div className="text-[11px] text-ink-300">
                Signed in {dateTimeLabel(session.createdAt)} · expires {dateTimeLabel(session.exp)}
              </div>
            </div>
            <button
              onClick={() => revoke(session.id)}
              disabled={busy === session.id}
              aria-label={`Revoke session on ${session.device}`}
              className="shrink-0 text-[11px] font-bold text-error-600 hover:text-error-500 disabled:opacity-50 transition-colors"
            >
              {busy === session.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Revoke'}
            </button>
          </div>
        ))}

        <Button variant="outline" className="w-full" onClick={revokeOthers}>
          <LogOut className="w-4 h-4" /> Sign out other devices
        </Button>
        <p className="flex items-start gap-1.5 text-[11px] text-ink-300">
          <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-px" />
          Revoking a session takes effect the next time that device loads OddWave.
        </p>
      </div>
    </section>
  );
}
