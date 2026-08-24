import { publicProcedure, router } from '../trpc';
import { authRouter } from './auth';

export const appRouter = router({
  health: publicProcedure.query(() => ({ ok: true as const })),
  auth: authRouter,
});

export type AppRouter = typeof appRouter;
