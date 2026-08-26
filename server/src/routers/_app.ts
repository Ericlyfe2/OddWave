import { publicProcedure, router } from '../trpc';
import { authRouter } from './auth';
import { adminRouter } from './admin';
import { walletRouter } from './wallet';

export const appRouter = router({
  health: publicProcedure.query(() => ({ ok: true as const })),
  auth: authRouter,
  admin: adminRouter,
  wallet: walletRouter,
});

export type AppRouter = typeof appRouter;
