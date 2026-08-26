import { create } from 'zustand';
import type { Txn } from '@/lib/types';
import { round2 } from '@/lib/format';
import { trpcClient } from '@/lib/trpc';

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
