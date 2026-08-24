import { getIronSession, type IronSession, type SessionOptions } from 'iron-session';
import type { IncomingMessage, ServerResponse } from 'node:http';

export interface SessionData {
  userId?: string;
  sessionId?: string;
}

const secret = process.env.SESSION_SECRET;
if (!secret || secret.length < 32) {
  throw new Error('SESSION_SECRET must be set to a string of 32+ characters (see server/.env.example)');
}

export const sessionOptions: SessionOptions = {
  cookieName: 'oddwave_session',
  password: secret,
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days; the DeviceSession row's own `exp` is the real expiry check
  },
};

export function getSession(req: IncomingMessage, res: ServerResponse): Promise<IronSession<SessionData>> {
  return getIronSession<SessionData>(req, res, sessionOptions);
}
