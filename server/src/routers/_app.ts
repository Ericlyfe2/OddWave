import { publicProcedure, router } from '../trpc';
import { authRouter } from './auth';
import { adminRouter } from './admin';

export const appRouter = router({
  health: publicProcedure.query(() => ({ ok: true as const })),
  auth: authRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
