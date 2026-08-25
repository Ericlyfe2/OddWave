// server/prisma/seed.ts
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const db = new PrismaClient();

async function upsertDemo(
  id: string,
  email: string,
  password: string,
  fullName: string,
  phone: string,
  role: 'user' | 'admin',
  bonusBalance: number,
  claimedPromos: string[]
) {
  const passwordHash = await argon2.hash(password);
  const user = await db.user.upsert({
    where: { email },
    // Demo accounts are one shared row reused across every dev session and
    // e2e run — reseeding is the documented way tests reset state that has
    // no dedicated reset endpoint (e.g. emailVerified/phoneVerified, a
    // password left rotated, or notification prefs left toggled off). An
    // empty `update` silently defeated that: reseeding a pre-existing row
    // did nothing at all.
    update: { passwordHash, fullName, phone, role, bonusBalance, claimedPromos, emailVerified: false, phoneVerified: false },
    create: {
      id,
      email,
      passwordHash,
      phone,
      fullName,
      role,
      bonusBalance,
      claimedPromos,
    },
  });
  // Same reasoning as above, for the two rows the create branch above no
  // longer nests: upsert so a reseed resets these back to defaults too,
  // not just the first time the account is created.
  await db.rgLimits.upsert({
    where: { userId: user.id },
    update: { depositLimit: null, lossLimit: null, sessionReminderMin: null, selfExcludedUntil: null },
    create: { userId: user.id },
  });
  await db.notificationPrefs.upsert({
    where: { userId: user.id },
    update: { betUpdates: true, promotions: true, liveEvents: true },
    create: { userId: user.id },
  });
}

async function main() {
  await upsertDemo('u-admin', 'admin@oddwave.demo', 'Admin123!', 'Control Room Admin', '+233200000001', 'admin', 0, []);
  await upsertDemo('u-fan', 'fan@oddwave.demo', 'Fan12345', 'Kwame Fan', '+233244567890', 'user', 25, ['welcome']);
  console.log('Seeded demo accounts: admin@oddwave.demo, fan@oddwave.demo');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
