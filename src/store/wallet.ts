import { create } from 'zustand';
import type { Txn } from '@/lib/types';
import { money, round2 } from '@/lib/format';
import { trpcClient } from '@/lib/trpc';
import { useAuth } from '@/store/auth';
import { useNotifs } from '@/store/notifs';

interface WalletState {
  txns: Record<string, Txn[]>;
  hydrate: (userId: string) => Promise<void>;
  clear: () => void;
  deposit: (userId: string, amount: number, provider: string) => Promise<Txn>;
  requestWithdrawal: (userId: string, amount: number, momoNumber: string) => Promise<{ txn?: Txn; error?: string }>;
  userTxns: (userId: string) => Txn[];
  balanceOf: (userId: string) => number;
  lockedOf: (userId: string) => number;
  pendingWithdrawals: () => Array<Txn & { userId: string }>;
}

export const useWallet = create<WalletState>((set, get) => ({
  txns: {},

  hydrate: async (userId) => {
    const list = await trpcClient.wallet.listTxns.query();
    set({ txns: { ...get().txns, [userId]: list } });
  },

  clear: () => set({ txns: {} }),

  deposit: async (userId, amount, provider) => {
    const txn = await trpcClient.wallet.deposit.mutate({ amount, provider });
    set({ txns: { ...get().txns, [userId]: [txn, ...(get().txns[userId] || [])] } });
    const notifPrefs = useAuth.getState().profile?.notifPrefs ?? null;
    useNotifs.getState().push(
      { userId, kind: 'deposit', title: 'Deposit successful', body: `${money(txn.amount)} added to your wallet · Ref ${txn.ref}` },
      notifPrefs
    );
    return txn;
  },

  requestWithdrawal: async (userId, amount, momoNumber) => {
    const result = await trpcClient.wallet.requestWithdrawal.mutate({ amount, momoNumber });
    if ('error' in result) return result;
    set({ txns: { ...get().txns, [userId]: [result.txn, ...(get().txns[userId] || [])] } });
    return result;
  },

  userTxns: (userId) => get().txns[userId] || [],

  balanceOf: (userId) =>
    round2((get().txns[userId] || []).filter((t) => t.status === 'success').reduce((sum, t) => sum + t.amount, 0)),

  lockedOf: (userId) =>
    round2(
      (get().txns[userId] || [])
        .filter((t) => t.type === 'withdrawal' && t.status === 'pending')
        .reduce((sum, t) => sum + Math.abs(t.amount), 0)
    ),

  pendingWithdrawals: () =>
    Object.entries(get().txns).flatMap(([userId, list]) =>
      list.filter((t) => t.type === 'withdrawal' && t.status === 'pending').map((t) => ({ ...t, userId }))
    ),
}));

let pollerStarted = false;

/**
 * The withdrawal auto-approve sweep now runs server-side (`server/src/index.ts`,
 * every 15s — see `server/src/walletSweep.ts`) and only updates the `Txn` row;
 * there's no server-to-client push in this architecture, so the client has no
 * other way to learn a pending withdrawal just resolved. This polls the same
 * cadence, hydrates the signed-in user's ledger, and diffs the previous
 * `pending` withdrawals against the freshly-fetched list to notify on any
 * transition to `success`/`failed`.
 */
export function startWithdrawalNotificationPoller(): void {
  if (pollerStarted || typeof window === 'undefined') return;
  pollerStarted = true;

  const tick = async () => {
    const userId = useAuth.getState().profile?.id;
    if (!userId) return;
    const before = useWallet.getState().txns[userId] || [];
    await useWallet.getState().hydrate(userId);
    const after = useWallet.getState().txns[userId] || [];
    const notifPrefs = useAuth.getState().profile?.notifPrefs ?? null;

    for (const txn of after) {
      if (txn.type !== 'withdrawal') continue;
      const prior = before.find((t) => t.id === txn.id);
      if (!prior || prior.status !== 'pending' || txn.status === prior.status) continue;

      if (txn.status === 'success') {
        useNotifs.getState().push(
          {
            userId,
            kind: 'withdrawal',
            title: 'Withdrawal approved',
            body: `${money(Math.abs(txn.amount))} sent via mobile money · Ref ${txn.ref}`,
          },
          notifPrefs
        );
      } else if (txn.status === 'failed') {
        useNotifs.getState().push(
          {
            userId,
            kind: 'withdrawal',
            title: 'Withdrawal failed',
            body: `${money(Math.abs(txn.amount))} could not be completed and was refunded · Ref ${txn.ref}`,
          },
          notifPrefs
        );
      }
    }
  };

  setInterval(() => {
    tick().catch((e) => console.error('[wallet] withdrawal notification poll failed', e));
  }, 15_000);
}
