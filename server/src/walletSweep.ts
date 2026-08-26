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
  let approved = 0;
  for (const txn of pending) {
    const didApprove = await db.$transaction(async (tx) => {
      const lockedRows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Txn" WHERE "id" = ${txn.id} FOR UPDATE
      `;
      if (lockedRows.length === 0) return false;
      const fresh = await tx.txn.findUnique({ where: { id: txn.id } });
      if (!fresh || fresh.status !== 'pending') return false;
      await tx.txn.update({ where: { id: txn.id }, data: { status: 'success', resolvedAt: new Date() } });
      return true;
    });
    if (didApprove) approved += 1;
  }
  return approved;
}
