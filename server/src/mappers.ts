import type { User, RgLimits, NotificationPrefs, DeviceSession as DeviceSessionRow } from '@prisma/client';
import type { Profile, DeviceSession } from '../../src/lib/types';

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
