import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { useAuth } from '@/store/auth';
import { useMatches } from '@/store/matches';
import { useBets } from '@/store/bets';
import { startWithdrawalAutoApprover } from '@/store/wallet';
import { installBookingBridge } from '@/lib/bookingBridge';
import { installSlipOwnerSync } from '@/store/slip';

async function boot() {
  await useAuth.getState().init();
  useMatches.getState().init();
  // Settle open bets the moment the live engine finishes a match.
  useMatches.getState().onFinish((matchId) => useBets.getState().settleOnMatchFinish(matchId));
  startWithdrawalAutoApprover();
  installBookingBridge();
  installSlipOwnerSync();

  const root = createRoot(document.getElementById('root')!);
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  );

  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    });
  }
}

void boot();
