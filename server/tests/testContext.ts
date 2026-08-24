import type { IronSession } from 'iron-session';
import { createCallerFactory } from '../src/trpc';
import { appRouter } from '../src/routers/_app';
import { db } from '../src/db';
import type { SessionData } from '../src/session';

const createCaller = createCallerFactory(appRouter);

/** Augments the given object in place with no-op save/destroy, so router code
 *  that calls ctx.session.save()/.destroy() works, and the caller's own
 *  reference to `session` reflects whatever the router wrote to it. */
function toFakeSession(session: SessionData) {
  const fake = session as SessionData & { save: () => Promise<void>; destroy: () => void };
  fake.save = async () => {};
  fake.destroy = () => {
    delete fake.userId;
    delete fake.sessionId;
  };
  return fake;
}

export function callerWithSession(session: SessionData = {}) {
  return createCaller({
    db,
    // The real Context type expects a full IronSession<SessionData> (save, destroy,
    // updateConfig). Tests bypass HTTP and never touch updateConfig, so the fake only
    // implements the two methods router code actually calls, then is cast to fit.
    session: toFakeSession(session) as unknown as IronSession<SessionData>,
    req: { headers: {} } as never,
    res: {} as never,
  });
}
