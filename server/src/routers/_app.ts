import { publicProcedure, router } from '../trpc';
import { authRouter } from './auth';
import { adminRouter } from './admin';
import { walletRouter } from './wallet';
import { betsRouter } from './bets';

export const appRouter = router({
  health: publicProcedure.query(() => ({ ok: true as const })),
  auth: authRouter,
  admin: adminRouter,
  wallet: walletRouter,
  bets: betsRouter,
});

export type AppRouter = typeof appRouter;
