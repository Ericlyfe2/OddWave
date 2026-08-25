import { initTRPC, TRPCError } from '@trpc/server';
import type { Context } from './context';
import { validateSession } from './session';

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  const user = await validateSession(ctx.db, ctx.session);
  if (!user) {
    ctx.session.destroy();
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not signed in, or session no longer valid' });
  }
  return next({ ctx: { ...ctx, currentUser: user } });
});

export const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (ctx.currentUser.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
  }
  return next({ ctx });
});
