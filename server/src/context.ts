import type { CreateHTTPContextOptions } from '@trpc/server/adapters/standalone';
import { db } from './db';
import { getSession } from './session';

export async function createContext({ req, res }: CreateHTTPContextOptions) {
  const session = await getSession(req, res);
  return { db, session };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
