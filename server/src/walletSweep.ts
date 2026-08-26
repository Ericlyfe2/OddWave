import type { Context } from './context';

// Local to the server on purpose — same reasoning as SESSION_DAYS in
// server/src/routers/auth.ts: the frontend's copy lives in a Vite-only
// module the server can't import under plain tsx.
const WITHDRAWAL_AUTO_APPROVE_MS = 120_000;

export async function sweepWithdrawals(db: Context['db']): Promise<number> {
  const cutoff = new Date(Date.now() - WITHDRAWAL_AUTO_APPROVE_MS);
  const pending = await db.txn.findMany({
    where: { type: 'withdrawal', status: 'pending', createdAt: { lte: cutoff } },
  });
  for (const txn of pending) {
    await db.txn.update({ where: { id: txn.id }, data: { status: 'success', resolvedAt: new Date() } });
  }
  return pending.length;
}
