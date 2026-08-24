import { z } from 'zod';
import * as argon2 from 'argon2';
import { publicProcedure, protectedProcedure, router } from '../trpc';
import { mapProfile, mapDeviceSession } from '../mappers';

// Local to the server on purpose: the frontend's src/lib/config.ts reads
// import.meta.env at module scope, which only exists under Vite/Vitest —
// importing it here crashes the server the moment it's run via plain tsx
// (i.e. `npm run dev --workspace=server`, outside any bundler transform).
const SESSION_DAYS = 7;

const SESSION_MS = SESSION_DAYS * 86400000;

async function loadProfile(db: import('../context').Context['db'], userId: string) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return null;
  const [rgLimits, notifPrefs] = await Promise.all([
    db.rgLimits.findUnique({ where: { userId } }),
    db.notificationPrefs.findUnique({ where: { userId } }),
  ]);
  return mapProfile(user, rgLimits, notifPrefs);
}

async function openDeviceSession(
  db: import('../context').Context['db'],
  session: import('../session').SessionData,
  userId: string,
  userAgent: string | undefined
) {
  const device = describeDevice(userAgent);
  const row = await db.deviceSession.create({
    data: { userId, device, exp: new Date(Date.now() + SESSION_MS) },
  });
  session.userId = userId;
  session.sessionId = row.id;
  await (session as unknown as { save: () => Promise<void> }).save();
  return mapDeviceSession(row);
}

/** Best-effort device label from the real request header — never invented. */
function describeDevice(ua: string | undefined): string {
  if (!ua) return 'Unknown device';
  const os = /Windows NT/.test(ua) ? 'Windows'
    : /Android/.test(ua) ? 'Android'
    : /iPhone|iPad|iPod/.test(ua) ? 'iOS'
    : /Mac OS X/.test(ua) ? 'macOS'
    : /Linux/.test(ua) ? 'Linux' : 'Unknown OS';
  const browser = /Edg\//.test(ua) ? 'Edge'
    : /OPR\//.test(ua) ? 'Opera'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return `${browser} on ${os}`;
}

export const authRouter = router({
  signUp: publicProcedure
    .input(z.object({ email: z.string(), password: z.string(), phone: z.string(), fullName: z.string() }))
    .mutation(async ({ ctx, input, }) => {
      const cleanEmail = input.email.trim().toLowerCase();
      const phone = input.phone.trim();
      const fullName = input.fullName.trim();
      if (!cleanEmail || !input.password || !phone || !fullName) {
        return { error: 'Please fill in all fields' };
      }
      if (input.password.length < 6) return { error: 'Password must be at least 6 characters' };
      if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) return { error: 'Enter a valid email address' };

      const existing = await ctx.db.user.findUnique({ where: { email: cleanEmail } });
      if (existing) return { error: 'An account with this email already exists' };

      const passwordHash = await argon2.hash(input.password);
      const user = await ctx.db.user.create({
        data: {
          email: cleanEmail,
          passwordHash,
          phone,
          fullName,
          rgLimits: { create: {} },
          notifPrefs: { create: {} },
        },
      });
      const rgLimits = await ctx.db.rgLimits.findUnique({ where: { userId: user.id } });
      const notifPrefs = await ctx.db.notificationPrefs.findUnique({ where: { userId: user.id } });

      await openDeviceSession(ctx.db, ctx.session, user.id, ctx.req.headers['user-agent']);
      return { profile: mapProfile(user, rgLimits, notifPrefs) };
    }),

  signIn: publicProcedure
    .input(z.object({ email: z.string(), password: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const cleanEmail = input.email.trim().toLowerCase();
      const user = await ctx.db.user.findUnique({ where: { email: cleanEmail } });
      if (!user) return { error: 'No account found with this email' };

      const valid = await argon2.verify(user.passwordHash, input.password).catch(() => false);
      if (!valid) return { error: 'Incorrect email or password' };

      const rgLimits = await ctx.db.rgLimits.findUnique({ where: { userId: user.id } });
      if (rgLimits?.selfExcludedUntil && rgLimits.selfExcludedUntil > new Date()) {
        return { error: 'Account is under self-exclusion until further notice' };
      }
      const notifPrefs = await ctx.db.notificationPrefs.findUnique({ where: { userId: user.id } });

      await openDeviceSession(ctx.db, ctx.session, user.id, ctx.req.headers['user-agent']);
      return { profile: mapProfile(user, rgLimits, notifPrefs) };
    }),

  signOut: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.session.sessionId) {
      await ctx.db.deviceSession.delete({ where: { id: ctx.session.sessionId } }).catch(() => undefined);
    }
    ctx.session.destroy();
  }),

  me: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.session.userId || !ctx.session.sessionId) return null;
    // Same reasoning as protectedProcedure: the cookie alone isn't proof of a
    // live session — a revoked-from-another-device session still decrypts
    // fine until its own 30-day cookie lifetime runs out, but its
    // DeviceSession row is gone the moment it's revoked.
    const deviceSession = await ctx.db.deviceSession.findUnique({ where: { id: ctx.session.sessionId } });
    if (!deviceSession || deviceSession.exp < new Date()) {
      ctx.session.destroy();
      return null;
    }
    return loadProfile(ctx.db, ctx.session.userId);
  }),

  updateProfile: protectedProcedure
    .input(
      z.object({
        fullName: z.string().min(1).optional(),
        phone: z.string().min(1).optional(),
        notifPrefs: z.object({ betUpdates: z.boolean(), promotions: z.boolean(), liveEvents: z.boolean() }).optional(),
        bonusBalance: z.number().optional(),
        claimedPromos: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.update({
        where: { id: ctx.currentUser.id },
        data: {
          fullName: input.fullName,
          phone: input.phone,
          bonusBalance: input.bonusBalance,
          claimedPromos: input.claimedPromos,
        },
      });
      if (input.notifPrefs) {
        await ctx.db.notificationPrefs.update({ where: { userId: user.id }, data: input.notifPrefs });
      }
      return loadProfile(ctx.db, user.id);
    }),

  changePassword: protectedProcedure
    .input(z.object({ currentPassword: z.string(), newPassword: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const valid = await argon2.verify(ctx.currentUser.passwordHash, input.currentPassword).catch(() => false);
      if (!valid) return { error: 'Current password is incorrect' };
      if (input.newPassword.length < 6) return { error: 'New password must be at least 6 characters' };
      if (input.newPassword === input.currentPassword) return { error: 'New password must be different' };

      const passwordHash = await argon2.hash(input.newPassword);
      await ctx.db.user.update({ where: { id: ctx.currentUser.id }, data: { passwordHash } });
      return {};
    }),

  listSessions: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.deviceSession.findMany({
      where: { userId: ctx.currentUser.id, exp: { gt: new Date() } },
      orderBy: { lastSeenAt: 'desc' },
    });
    return rows.map((row) => ({ ...mapDeviceSession(row), current: row.id === ctx.session.sessionId }));
  }),

  revokeSession: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.deviceSession
        .delete({ where: { id: input.sessionId, userId: ctx.currentUser.id } })
        .catch(() => undefined);
      if (ctx.session.sessionId === input.sessionId) {
        ctx.session.destroy();
        return { signedOut: true };
      }
      return { signedOut: false };
    }),

  revokeOtherSessions: protectedProcedure.mutation(async ({ ctx }) => {
    const { count } = await ctx.db.deviceSession.deleteMany({
      where: { userId: ctx.currentUser.id, id: { not: ctx.session.sessionId } },
    });
    return count;
  }),

  requestPasswordReset: publicProcedure
    .input(z.object({ email: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const cleanEmail = input.email.trim().toLowerCase();
      const user = await ctx.db.user.findUnique({ where: { email: cleanEmail } });
      if (!user) return { ok: false, error: 'No account found with this email' };
      const code = String(Math.floor(100000 + Math.random() * 900000));
      await ctx.db.verificationCode.create({ data: { userId: user.id, purpose: 'reset', code } });
      return { ok: true, resetCode: code };
    }),

  resetPassword: publicProcedure
    .input(z.object({ email: z.string(), code: z.string(), newPassword: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const cleanEmail = input.email.trim().toLowerCase();
      const user = await ctx.db.user.findUnique({ where: { email: cleanEmail } });
      if (!user) return { error: 'No account found with this email' };

      const stored = await ctx.db.verificationCode.findFirst({
        where: { userId: user.id, purpose: 'reset' },
        orderBy: { createdAt: 'desc' },
      });
      if (!stored || stored.code !== input.code.trim()) return { error: 'Invalid reset code' };
      if (Date.now() - stored.createdAt.getTime() > 15 * 60_000) return { error: 'Reset code expired, request a new one' };
      if (input.newPassword.length < 6) return { error: 'Password must be at least 6 characters' };

      const passwordHash = await argon2.hash(input.newPassword);
      await ctx.db.user.update({ where: { id: user.id }, data: { passwordHash } });
      await ctx.db.verificationCode.delete({ where: { id: stored.id } });
      return {};
    }),

  requestVerification: protectedProcedure
    .input(z.object({ channel: z.enum(['email', 'phone']) }))
    .mutation(async ({ ctx, input }) => {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      await ctx.db.verificationCode.create({
        data: { userId: ctx.currentUser.id, purpose: `verify_${input.channel}`, code },
      });
      return { code };
    }),

  confirmVerification: protectedProcedure
    .input(z.object({ channel: z.enum(['email', 'phone']), code: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const stored = await ctx.db.verificationCode.findFirst({
        where: { userId: ctx.currentUser.id, purpose: `verify_${input.channel}` },
        orderBy: { createdAt: 'desc' },
      });
      if (!stored || stored.code !== input.code.trim()) return { error: 'Invalid verification code' };
      if (Date.now() - stored.createdAt.getTime() > 15 * 60_000) return { error: 'Code expired, request a new one' };

      await ctx.db.user.update({
        where: { id: ctx.currentUser.id },
        data: input.channel === 'email' ? { emailVerified: true } : { phoneVerified: true },
      });
      await ctx.db.verificationCode.delete({ where: { id: stored.id } });
      return {};
    }),

  notifPrefsFor: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      const prefs = await ctx.db.notificationPrefs.findUnique({ where: { userId: input.userId } });
      if (!prefs) return null;
      return { betUpdates: prefs.betUpdates, promotions: prefs.promotions, liveEvents: prefs.liveEvents };
    }),
});

export { loadProfile };
