// server/tests/health.test.ts
import { describe, it, expect } from 'vitest';
import { createCallerFactory } from '../src/trpc';
import { appRouter } from '../src/routers/_app';
import { db } from '../src/db';

const createCaller = createCallerFactory(appRouter);

describe('health', () => {
  it('responds ok without touching the database', async () => {
    const caller = createCaller({ db, session: {} as never, req: {} as never, res: {} as never });
    const result = await caller.health();
    expect(result).toEqual({ ok: true });
  });
});
