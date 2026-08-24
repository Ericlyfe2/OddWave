import { useNavigate } from 'react-router-dom';
import { Compass, Radio, Ticket, Megaphone } from 'lucide-react';
import { useDocumentMeta } from '@/lib/seo';
import { Button } from '@/components/ui';

const links = [
  { to: '/sports', label: 'Browse Sports', icon: Compass },
  { to: '/live', label: 'Live Betting', icon: Radio },
  { to: '/promotions', label: 'Promotions', icon: Megaphone },
  { to: '/bets', label: 'My Bets', icon: Ticket },
];

export function NotFoundScreen() {
  const navigate = useNavigate();
  useDocumentMeta('Page not found', 'The page you were looking for doesn’t exist. Browse sports, live betting, and promotions on OddWave instead.');

  return (
    <div className="flex flex-col items-center px-6 pt-16 pb-10 text-center">
      <span className="text-6xl font-extrabold text-ink-500 tnum">404</span>
      <h1 className="text-lg font-extrabold text-ink-50 mt-3">Page not found</h1>
      <p className="text-sm text-ink-300 mt-1.5 max-w-xs">
        That link is broken or the page has moved. Here's where you probably meant to go.
      </p>

      <Button className="mt-6 w-full max-w-xs" onClick={() => navigate('/')}>
        Back to Home
      </Button>

      <div className="grid grid-cols-2 gap-2 mt-6 w-full max-w-xs">
        {links.map(({ to, label, icon: Icon }) => (
          <button
            key={to}
            onClick={() => navigate(to)}
            className="flex flex-col items-center gap-1.5 bg-ink-600 hover:bg-ink-500/70 rounded-xl py-4 text-xs font-bold text-ink-100 transition-colors"
          >
            <Icon className="w-4 h-4 text-primary-600" />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
