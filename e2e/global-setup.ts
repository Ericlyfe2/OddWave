import type { FullConfig } from '@playwright/test';

const API_BASE = 'http://localhost:4000';
const DEMO_ACCOUNTS = [
  { email: 'fan@oddwave.demo', password: 'Fan12345' },
  { email: 'admin@oddwave.demo', password: 'Admin123!' },
] as const;

/**
 * The demo accounts are one real, persistent row each in a real database
 * shared across every test and every run — not per-test, per-worker, or
 * per-CI-run isolated. Every `signIn()` call anywhere in the suite creates a
 * real DeviceSession row that nothing but an explicit revoke or a 30-day TTL
 * clears, so a run that fails partway through (leaving cleanup steps unrun)
 * compounds into the next run. Clearing every session for both demo accounts
 * once, before the suite starts, is the one place that's guaranteed to run
 * regardless of what any previous run left behind.
 */
export default async function globalSetup(_config: FullConfig): Promise<void> {
  for (const { email, password } of DEMO_ACCOUNTS) {
    const signInRes = await fetch(`${API_BASE}/auth.signIn`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const cookie = signInRes.headers.get('set-cookie');
    if (!cookie) {
      // The one realistic cause, given webServer's health check already
      // guarantees the server is up: a prior failed run left this demo
      // account's password rotated away from what's hardcoded here. Fail
      // loudly now rather than proceeding to 50 confusing signIn() failures
      // with no pointer back to the actual cause.
      const body = await signInRes.text().catch(() => '<unreadable body>');
      throw new Error(
        `global-setup: signIn as ${email} did not return a session cookie ` +
          `(status ${signInRes.status}, body: ${body}). The demo account's ` +
          `password may be out of sync with the hardcoded value here.`
      );
    }
    const sessionCookie = cookie.split(';')[0];

    await fetch(`${API_BASE}/auth.revokeOtherSessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: sessionCookie },
      body: JSON.stringify({}),
    });
  }
}
