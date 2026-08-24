# Phase 1a: Backend scaffold + auth

Status: approved, ready for implementation planning
Parent: [OddWave Go-Live Roadmap](https://claude.ai/code/artifact/7b16deff-ec32-4f09-8498-02785ef9f2cd), Phase 1 (Real backend foundation)
Scope: first of three sub-slices — wallet (1b) and bets/settlement (1c) are separate specs, built after this one lands.

## Why this is its own slice

Phase 1 in the roadmap bundles auth, wallet, and bets into "make the backend real." That's three
independent pieces of work that happen to share one database. Auth has to come first regardless —
wallet and bets both key everything off `userId` — so it gets built and proven on its own before
anything else depends on it.

## Current state

Today `src/store/auth.ts` *is* the backend: it hashes passwords with WebCrypto, stores a
`Record<email, StoredUser>` in `localStorage`, and "sessions" are just a `DeviceSession` array in
the same store. Anyone with devtools can read every password hash, forge a session, or promote
themselves to `role: 'admin'`. Two demo accounts (`fan@oddwave.demo` / `admin@oddwave.demo`) are
seeded on boot (`seedDemoAccounts()`) and used by the app's own quick-login buttons in
`AuthScreen.tsx` and by `e2e/helpers.ts#signIn`.

## Goal

Move authentication server-side without changing anything the rest of the app sees. `useAuth`
keeps its current Zustand shape; `AuthScreen.tsx`, `SecurityScreen.tsx`, `AccountScreens.tsx`, and
`e2e/auth.spec.ts` / `e2e/security.spec.ts` should not need to change.

## Architecture

```
SPORTY/                        (repo root — unchanged, frontend stays here)
├── package.json                + "workspaces": ["server"]
├── src/...                     (unchanged)
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.ts             (creates the two demo accounts)
│   └── src/
│       ├── index.ts            (HTTP entrypoint)
│       ├── context.ts          (per-request context: db client, session)
│       ├── session.ts          (iron-session config + helpers)
│       └── routers/
│           ├── _app.ts         (root router)
│           └── auth.ts
```

The frontend imports `AppRouter`'s *type* directly from `server/src/routers/_app.ts` — no build
step, no code generation. The npm workspace makes `server` a sibling package `node_modules` can
resolve, and TypeScript resolves the relative import for the type-only reference.

**Dev wiring:** `vite.config.ts` gets a `server.proxy` entry forwarding `/api` to
`http://localhost:4000`, so in development the browser sees the API as same-origin — no CORS
configuration needed, and the session cookie just works.

## Stack

| Concern | Choice | Why |
|---|---|---|
| Server framework | `@trpc/server`, standalone adapter | End-to-end types with the existing TS frontend, no separate client SDK to hand-write |
| Database | PostgreSQL on Neon (free tier) | User creates the project; matches most Ghanaian hosting options for later phases |
| ORM | Prisma | Schema file doubles as living documentation; migration tooling is the most approachable |
| Password hashing | `argon2` (argon2id) | Current best practice, memory-hard, no known practical attacks |
| Sessions | `iron-session` (encrypted, stateless cookie) | No session store (Redis) needed yet; the cookie *is* the session, sealed with a server secret |

## Data model (`server/prisma/schema.prisma`)

Mirrors `Profile` / `RGLimits` / `NotificationPrefs` / `DeviceSession` in `src/lib/types.ts`
closely enough that mapping between them is mechanical:

```prisma
model User {
  id             String   @id @default(cuid())
  email          String   @unique
  passwordHash   String
  phone          String
  fullName       String
  role           Role     @default(user)
  createdAt      DateTime @default(now())
  bonusBalance   Decimal  @default(0) @db.Decimal(12, 2)
  suspended      Boolean  @default(false)
  emailVerified  Boolean  @default(false)
  phoneVerified  Boolean  @default(false)
  claimedPromos  String[] @default([])

  rgLimits       RgLimits?
  notifPrefs     NotificationPrefs?
  sessions       DeviceSession[]
}

model RgLimits {
  userId              String    @id
  user                User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  depositLimit        Decimal?  @db.Decimal(12, 2)
  lossLimit           Decimal?  @db.Decimal(12, 2)
  sessionReminderMin  Int?
  selfExcludedUntil   DateTime?
}

model NotificationPrefs {
  userId        String  @id
  user          User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  betUpdates    Boolean @default(true)
  promotions    Boolean @default(true)
  liveEvents    Boolean @default(true)
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

enum Role {
  user
  admin
}
```

`claimedPromos` stays a plain string array here — promotions themselves are out of scope for this
slice and already work independently client-side.

## API surface (`auth` tRPC router)

Matches the seven methods `useAuth` already exposes, so the store rewrite is a like-for-like swap:

- `signUp(email, password, phone, fullName)` → creates `User` + `RgLimits` + `NotificationPrefs` +
  a `DeviceSession`, sets the session cookie, returns the `Profile`
- `signIn(email, password)` → verifies the argon2 hash, creates a `DeviceSession`, sets the cookie.
  `DeviceSession.device` is parsed server-side from the request's `User-Agent` header (replacing
  today's client-side `describeDevice()`), since the server — not the browser — is now the one
  creating the record.
- `signOut()` → deletes the current `DeviceSession`, clears the cookie
- `me` (query) → returns the `Profile` for the current session, or `null`
- `updateProfile(patch)` → partial update, admin-only fields (`role`, `suspended`) rejected unless
  the caller is already an admin
- `changePassword(currentPassword, newPassword)` → re-verifies current hash before replacing it
- `listSessions()` → all non-expired `DeviceSession`s for the current user, flagged with
  `current: boolean`
- `revokeSession(sessionId)` → deletes a `DeviceSession`; if it's the caller's own current session,
  the response tells the frontend to also clear local state and redirect to `/auth` (matching
  today's `revokeSession` behavior in `auth.ts`)

Email/phone verification (`verifyContact`) stays a client-side-only stub for this slice, same as
it effectively is today — it's not blocking and needs a real SMS/email provider, which belongs in
its own later slice.

## Frontend integration

`src/store/auth.ts` is rewritten to call the tRPC client (`src/lib/trpc.ts`, new) instead of
reading/writing `localStorage` for user records. The **shape** of `useAuth` (every field and
method on the `AuthState` interface) stays identical, so no screen changes. What's deleted:
`hashPassword`, `seedDemoAccounts`'s in-browser user table, and the `localStorage`-backed
`SessionRegistry`. What's added: a `React Query`-backed `me` query that hydrates `profile` on
boot, replacing today's "restore session from localStorage" logic.

The two demo accounts move to `server/prisma/seed.ts`, run once against the Neon database, so
`e2e/helpers.ts#signIn` keeps working unmodified.

## Testing

- **Server:** Vitest tests for each `auth` router procedure, against a real (test) Postgres
  database — Prisma's migration + seed scripts make this cheap to reset between runs.
- **E2E:** `playwright.config.ts`'s `webServer` gains a second entry that boots `server/` alongside
  `npm run dev`, so `e2e/auth.spec.ts` and `e2e/security.spec.ts` run unchanged against the real
  backend instead of the simulation.
- **Unit:** existing `tests/authSessions.test.ts` covers logic that's moving server-side; it gets
  deleted in favor of the new server-side Vitest coverage rather than kept as dead client tests.

## Explicitly out of scope for 1a

- Wallet, bets, settlement, admin bet/promo management — separate specs (1b, 1c)
- Real email/SMS verification — stays a stub
- Rate limiting / brute-force protection on `signIn` — flagged for Phase 4 (Compliance & security
  hardening) in the roadmap, not blocking this slice
- Deploying the server anywhere — this spec covers local development only; a hosting target
  (Railway/Render/Fly) is a Phase 5 concern

## Open dependency

**You need to create a free Neon Postgres project** at neon.tech and provide the connection string
for `server/.env` (gitignored). Everything else in this spec can be scaffolded without it, but
migrations and the seed script need a real database to run against.
