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
  await db.user.upsert({
    where: { email },
    update: {},
    create: {
      id,
      email,
      passwordHash,
      phone,
      fullName,
      role,
      bonusBalance,
      claimedPromos,
      rgLimits: { create: {} },
      notifPrefs: { create: {} },
    },
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
