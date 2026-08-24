import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Wallet, Compass } from 'lucide-react';
import { useAuth } from '@/store/auth';
import { useDocumentMeta } from '@/lib/seo';
import { Button } from '@/components/ui';

/** Shown right after a successful sign-up — the first thing a new player
 *  sees, so it's the natural place to point them at their next concrete
 *  step (fund the account) rather than dropping them back on the homepage. */
export function ThankYouScreen() {
  const navigate = useNavigate();
  const profile = useAuth((s) => s.profile);
  useDocumentMeta('Welcome to OddWave');

  return (
    <div className="flex flex-col items-center px-6 pt-16 pb-10 text-center">
      <CheckCircle2 className="w-14 h-14 text-success-500" />
      <h1 className="text-lg font-extrabold text-ink-50 mt-3">
        {profile ? `You're in, ${profile.fullName.split(' ')[0]}!` : "You're in!"}
      </h1>
      <p className="text-sm text-ink-300 mt-1.5 max-w-xs">
        Your account is ready. Add funds to place your first bet, or have a look around first.
      </p>

      <Button className="mt-6 w-full max-w-xs flex items-center justify-center gap-2" onClick={() => navigate('/account/deposit')}>
        <Wallet className="w-4 h-4" /> Make Your First Deposit
      </Button>
      <button
        onClick={() => navigate('/')}
        className="mt-3 flex items-center justify-center gap-1.5 text-xs font-bold text-ink-200 hover:text-ink-50 transition-colors"
      >
        <Compass className="w-3.5 h-3.5" /> Explore matches instead
      </button>
    </div>
  );
}
