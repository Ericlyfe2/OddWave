import { create } from 'zustand';
import type { Txn, TxnType } from '@/lib/types';
import { loadJson, saveJson } from '@/lib/storage';
import { uid } from '@/lib/rng';
import { money, round2 } from '@/lib/format';
import { logger } from '@/lib/logger';
import { WITHDRAWAL_AUTO_APPROVE_MS } from '@/lib/config';
import { useNotifs } from '@/store/notifs';
import { trpcClient } from '@/lib/trpc';
import type { NotificationPrefs } from '@/lib/types';

interface WalletState {
  txns: Record<string, Txn[]>;
  deposit: (userId: string, amount: number, provider: string, notifPrefs: NotificationPrefs | null) => Txn;
  requestWithdrawal: (userId: string, amount: number, momoNumber: string) => { txn?: Txn; error?: string };
  applyStake: (userId: string, amount: number, ref: string, bonusUsed: number) => void;
  credit: (userId: string, amount: number, type: TxnType, ref: string) => Txn;
  refundStake: (userId: string, betId: string, amount: number, bonusUsed: number) => void;
  resolveWithdrawal: (userId: string, txnId: string, approve: boolean) => void;
  adminAdjust: (userId: string, amount: number, reason: string) => void;
  userTxns: (userId: string) => Txn[];
  balanceOf: (userId: string) => number;
  lockedOf: (userId: string) => number;
  pendingWithdrawals: () => Array<Txn & { userId: string }>;
}


export const useWallet = create<WalletState>((set, get) => {
  const persist = (txns: Record<string, Txn[]>) => saveJson('wallet_txns', txns);

  const push = (userId: string, txn: Txn): void => {
    const txns = { ...get().txns };
    txns[userId] = [txn, ...(txns[userId] || [])];
    set({ txns });
    persist(txns);
    logger.info('wallet.txn', { userId, type: txn.type, amount: txn.amount, status: txn.status, ref: txn.ref });
  };

  const replace = (userId: string, txnId: string, patch: Partial<Txn>): void => {
    const txns = { ...get().txns };
    txns[userId] = (txns[userId] || []).map((t) => (t.id === txnId ? { ...t, ...patch } : t));
    set({ txns });
    persist(txns);
  };

  return {
    txns: loadJson<Record<string, Txn[]>>('wallet_txns', {}),

    deposit: (userId, amount, provider, notifPrefs) => {
      const txn: Txn = {
        id: uid('t-'),
        userId,
        type: 'deposit',
        amount: round2(amount),
        status: 'success',
        ref: `${provider.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`,
        createdAt: Date.now(),
      };
      push(userId, txn);
      useNotifs.getState().push(
        { userId, kind: 'deposit', title: 'Deposit successful', body: `${money(txn.amount)} added to your wallet · Ref ${txn.ref}` },
        notifPrefs
      );
      return txn;
    },

    requestWithdrawal: (userId, amount, momoNumber) => {
      if (!momoNumber.trim()) return { error: 'Enter your MoMo number' };
      const available = get().balanceOf(userId) - get().lockedOf(userId);
      if (round2(amount) > available) return { error: 'Insufficient available balance' };
      const txn: Txn = {
        id: uid('t-'),
        userId,
        type: 'withdrawal',
        amount: -round2(amount),
        status: 'pending',
        ref: `WD-${Date.now().toString(36).toUpperCase()}`,
        meta: { momo: momoNumber },
        createdAt: Date.now(),
      };
      push(userId, txn);
      return { txn };
    },

    applyStake: (userId, amount, ref, bonusUsed) => {
      const cashPart = round2(amount - bonusUsed);
      if (bonusUsed > 0) {
        push(userId, {
          id: uid('t-'),
          userId,
          type: 'stake',
          amount: -cashPart,
          status: 'success',
          ref,
          meta: { bonusUsed },
          createdAt: Date.now(),
        });
        return;
      }
      push(userId, {
        id: uid('t-'),
        userId,
        type: 'stake',
        amount: -cashPart,
        status: 'success',
        ref,
        createdAt: Date.now(),
      });
    },

    credit: (userId, amount, type, ref) => {
      const txn: Txn = {
        id: uid('t-'),
        userId,
        type,
        amount: round2(amount),
        status: 'success',
        ref,
        createdAt: Date.now(),
        resolvedAt: Date.now(),
      };
      push(userId, txn);
      return txn;
    },

    refundStake: (userId, betId, amount, bonusUsed) => {
      push(userId, {
        id: uid('t-'),
        userId,
        type: 'refund',
        amount: round2(amount - bonusUsed),
        status: 'success',
        ref: `REFUND-${betId.slice(-6).toUpperCase()}`,
        meta: { bonusUsed },
        createdAt: Date.now(),
        resolvedAt: Date.now(),
      });
    },

    resolveWithdrawal: (userId, txnId, approve) => {
      replace(userId, txnId, approve ? { status: 'success', resolvedAt: Date.now() } : { status: 'failed', resolvedAt: Date.now() });
      if (!approve) {
        const txn = (get().txns[userId] || []).find((t) => t.id === txnId);
        if (txn) {
          push(userId, {
            id: uid('t-'),
            userId,
            type: 'refund',
            amount: Math.abs(txn.amount),
            status: 'success',
            ref: `REFUND-${txn.ref}`,
            meta: { reason: 'Withdrawal rejected' },
            createdAt: Date.now(),
            resolvedAt: Date.now(),
          });
        }
      }
    },

    adminAdjust: (userId, amount, reason) => {
      push(userId, {
        id: uid('t-'),
        userId,
        type: 'adjustment',
        amount: round2(amount),
        status: 'success',
        ref: `ADJ-${reason}`,
        createdAt: Date.now(),
        resolvedAt: Date.now(),
      });
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
  };
});

let approverStarted = false;

export function startWithdrawalAutoApprover(): void {
  if (approverStarted || typeof window === 'undefined') return;
  approverStarted = true;
  const sweep = async () => {
    const state = useWallet.getState();
    const now = Date.now();
    for (const txn of state.pendingWithdrawals()) {
      if (now - txn.createdAt >= WITHDRAWAL_AUTO_APPROVE_MS) {
        state.resolveWithdrawal(txn.userId, txn.id, true);
        // protectedProcedure rejects (rather than returning null) when
        // nobody is signed in or the session was revoked — this sweep must
        // keep processing the rest of the queue either way, and notifs.push
        // already treats a null prefs argument as "deliver" (see notifs.ts).
        const notifPrefs = await trpcClient.auth.notifPrefsFor.query({ userId: txn.userId }).catch(() => null);
        useNotifs.getState().push(
          { userId: txn.userId, kind: 'withdrawal', title: 'Withdrawal approved', body: `${money(Math.abs(txn.amount))} sent via mobile money · Ref ${txn.ref}` },
          notifPrefs
        );
      }
    }
  };
  setInterval(sweep, 15_000);
  setTimeout(sweep, WITHDRAWAL_AUTO_APPROVE_MS);
}
