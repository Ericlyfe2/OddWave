import { getIronSession, type IronSession, type SessionOptions } from 'iron-session';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { User } from '@prisma/client';
import type { Context } from './context';

export interface SessionData {
  userId?: string;
  sessionId?: string;
}

/**
 * The one place a session is validated against the database — used by both
 * protectedProcedure and the public `me` query, which each need the same
 * check for different reasons (throw vs. return null). Keeping this as two
 * hand-copied predicates is exactly what let the original bug happen: the
 * cookie is a self-contained signed blob valid for its own ~30-day lifetime
 * independent of the database, so a session is only real if its
 * DeviceSession row still exists, belongs to the same user, and hasn't
 * expired — checking `ctx.session.userId` alone (what the cookie decrypting
 * successfully tells you) is not enough.
 */
export async function validateSession(db: Context['db'], session: SessionData): Promise<User | null> {
  if (!session.userId || !session.sessionId) return null;
  const [user, deviceSession] = await Promise.all([
    db.user.findUnique({ where: { id: session.userId } }),
    db.deviceSession.findUnique({ where: { id: session.sessionId } }),
  ]);
  if (!user || user.suspended || !deviceSession || deviceSession.userId !== user.id || deviceSession.exp < new Date()) {
    return null;
  }
  // Fire-and-forget: listSessions' "last seen" and its orderBy both read this
  // column, so it needs to move on real use, not just at sign-in. Never
  // awaited or allowed to fail the request — it's freshness metadata, not
  // part of the validity check above.
  void db.deviceSession.update({ where: { id: deviceSession.id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
  return user;
}

// Lazy on purpose: this used to run at module-import time, which meant
// merely importing anything from this file (e.g. validateSession, which
// doesn't touch the cookie secret at all) required SESSION_SECRET to
// already be in process.env — turning module load order into an implicit
// env-loading dependency. Deferred to first real use (getSession), which is
// only ever called while actually handling a request.
function getSessionOptions(): SessionOptions {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET must be set to a string of 32+ characters (see server/.env.example)');
  }
  return {
    cookieName: 'oddwave_session',
    password: secret,
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days; the DeviceSession row's own `exp` is the real expiry check
    },
  };
}

export function getSession(req: IncomingMessage, res: ServerResponse): Promise<IronSession<SessionData>> {
  return getIronSession<SessionData>(req, res, getSessionOptions());
}
