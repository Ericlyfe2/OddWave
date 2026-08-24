import { initTRPC, TRPCError } from '@trpc/server';
import type { Context } from './context';

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.session.userId || !ctx.session.sessionId) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not signed in' });
  }
  // The session cookie is a self-contained, signed blob valid for its own
  // lifetime (30 days) independent of anything in the database — revoking a
  // device only deletes its DeviceSession row, so that row's continued
  // existence (and non-expiry) is what actually makes a cookie honor-worthy
  // request-to-request, not just the cookie decrypting successfully.
  const [user, deviceSession] = await Promise.all([
    ctx.db.user.findUnique({ where: { id: ctx.session.userId } }),
    ctx.db.deviceSession.findUnique({ where: { id: ctx.session.sessionId } }),
  ]);
  if (!user || user.suspended || !deviceSession || deviceSession.exp < new Date()) {
    ctx.session.destroy();
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Session no longer valid' });
  }
  return next({ ctx: { ...ctx, currentUser: user } });
});

export const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (ctx.currentUser.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
  }
  return next({ ctx });
});
