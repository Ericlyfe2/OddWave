import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './index.css';
import { useAuth } from '@/store/auth';
import { useMatches } from '@/store/matches';
import { useBets } from '@/store/bets';
import { startWithdrawalNotificationPoller } from '@/store/wallet';
import { installBookingBridge } from '@/lib/bookingBridge';
import { installSlipOwnerSync } from '@/store/slip';
import { trpc, trpcClientConfig } from '@/lib/trpc';

const queryClient = new QueryClient();
const trpcClientInstance = trpc.createClient(trpcClientConfig());

async function boot() {
  await useAuth.getState().init();
  useMatches.getState().init();
  // Settle open bets the moment the live engine finishes a match.
  useMatches.getState().onFinish((matchId) => {
    void useBets.getState().settleOnMatchFinish(matchId).catch(() => undefined);
  });
  installBookingBridge();
  installSlipOwnerSync();
  startWithdrawalNotificationPoller();

  const root = createRoot(document.getElementById('root')!);
  root.render(
    <StrictMode>
      <trpc.Provider client={trpcClientInstance} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </trpc.Provider>
    </StrictMode>
  );

  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    });
  }
}

void boot();
