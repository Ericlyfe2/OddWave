import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Bell, HelpCircle, ChevronRight, LogOut, Smartphone, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/store/auth';
import { useUI } from '@/store/ui';
import { Button } from '@/components/ui';
import { PageTitle } from '@/components/pieces';

export function SettingsScreen() {
  const navigate = useNavigate();
  const profile = useAuth((s) => s.profile);
  const updateProfile = useAuth((s) => s.updateProfile);
  const signOut = useAuth((s) => s.signOut);
  const toast = useUI((s) => s.toast);

  if (!profile) return null;

  const prefs = profile.notifPrefs;

  const togglePref = async (key: keyof typeof prefs) => {
    await updateProfile({ notifPrefs: { ...prefs, [key]: !prefs[key] } });
  };

  return (
    <div className="pb-4">
      <PageTitle title="Settings" />
      <div className="px-4 space-y-4">
        <div className="rounded-xl border border-ink-500/40 bg-ink-600 overflow-hidden">
          <div className="px-3 py-2.5 border-b border-ink-500/40 flex items-center gap-1.5">
            <Bell className="w-4 h-4 text-primary-600" />
            <span className="text-xs font-bold text-ink-100 uppercase tracking-wide">Notification Preferences</span>
          </div>
          <ToggleRow label="Bet updates" desc="Settlements and cashout availability" checked={prefs.betUpdates} onChange={() => togglePref('betUpdates')} />
          <ToggleRow label="Live events" desc="Favorite events going live" checked={prefs.liveEvents} onChange={() => togglePref('liveEvents')} />
          <ToggleRow label="Promotions" desc="Bonuses and campaigns" checked={prefs.promotions} onChange={() => togglePref('promotions')} />
        </div>

        <button onClick={() => navigate('/responsible-gaming')} className="w-full rounded-xl border border-ink-500/40 bg-ink-600 px-3 py-3.5 flex items-center gap-3 hover:border-primary-500/50 transition-colors text-left">
          <ShieldCheck className="w-5 h-5 text-primary-600" />
          <span className="flex-1">
            <span className="block text-sm font-bold text-ink-50">Responsible Gaming</span>
            <span className="block text-[11px] text-ink-300">Limits, cooling-off, self-exclusion</span>
          </span>
          <ChevronRight className="w-4 h-4 text-ink-300" />
        </button>

        <button onClick={() => navigate('/help')} className="w-full rounded-xl border border-ink-500/40 bg-ink-600 px-3 py-3.5 flex items-center gap-3 hover:border-primary-500/50 transition-colors text-left">
          <HelpCircle className="w-5 h-5 text-primary-600" />
          <span className="flex-1">
            <span className="block text-sm font-bold text-ink-50">Help Center</span>
            <span className="block text-[11px] text-ink-300">FAQs and contact</span>
          </span>
          <ChevronRight className="w-4 h-4 text-ink-300" />
        </button>

        <button onClick={() => navigate('/account/security')} className="w-full rounded-xl border border-ink-500/40 bg-ink-600 px-3 py-3.5 flex items-center gap-3 hover:border-primary-500/50 transition-colors text-left">
          <Smartphone className="w-5 h-5 text-primary-600" />
          <span className="flex-1">
            <span className="block text-sm font-bold text-ink-50">Security & Sessions</span>
            <span className="block text-[11px] text-ink-300">Password, verification, signed-in devices</span>
          </span>
          <ChevronRight className="w-4 h-4 text-ink-300" />
        </button>

        <Button
          variant="danger"
          size="lg"
          className="w-full"
          onClick={async () => {
            await signOut();
            toast('info', 'Signed out');
            navigate('/');
          }}
        >
          <LogOut className="w-4 h-4" /> Sign Out
        </Button>
      </div>
    </div>
  );
}

export function ToggleRow({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: () => void }) {
  return (
    <button onClick={onChange} role="switch" aria-checked={checked} className="w-full flex items-center gap-3 px-3 py-3 border-b border-ink-500/30 last:border-b-0 text-left">
      <span className="flex-1">
        <span className="block text-sm font-semibold text-ink-50">{label}</span>
        <span className="block text-[11px] text-ink-300">{desc}</span>
      </span>
      <span className={clsx('w-10 h-[22px] rounded-full relative transition-colors shrink-0', checked ? 'bg-primary-500' : 'bg-ink-400')}>
        <span className={clsx('absolute top-[3px] w-4 h-4 bg-white rounded-full transition-all', checked ? 'left-[22px]' : 'left-[3px]')} />
      </span>
    </button>
  );
}
