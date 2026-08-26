import 'dotenv/config';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { appRouter } from './routers/_app';
import { createContext } from './context';
import { db } from './db';
import { sweepWithdrawals } from './walletSweep';

const server = createHTTPServer({
  router: appRouter,
  createContext,
});

const port = Number(process.env.PORT ?? 4000);
server.listen(port);
console.log(`[server] listening on http://localhost:${port}`);

setInterval(() => {
  sweepWithdrawals(db).catch((e) => console.error('[server] withdrawal sweep failed', e));
}, 15_000);
