# Phase 1a: Backend Scaffold + Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the client-side, `localStorage`-backed "auth database" in `src/store/auth.ts` with a real server (tRPC + Prisma + PostgreSQL), while every screen that consumes `useAuth` keeps working unmodified.

**Architecture:** A new `server/` npm workspace exposes a tRPC router (`auth`, `admin`) over HTTP on port 4000, backed by Postgres via Prisma and cookie sessions via `iron-session`. Vite proxies `/api` to it in dev, so the browser sees one origin. `src/store/auth.ts` is rewritten to call the tRPC client instead of `localStorage`, keeping its exact public interface.

**Tech Stack:** TypeScript, `@trpc/server` v11 (standalone adapter), Prisma 6 + PostgreSQL (Neon), `argon2` (password hashing), `iron-session` v8 (encrypted cookie sessions), `zod` (input validation), `@trpc/client` + `@trpc/react-query` + `@tanstack/react-query` v5 (frontend).

## Global Constraints

- The public shape of `useAuth` (every field/method on `AuthState` in `src/store/auth.ts`) does not change — no screen (`AuthScreen.tsx`, `SecurityScreen.tsx`, `AccountScreens.tsx`, `AdminOps.tsx`, `AdminOverview.tsx`) gets modified beyond what's explicitly listed in a task below.
- Demo accounts stay `fan@oddwave.demo` / `Fan12345` and `admin@oddwave.demo` / `Admin123!`, with the same `id`s (`u-fan`, `u-admin`) — `e2e/helpers.ts#signIn` and any test asserting those ids keep working.
- `Profile.createdAt`, `RGLimits.selfExcludedUntil`, and `DeviceSession.{createdAt,lastSeenAt,exp}` stay epoch-millisecond `number`s on the wire (not `Date` objects), matching `src/lib/types.ts` exactly.
- Money fields (`Profile.bonusBalance`, `RGLimits.{depositLimit,lossLimit}`) stay plain `number` on the wire; `Decimal` is a database-only concern converted at the router boundary.
- Every mutation that can fail for an expected business reason (wrong password, duplicate email, expired code) returns `{ error: string }` rather than throwing — this is the contract every screen already codes against. `TRPCError` is thrown only for authorization failures (no session, wrong role) and genuine server errors.

---

## File Structure

```
SPORTY/
├── package.json                 (+ "workspaces": ["server"])
├── vite.config.ts                (+ dev proxy: /api -> localhost:4000)
├── playwright.config.ts          (+ second webServer entry for server/)
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.ts
│   ├── tests/
│   │   └── auth.test.ts
│   └── src/
│       ├── db.ts                 (Prisma client singleton)
│       ├── session.ts            (iron-session config + helpers)
│       ├── mappers.ts            (Prisma row -> Profile/DeviceSession)
│       ├── trpc.ts               (procedure builders)
│       ├── context.ts            (per-request context)
│       ├── index.ts              (HTTP entrypoint)
│       └── routers/
│           ├── _app.ts
│           ├── auth.ts
│           └── admin.ts
├── src/
│   ├── lib/trpc.ts                (new — tRPC client)
│   ├── main.tsx                   (+ QueryClientProvider / trpc.Provider)
│   ├── store/auth.ts               (rewritten)
│   ├── store/notifs.ts             (push() signature change)
│   ├── store/wallet.ts             (2 call sites updated)
│   ├── store/bets.ts               (4 call sites updated)
│   └── screens/
│       ├── AdminOps.tsx            (listProfiles/adminUpdateUser -> trpc)
│       └── AdminOverview.tsx       (listProfiles -> trpc)
├── tests/
│   ├── authSessions.test.ts        (deleted — superseded by server/tests/auth.test.ts)
│   └── notifs.test.ts              (rewritten — no longer depends on useAuth)
└── e2e/
    └── security.spec.ts            (2 tests rewritten — real second session, not localStorage injection)
```

---

### Task 1: Workspace scaffold

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/.env.example`

**Interfaces:**
- Produces: an installable `server` workspace; `npm run dev` (root) and a new `npm run dev --workspace=server` both resolve.

- [ ] **Step 1: Declare the workspace at the root**

Edit `package.json`, add after `"private": true,`:

```json
  "workspaces": ["server"],
```

- [ ] **Step 2: Create `server/package.json`**

```json
{
  "name": "@oddwave/server",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -b",
    "typecheck": "tsc -b --noEmit",
    "test": "vitest run",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:seed": "tsx prisma/seed.ts"
  },
  "dependencies": {
    "@prisma/client": "^6.1.0",
    "@trpc/server": "^11.0.0",
    "argon2": "^0.41.1",
    "iron-session": "^8.0.4",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "prisma": "^6.1.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.2",
    "vitest": "^3.2.7"
  }
}
```

- [ ] **Step 3: Create `server/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src", "prisma", "tests"]
}
```

No path alias for reaching into the frontend's `src/` — `tsx` (the dev/seed runtime) doesn't reliably resolve
tsconfig `paths` at runtime the way `tsc`'s typechecker does, so server code imports shared types with plain
relative paths (e.g. `../../src/lib/types`) instead. `tsc -b --noEmit` still typechecks these correctly since
they're ordinary relative imports.

- [ ] **Step 4: Create `server/.env.example`**

```bash
# Copy to server/.env and fill in the real values. server/.env is gitignored.
DATABASE_URL="postgresql://user:password@host/dbname?sslmode=require"
# Must be at least 32 characters — generate with: openssl rand -base64 32
SESSION_SECRET="replace-with-a-random-32+-character-string"
PORT=4000
```

- [ ] **Step 5: Add the dev proxy to `vite.config.ts`**

In the `server: { port: 3000, host: true }` block, add a `proxy` key so the browser sees `/api` as same-origin:

```ts
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
```

- [ ] **Step 6: Install dependencies**

Run: `npm install` (from repo root — this installs both the root and `server` workspaces)
Expected: completes without error; `server/node_modules` exists (or is symlinked via the root `node_modules`).

- [ ] **Step 7: Commit**

```bash
git add package.json vite.config.ts server/package.json server/tsconfig.json server/.env.example package-lock.json
git commit -m "chore: scaffold server/ workspace"
```

---

### Task 2: Prisma schema + generated client

**Files:**
- Create: `server/prisma/schema.prisma`

**Interfaces:**
- Produces: `@prisma/client`'s generated `PrismaClient` type with models `User`, `RgLimits`, `NotificationPrefs`, `DeviceSession`, and enum `Role`.

- [ ] **Step 1: Write the schema**

```prisma
// server/prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  user
  admin
}

model User {
  id            String   @id @default(cuid())
  email         String   @unique
  passwordHash  String
  phone         String
  fullName      String
  role          Role     @default(user)
  createdAt     DateTime @default(now())
  bonusBalance  Decimal  @default(0) @db.Decimal(12, 2)
  suspended     Boolean  @default(false)
  emailVerified Boolean  @default(false)
  phoneVerified Boolean  @default(false)
  claimedPromos String[] @default([])

  rgLimits   RgLimits?
  notifPrefs NotificationPrefs?
  sessions   DeviceSession[]
}

model RgLimits {
  userId             String    @id
  user               User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  depositLimit       Decimal?  @db.Decimal(12, 2)
  lossLimit          Decimal?  @db.Decimal(12, 2)
  sessionReminderMin Int?
  selfExcludedUntil  DateTime?
}

model NotificationPrefs {
  userId     String  @id
  user       User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  betUpdates Boolean @default(true)
  promotions Boolean @default(true)
  liveEvents Boolean @default(true)
}

model DeviceSession {
  id         String   @id @default(cuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  device     String
  createdAt  DateTime @default(now())
  lastSeenAt DateTime @default(now())
  exp        DateTime
}
```

- [ ] **Step 2: Validate the schema (does not need a live database)**

Run: `npm run db:generate --workspace=server`
Expected: `Generated Prisma Client` message, no errors. This only parses the schema and writes generated TS types — it does not connect to `DATABASE_URL`.

- [ ] **Step 3: Commit**

```bash
git add server/prisma/schema.prisma
git commit -m "feat(server): add Prisma schema for User/RgLimits/NotificationPrefs/DeviceSession"
```

**⏸ Checkpoint:** everything from here on that touches the database needs a real `DATABASE_URL`. Create a free Neon Postgres project at neon.tech, copy `server/.env.example` to `server/.env`, and paste the connection string in before starting Task 3. Then run:

```bash
npm run db:migrate --workspace=server -- --name init
```

Expected: creates `server/prisma/migrations/<timestamp>_init/`, applies it, and prints `Your database is now in sync with your schema.`

---

### Task 3: tRPC plumbing + health check

**Files:**
- Create: `server/src/db.ts`
- Create: `server/src/session.ts`
- Create: `server/src/context.ts`
- Create: `server/src/trpc.ts`
- Create: `server/src/routers/_app.ts`
- Create: `server/src/index.ts`
- Test: `server/tests/health.test.ts`

**Interfaces:**
- Produces: `publicProcedure`, `protectedProcedure`, `adminProcedure` (exported from `trpc.ts`); `AppRouter` type (exported from `routers/_app.ts`) — this is the type Task 10's frontend client imports.
- Consumes: nothing from earlier tasks besides the generated Prisma client from Task 2.

- [ ] **Step 1: Prisma client singleton — `server/src/db.ts`**

```ts
import { PrismaClient } from '@prisma/client';

export const db = new PrismaClient();
```

- [ ] **Step 2: Session config — `server/src/session.ts`**

```ts
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
```

- [ ] **Step 3: Request context — `server/src/context.ts`**

```ts
import type { CreateHTTPContextOptions } from '@trpc/server/adapters/standalone';
import { db } from './db';
import { getSession } from './session';

export async function createContext({ req, res }: CreateHTTPContextOptions) {
  const session = await getSession(req, res);
  return { db, session };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
```

- [ ] **Step 4: Procedure builders — `server/src/trpc.ts`**

```ts
import { initTRPC, TRPCError } from '@trpc/server';
import type { Context } from './context';

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
/** `@trpc/server` v11 doesn't export this from its package root — only off the
 *  initialized instance — so every test file imports it from here instead. */
export const createCallerFactory = t.createCallerFactory;

export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.session.userId) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not signed in' });
  }
  const user = await ctx.db.user.findUnique({ where: { id: ctx.session.userId } });
  if (!user || user.suspended) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Session no longer valid' });
  }
  return next({ ctx: { ...ctx, currentUser: user } });
});

export const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (ctx.currentUser.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
  }
  return next({ ctx });
});
```

- [ ] **Step 5: Root router (health check only for now) — `server/src/routers/_app.ts`**

```ts
import { publicProcedure, router } from '../trpc';

export const appRouter = router({
  health: publicProcedure.query(() => ({ ok: true as const })),
});

export type AppRouter = typeof appRouter;
```

- [ ] **Step 6: HTTP entrypoint — `server/src/index.ts`**

```ts
import 'dotenv/config';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { appRouter } from './routers/_app';
import { createContext } from './context';

const server = createHTTPServer({
  router: appRouter,
  createContext,
});

const port = Number(process.env.PORT ?? 4000);
server.listen(port);
console.log(`[server] listening on http://localhost:${port}`);
```

`dotenv` isn't in `server/package.json` yet — add it:

Run: `npm install dotenv --workspace=server`

- [ ] **Step 7: Write the health-check test**

```ts
// server/tests/health.test.ts
import { describe, it, expect } from 'vitest';
import { createCallerFactory } from '../src/trpc';
import { appRouter } from '../src/routers/_app';
import { db } from '../src/db';

const createCaller = createCallerFactory(appRouter);

describe('health', () => {
  it('responds ok without touching the database', async () => {
    const caller = createCaller({ db, session: {} as never });
    const result = await caller.health();
    expect(result).toEqual({ ok: true });
  });
});
```

- [ ] **Step 8: Run the test**

Run: `npm run test --workspace=server`
Expected: PASS — 1 test.

- [ ] **Step 9: Boot the server and verify it responds**

`createHTTPServer` (the standalone adapter) mounts each procedure at its own path off the server's
root — `/health`, not `/trpc/health`. The `/trpc` prefix only applies when tRPC is mounted as a sub-router
of another HTTP framework (Express, Next.js), which this isn't.

Run: `npm run dev --workspace=server` (leave running)
Run in another terminal: `curl http://localhost:4000/health`
Expected: JSON body containing `"ok":true`.

- [ ] **Step 10: Commit**

```bash
git add server/src server/tests/health.test.ts server/package.json package-lock.json
git commit -m "feat(server): tRPC scaffold with health check"
```

---

### Task 4: Auth router — signUp + signIn

**Files:**
- Create: `server/src/mappers.ts`
- Create: `server/src/routers/auth.ts`
- Modify: `server/src/routers/_app.ts`
- Modify: `server/src/context.ts` (add `req`/`res` to the returned context)
- Create: `server/tests/testContext.ts`
- Test: `server/tests/auth.test.ts`

**Interfaces:**
- Consumes: `publicProcedure`, `router` (Task 3); `db` (Task 3); `SessionData` (Task 3).
- Produces: `mapProfile(user, rgLimits, notifPrefs): Profile` and `mapDeviceSession(row): DeviceSession`, reused by every later auth/admin procedure. `authRouter.signUp`, `authRouter.signIn`. `callerWithSession(session?): AppRouter caller` from `server/tests/testContext.ts`, reused by every later server test file (Task 8's `admin.test.ts` in particular — no second copy of this helper).

- [ ] **Step 1: Row-to-wire mappers — `server/src/mappers.ts`**

```ts
import type { User, RgLimits, NotificationPrefs, DeviceSession as DeviceSessionRow } from '@prisma/client';
import type { Profile, DeviceSession } from '../../src/lib/types';

export function mapProfile(user: User, rgLimits: RgLimits | null, notifPrefs: NotificationPrefs | null): Profile {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    fullName: user.fullName,
    role: user.role,
    createdAt: user.createdAt.getTime(),
    bonusBalance: Number(user.bonusBalance),
    suspended: user.suspended,
    claimedPromos: user.claimedPromos,
    emailVerified: user.emailVerified,
    phoneVerified: user.phoneVerified,
    rgLimits: {
      depositLimit: rgLimits?.depositLimit != null ? Number(rgLimits.depositLimit) : null,
      lossLimit: rgLimits?.lossLimit != null ? Number(rgLimits.lossLimit) : null,
      sessionReminderMin: rgLimits?.sessionReminderMin ?? null,
      selfExcludedUntil: rgLimits?.selfExcludedUntil ? rgLimits.selfExcludedUntil.getTime() : null,
    },
    notifPrefs: {
      betUpdates: notifPrefs?.betUpdates ?? true,
      promotions: notifPrefs?.promotions ?? true,
      liveEvents: notifPrefs?.liveEvents ?? true,
    },
  };
}

export function mapDeviceSession(row: DeviceSessionRow): DeviceSession {
  return {
    id: row.id,
    userId: row.userId,
    device: row.device,
    createdAt: row.createdAt.getTime(),
    lastSeenAt: row.lastSeenAt.getTime(),
    exp: row.exp.getTime(),
  };
}
```

- [ ] **Step 2: Test support — a fake session that behaves like the real one**

Router code calls `ctx.session.save()` and `ctx.session.destroy()` (real `IronSession` methods that also
write the encrypted cookie header). Tests call the router directly via `createCallerFactory`, bypassing HTTP
entirely, so they need a stand-in that implements just enough of that interface — and, critically, mutates
the *same object reference* the test holds, so a test can create `const session: SessionData = {}`, pass it
in, and later read `session.sessionId` after a mutation sets it:

```ts
// server/tests/testContext.ts
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
    session: toFakeSession(session),
    req: { headers: {} } as never,
    res: {} as never,
  });
}
```

- [ ] **Step 3: Write the failing tests**

```ts
// server/tests/auth.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db';
import type { SessionData } from '../src/session';
import { callerWithSession } from './testContext';

beforeEach(async () => {
  await db.deviceSession.deleteMany();
  await db.rgLimits.deleteMany();
  await db.notificationPrefs.deleteMany();
  await db.user.deleteMany();
});

describe('auth.signUp', () => {
  it('creates a user and returns a profile with default limits and prefs', async () => {
    const caller = callerWithSession();
    const result = await caller.auth.signUp({
      email: 'New.Player@Example.com',
      password: 'longenough',
      phone: '+233200000009',
      fullName: 'New Player',
    });

    expect(result.error).toBeUndefined();
    expect(result.profile?.email).toBe('new.player@example.com'); // lowercased
    expect(result.profile?.rgLimits).toEqual({
      depositLimit: null,
      lossLimit: null,
      sessionReminderMin: null,
      selfExcludedUntil: null,
    });
    expect(result.profile?.notifPrefs).toEqual({ betUpdates: true, promotions: true, liveEvents: true });

    const stored = await db.user.findUnique({ where: { email: 'new.player@example.com' } });
    expect(stored).not.toBeNull();
    expect(stored?.passwordHash).not.toBe('longenough'); // hashed, not plaintext
  });

  it('rejects a password under 6 characters', async () => {
    const result = await callerWithSession().auth.signUp({
      email: 'short@example.com',
      password: '123',
      phone: '+233200000009',
      fullName: 'Short Pw',
    });
    expect(result.error).toBe('Password must be at least 6 characters');
  });

  it('rejects a duplicate email', async () => {
    await callerWithSession().auth.signUp({
      email: 'dup@example.com',
      password: 'longenough',
      phone: '+233200000009',
      fullName: 'First',
    });
    const result = await callerWithSession().auth.signUp({
      email: 'DUP@example.com',
      password: 'longenough2',
      phone: '+233200000009',
      fullName: 'Second',
    });
    expect(result.error).toBe('An account with this email already exists');
  });
});

describe('auth.signIn', () => {
  it('signs in with the correct password', async () => {
    await callerWithSession().auth.signUp({
      email: 'login@example.com',
      password: 'correcthorse',
      phone: '+233200000009',
      fullName: 'Login Test',
    });
    const result = await callerWithSession().auth.signIn({ email: 'login@example.com', password: 'correcthorse' });
    expect(result.error).toBeUndefined();
    expect(result.profile?.email).toBe('login@example.com');
  });

  it('rejects the wrong password', async () => {
    await callerWithSession().auth.signUp({
      email: 'wrongpw@example.com',
      password: 'correcthorse',
      phone: '+233200000009',
      fullName: 'Wrong Pw',
    });
    const result = await callerWithSession().auth.signIn({ email: 'wrongpw@example.com', password: 'nope' });
    expect(result.error).toBe('Incorrect email or password');
  });

  it('rejects an unknown email', async () => {
    const result = await callerWithSession().auth.signIn({ email: 'nobody@example.com', password: 'whatever' });
    expect(result.error).toBe('No account found with this email');
  });

  it('rejects a self-excluded account', async () => {
    const signUp = await callerWithSession().auth.signUp({
      email: 'excluded@example.com',
      password: 'correcthorse',
      phone: '+233200000009',
      fullName: 'Excluded',
    });
    await db.rgLimits.update({
      where: { userId: signUp.profile!.id },
      data: { selfExcludedUntil: new Date(Date.now() + 86_400_000) },
    });
    const result = await callerWithSession().auth.signIn({ email: 'excluded@example.com', password: 'correcthorse' });
    expect(result.error).toBe('Account is under self-exclusion until further notice');
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npm run test --workspace=server`
Expected: FAIL — `Property 'auth' does not exist` / `appRouter.auth is undefined`.

- [ ] **Step 5: Implement `signUp` and `signIn` — `server/src/routers/auth.ts`**

```ts
import { z } from 'zod';
import * as argon2 from 'argon2';
import { publicProcedure, router } from '../trpc';
import { mapProfile, mapDeviceSession } from '../mappers';
import { SESSION_DAYS } from '../../../src/lib/config';

const SESSION_MS = SESSION_DAYS * 86400000;

async function loadProfile(db: import('../context').Context['db'], userId: string) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return null;
  const [rgLimits, notifPrefs] = await Promise.all([
    db.rgLimits.findUnique({ where: { userId } }),
    db.notificationPrefs.findUnique({ where: { userId } }),
  ]);
  return mapProfile(user, rgLimits, notifPrefs);
}

async function openDeviceSession(
  db: import('../context').Context['db'],
  session: import('../session').SessionData,
  userId: string,
  userAgent: string | undefined
) {
  const device = describeDevice(userAgent);
  const row = await db.deviceSession.create({
    data: { userId, device, exp: new Date(Date.now() + SESSION_MS) },
  });
  session.userId = userId;
  session.sessionId = row.id;
  await (session as unknown as { save: () => Promise<void> }).save();
  return mapDeviceSession(row);
}

/** Best-effort device label from the real request header — never invented. */
function describeDevice(ua: string | undefined): string {
  if (!ua) return 'Unknown device';
  const os = /Windows NT/.test(ua) ? 'Windows'
    : /Android/.test(ua) ? 'Android'
    : /iPhone|iPad|iPod/.test(ua) ? 'iOS'
    : /Mac OS X/.test(ua) ? 'macOS'
    : /Linux/.test(ua) ? 'Linux' : 'Unknown OS';
  const browser = /Edg\//.test(ua) ? 'Edge'
    : /OPR\//.test(ua) ? 'Opera'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return `${browser} on ${os}`;
}

export const authRouter = router({
  signUp: publicProcedure
    .input(z.object({ email: z.string(), password: z.string(), phone: z.string(), fullName: z.string() }))
    .mutation(async ({ ctx, input, }) => {
      const cleanEmail = input.email.trim().toLowerCase();
      const phone = input.phone.trim();
      const fullName = input.fullName.trim();
      if (!cleanEmail || !input.password || !phone || !fullName) {
        return { error: 'Please fill in all fields' };
      }
      if (input.password.length < 6) return { error: 'Password must be at least 6 characters' };
      if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) return { error: 'Enter a valid email address' };

      const existing = await ctx.db.user.findUnique({ where: { email: cleanEmail } });
      if (existing) return { error: 'An account with this email already exists' };

      const passwordHash = await argon2.hash(input.password);
      const user = await ctx.db.user.create({
        data: {
          email: cleanEmail,
          passwordHash,
          phone,
          fullName,
          rgLimits: { create: {} },
          notifPrefs: { create: {} },
        },
      });
      const rgLimits = await ctx.db.rgLimits.findUnique({ where: { userId: user.id } });
      const notifPrefs = await ctx.db.notificationPrefs.findUnique({ where: { userId: user.id } });

      await openDeviceSession(ctx.db, ctx.session, user.id, ctx.req.headers['user-agent']);
      return { profile: mapProfile(user, rgLimits, notifPrefs) };
    }),

  signIn: publicProcedure
    .input(z.object({ email: z.string(), password: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const cleanEmail = input.email.trim().toLowerCase();
      const user = await ctx.db.user.findUnique({ where: { email: cleanEmail } });
      if (!user) return { error: 'No account found with this email' };

      const valid = await argon2.verify(user.passwordHash, input.password).catch(() => false);
      if (!valid) return { error: 'Incorrect email or password' };

      const rgLimits = await ctx.db.rgLimits.findUnique({ where: { userId: user.id } });
      if (rgLimits?.selfExcludedUntil && rgLimits.selfExcludedUntil > new Date()) {
        return { error: 'Account is under self-exclusion until further notice' };
      }
      const notifPrefs = await ctx.db.notificationPrefs.findUnique({ where: { userId: user.id } });

      await openDeviceSession(ctx.db, ctx.session, user.id, ctx.req.headers['user-agent']);
      return { profile: mapProfile(user, rgLimits, notifPrefs) };
    }),
});

export { loadProfile };
```

`ctx.req` isn't on `Context` yet — `createHTTPContextOptions` exposes `req`/`res`, so update `server/src/context.ts` to also return them:

```ts
export async function createContext({ req, res }: CreateHTTPContextOptions) {
  const session = await getSession(req, res);
  return { db, session, req, res };
}
```

- [ ] **Step 6: Wire the router into `_app.ts`**

```ts
import { publicProcedure, router } from '../trpc';
import { authRouter } from './auth';

export const appRouter = router({
  health: publicProcedure.query(() => ({ ok: true as const })),
  auth: authRouter,
});

export type AppRouter = typeof appRouter;
```

- [ ] **Step 7: Run the tests**

Run: `npm run test --workspace=server`
Expected: PASS — all `auth.signUp` / `auth.signIn` tests green.

- [ ] **Step 8: Commit**

```bash
git add server/src server/tests/testContext.ts package-lock.json
git commit -m "feat(server): auth.signUp and auth.signIn"
```

---

### Task 5: Auth router — signOut, me, updateProfile

**Files:**
- Modify: `server/src/routers/auth.ts`
- Modify: `server/tests/auth.test.ts`

**Interfaces:**
- Consumes: `protectedProcedure` (Task 3), `loadProfile` (Task 4).
- Produces: `authRouter.signOut`, `authRouter.me`, `authRouter.updateProfile`.

- [ ] **Step 1: Write the failing tests**

Append to `server/tests/auth.test.ts`:

```ts
describe('auth.me / signOut / updateProfile', () => {
  async function signedInCaller() {
    const session: SessionData = {};
    const caller = callerWithSession(session);
    await caller.auth.signUp({
      email: 'session-user@example.com',
      password: 'correcthorse',
      phone: '+233200000009',
      fullName: 'Session User',
    });
    return { caller, session };
  }

  it('me returns null when signed out', async () => {
    const result = await callerWithSession().auth.me();
    expect(result).toBeNull();
  });

  it('me returns the current profile once signed in', async () => {
    const { caller } = await signedInCaller();
    const me = await caller.auth.me();
    expect(me?.email).toBe('session-user@example.com');
  });

  it('signOut clears the session so me returns null again', async () => {
    const { caller } = await signedInCaller();
    await caller.auth.signOut();
    const me = await caller.auth.me();
    expect(me).toBeNull();
  });

  it('updateProfile updates allowed fields but ignores role/suspended', async () => {
    const { caller } = await signedInCaller();
    const updated = await caller.auth.updateProfile({
      fullName: 'Renamed',
      role: 'admin',
      suspended: true,
    } as never);
    expect(updated?.fullName).toBe('Renamed');
    expect(updated?.role).toBe('user');
    expect(updated?.suspended).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test --workspace=server`
Expected: FAIL — `caller.auth.me is not a function`.

- [ ] **Step 3: Implement, appending to `authRouter` in `server/src/routers/auth.ts`**

```ts
import { protectedProcedure } from '../trpc';
```

Add to the `router({...})` object (after `signIn`):

```ts
  signOut: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.session.sessionId) {
      await ctx.db.deviceSession.delete({ where: { id: ctx.session.sessionId } }).catch(() => undefined);
    }
    ctx.session.destroy();
  }),

  me: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.session.userId) return null;
    return loadProfile(ctx.db, ctx.session.userId);
  }),

  updateProfile: protectedProcedure
    .input(
      z.object({
        fullName: z.string().min(1).optional(),
        phone: z.string().min(1).optional(),
        notifPrefs: z.object({ betUpdates: z.boolean(), promotions: z.boolean(), liveEvents: z.boolean() }).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.update({
        where: { id: ctx.currentUser.id },
        data: { fullName: input.fullName, phone: input.phone },
      });
      if (input.notifPrefs) {
        await ctx.db.notificationPrefs.update({ where: { userId: user.id }, data: input.notifPrefs });
      }
      return loadProfile(ctx.db, user.id);
    }),
```

Note: `updateProfile`'s input schema deliberately has no `role` or `suspended` field — those don't exist as accepted keys, so a client sending them (as the test above does, cast through `as never` to bypass the type check on purpose) has them silently dropped by zod's schema parsing. This is what makes the self-service endpoint safe to call with the exact `Partial<Profile>` shape `useAuth.updateProfile` already uses today — extra keys are ignored, not rejected.

- [ ] **Step 4: Run the tests**

Run: `npm run test --workspace=server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src server/tests
git commit -m "feat(server): auth.signOut, auth.me, auth.updateProfile"
```

---

### Task 6: Auth router — changePassword + session management

**Files:**
- Modify: `server/src/routers/auth.ts`
- Modify: `server/tests/auth.test.ts`

**Interfaces:**
- Produces: `authRouter.changePassword`, `authRouter.listSessions`, `authRouter.revokeSession`, `authRouter.revokeOtherSessions`.

- [ ] **Step 1: Write the failing tests**

```ts
describe('auth.changePassword', () => {
  it('rejects the wrong current password', async () => {
    const { caller } = await signedInCaller();
    const result = await caller.auth.changePassword({ currentPassword: 'wrong', newPassword: 'newenough' });
    expect(result.error).toBe('Current password is incorrect');
  });

  it('rejects a new password under 6 characters', async () => {
    const { caller } = await signedInCaller();
    const result = await caller.auth.changePassword({ currentPassword: 'correcthorse', newPassword: 'abc' });
    expect(result.error).toBe('New password must be at least 6 characters');
  });

  it('replaces the password so only the new one signs in', async () => {
    const { caller } = await signedInCaller();
    const result = await caller.auth.changePassword({ currentPassword: 'correcthorse', newPassword: 'newenough' });
    expect(result.error).toBeUndefined();

    const oldPw = await callerWithSession().auth.signIn({ email: 'session-user@example.com', password: 'correcthorse' });
    expect(oldPw.error).toBe('Incorrect email or password');
    const newPw = await callerWithSession().auth.signIn({ email: 'session-user@example.com', password: 'newenough' });
    expect(newPw.error).toBeUndefined();
  });
});

describe('session management', () => {
  it('listSessions marks the current session and includes a second device', async () => {
    const { caller, session } = await signedInCaller();
    const otherSession: SessionData = {};
    await callerWithSession(otherSession).auth.signIn({ email: 'session-user@example.com', password: 'correcthorse' });

    const sessions = await caller.auth.listSessions();
    expect(sessions).toHaveLength(2);
    expect(sessions.filter((s) => s.current)).toHaveLength(1);
    expect(sessions.find((s) => s.current)?.id).toBe(session.sessionId);
  });

  it('revokeSession on another device does not sign the caller out', async () => {
    const { caller } = await signedInCaller();
    const otherSession: SessionData = {};
    await callerWithSession(otherSession).auth.signIn({ email: 'session-user@example.com', password: 'correcthorse' });
    const otherId = otherSession.sessionId!;

    const result = await caller.auth.revokeSession({ sessionId: otherId });
    expect(result.signedOut).toBe(false);
    expect(await caller.auth.me()).not.toBeNull();
    expect(await caller.auth.listSessions()).toHaveLength(1);
  });

  it('revokeSession on your own current session signs you out', async () => {
    const { caller, session } = await signedInCaller();
    const result = await caller.auth.revokeSession({ sessionId: session.sessionId! });
    expect(result.signedOut).toBe(true);
    expect(await caller.auth.me()).toBeNull();
  });

  it('revokeOtherSessions leaves only the caller signed in', async () => {
    const { caller } = await signedInCaller();
    for (let i = 0; i < 2; i++) {
      await callerWithSession({}).auth.signIn({ email: 'session-user@example.com', password: 'correcthorse' });
    }
    expect(await caller.auth.listSessions()).toHaveLength(3);

    const removed = await caller.auth.revokeOtherSessions();
    expect(removed).toBe(2);
    expect(await caller.auth.listSessions()).toHaveLength(1);
    expect(await caller.auth.me()).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test --workspace=server`
Expected: FAIL — `caller.auth.changePassword is not a function`.

- [ ] **Step 3: Implement, appending to `authRouter`**

```ts
  changePassword: protectedProcedure
    .input(z.object({ currentPassword: z.string(), newPassword: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const valid = await argon2.verify(ctx.currentUser.passwordHash, input.currentPassword).catch(() => false);
      if (!valid) return { error: 'Current password is incorrect' };
      if (input.newPassword.length < 6) return { error: 'New password must be at least 6 characters' };
      if (input.newPassword === input.currentPassword) return { error: 'New password must be different' };

      const passwordHash = await argon2.hash(input.newPassword);
      await ctx.db.user.update({ where: { id: ctx.currentUser.id }, data: { passwordHash } });
      return {};
    }),

  listSessions: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.deviceSession.findMany({
      where: { userId: ctx.currentUser.id, exp: { gt: new Date() } },
      orderBy: { lastSeenAt: 'desc' },
    });
    return rows.map((row) => ({ ...mapDeviceSession(row), current: row.id === ctx.session.sessionId }));
  }),

  revokeSession: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.deviceSession
        .delete({ where: { id: input.sessionId, userId: ctx.currentUser.id } })
        .catch(() => undefined);
      if (ctx.session.sessionId === input.sessionId) {
        ctx.session.destroy();
        return { signedOut: true };
      }
      return { signedOut: false };
    }),

  revokeOtherSessions: protectedProcedure.mutation(async ({ ctx }) => {
    const { count } = await ctx.db.deviceSession.deleteMany({
      where: { userId: ctx.currentUser.id, id: { not: ctx.session.sessionId } },
    });
    return count;
  }),
```

- [ ] **Step 4: Run the tests**

Run: `npm run test --workspace=server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src server/tests
git commit -m "feat(server): auth.changePassword and device session management"
```

---

### Task 7: Auth router — password reset, verification, notifPrefsFor

**Files:**
- Create: `server/prisma/schema.prisma` (add two models)
- Modify: `server/src/routers/auth.ts`
- Modify: `server/tests/auth.test.ts`

**Interfaces:**
- Produces: `authRouter.requestPasswordReset`, `authRouter.resetPassword`, `authRouter.requestVerification`, `authRouter.confirmVerification`, `authRouter.notifPrefsFor`.

- [ ] **Step 1: Add reset/verification code storage to the schema**

Both codes are short-lived (15 minutes) and single-purpose, so they get their own small table rather than
overloading `User` with nullable code columns. Append to `server/prisma/schema.prisma`:

```prisma
model VerificationCode {
  id        String   @id @default(cuid())
  userId    String
  purpose   String   // "reset" | "verify_email" | "verify_phone"
  code      String
  createdAt DateTime @default(now())

  @@index([userId, purpose])
}
```

Run: `npm run db:migrate --workspace=server -- --name add_verification_codes`
Expected: migration applies cleanly.

- [ ] **Step 2: Write the failing tests**

```ts
describe('password reset', () => {
  it('issues a code and accepts it once', async () => {
    await callerWithSession().auth.signUp({
      email: 'reset-me@example.com',
      password: 'correcthorse',
      phone: '+233200000009',
      fullName: 'Reset Me',
    });
    const req = await callerWithSession().auth.requestPasswordReset({ email: 'reset-me@example.com' });
    expect(req.ok).toBe(true);
    expect(req.resetCode).toMatch(/^\d{6}$/);

    const result = await callerWithSession().auth.resetPassword({
      email: 'reset-me@example.com',
      code: req.resetCode!,
      newPassword: 'brandnewpw',
    });
    expect(result.error).toBeUndefined();

    const signIn = await callerWithSession().auth.signIn({ email: 'reset-me@example.com', password: 'brandnewpw' });
    expect(signIn.error).toBeUndefined();
  });

  it('rejects an invalid code', async () => {
    await callerWithSession().auth.signUp({
      email: 'badcode@example.com',
      password: 'correcthorse',
      phone: '+233200000009',
      fullName: 'Bad Code',
    });
    await callerWithSession().auth.requestPasswordReset({ email: 'badcode@example.com' });
    const result = await callerWithSession().auth.resetPassword({
      email: 'badcode@example.com',
      code: '000000',
      newPassword: 'brandnewpw',
    });
    expect(result.error).toBe('Invalid reset code');
  });
});

describe('contact verification', () => {
  it('marks a channel verified only for the issued code', async () => {
    const { caller } = await signedInCaller();
    const req = await caller.auth.requestVerification({ channel: 'email' });
    expect(req.code).toMatch(/^\d{6}$/);

    const wrong = await caller.auth.confirmVerification({ channel: 'email', code: '000000' });
    expect(wrong.error).toBe('Invalid verification code');

    const right = await caller.auth.confirmVerification({ channel: 'email', code: req.code });
    expect(right.error).toBeUndefined();

    const me = await caller.auth.me();
    expect(me?.emailVerified).toBe(true);
    expect(me?.phoneVerified).toBe(false);
  });
});

describe('notifPrefsFor', () => {
  it('returns another user’s prefs by id for a signed-in caller', async () => {
    const { caller } = await signedInCaller();
    const other = await callerWithSession().auth.signUp({
      email: 'other-prefs@example.com',
      password: 'correcthorse',
      phone: '+233200000009',
      fullName: 'Other Prefs',
    });
    const prefs = await caller.auth.notifPrefsFor({ userId: other.profile!.id });
    expect(prefs).toEqual({ betUpdates: true, promotions: true, liveEvents: true });
  });

  it('returns null for an unknown user id', async () => {
    const { caller } = await signedInCaller();
    const prefs = await caller.auth.notifPrefsFor({ userId: 'does-not-exist' });
    expect(prefs).toBeNull();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test --workspace=server`
Expected: FAIL — `caller.auth.requestPasswordReset is not a function`.

- [ ] **Step 4: Implement, appending to `authRouter`**

```ts
  requestPasswordReset: publicProcedure
    .input(z.object({ email: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const cleanEmail = input.email.trim().toLowerCase();
      const user = await ctx.db.user.findUnique({ where: { email: cleanEmail } });
      if (!user) return { ok: false, error: 'No account found with this email' };
      const code = String(Math.floor(100000 + Math.random() * 900000));
      await ctx.db.verificationCode.create({ data: { userId: user.id, purpose: 'reset', code } });
      return { ok: true, resetCode: code };
    }),

  resetPassword: publicProcedure
    .input(z.object({ email: z.string(), code: z.string(), newPassword: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const cleanEmail = input.email.trim().toLowerCase();
      const user = await ctx.db.user.findUnique({ where: { email: cleanEmail } });
      if (!user) return { error: 'No account found with this email' };

      const stored = await ctx.db.verificationCode.findFirst({
        where: { userId: user.id, purpose: 'reset' },
        orderBy: { createdAt: 'desc' },
      });
      if (!stored || stored.code !== input.code.trim()) return { error: 'Invalid reset code' };
      if (Date.now() - stored.createdAt.getTime() > 15 * 60_000) return { error: 'Reset code expired, request a new one' };
      if (input.newPassword.length < 6) return { error: 'Password must be at least 6 characters' };

      const passwordHash = await argon2.hash(input.newPassword);
      await ctx.db.user.update({ where: { id: user.id }, data: { passwordHash } });
      await ctx.db.verificationCode.delete({ where: { id: stored.id } });
      return {};
    }),

  requestVerification: protectedProcedure
    .input(z.object({ channel: z.enum(['email', 'phone']) }))
    .mutation(async ({ ctx, input }) => {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      await ctx.db.verificationCode.create({
        data: { userId: ctx.currentUser.id, purpose: `verify_${input.channel}`, code },
      });
      return { code };
    }),

  confirmVerification: protectedProcedure
    .input(z.object({ channel: z.enum(['email', 'phone']), code: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const stored = await ctx.db.verificationCode.findFirst({
        where: { userId: ctx.currentUser.id, purpose: `verify_${input.channel}` },
        orderBy: { createdAt: 'desc' },
      });
      if (!stored || stored.code !== input.code.trim()) return { error: 'Invalid verification code' };
      if (Date.now() - stored.createdAt.getTime() > 15 * 60_000) return { error: 'Code expired, request a new one' };

      await ctx.db.user.update({
        where: { id: ctx.currentUser.id },
        data: input.channel === 'email' ? { emailVerified: true } : { phoneVerified: true },
      });
      await ctx.db.verificationCode.delete({ where: { id: stored.id } });
      return {};
    }),

  notifPrefsFor: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      const prefs = await ctx.db.notificationPrefs.findUnique({ where: { userId: input.userId } });
      if (!prefs) return null;
      return { betUpdates: prefs.betUpdates, promotions: prefs.promotions, liveEvents: prefs.liveEvents };
    }),
```

- [ ] **Step 5: Run the tests**

Run: `npm run test --workspace=server`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/prisma server/src server/tests
git commit -m "feat(server): password reset, contact verification, notifPrefsFor"
```

---

### Task 8: Admin router — listUsers + updateUser

**Files:**
- Create: `server/src/routers/admin.ts`
- Modify: `server/src/routers/_app.ts`
- Test: `server/tests/admin.test.ts`

**Interfaces:**
- Consumes: `adminProcedure` (Task 3), `mapProfile` (Task 4), `callerWithSession` (Task 4's `server/tests/testContext.ts`).
- Produces: `adminRouter.listUsers`, `adminRouter.updateUser`.

- [ ] **Step 1: Write the failing tests**

```ts
// server/tests/admin.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db';
import type { SessionData } from '../src/session';
import { callerWithSession } from './testContext';

beforeEach(async () => {
  await db.deviceSession.deleteMany();
  await db.rgLimits.deleteMany();
  await db.notificationPrefs.deleteMany();
  await db.user.deleteMany();
});

async function signUpAs(role: 'user' | 'admin', email: string) {
  const session: SessionData = {};
  const caller = callerWithSession(session);
  await caller.auth.signUp({ email, password: 'correcthorse', phone: '+233200000009', fullName: 'Test User' });
  if (role === 'admin') await db.user.update({ where: { email }, data: { role: 'admin' } });
  return caller;
}

describe('admin.listUsers / updateUser', () => {
  it('rejects a non-admin caller', async () => {
    const caller = await signUpAs('user', 'plain@example.com');
    await expect(caller.admin.listUsers()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('rejects an unauthenticated caller', async () => {
    await expect(callerWithSession().admin.listUsers()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('lists every user for an admin caller', async () => {
    await signUpAs('user', 'one@example.com');
    const admin = await signUpAs('admin', 'the-admin@example.com');
    const users = await admin.admin.listUsers();
    expect(users.map((u) => u.email).sort()).toEqual(['one@example.com', 'the-admin@example.com']);
  });

  it('lets an admin suspend and un-suspend another user', async () => {
    await signUpAs('user', 'target@example.com');
    const admin = await signUpAs('admin', 'the-admin2@example.com');
    const target = (await admin.admin.listUsers()).find((u) => u.email === 'target@example.com')!;

    const suspended = await admin.admin.updateUser({ userId: target.id, patch: { suspended: true } });
    expect(suspended?.suspended).toBe(true);

    const restored = await admin.admin.updateUser({ userId: target.id, patch: { suspended: false } });
    expect(restored?.suspended).toBe(false);
  });

  it('lets an admin promote another user to admin', async () => {
    await signUpAs('user', 'promote-me@example.com');
    const admin = await signUpAs('admin', 'the-admin3@example.com');
    const target = (await admin.admin.listUsers()).find((u) => u.email === 'promote-me@example.com')!;

    const promoted = await admin.admin.updateUser({ userId: target.id, patch: { role: 'admin' } });
    expect(promoted?.role).toBe('admin');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test --workspace=server`
Expected: FAIL — `appRouter.admin is undefined`.

- [ ] **Step 3: Implement `server/src/routers/admin.ts`**

```ts
import { z } from 'zod';
import { adminProcedure, router } from '../trpc';
import { mapProfile } from '../mappers';

export const adminRouter = router({
  listUsers: adminProcedure.query(async ({ ctx }) => {
    const users = await ctx.db.user.findMany({ orderBy: { createdAt: 'asc' } });
    const results = await Promise.all(
      users.map(async (user) => {
        const [rgLimits, notifPrefs] = await Promise.all([
          ctx.db.rgLimits.findUnique({ where: { userId: user.id } }),
          ctx.db.notificationPrefs.findUnique({ where: { userId: user.id } }),
        ]);
        return mapProfile(user, rgLimits, notifPrefs);
      })
    );
    return results;
  }),

  updateUser: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        patch: z.object({
          suspended: z.boolean().optional(),
          role: z.enum(['user', 'admin']).optional(),
          bonusBalance: z.number().optional(),
        }),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.update({
        where: { id: input.userId },
        data: {
          suspended: input.patch.suspended,
          role: input.patch.role,
          bonusBalance: input.patch.bonusBalance,
        },
      });
      const [rgLimits, notifPrefs] = await Promise.all([
        ctx.db.rgLimits.findUnique({ where: { userId: user.id } }),
        ctx.db.notificationPrefs.findUnique({ where: { userId: user.id } }),
      ]);
      return mapProfile(user, rgLimits, notifPrefs);
    }),
});
```

- [ ] **Step 4: Wire into `_app.ts`**

```ts
import { adminRouter } from './admin';
// ...
export const appRouter = router({
  health: publicProcedure.query(() => ({ ok: true as const })),
  auth: authRouter,
  admin: adminRouter,
});
```

- [ ] **Step 5: Run the tests**

Run: `npm run test --workspace=server`
Expected: PASS — both `server/tests/auth.test.ts` and `server/tests/admin.test.ts` green.

- [ ] **Step 6: Commit**

```bash
git add server/src server/tests
git commit -m "feat(server): admin.listUsers and admin.updateUser"
```

---

### Task 9: Prisma seed script (demo accounts)

**Files:**
- Create: `server/prisma/seed.ts`

**Interfaces:**
- Produces: `admin@oddwave.demo` (id `u-admin`) and `fan@oddwave.demo` (id `u-fan`) rows, matching what `e2e/helpers.ts` and the app's own quick-login buttons expect.

- [ ] **Step 1: Write the seed script**

```ts
// server/prisma/seed.ts
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const db = new PrismaClient();

async function upsertDemo(
  id: string,
  email: string,
  password: string,
  fullName: string,
  phone: string,
  role: 'user' | 'admin',
  bonusBalance: number,
  claimedPromos: string[]
) {
  const passwordHash = await argon2.hash(password);
  await db.user.upsert({
    where: { email },
    update: {},
    create: {
      id,
      email,
      passwordHash,
      phone,
      fullName,
      role,
      bonusBalance,
      claimedPromos,
      rgLimits: { create: {} },
      notifPrefs: { create: {} },
    },
  });
}

async function main() {
  await upsertDemo('u-admin', 'admin@oddwave.demo', 'Admin123!', 'Control Room Admin', '+233200000001', 'admin', 0, []);
  await upsertDemo('u-fan', 'fan@oddwave.demo', 'Fan12345', 'Kwame Fan', '+233244567890', 'user', 25, ['welcome']);
  console.log('Seeded demo accounts: admin@oddwave.demo, fan@oddwave.demo');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
```

- [ ] **Step 2: Run it**

Run: `npm run db:seed --workspace=server`
Expected: `Seeded demo accounts: admin@oddwave.demo, fan@oddwave.demo`

- [ ] **Step 3: Verify against the live API**

Run (server already running from Task 3, Step 9):
```bash
curl -c cookies.txt -X POST http://localhost:4000/auth.signIn \
  -H 'content-type: application/json' \
  -d '{"email":"fan@oddwave.demo","password":"Fan12345"}'
```
Expected: JSON response with `result.data.profile.email` = `"fan@oddwave.demo"`.

- [ ] **Step 4: Commit**

```bash
git add server/prisma/seed.ts
git commit -m "feat(server): seed script for demo accounts"
```

---

### Task 10: Frontend tRPC client + provider wiring

**Files:**
- Create: `src/lib/trpc.ts`
- Modify: `src/main.tsx`
- Modify: `package.json` (root dependencies)

**Interfaces:**
- Consumes: `AppRouter` type from `server/src/routers/_app.ts` (Task 8).
- Produces: `trpc` (React Query-bound tRPC client) and `trpcClient` (raw client, for use outside React components), importable as `import { trpc, trpcClient } from '@/lib/trpc'`.

- [ ] **Step 1: Install frontend dependencies**

Run: `npm install @trpc/client@^11.0.0 @trpc/react-query@^11.0.0 @tanstack/react-query@^5.62.0`

- [ ] **Step 2: Create the client**

```ts
// src/lib/trpc.ts
import { createTRPCReact } from '@trpc/react-query';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../../server/src/routers/_app';

export const trpc = createTRPCReact<AppRouter>();

const linkOptions = {
  links: [httpBatchLink({ url: '/api', fetch: (input, init) => fetch(input, { ...init, credentials: 'include' }) })],
};

/** Raw client for use in Zustand stores, outside the React tree. */
export const trpcClient = createTRPCClient<AppRouter>(linkOptions);

export function trpcClientConfig() {
  return linkOptions;
}
```

`createHTTPServer` (the standalone adapter used in `server/src/index.ts`) mounts every procedure directly at
its own path off the server's root — `/health`, `/auth.signIn`, and so on — there is no `/trpc` prefix (that
convention only applies when tRPC is mounted as a sub-router of another framework, e.g. Express or Next.js,
which this isn't; Task 3 confirmed the real path with `curl http://localhost:4000/health`). So the proxy just
needs to strip the `/api` prefix the frontend uses and forward the rest as-is. Update `vite.config.ts`'s proxy
entry from Task 1 to add that rewrite:

```ts
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
```

- [ ] **Step 3: Wrap the app in providers**

Read `src/main.tsx` first to match its exact current structure, then wrap the existing root render with
`QueryClientProvider` and `trpc.Provider`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { trpc, trpcClientConfig } from '@/lib/trpc';

const queryClient = new QueryClient();
const trpcClientInstance = trpc.createClient(trpcClientConfig());

// Wrap whatever main.tsx currently renders (e.g. <App />) with:
// <trpc.Provider client={trpcClientInstance} queryClient={queryClient}>
//   <QueryClientProvider client={queryClient}>
//     <App />
//   </QueryClientProvider>
// </trpc.Provider>
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors. This is the first point where the frontend's TypeScript resolves types from `server/` — if
this fails with a module resolution error, confirm `server` migrations ran (Task 2) so `@prisma/client`'s
generated types exist, since `AppRouter`'s type transitively references them.

- [ ] **Step 5: Commit**

```bash
git add src/lib/trpc.ts src/main.tsx vite.config.ts package.json package-lock.json
git commit -m "feat: wire tRPC client and React Query provider into the frontend"
```

---

### Task 11: Rewrite `src/store/auth.ts` against the real backend

**Files:**
- Modify: `src/store/auth.ts` (full rewrite)
- Delete: `tests/authSessions.test.ts`

**Interfaces:**
- Consumes: `trpcClient` (Task 10).
- Produces: `useAuth` — same `AuthState` shape as today (see Global Constraints), so no other file changes.

- [ ] **Step 1: Delete the superseded client-side test**

The behavior it covered (localStorage-backed session registry) no longer exists — it's replaced by
`server/tests/auth.test.ts`'s "session management" suite from Task 6.

Run: `git rm tests/authSessions.test.ts`

- [ ] **Step 2: Rewrite `src/store/auth.ts`**

```ts
import { create } from 'zustand';
import type { DeviceSession, Profile } from '@/lib/types';
import { trpcClient } from '@/lib/trpc';

interface AuthState {
  profile: Profile | null;
  ready: boolean;
  init: () => Promise<void>;
  signUp: (email: string, password: string, phone: string, fullName: string) => Promise<{ error?: string; needsVerification?: boolean }>;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  updateProfile: (patch: Partial<Profile>) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<{ ok: boolean; resetCode?: string; error?: string }>;
  resetPassword: (email: string, code: string, newPassword: string) => Promise<{ error?: string }>;
  listProfiles: () => Promise<Profile[]>;
  adminUpdateUser: (userId: string, patch: Partial<Profile>) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ error?: string }>;
  listSessions: () => Promise<Array<DeviceSession & { current: boolean }>>;
  revokeSession: (sessionId: string) => Promise<{ signedOut: boolean }>;
  revokeOtherSessions: () => Promise<number>;
  requestVerification: (channel: 'email' | 'phone') => Promise<{ code: string }>;
  confirmVerification: (channel: 'email' | 'phone', code: string) => Promise<{ error?: string }>;
}

export const useAuth = create<AuthState>((set) => ({
  profile: null,
  ready: false,

  init: async () => {
    const profile = await trpcClient.auth.me.query();
    set({ profile, ready: true });
  },

  signUp: async (email, password, phone, fullName) => {
    const result = await trpcClient.auth.signUp.mutate({ email, password, phone, fullName });
    if (result.error) return { error: result.error };
    set({ profile: result.profile! });
    return {};
  },

  signIn: async (email, password) => {
    const result = await trpcClient.auth.signIn.mutate({ email, password });
    if (result.error) return { error: result.error };
    set({ profile: result.profile! });
    return {};
  },

  signOut: async () => {
    await trpcClient.auth.signOut.mutate();
    set({ profile: null });
  },

  updateProfile: async (patch) => {
    const profile = await trpcClient.auth.updateProfile.mutate(patch as never);
    set({ profile });
  },

  requestPasswordReset: (email) => trpcClient.auth.requestPasswordReset.mutate({ email }),

  resetPassword: (email, code, newPassword) => trpcClient.auth.resetPassword.mutate({ email, code, newPassword }),

  listProfiles: () => trpcClient.admin.listUsers.query(),

  adminUpdateUser: async (userId, patch) => {
    await trpcClient.admin.updateUser.mutate({ userId, patch: patch as never });
  },

  changePassword: (currentPassword, newPassword) => trpcClient.auth.changePassword.mutate({ currentPassword, newPassword }),

  listSessions: () => trpcClient.auth.listSessions.query(),

  revokeSession: async (sessionId) => {
    const result = await trpcClient.auth.revokeSession.mutate({ sessionId });
    if (result.signedOut) set({ profile: null });
    return result;
  },

  revokeOtherSessions: () => trpcClient.auth.revokeOtherSessions.mutate(),

  requestVerification: (channel) => trpcClient.auth.requestVerification.mutate({ channel }),

  confirmVerification: async (channel, code) => {
    const result = await trpcClient.auth.confirmVerification.mutate({ channel, code });
    if (!result.error) {
      const profile = await trpcClient.auth.me.query();
      set({ profile });
    }
    return result;
  },
}));
```

Note what's gone versus today's file: `hashPassword`, `seedDemoAccounts`, `ensureDemoPasswords`,
`describeDevice`, the whole `SessionRegistry`/`loadRegistry`/`saveRegistry` mechanism, and the `users` field
on `AuthState` — the client no longer holds any user record but its own. `findProfileById` is also gone; Task 12
replaces its one caller.

- [ ] **Step 3: Update call sites that used the removed `users`/sync return values**

Every caller of `listProfiles`, `revokeSession`, `revokeOtherSessions`, `updateProfile`, `adminUpdateUser`,
`requestVerification`, `confirmVerification` now awaits a `Promise` instead of getting a value back
synchronously. Search for each and adjust:

Run: `grep -rn "listProfiles()\|revokeSession(\|revokeOtherSessions()\|updateProfile(\|adminUpdateUser(\|requestVerification(\|confirmVerification(" src/screens`

For each match in `AuthScreen.tsx`, `SecurityScreen.tsx`, `AccountScreens.tsx`, `AdminOps.tsx`, `AdminOverview.tsx`:
if it's inside an already-`async` handler, prefix the call with `await`; if it's inside a synchronous handler,
mark that handler `async`. `AdminOps.tsx` and `AdminOverview.tsx` need a bigger change — Task 13 covers those
specifically since `listProfiles()` there is read inside a `useMemo`, which can't `await`.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: errors listing every remaining call site that needs the `await`/`async` treatment from Step 3 — fix
them one by one until this passes clean. (Task 13 handles `AdminOps.tsx`/`AdminOverview.tsx` separately, so
those two files are expected to still error out at the end of this task — that's fine.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: rewrite useAuth against the tRPC backend"
```

---

### Task 12: `notifs.push` takes explicit `notifPrefs`

**Files:**
- Modify: `src/store/notifs.ts`
- Modify: `src/store/wallet.ts`
- Modify: `src/store/bets.ts`
- Modify: `tests/notifs.test.ts`

**Interfaces:**
- Produces: `useNotifs.push(n: Omit<AppNotification, 'id'|'read'|'createdAt'> & {createdAt?: number}, notifPrefs: NotificationPrefs | null)` — `notifPrefs` is now a required second argument.
- Consumes: `trpcClient.auth.notifPrefsFor` (Task 7) for the one caller that doesn't already have the target
  user's profile in hand.

- [ ] **Step 1: Change `push`'s signature in `src/store/notifs.ts`**

```ts
import { create } from 'zustand';
import type { AppNotification, NotificationPrefs } from '@/lib/types';
import { loadJson, saveJson } from '@/lib/storage';
import { uid } from '@/lib/rng';

interface NotifsState {
  items: AppNotification[];
  push: (n: Omit<AppNotification, 'id' | 'read' | 'createdAt'> & { createdAt?: number }, notifPrefs: NotificationPrefs | null) => void;
  markAllRead: () => void;
  markRead: (id: string) => void;
  clear: (userId: string) => void;
  unreadFor: (userId: string) => number;
  itemsFor: (userId: string) => AppNotification[];
}

function prefKeyFor(kind: AppNotification['kind']): keyof NotificationPrefs | null {
  switch (kind) {
    case 'bet_placed':
    case 'bet_won':
    case 'bet_lost':
    case 'cashout':
      return 'betUpdates';
    case 'promo':
      return 'promotions';
    case 'live':
      return 'liveEvents';
    default:
      return null;
  }
}

export const useNotifs = create<NotifsState>((set, get) => ({
  items: loadJson<AppNotification[]>('notifs', []),

  push: (n, notifPrefs) => {
    const prefKey = prefKeyFor(n.kind);
    // No prefs on record (e.g. an unresolved lookup) fails open rather than
    // silently dropping a notification for a user we can't check.
    if (prefKey && notifPrefs && !notifPrefs[prefKey]) return;

    const item: AppNotification = {
      id: uid('n-'),
      userId: n.userId,
      kind: n.kind,
      title: n.title,
      body: n.body,
      link: n.link,
      read: false,
      createdAt: n.createdAt ?? Date.now(),
    };
    const next = [item, ...get().items];
    set({ items: next });
    saveJson('notifs', next);
  },

  markAllRead: () => {
    const next = get().items.map((i) => ({ ...i, read: true }));
    set({ items: next });
    saveJson('notifs', next);
  },
  markRead: (id) => {
    const next = get().items.map((i) => (i.id === id ? { ...i, read: true } : i));
    set({ items: next });
    saveJson('notifs', next);
  },
  clear: (userId) => {
    const next = get().items.filter((i) => i.userId !== userId);
    set({ items: next });
    saveJson('notifs', next);
  },
  unreadFor: (userId) => get().items.filter((i) => i.userId === userId && !i.read).length,
  itemsFor: (userId) => get().items.filter((i) => i.userId === userId),
}));
```

(This assumes `markAllRead`/`markRead`/`clear`/`unreadFor`/`itemsFor` bodies match what's already in the file —
read `src/store/notifs.ts` in full before this step and carry over any detail that differs from the reconstruction
above; only `push`'s signature and body are meant to change.)

- [ ] **Step 2: Update the 4 call sites in `src/store/bets.ts`**

All four already have the acting user's `profile` in scope (see the codebase excerpts below each). Add
`profile.notifPrefs` as the second argument to each:

- The `placeBet` success notification (`kind: 'bet_placed'`) — `profile` is the local variable already in
  scope from `useAuth.getState().profile` earlier in the function.
- The `cashOut` success notification (`kind: 'cashout'`) — `profile` is fetched via
  `const profile = useAuth.getState().profile;` immediately above.
- The two `settleOnMatchFinish` notifications (`kind: 'bet_won'` / `kind: 'bet_lost'`) — both are already
  gated behind `useAuth.getState().profile?.id === bet.userId`, so `useAuth.getState().profile!.notifPrefs`
  is safe (non-null) right there.

For each, change `useNotifs.getState().push({...})` / `notifs.push({...})` to
`useNotifs.getState().push({...}, profile.notifPrefs)` / `notifs.push({...}, useAuth.getState().profile!.notifPrefs)`
respectively, matching whichever local variable is in scope at that call site.

- [ ] **Step 3: Update `deposit` in `src/store/wallet.ts`**

`deposit` only receives a `userId`, not a full profile, so it needs `notifPrefs` threaded in as a new parameter
from its caller (the deposit screen always acts for the signed-in user, which already has `profile` on hand):

```ts
  deposit: (userId, amount, provider, notifPrefs) => {
    const txn: Txn = {
      id: uid('t-'),
      userId,
      type: 'deposit',
      amount: round2(amount),
      status: 'success',
      ref: `${provider.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`,
      createdAt: Date.now(),
    };
    push(userId, txn);
    useNotifs.getState().push(
      { userId, kind: 'deposit', title: 'Deposit successful', body: `${money(txn.amount)} added to your wallet · Ref ${txn.ref}` },
      notifPrefs
    );
    return txn;
  },
```

Update the `WalletState` interface's `deposit` signature to
`(userId: string, amount: number, provider: string, notifPrefs: import('@/lib/types').NotificationPrefs | null) => Txn`,
and find its call site (in the deposit screen) to pass `useAuth.getState().profile?.notifPrefs ?? null`.

Run: `grep -rn "\.deposit(" src/screens`

- [ ] **Step 4: Handle the withdrawal auto-approve sweep in `src/store/wallet.ts`**

This is the one caller with no profile in hand at all — it's a background `setInterval` sweep that can act on
any user's pending withdrawal, not just the currently signed-in one. Make the sweep callback `async` and fetch
prefs via the new `notifPrefsFor` query:

```ts
import { trpcClient } from '@/lib/trpc';
// ...
  const sweep = async () => {
    const state = useWallet.getState();
    const now = Date.now();
    for (const txn of state.pendingWithdrawals()) {
      if (now - txn.createdAt >= WITHDRAWAL_AUTO_APPROVE_MS) {
        state.resolveWithdrawal(txn.userId, txn.id, true);
        const notifPrefs = await trpcClient.auth.notifPrefsFor.query({ userId: txn.userId });
        useNotifs.getState().push(
          { userId: txn.userId, kind: 'withdrawal', title: 'Withdrawal approved', body: `${money(Math.abs(txn.amount))} sent via mobile money · Ref ${txn.ref}` },
          notifPrefs
        );
      }
    }
  };
```

- [ ] **Step 5: Rewrite `tests/notifs.test.ts` to not depend on `useAuth`**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NotificationPrefs } from '../src/lib/types';

function installLocalStorageMock(): void {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  });
}

const FAN_ID = 'u-fan';
const ADMIN_ID = 'u-admin';
const DEFAULT_PREFS: NotificationPrefs = { betUpdates: true, promotions: true, liveEvents: true };

async function freshNotifsStore() {
  installLocalStorageMock();
  vi.resetModules();
  const { useNotifs } = await import('../src/store/notifs');
  return useNotifs;
}

describe('notification preferences', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('delivers a bet-update notification when the toggle is on (the default)', async () => {
    const useNotifs = await freshNotifsStore();
    useNotifs.getState().push({ userId: FAN_ID, kind: 'bet_placed', title: 'Bet placed', body: 'x' }, DEFAULT_PREFS);
    expect(useNotifs.getState().itemsFor(FAN_ID)).toHaveLength(1);
  });

  it('suppresses bet-update notifications once the toggle is switched off', async () => {
    const useNotifs = await freshNotifsStore();
    const prefs: NotificationPrefs = { ...DEFAULT_PREFS, betUpdates: false };
    for (const kind of ['bet_placed', 'bet_won', 'bet_lost', 'cashout'] as const) {
      useNotifs.getState().push({ userId: FAN_ID, kind, title: 'x', body: 'x' }, prefs);
    }
    expect(useNotifs.getState().itemsFor(FAN_ID)).toHaveLength(0);
  });

  it('suppresses only promo notifications when promotions are off, leaving bet updates alone', async () => {
    const useNotifs = await freshNotifsStore();
    const prefs: NotificationPrefs = { ...DEFAULT_PREFS, promotions: false };
    useNotifs.getState().push({ userId: FAN_ID, kind: 'promo', title: 'Promo', body: 'x' }, prefs);
    useNotifs.getState().push({ userId: FAN_ID, kind: 'bet_won', title: 'Won', body: 'x' }, prefs);
    const items = useNotifs.getState().itemsFor(FAN_ID);
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('bet_won');
  });

  it('suppresses live-event notifications independently of the other two toggles', async () => {
    const useNotifs = await freshNotifsStore();
    const prefs: NotificationPrefs = { ...DEFAULT_PREFS, liveEvents: false };
    useNotifs.getState().push({ userId: FAN_ID, kind: 'live', title: 'Live', body: 'x' }, prefs);
    useNotifs.getState().push({ userId: FAN_ID, kind: 'promo', title: 'Promo', body: 'x' }, prefs);
    const items = useNotifs.getState().itemsFor(FAN_ID);
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('promo');
  });

  it('never suppresses wallet-movement or system notices — those have no toggle', async () => {
    const useNotifs = await freshNotifsStore();
    const prefs: NotificationPrefs = { betUpdates: false, promotions: false, liveEvents: false };
    useNotifs.getState().push({ userId: FAN_ID, kind: 'deposit', title: 'Deposit', body: 'x' }, prefs);
    useNotifs.getState().push({ userId: FAN_ID, kind: 'withdrawal', title: 'Withdrawal', body: 'x' }, prefs);
    useNotifs.getState().push({ userId: FAN_ID, kind: 'system', title: 'System', body: 'x' }, prefs);
    expect(useNotifs.getState().itemsFor(FAN_ID)).toHaveLength(3);
  });

  it('checks the recipient’s own prefs, not whoever passed them in', async () => {
    const useNotifs = await freshNotifsStore();
    const adminPrefsPromosOff: NotificationPrefs = { ...DEFAULT_PREFS, promotions: false };
    useNotifs.getState().push({ userId: ADMIN_ID, kind: 'promo', title: 'Promo', body: 'x' }, adminPrefsPromosOff);
    useNotifs.getState().push({ userId: FAN_ID, kind: 'promo', title: 'Promo', body: 'x' }, DEFAULT_PREFS);
    expect(useNotifs.getState().itemsFor(ADMIN_ID)).toHaveLength(0);
    expect(useNotifs.getState().itemsFor(FAN_ID)).toHaveLength(1);
  });
});
```

The deposit-notification regression test moves to a `wallet`-focused test (or is covered by the e2e suite,
which already asserts a deposit produces a notification via the real UI) — it depended on `useWallet.deposit`,
which is unrelated to what this file is meant to test now that `push` takes prefs directly.

- [ ] **Step 6: Run the unit tests**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: notifs.push takes explicit notifPrefs instead of looking them up"
```

---

### Task 13: `AdminOps.tsx` + `AdminOverview.tsx` on tRPC queries

**Files:**
- Modify: `src/screens/AdminOps.tsx`
- Modify: `src/screens/AdminOverview.tsx`

**Interfaces:**
- Consumes: `trpc.admin.listUsers.useQuery()`, `trpc.admin.updateUser.useMutation()` (Task 10's `trpc` React
  Query bindings).

- [ ] **Step 1: Read both files in full**

Both use `listProfiles`/`adminUpdateUser` from `useAuth` today (per the earlier `grep` in the design spec:
`AdminOps.tsx:108-109`, `AdminOps.tsx:201`, `AdminOverview.tsx:19`). Read the surrounding component code
before editing so the replacement fits each one's existing structure (loading states, empty states, etc.).

- [ ] **Step 2: Replace in `AdminOps.tsx`**

Wherever `const listProfiles = useAuth((s) => s.listProfiles); const profiles = useMemo(() => listProfiles(), [...])`
appears, replace with:

```tsx
const { data: profiles = [] } = trpc.admin.listUsers.useQuery();
```

Wherever `adminUpdateUser(p.id, { suspended: !p.suspended })` / `adminUpdateUser(p.id, { role: ... })` are
called, replace with a mutation that invalidates the list afterward:

```tsx
const utils = trpc.useUtils();
const updateUser = trpc.admin.updateUser.useMutation({
  onSuccess: () => utils.admin.listUsers.invalidate(),
});
// ...
onClick={() => updateUser.mutate({ userId: p.id, patch: { suspended: !p.suspended } })}
// ...
onClick={() => updateUser.mutate({ userId: p.id, patch: { role: p.role === 'admin' ? 'user' : 'admin' } })}
```

Add `import { trpc } from '@/lib/trpc';` at the top; remove the now-unused `useAuth` import if nothing else
in the file needs it (check before removing).

- [ ] **Step 3: Replace in `AdminOverview.tsx`**

```tsx
const { data: profiles = [] } = trpc.admin.listUsers.useQuery();
// ...
users: profiles.length,
```

Add `import { trpc } from '@/lib/trpc';`; remove the `useAuth` import for `listProfiles` if unused elsewhere
in the file.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors — this should also clear any remaining errors left over from Task 11, Step 4.

- [ ] **Step 5: Commit**

```bash
git add src/screens/AdminOps.tsx src/screens/AdminOverview.tsx
git commit -m "refactor: AdminOps/AdminOverview read users via trpc.admin.listUsers"
```

---

### Task 14: Integration — Playwright wiring, e2e fixes, full suite green

**Files:**
- Modify: `playwright.config.ts`
- Modify: `e2e/security.spec.ts` (2 tests)

**Interfaces:**
- Consumes: everything from Tasks 1–13.

- [ ] **Step 1: Boot the server alongside the frontend in Playwright**

`playwright.config.ts`'s `webServer` currently starts one process (`npm run dev`). Change it to an array
starting both:

```ts
  webServer: [
    {
      command: 'npm run dev --workspace=server',
      url: 'http://localhost:4000/health',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'npm run dev',
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
```

- [ ] **Step 2: Point Playwright's test database at a separate Neon branch (or database)**

Running the e2e suite against the same database as manual dev testing would leave stale demo-account state
(sessions, changed passwords) between runs. Create a second Neon database (Neon's free tier supports database
branching for exactly this), and add a `server/.env.test` with its `DATABASE_URL`. Add a `pretest:e2e` script
to the root `package.json`:

```json
    "pretest:e2e": "dotenv -e server/.env.test -- npm run db:migrate --workspace=server && dotenv -e server/.env.test -- npm run db:seed --workspace=server",
    "test:e2e": "dotenv -e server/.env.test -- playwright test"
```

Run: `npm install dotenv-cli --save-dev`

- [ ] **Step 3: Rewrite the two localStorage-injection tests in `e2e/security.spec.ts`**

These simulated "another device" by writing directly into `localStorage`'s session registry — a mechanism
that no longer exists. A real second device is now a second authenticated browser context sharing nothing but
the account credentials:

```ts
// "lists another device and revokes only that one"
test('lists another device and revokes only that one', async ({ page, browser }) => {
  await signIn(page);

  // A second device is a second browser context with its own cookie jar,
  // signed in to the same account — exactly how a real second device behaves.
  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();
  await signIn(otherPage);

  await page.goto('/account/security');
  await page.reload();
  await expect(page.getByRole('button', { name: /^Revoke session/ })).toHaveCount(2);
  await expect(page.getByText('This device')).toHaveCount(1);

  await page.getByRole('button', { name: /Sign out other devices/ }).click();
  await expect(page.getByText(/1 other session revoked/)).toBeVisible();
  await expect(page.getByRole('button', { name: /^Revoke session/ })).toHaveCount(1);

  // Revoking someone else's session must not sign this device out.
  await page.goto('/bets');
  await expect(page).not.toHaveURL(/\/auth/);

  // The other device really is signed out now.
  await otherPage.goto('/bets');
  await expect(otherPage).toHaveURL(/\/auth/);
  await otherContext.close();
});

// "a revoked session no longer restores on reload"
test('a revoked session no longer restores on reload', async ({ page, browser }) => {
  await signIn(page);

  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();
  await signIn(otherPage);
  await otherPage.goto('/account/security');
  // Revoke every other session from the second device's own view of itself —
  // i.e. revoke the *first* page's session from here.
  await otherPage.getByRole('button', { name: /Sign out other devices/ }).click();

  await page.goto('/bets');
  await expect(page).toHaveURL(/\/auth/);
  await otherContext.close();
});
```

Read the surrounding file first — these replacements assume the existing `test.describe` block and the
`getByText('Safari on iOS')` assertions were only there to sanity-check the fake injected device's label,
which no longer applies now that the "other device" is a real second sign-in; drop assertions that were
specifically about the fake device's hardcoded label.

- [ ] **Step 4: Run the full suite**

Run: `npm run test` (unit)
Expected: PASS.

Run: `npm run test --workspace=server` (server unit)
Expected: PASS.

Run: `npm run test:e2e -- --project=mobile` (e2e, from Step 2's script)
Expected: PASS — including `e2e/auth.spec.ts` and all of `e2e/security.spec.ts`.

- [ ] **Step 5: Typecheck and build**

Run: `npm run typecheck`
Run: `npm run build`
Expected: both succeed.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "test: run e2e against the real backend; fix device-session tests for real sessions"
```

---

## Self-Review Notes

- **Spec coverage:** every method on the spec's approved `auth` router (§API surface) has a task —
  `signUp`/`signIn` (4), `signOut`/`me`/`updateProfile` (5), `changePassword`/session management (6). The two
  items the spec called "stub" (`requestVerification`/`confirmVerification`) turned out to already be
  self-contained code flows with no external dependency, so Task 7 implements them for real rather than
  stubbing — this is a strict improvement on the spec, not a scope change, since it costs nothing extra beyond
  what a stub would have needed anyway (a `VerificationCode` table either way).
- **Scope added beyond the original spec, by explicit decision:** `admin.listUsers`/`admin.updateUser`
  (Task 8) and the `notifs.push` signature change (Task 12) — both agreed via the "include both now" choice
  made before writing this plan, since the spec's promise that "no screen changes" is only true if these are
  handled.
- **Type consistency check:** `mapProfile`'s return type is used identically in `auth.ts` (Task 4) and
  `admin.ts` (Task 8); `SessionData` (Task 3) is the type threaded through every `callerWithSession` helper in
  every test file; `NotificationPrefs` (Task 12) matches the shape already defined in `src/lib/types.ts` with
  no new fields.
- **Deferred, not forgotten:** deploying the server anywhere, rate limiting on `signIn`, and real email/SMS
  delivery of the verification/reset codes (today, and after this plan, the code is simply returned to the
  caller — fine for a demo, not for production) are unchanged from the spec's "explicitly out of scope" list.

---

Plan complete and saved to `docs/superpowers/plans/2026-08-24-phase1a-backend-auth.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
