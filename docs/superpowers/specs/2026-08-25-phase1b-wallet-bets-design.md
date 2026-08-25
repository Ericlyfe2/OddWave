# Phase 1b: Wallet ledger + bets + settlement server-side

Status: approved, ready for implementation planning
Parent: [OddWave Go-Live Roadmap](https://claude.ai/code/artifact/7b16deff-ec32-4f09-8498-02785ef9f2cd), Phase 1 (Real backend foundation)
Scope: second of three sub-slices. [1a (backend scaffold + auth)](2026-08-24-phase1a-backend-auth-design.md)
shipped auth server-side. Admin bet/promo *content* management is a separate spec (1c), built after
this one lands.

## Why this is its own slice

1a proved the pattern (tRPC + Prisma + Postgres) and gave every later slice `userId` to key off.
Wallet and bets are the next independent piece: everything downstream of "does this user have
money and open bets" (settlement, cash-out, admin voiding, responsible-gaming loss limits) depends
on this data being real and server-authoritative, not a `localStorage` object any browser tab can
edit. Promo *campaign content* (`usePromotions`) is a genuinely separate, unrelated data model —
it moves to 1c untouched.

## Current state

`src/store/wallet.ts` and `src/store/bets.ts` are the entire "backend" for money and bets: a
`Record<userId, Txn[]>` and a `Bet[]` array, both in `localStorage`, both directly mutable by
anyone with devtools. `src/lib/betsMath.ts`, `src/lib/settlement.ts`, and `src/lib/cashout.ts` hold
the actual payout/settlement math, but `settlement.ts` and `cashout.ts` import `outcomeResult` and
match state from `src/lib/liveEngine.ts` — a stateful, browser-only singleton (timers, per-tab
seeded RNG) that has no server-side equivalent and isn't in scope to build one (that's Phase 3's
real odds feed). The client-side withdrawal auto-approve sweep
(`startWithdrawalAutoApprover` in `wallet.ts`) runs as a `setInterval` in whichever browser tab
happens to be open, resolving *any* user's pending withdrawal it finds — a shortcut that only
worked because all users' data lived in one shared `localStorage`.

## Goal

Move the wallet ledger and every action that touches `Bet`/`Txn` records — placing a bet, cashing
out, settling on match finish, and admin voiding — server-side. Deposits and withdrawals stay
*simulated*: no real MoMo/card call happens (that's Phase 2), but the transaction records
themselves become server-authoritative rather than client-invented. The server does not yet have
its own source of truth for live odds or match results; it trusts client-reported match state for
placement, cash-out, and settlement, the same way `liveEngine.ts` already computes it today. This
is a documented, temporary trust gap — closed by Phase 3's real feed, and must be revisited before
Phase 4 (compliance/security hardening) signs off. `src/store/wallet.ts` and `src/store/bets.ts`
keep their current Zustand shape and derived selectors (`balanceOf`, `lockedOf`,
`pendingWithdrawals`); screens and existing e2e coverage (`booking-and-wallet.spec.ts`,
`betting.spec.ts`, `admin-bets.spec.ts`, `bet-builder.spec.ts`) should not need to change.

## Architecture

```
server/src/
├── routers/
│   ├── _app.ts          (adds wallet, bets)
│   ├── wallet.ts         (new)
│   └── bets.ts            (new)
└── lib/                  (new — server-safe copies/imports of shared pure math)
    └── config.ts         (LIMITS, WITHDRAWAL_AUTO_APPROVE_MS — localized, see below)

src/lib/
├── outcomes.ts            (new — outcomeResult, moved out of liveEngine.ts)
├── liveEngine.ts          (drops outcomeResult; only settlement.ts and its test import it today)
├── betsMath.ts            (LIMITS import switched to a parameter, not a module-level constant)
├── settlement.ts          (imports outcomes.ts instead of liveEngine.ts)
└── cashout.ts              (cashoutValue takes match snapshots as a parameter, not liveEngine.get())
```

**Shared math, not duplicated math.** `outcomeResult`, `settleBetAgainstMatch`, `cashoutValue`, and
`validateStake`/`potentialFor` are pure functions once decoupled from `liveEngine.ts`'s singleton
and `config.ts`'s `import.meta.env`-touching `LIMITS`. The server imports these same files directly
from `server/src/routers/bets.ts` (relative import across the workspace boundary, exactly like
`server/src/mappers.ts` already imports types from `src/lib/types.ts`). This is the one point of
this spec most likely to hit friction — see Risks below — but it's the only way settlement math
can't drift between what the client shows and what the server pays out.

## Data model (`server/prisma/schema.prisma` additions)

Mirrors `Txn` / `Bet` / `BetLeg` in `src/lib/types.ts` field-for-field. Enum-like fields stay plain
strings validated by zod at the API boundary — matching `VerificationCode.purpose`'s existing
pattern, not a new Prisma enum, since `TxnType`/`TxnStatus`/`BetType`/`BetStatus` are plain TS
unions on the client today.

```prisma
model Txn {
  id         String    @id @default(cuid())
  userId     String
  user       User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  type       String    // deposit | withdrawal | stake | payout | cashout | bonus | refund | adjustment
  amount     Decimal   @db.Decimal(12, 2)
  status     String    // pending | success | failed
  ref        String
  meta       Json?
  createdAt  DateTime  @default(now())
  resolvedAt DateTime?

  @@index([userId, createdAt])
}

model Bet {
  id             String    @id @default(cuid())
  userId         String
  user           User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  bookingCode    String
  type           String    // single | multi | system | builder
  stake          Decimal   @db.Decimal(12, 2)
  totalOdds      Decimal   @db.Decimal(10, 3)
  potential      Decimal   @db.Decimal(12, 2)
  comboCount     Int?
  systemConfig   Json?
  legs           Json      // BetLeg[]
  status         String    // open | won | lost | cashed_out | void
  payout         Decimal?  @db.Decimal(12, 2)
  cashoutAmount  Decimal?  @db.Decimal(12, 2)
  cashoutHistory Json?
  usedBonus      Decimal   @default(0) @db.Decimal(12, 2)
  placedAt       DateTime  @default(now())
  settledAt      DateTime?

  @@index([userId, placedAt])
  @@index([bookingCode])
}
```

`User.bonusBalance` already exists (1a). `settle` and `voidBet` filter open bets against the
`legs` JSON in application code (fetch all `status: 'open'` bets, filter in JS for
`legs.some(l => l.matchId === matchId)`) rather than a raw jsonb containment query — simpler, and
correct at the bet volumes this phase will ever see in dev/staging.

## API surface

### `wallet` router

- `deposit(amount, provider)` → creates a `Txn` (`type: deposit`, `status: success`) — no real
  payment call, matching today's simulated instant-success deposit.
- `requestWithdrawal(amount, momoNumber)` → validates available balance (`balanceOf - lockedOf`,
  computed server-side from the caller's own `Txn` history) before creating a `Txn`
  (`type: withdrawal`, `status: pending`, `momoNumber` in `meta`).
- `listTxns()` (query) → the caller's own `Txn` history, newest first.
- `resolveWithdrawal(txnId, approve)` (adminProcedure) → manual override matching today's
  `adminAdjust`-adjacent admin action; on reject, creates the refund `Txn` the same way
  `wallet.ts`'s `resolveWithdrawal` does today.
- `adminAdjust(userId, amount, reason)` (adminProcedure) → creates an `adjustment` `Txn` on the
  target user.

**Withdrawal auto-approve sweep** moves into `server/src/index.ts` as a `setInterval`, checking
every 15s for `pending` withdrawals older than `WITHDRAWAL_AUTO_APPROVE_MS` (localized to a server
constant, same pattern as 1a's `SESSION_DAYS`) and resolving them — the server, not a browser tab,
now owns the pending-withdrawal queue, so this can't stay client-triggered.

### `bets` router

- `place(type, stakePerCombo, legs, systemPicks?, useBonus?)` → re-runs every validation
  `bets.ts#placeBet` does today (leg-shape checks, `validateStake`, per-type structural rules,
  loss-limit check against the caller's own `Txn` history, balance check) using the shared pure
  functions, then creates the `Bet` row(s) + stake `Txn` + bonus debit in one Prisma
  `$transaction` — money movement is atomic, not three sequential client calls.
- `listBets()` (query) → the caller's own bets, newest first.
- `cashOut(betId, portion)` → takes the client's current match snapshot(s) for every open leg
  (per the trust-gap decision above), recomputes `cashoutValue` server-side, updates the `Bet` and
  creates the `cashout` `Txn` in one transaction.
- `settle(matchId, finalSnapshot)` → runs `settleBetAgainstMatch` against every open bet
  referencing `matchId`, updates status/payout, creates `payout` `Txn`s for winners. Triggered by
  the client's `liveEngine` detecting a match finish, same trigger point as today's
  `settleOnMatchFinish`.
- `voidBet(betId, reason)` (adminProcedure) → sets `status: void`, refunds `stake - usedBonus` via
  a `refund` `Txn`. Included in 1b (not deferred to 1c) because it mutates the same `Bet` table
  everything else in this router owns, and `admin-bets.spec.ts` already exercises it end-to-end.

## Frontend integration

`src/store/wallet.ts` and `src/store/bets.ts` are rewritten to call `trpcClient.wallet.*` /
`trpcClient.bets.*` instead of reading/writing `localStorage`, following the exact pattern 1a
established for `useAuth`. The Zustand shape (every field and method on `WalletState`/`BetsState`)
stays identical — `balanceOf`, `lockedOf`, `pendingWithdrawals`, `userTxns` keep computing from a
`txns` array in state, just one that's hydrated from `listTxns()` instead of `loadJson`. What's
deleted: `saveJson`/`loadJson` calls in both stores, and the client-side
`startWithdrawalAutoApprover`. What's added: a `React Query`-backed hydration of `txns`/`bets` on
sign-in (mirroring `useAuth.init()`), and re-fetching after each mutation (or optimistic local
append, matching today's `set()`-then-`persist()` pattern, reconciled against the mutation's
response).

## Testing

- **Server:** Vitest tests for every `wallet` and `bets` procedure against the real (dev) Postgres
  database, following 1a's `server/vitest.config.ts` conventions (`fileParallelism: false`,
  30s timeout). Specifically covers: balance/loss-limit enforcement, atomicity of `place` (a
  failed bonus debit or stake `Txn` must not leave a half-created `Bet`), and `settle` correctly
  ignoring bets for other matches.
- **E2E:** no `playwright.config.ts` changes needed (server is already in the `webServer` array
  from 1a). Existing specs (`betting.spec.ts`, `booking-and-wallet.spec.ts`, `bet-builder.spec.ts`,
  `admin-bets.spec.ts`) should pass largely unmodified against the real backend; any breakage
  surfaces exactly where client and server behavior diverge, which is the point.
- **Unit:** `tests/betsMath.test.ts`, `tests/settlement.test.ts` keep testing the now-shared pure
  functions directly (no change — they never touched `localStorage`). `tests/slip.test.ts` and any
  test asserting against `wallet.ts`/`bets.ts`'s Zustand store directly get updated to mock
  `trpcClient` instead of relying on real store mutation.

## Risks

- **Server importing client `src/lib/*` files.** 1a hit this exact problem once already
  (`SESSION_DAYS` via `src/lib/config.ts` crashed the server under plain `tsx`, because
  `import.meta.env` doesn't exist outside Vite/Vitest). This spec avoids repeating it by
  localizing every `config.ts` constant the shared math needs (`LIMITS`,
  `WITHDRAWAL_AUTO_APPROVE_MS`) as server-local copies, and by decoupling `settlement.ts`/
  `cashout.ts` from `liveEngine.ts`'s singleton — but every shared file needs to be re-checked for
  this class of import before assuming it's safe.
- **Trust gap is real, not just documented.** Until Phase 3, a client can report favorable fake
  odds or fabricate a match finish. Acceptable for a pre-launch, no-real-money phase; the plan
  should note this explicitly in a Global Constraint so no later task quietly treats client-
  reported match state as trustworthy.

## Explicitly out of scope for 1b

- Real payment processor integration (MoMo/Paystack/Flutterwave) — Phase 2
- The live odds/match engine itself becoming server-authoritative — Phase 3
- Promo campaign content management (`usePromotions`, admin promo screens) — 1c, unrelated data
  model
- Rate limiting / anti-fraud on bet placement — Phase 4
- Deploying the server anywhere — still local development only, per 1a
