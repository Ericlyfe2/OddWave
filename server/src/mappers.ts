import type { User, RgLimits, NotificationPrefs, DeviceSession as DeviceSessionRow, Txn as TxnRow, Bet as BetRow } from '@prisma/client';
import type { Profile, DeviceSession, Txn, Bet, BetLeg } from '../../src/lib/types';

export function mapProfile(user: User, rgLimits: RgLimits | null, notifPrefs: NotificationPrefs | null): Profile {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    fullName: user.fullName,
    role: user.role,
    createdAt: user.createdAt.getTime(),
    bonusBalance: Number(user.bonusBalance),
    suspended: user.suspended,
    claimedPromos: user.claimedPromos,
    emailVerified: user.emailVerified,
    phoneVerified: user.phoneVerified,
    rgLimits: {
      depositLimit: rgLimits?.depositLimit != null ? Number(rgLimits.depositLimit) : null,
      lossLimit: rgLimits?.lossLimit != null ? Number(rgLimits.lossLimit) : null,
      sessionReminderMin: rgLimits?.sessionReminderMin ?? null,
      selfExcludedUntil: rgLimits?.selfExcludedUntil ? rgLimits.selfExcludedUntil.getTime() : null,
    },
    notifPrefs: {
      betUpdates: notifPrefs?.betUpdates ?? true,
      promotions: notifPrefs?.promotions ?? true,
      liveEvents: notifPrefs?.liveEvents ?? true,
    },
  };
}

export function mapDeviceSession(row: DeviceSessionRow): DeviceSession {
  return {
    id: row.id,
    userId: row.userId,
    device: row.device,
    createdAt: row.createdAt.getTime(),
    lastSeenAt: row.lastSeenAt.getTime(),
    exp: row.exp.getTime(),
  };
}

export function mapTxn(row: TxnRow): Txn {
  return {
    id: row.id,
    userId: row.userId,
    type: row.type as Txn['type'],
    amount: Number(row.amount),
    status: row.status as Txn['status'],
    ref: row.ref,
    meta: (row.meta as Record<string, unknown>) ?? undefined,
    createdAt: row.createdAt.getTime(),
    resolvedAt: row.resolvedAt?.getTime(),
  };
}

export function mapBet(row: BetRow): Bet {
  return {
    id: row.id,
    userId: row.userId,
    bookingCode: row.bookingCode,
    type: row.type as Bet['type'],
    stake: Number(row.stake),
    totalOdds: Number(row.totalOdds),
    potential: Number(row.potential),
    comboCount: row.comboCount ?? undefined,
    systemConfig: (row.systemConfig as unknown as Bet['systemConfig']) ?? undefined,
    legs: row.legs as unknown as BetLeg[],
    status: row.status as Bet['status'],
    payout: row.payout != null ? Number(row.payout) : undefined,
    cashoutAmount: row.cashoutAmount != null ? Number(row.cashoutAmount) : undefined,
    cashoutHistory: (row.cashoutHistory as Bet['cashoutHistory']) ?? undefined,
    usedBonus: Number(row.usedBonus),
    placedAt: row.placedAt.getTime(),
    settledAt: row.settledAt?.getTime(),
  };
}
