# Phase 1b: Wallet ledger + bets + settlement server-side Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the wallet ledger, bet placement/validation, cash-out, settlement, and admin bet
voiding server-side (Postgres/tRPC), following the pattern Phase 1a established for auth.

**Architecture:** Two new tRPC routers (`wallet`, `bets`) backed by two new Prisma models (`Txn`,
`Bet`). The payout/settlement math that already exists client-side (`src/lib/betsMath.ts`,
`src/lib/settlement.ts`, `src/lib/cashout.ts`) is decoupled from its browser-only dependencies
(`import.meta.env`-touching `config.ts`, the stateful `liveEngine` singleton) so the server can
import the *same* pure functions instead of re-implementing them — this is the one property this
plan protects most carefully, since a second hand-written copy of payout math is how it drifts.
`src/store/wallet.ts` and `src/store/bets.ts` are rewritten to call the new routers instead of
`localStorage`, keeping their exact current Zustand shape.

**Tech Stack:** tRPC v11, Prisma 6, PostgreSQL (Neon), zod, Vitest, Playwright — all already in
place from Phase 1a.

## Global Constraints

- The server trusts client-reported match/odds/status state for bet placement, cash-out, and
  settlement — there is no server-side odds feed yet (that's Phase 3). This is a documented,
  temporary trust gap, not a bug to "fix" within this plan.
- Deposits and withdrawals stay simulated: creating a `Txn` row is real, calling an actual payment
  processor is not (Phase 2).
- `TxnType`/`TxnStatus`/`BetType`/`BetStatus` are stored as plain strings on `Txn`/`Bet`, validated
  by zod at the API boundary — not Prisma enums, matching `VerificationCode.purpose`'s existing
  pattern.
- No file under `src/lib/` that the server imports may touch `import.meta.env` or the `liveEngine`
  singleton's mutable state (timers, `Map` of live matches) — both classes of bug already crashed
  the server once in Phase 1a. Every task below that touches a shared file must confirm this before
  marking the task done.
- `server/vitest.config.ts` conventions apply to every new test file: `fileParallelism: false`,
  30s timeout, tests run against the real dev Postgres database.
- Every money-moving mutation (`bets.place`, `bets.cashOut`, `bets.voidBet`,
  `wallet.resolveWithdrawal` on reject) writes its `Bet`/`Txn` rows inside one Prisma
  `$transaction` — never as sequential awaited calls that could leave a half-applied state if one
  fails partway.
- Reseed demo accounts (`npm run db:seed --workspace=server`) after running server unit tests and
  before any e2e run — server tests' `beforeEach` truncates shared tables (established in Phase
  1a, applies unchanged here).

---

### Task 1: Extract `outcomeResult` out of `liveEngine.ts`

**Files:**
- Create: `src/lib/outcomes.ts`
- Modify: `src/lib/liveEngine.ts` (remove `outcomeResult`)
- Modify: `src/lib/settlement.ts:3` (import path)
- Modify: `tests/settlement.test.ts:2` (import path)

**Interfaces:**
- Produces: `outcomeResult(match: MatchOutcomeInput, marketKey: string, code: string): 'won' | 'lost' | 'void'`
  from `src/lib/outcomes.ts`, structurally typed so both the full client `Match` and a minimal
  server-parsed object satisfy it.

`outcomeResult` only ever reads `match.score` — it doesn't need the rest of `Match`, and keeping it
in `liveEngine.ts` means importing it drags in that file's stateful singleton
(`export const liveEngine = new LiveEngine()`), which is unsafe to import server-side even though
merely importing it doesn't itself start any timer.

- [ ] **Step 1: Write the failing test for the new import path**

Edit `tests/settlement.test.ts:2`:

```ts
import { outcomeResult } from '../src/lib/outcomes';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- --run tests/settlement.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/outcomes'`

- [ ] **Step 3: Create `src/lib/outcomes.ts`**

Move the entire `outcomeResult` function (currently the last export in `src/lib/liveEngine.ts`)
into this new file verbatim, but replace its `match: Match` parameter type with a minimal
structural interface:

```ts
export interface MatchOutcomeInput {
  score?: { home: number; away: number };
}

export function outcomeResult(match: MatchOutcomeInput, marketKey: string, code: string): 'won' | 'lost' | 'void' {
  const s = match.score ?? { home: 0, away: 0 };
  switch (marketKey) {
    case '1x2':
      if (s.home > s.away) return code === '1' ? 'won' : 'lost';
      if (s.home < s.away) return code === '2' ? 'won' : 'lost';
      return code === 'X' ? 'won' : 'lost';
    case 'moneyline': {
      if (code === '1') return s.home >= s.away ? 'won' : 'lost';
      return s.away >= s.home ? 'won' : 'lost';
    }
    case 'dc':
      if (code === '1X') return s.home >= s.away ? 'won' : 'lost';
      if (code === 'X2') return s.away >= s.home ? 'won' : 'lost';
      return s.home > s.away || s.away > s.home ? 'won' : 'lost';
    case 'ou':
      if (code.startsWith('over')) return s.home + s.away > 2.5 ? 'won' : s.home + s.away === 2.5 ? 'void' : 'lost';
      return s.home + s.away < 2.5 ? 'won' : s.home + s.away === 2.5 ? 'void' : 'lost';
    case 'btts':
      if (code === 'btts_yes') return s.home > 0 && s.away > 0 ? 'won' : 'lost';
      return s.home === 0 || s.away === 0 ? 'won' : 'lost';
    case 'hcp': {
      if (code === 'hcp_1') return s.home - 1 > s.away ? 'won' : s.home - 1 === s.away ? 'void' : 'lost';
      if (code === 'hcp_2') return s.away + 1 > s.home ? 'won' : s.away + 1 === s.home ? 'void' : 'lost';
      return 'void';
    }
    case 'setwinner':
      return code === '2-0' ? 'won' : 'lost';
    default:
      return 'void';
  }
}
```

Remove the same function (and its now-unused `export`) from the end of `src/lib/liveEngine.ts`.

- [ ] **Step 4: Update `src/lib/settlement.ts`'s import**

Change line 3 from `import { outcomeResult } from './liveEngine';` to
`import { outcomeResult } from './outcomes';`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test -- --run`
Expected: PASS, all suites (this is a pure rename/move — no behavior change)

- [ ] **Step 6: Commit**

```bash
git add src/lib/outcomes.ts src/lib/liveEngine.ts src/lib/settlement.ts tests/settlement.test.ts
git commit -m "refactor: extract outcomeResult out of liveEngine.ts into a pure module"
```

---

### Task 2: Extract `LIMITS` out of `config.ts`

**Files:**
- Create: `src/lib/limits.ts`
- Modify: `src/lib/config.ts` (re-export `LIMITS` for existing importers)
- Modify: `src/lib/betsMath.ts:1` (import path)
- Modify: `tests/betsMath.test.ts:11` (import path)

**Interfaces:**
- Produces: `LIMITS` (same shape as today) from `src/lib/limits.ts`, importable without touching
  `import.meta.env`.

`config.ts` reads `import.meta.env.VITE_*` at module scope — that's what crashed the server under
plain `tsx` in Phase 1a (`SESSION_DAYS`). `LIMITS` itself is a plain object with no env dependency;
moving it out lets the server import it directly instead of duplicating the numbers.

- [ ] **Step 1: Write the failing test for the new import path**

Edit `tests/betsMath.test.ts:11` from `import { LIMITS } from '../src/lib/config';` to
`import { LIMITS } from '../src/lib/limits';`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- --run tests/betsMath.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/limits'`

- [ ] **Step 3: Create `src/lib/limits.ts`**

```ts
export const LIMITS = {
  minStake: 1,
  maxStake: 20000,
  maxPayout: 500000,
  minDeposit: 5,
  maxDeposit: 10000,
  minWithdrawal: 20,
  maxWithdrawal: 50000,
};
```

- [ ] **Step 4: Update `src/lib/config.ts`**

Remove the inline `LIMITS` object (currently lines 5-13) and replace with a re-export, so
`src/screens/AccountScreens.tsx` and `src/store/bets.ts` (which import `LIMITS` from `@/lib/config`
today) keep working unmodified:

```ts
export { LIMITS } from './limits';
```

- [ ] **Step 5: Update `src/lib/betsMath.ts`'s import**

Change line 1 from `import { LIMITS } from './config';` to `import { LIMITS } from './limits';`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test -- --run`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/limits.ts src/lib/config.ts src/lib/betsMath.ts tests/betsMath.test.ts
git commit -m "refactor: extract LIMITS out of config.ts into an env-free module"
```

---

### Task 3: Narrow `settleBetAgainstMatch` and `cashoutValue` to structural inputs

**Files:**
- Modify: `src/lib/settlement.ts`
- Modify: `src/lib/cashout.ts`
- Create: `src/lib/cashoutLive.ts` (client-only wrapper, replaces `cashout.ts`'s direct `liveEngine` use)
- Modify: `src/screens/BetPieces.tsx:8,50` (import + call switched to `cashoutValueLive`)
- Modify: `src/store/bets.ts:12,217` (import switched, call site updated in Task 14 — for now just the import path)
- Create: `tests/cashout.test.ts`

**Interfaces:**
- Consumes: `outcomeResult` from Task 1 (`src/lib/outcomes.ts`)
- Produces:
  - `settleBetAgainstMatch(bet: Bet, match: MatchSettlementInput): Bet | null` from
    `src/lib/settlement.ts`, where `MatchSettlementInput = { id: string; status: MatchStatus; score?: { home: number; away: number } }`
  - `cashoutValue(bet: Bet, matches: Record<string, MatchCashoutInput>): CashoutState` from
    `src/lib/cashout.ts`, where
    `MatchCashoutInput = { id: string; status: MatchStatus; score?: { home: number; away: number }; minute?: number; markets: Array<{ key: string; suspended: boolean; outcomes: Array<{ code: string; odds: number; suspended?: boolean }> }> }`
  - `cashoutValueLive(bet: Bet): CashoutState` from `src/lib/cashoutLive.ts` — the client-only
    convenience wrapper that builds the `matches` map from the `liveEngine` singleton, used by UI
    code that wants a live-updating estimate without wiring the lookup itself.

Both `MatchSettlementInput` and `MatchCashoutInput` are structural subsets of the full client
`Match` type, so every existing client call site (which passes real `Match` objects) keeps working
with zero casts — only the *parameter type* narrows, not what callers can pass.

- [ ] **Step 1: Write the failing tests**

Create `tests/cashout.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { cashoutValue } from '../src/lib/cashout';
import type { Bet } from '../src/lib/types';

function openSingle(overrides: Partial<Bet> = {}): Bet {
  return {
    id: 'b1',
    userId: 'u1',
    bookingCode: 'ABC12345',
    type: 'single',
    stake: 10,
    totalOdds: 2,
    potential: 20,
    legs: [
      {
        matchId: 'm1',
        matchName: 'Home vs Away',
        leagueName: 'Test League',
        marketKey: '1x2',
        marketName: 'Match Result',
        outcomeCode: '1',
        outcomeLabel: 'Home',
        odds: 2,
        kickoff: Date.now() - 600_000,
        status: 'open',
      },
    ],
    status: 'open',
    placedAt: Date.now(),
    ...overrides,
  };
}

describe('cashoutValue', () => {
  it('is unavailable once the bet is no longer open', () => {
    const bet = openSingle({ status: 'won' });
    const result = cashoutValue(bet, {});
    expect(result.available).toBe(false);
  });

  it('is unavailable when the referenced match is missing from the snapshot map', () => {
    const bet = openSingle();
    const result = cashoutValue(bet, {});
    // No snapshot at all reads as "awaiting settlement" (finishedOrMissing branch),
    // matching today's behavior when liveEngine.get() returns undefined.
    expect(result.available).toBe(false);
  });

  it('offers a value for a live match with matching market/outcome data', () => {
    const bet = openSingle();
    const result = cashoutValue(bet, {
      m1: {
        id: 'm1',
        status: 'live',
        score: { home: 1, away: 0 },
        minute: 60,
        markets: [
          { key: '1x2', suspended: false, outcomes: [{ code: '1', odds: 1.5, suspended: false }] },
        ],
      },
    });
    expect(result.available).toBe(true);
    expect(result.amount).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- --run tests/cashout.test.ts`
Expected: FAIL — `cashoutValue` still takes one argument, calls `liveEngine.get()` internally

- [ ] **Step 3: Rewrite `src/lib/settlement.ts`'s `Match` dependency**

Change the type import and function signature (logic body unchanged — only the parameter type
narrows):

```ts
import type { Bet, BetLeg } from './types';
import { round2 } from './format';
import { outcomeResult, type MatchOutcomeInput } from './outcomes';

export interface MatchSettlementInput extends MatchOutcomeInput {
  id: string;
  status: 'upcoming' | 'live' | 'finished' | 'postponed' | 'cancelled';
}

export interface SettledBet extends Bet {
  payout?: number;
}
```

Change `settleBetAgainstMatch(bet: Bet, match: Match): Bet | null` to
`settleBetAgainstMatch(bet: Bet, match: MatchSettlementInput): Bet | null` — no other line in the
function body changes, it only ever reads `match.id`, `match.status`, and (via `outcomeResult`)
`match.score`.

- [ ] **Step 4: Rewrite `src/lib/cashout.ts` to take a `matches` lookup**

```ts
import type { Bet } from './types';
import { round2, clamp } from './format';

export interface MatchCashoutInput {
  id: string;
  status: 'upcoming' | 'live' | 'finished' | 'postponed' | 'cancelled';
  score?: { home: number; away: number };
  minute?: number;
  markets: Array<{ key: string; suspended: boolean; outcomes: Array<{ code: string; odds: number; suspended?: boolean }> }>;
}

export interface CashoutState {
  available: boolean;
  reason?: string;
  amount: number;
}

function impliedProb(odds: number): number {
  return clamp(1 / Math.max(1.01, odds), 0.02, 0.97);
}

export function cashoutValue(bet: Bet, matches: Record<string, MatchCashoutInput>): CashoutState {
  if (bet.status !== 'open') return { available: false, amount: 0, reason: 'Bet is not active' };

  const liveLegs = bet.legs.filter((l) => matches[l.matchId]?.status === 'live');
  const finishedOrMissing = bet.legs.filter((l) => {
    const m = matches[l.matchId];
    return !m || m.status === 'finished' || m.status === 'cancelled' || m.status === 'postponed';
  });

  let prob = 1;
  for (const leg of bet.legs) {
    const m = matches[leg.matchId];
    if (!m) {
      prob *= 0.9;
      continue;
    }
    if (m.status === 'finished' || m.status === 'cancelled' || m.status === 'postponed') {
      prob *= 0.5;
    } else if (m.status === 'live') {
      const s = m.score ?? { home: 0, away: 0 };
      const diff = s.home - s.away;
      const timeLeft = Math.max(0.05, 1 - (m.minute ?? 0) / 90);
      let p = 0.5;
      const market = m.markets.find((mk) => mk.key === leg.marketKey);
      const outcome = market?.outcomes.find((o) => o.code === leg.outcomeCode);
      if (outcome) p = impliedProb(outcome.odds);
      if (leg.outcomeCode === '1') p = clamp(p + diff * timeLeft * 0.25, 0.02, 0.97);
      else if (leg.outcomeCode === '2') p = clamp(p - diff * timeLeft * 0.25, 0.02, 0.97);
      else if (leg.outcomeCode === 'X') p = clamp(p * timeLeft * 2, 0.02, 0.9);
      else p = clamp(p * timeLeft, 0.03, 0.95);
      prob *= p;
    } else {
      const market = m.markets.find((mk) => mk.key === leg.marketKey);
      const outcome = market?.outcomes.find((o) => o.code === leg.outcomeCode);
      prob *= outcome ? impliedProb(outcome.odds) : 0.45;
    }
  }

  if (bet.type === 'single') {
    const openLegs = bet.legs.filter((l) => l.status === 'open');
    if (openLegs.length !== 1) return { available: false, amount: 0, reason: 'No open legs to cash out' };
  }

  const base = Math.min(bet.potential, bet.stake * Math.max(bet.totalOdds, 1));
  let amount = round2(base * prob * 0.94);
  amount = clamp(amount, round2(base * 0.05), round2(base * 0.97));

  if (amount < 0.1) return { available: false, amount: 0, reason: 'Cash out value too low' };
  const firstLiveMatch = liveLegs.length > 0 ? matches[liveLegs[0].matchId] : undefined;
  if (firstLiveMatch?.markets.every((mk) => mk.suspended)) {
    return { available: false, amount: 0, reason: 'Temporarily suspended' };
  }
  if (finishedOrMissing.length === bet.legs.length) {
    return { available: false, amount: 0, reason: 'Awaiting settlement' };
  }
  return { available: true, amount };
}
```

- [ ] **Step 5: Create `src/lib/cashoutLive.ts`**

The client-only adapter that keeps existing UI call sites working — it, not `cashout.ts`, is the
one file allowed to import the `liveEngine` singleton:

```ts
import type { Bet } from './types';
import { liveEngine } from './liveEngine';
import { cashoutValue, type CashoutState, type MatchCashoutInput } from './cashout';

/** Cash-out estimate against the live browser-side match simulation. */
export function cashoutValueLive(bet: Bet): CashoutState {
  const matches: Record<string, MatchCashoutInput> = {};
  for (const leg of bet.legs) {
    const m = liveEngine.get(leg.matchId);
    if (m) matches[leg.matchId] = m;
  }
  return cashoutValue(bet, matches);
}
```

(`liveEngine.get(...)` returns a full `Match`, which structurally satisfies `MatchCashoutInput` —
no cast needed.)

- [ ] **Step 6: Update `src/screens/BetPieces.tsx`**

Change line 8 from `import { cashoutValue } from '@/lib/cashout';` to
`import { cashoutValueLive } from '@/lib/cashoutLive';`, and line 50 from
`const co = cashoutValue(bet);` to `const co = cashoutValueLive(bet);`.

- [ ] **Step 7: Update `src/store/bets.ts`'s import**

Change line 12 from `import { cashoutValue } from '@/lib/cashout';` to
`import { cashoutValueLive } from '@/lib/cashoutLive';`. Leave line 217
(`const value = cashoutValue(bet);`) using the new name (`cashoutValueLive(bet)`) for now — Task 14
replaces this whole function body with a call to the server.

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm run test -- --run`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/lib/settlement.ts src/lib/cashout.ts src/lib/cashoutLive.ts src/screens/BetPieces.tsx src/store/bets.ts tests/cashout.test.ts
git commit -m "refactor: decouple settlement/cashout math from Match and the liveEngine singleton"
```

---

### Task 4: Unify `validateSlipSelections` to a structural selection type

**Files:**
- Modify: `src/lib/betsMath.ts`
- Modify: `tests/betsMath.test.ts` (no behavior change expected, existing tests should still pass)

**Interfaces:**
- Produces: `validateSlipSelections(items: Selection[], mode): ValidationResult` from
  `src/lib/betsMath.ts`, where `Selection = { matchId: string; matchName: string; marketKey: string; marketName: string; outcomeCode: string; odds: number }`
  — satisfied by both `SlipItem` (client pre-submit validation) and `BetLeg` (server placement
  validation), so both callers share one implementation.

Today's `bets.ts#placeBet` re-implements roughly 25 lines of this exact same logic by hand (its own
comment even says "re-run here because the client can't be trusted") because `BetLeg` doesn't
satisfy `SlipItem`. Narrowing the parameter type to only the fields actually used removes that
duplication — Task 11 (server `bets.place`) calls this same function instead of writing it a third
time.

- [ ] **Step 1: Confirm the existing test suite as the regression baseline**

Run: `npm run test -- --run tests/betsMath.test.ts`
Expected: PASS (25 tests) — this task must not change this file's behavior, only its parameter
type. No new test is added; the existing suite is the safety net.

- [ ] **Step 2: Change `validateSlipSelections`'s signature and dedup key**

In `src/lib/betsMath.ts`, replace the `items: SlipItem[]` parameter with a structural type, and
switch the duplicate-detection key from `outcomeId` (`SlipItem`-only) to
`matchId:marketKey:outcomeCode` (present on both `SlipItem` and `BetLeg`, and already the exact key
`bets.ts#placeBet` uses today for its own duplicate check):

```ts
export interface Selection {
  matchId: string;
  matchName: string;
  marketKey: string;
  marketName: string;
  outcomeCode: string;
  odds: number;
}

export function validateSlipSelections(items: Selection[], mode: 'single' | 'multi' | 'system' | 'builder'): ValidationResult {
  if (items.length === 0) return { ok: false, error: 'Add at least one selection' };
  if (mode === 'multi' && items.length < 2) return { ok: false, error: 'Multi bets need at least 2 selections' };
  if (mode === 'builder') {
    const matchIds = new Set(items.map((i) => i.matchId));
    if (matchIds.size !== 1) return { ok: false, error: 'Bet Builder combines markets from one match only' };
    if (items.length < 2) return { ok: false, error: 'Bet Builder needs at least 2 markets' };
    const marketKeys = new Set<string>();
    for (const i of items) {
      if (marketKeys.has(i.marketKey)) return { ok: false, error: `Only one selection per market allowed in Bet Builder (${i.marketName})` };
      marketKeys.add(i.marketKey);
    }
  }
  if (mode === 'system' && items.length < 3) return { ok: false, error: 'System bets need at least 3 selections' };
  const suspended = items.filter((i) => i.odds <= 1.001);
  if (suspended.length > 0) return { ok: false, error: 'Some selections are unavailable' };
  const seen = new Set<string>();
  for (const i of items) {
    const key = `${i.matchId}:${i.marketKey}:${i.outcomeCode}`;
    if (seen.has(key)) return { ok: false, error: 'Duplicate selection found' };
    seen.add(key);
  }
  if (mode === 'multi' || mode === 'system') {
    const matchIds = new Set<string>();
    for (const i of items) {
      if (matchIds.has(i.matchId)) {
        return { ok: false, error: `Multiple selections from ${i.matchName} can't be combined — use Bet Builder instead` };
      }
      matchIds.add(i.matchId);
    }
  }
  return { ok: true };
}
```

`SlipItem` and `BetLeg` both already have every field `Selection` requires, so no client call site
(`src/components/Betslip.tsx:216`) needs to change.

- [ ] **Step 3: Run tests to verify they still pass**

Run: `npm run test -- --run tests/betsMath.test.ts`
Expected: PASS (25 tests, unchanged) — confirms the dedup-key switch doesn't change behavior for
any existing case (verified by hand during design: every existing test's fixtures already share
`matchId`/`marketKey`/`outcomeCode` exactly when they intend a duplicate, and differ on `matchId`
when they don't).

- [ ] **Step 4: Commit**

```bash
git add src/lib/betsMath.ts
git commit -m "refactor: make validateSlipSelections accept BetLeg as well as SlipItem"
```

---

### Task 5: Prisma schema — `Txn` and `Bet` models

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/<timestamp>_add_wallet_bets/migration.sql` (generated)

**Interfaces:**
- Produces: `Txn` and `Bet` Prisma models, and their generated `@prisma/client` types, consumed by
  every server task from here on.

- [ ] **Step 1: Add the two models**

Append to `server/prisma/schema.prisma`, after the existing `VerificationCode` model:

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
  legs           Json
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

Add the two back-relations to `model User` (alongside the existing `sessions DeviceSession[]`):

```prisma
  txns  Txn[]
  bets  Bet[]
```

- [ ] **Step 2: Generate and apply the migration**

Run: `npm run db:migrate --workspace=server -- --name add_wallet_bets`
Expected: creates `server/prisma/migrations/<timestamp>_add_wallet_bets/migration.sql` and applies
it against the dev database. Confirm no errors and that `npx prisma studio` (or a quick
`SELECT * FROM "Txn"` via `psql`) shows the two new empty tables.

- [ ] **Step 3: Regenerate the Prisma client**

Run: `npm run db:generate --workspace=server`
Expected: `Txn`/`Bet` types now available from `@prisma/client`.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck --workspace=server`
Expected: PASS (no code references the new models yet, so this only confirms the schema itself is
valid TypeScript-generation-wise)

- [ ] **Step 5: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations
git commit -m "feat(server): Txn and Bet Prisma models"
```

---

### Task 6: `mapTxn` / `mapBet` mappers

**Files:**
- Modify: `server/src/mappers.ts`
- Create: `server/tests/mappers.test.ts`

**Interfaces:**
- Consumes: `Txn`, `Bet` from `@prisma/client` (Task 5)
- Produces: `mapTxn(row: TxnRow): Txn`, `mapBet(row: BetRow): Bet` from `server/src/mappers.ts`,
  matching the client-side `Txn`/`Bet` shapes in `src/lib/types.ts` exactly (epoch-ms numbers, not
  `Date` objects; `Decimal` converted via `Number(...)`, matching `mapProfile`'s existing
  convention).

- [ ] **Step 1: Write the failing test**

Create `server/tests/mappers.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mapTxn, mapBet } from '../src/mappers';

describe('mapTxn', () => {
  it('converts Decimal amount to a number and dates to epoch ms', () => {
    const row = {
      id: 't1',
      userId: 'u1',
      type: 'deposit',
      amount: { toString: () => '25.50' } as never, // Prisma.Decimal stand-in
      status: 'success',
      ref: 'MOMO-ABC123',
      meta: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      resolvedAt: null,
    };
    const mapped = mapTxn(row);
    expect(mapped.amount).toBe(25.5);
    expect(mapped.createdAt).toBe(new Date('2026-01-01T00:00:00Z').getTime());
    expect(mapped.resolvedAt).toBeUndefined();
  });
});

describe('mapBet', () => {
  it('converts Decimal fields and passes legs through as-is', () => {
    const legs = [{ matchId: 'm1', outcomeCode: '1', odds: 2, status: 'open' }];
    const row = {
      id: 'b1',
      userId: 'u1',
      bookingCode: 'ABC12345',
      type: 'single',
      stake: { toString: () => '10' } as never,
      totalOdds: { toString: () => '2' } as never,
      potential: { toString: () => '20' } as never,
      comboCount: null,
      systemConfig: null,
      legs,
      status: 'open',
      payout: null,
      cashoutAmount: null,
      cashoutHistory: null,
      usedBonus: { toString: () => '0' } as never,
      placedAt: new Date('2026-01-01T00:00:00Z'),
      settledAt: null,
    };
    const mapped = mapBet(row);
    expect(mapped.stake).toBe(10);
    expect(mapped.legs).toEqual(legs);
    expect(mapped.usedBonus).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=server -- mappers.test.ts`
Expected: FAIL — `mapTxn`/`mapBet` not exported from `../src/mappers`

- [ ] **Step 3: Add the mappers**

Append to `server/src/mappers.ts`:

```ts
import type { Txn as TxnRow, Bet as BetRow } from '@prisma/client';
import type { Txn, Bet, BetLeg } from '../../src/lib/types';

export function mapTxn(row: TxnRow): Txn {
  return {
    id: row.id,
    userId: row.userId,
    type: row.type as Txn['type'],
    amount: Number(row.amount),
    status: row.status as Txn['status'],
    ref: row.ref,
    meta: (row.meta as Record<string, unknown>) ?? undefined,
    createdAt: row.createdAt.getTime(),
    resolvedAt: row.resolvedAt?.getTime(),
  };
}

export function mapBet(row: BetRow): Bet {
  return {
    id: row.id,
    userId: row.userId,
    bookingCode: row.bookingCode,
    type: row.type as Bet['type'],
    stake: Number(row.stake),
    totalOdds: Number(row.totalOdds),
    potential: Number(row.potential),
    comboCount: row.comboCount ?? undefined,
    systemConfig: (row.systemConfig as Bet['systemConfig']) ?? undefined,
    legs: row.legs as BetLeg[],
    status: row.status as Bet['status'],
    payout: row.payout != null ? Number(row.payout) : undefined,
    cashoutAmount: row.cashoutAmount != null ? Number(row.cashoutAmount) : undefined,
    cashoutHistory: (row.cashoutHistory as Bet['cashoutHistory']) ?? undefined,
    usedBonus: Number(row.usedBonus),
    placedAt: row.placedAt.getTime(),
    settledAt: row.settledAt?.getTime(),
  };
}
```

(Import `Txn as TxnRow, Bet as BetRow` alongside the file's existing `User, RgLimits,
NotificationPrefs, DeviceSession as DeviceSessionRow` import from `@prisma/client`, and add `Txn,
Bet, BetLeg` to the existing `import type { Profile, DeviceSession } from '../../src/lib/types'`
line.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=server -- mappers.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/mappers.ts server/tests/mappers.test.ts
git commit -m "feat(server): mapTxn and mapBet"
```

---

### Task 7: `wallet` router — `deposit`, `requestWithdrawal`, `listTxns`

**Files:**
- Create: `server/src/routers/wallet.ts`
- Modify: `server/src/routers/_app.ts` (mount `wallet: walletRouter`)
- Create: `server/tests/wallet.test.ts`

**Interfaces:**
- Consumes: `mapTxn` (Task 6), `round2` from `src/lib/format.ts`
- Produces: `walletRouter` with `deposit`, `requestWithdrawal`, `listTxns` — mounted at
  `appRouter.wallet`, consumed by the client wallet store rewrite (Task 15) and by Task 8's
  `resolveWithdrawal`/`adminAdjust`.

- [ ] **Step 1: Write the failing tests**

Create `server/tests/wallet.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db';
import { callerWithSession } from './testContext';

beforeEach(async () => {
  await db.txn.deleteMany();
  await db.bet.deleteMany();
  await db.deviceSession.deleteMany();
  await db.rgLimits.deleteMany();
  await db.notificationPrefs.deleteMany();
  await db.user.deleteMany();
});

async function signedInCaller() {
  const caller = callerWithSession();
  await caller.auth.signUp({
    email: 'wallet-user@example.com',
    password: 'correcthorse',
    phone: '+233200000009',
    fullName: 'Wallet User',
  });
  return caller;
}

describe('wallet.deposit', () => {
  it('creates a successful deposit txn', async () => {
    const caller = await signedInCaller();
    const txn = await caller.wallet.deposit({ amount: 100, provider: 'momo' });
    expect(txn.type).toBe('deposit');
    expect(txn.status).toBe('success');
    expect(txn.amount).toBe(100);
  });
});

describe('wallet.requestWithdrawal', () => {
  it('rejects a withdrawal larger than the available balance', async () => {
    const caller = await signedInCaller();
    await caller.wallet.deposit({ amount: 50, provider: 'momo' });
    const result = await caller.wallet.requestWithdrawal({ amount: 100, momoNumber: '0244567890' });
    expect(result.error).toBe('Insufficient available balance');
  });

  it('creates a pending withdrawal within the available balance', async () => {
    const caller = await signedInCaller();
    await caller.wallet.deposit({ amount: 100, provider: 'momo' });
    const result = await caller.wallet.requestWithdrawal({ amount: 40, momoNumber: '0244567890' });
    expect(result.txn?.status).toBe('pending');
    expect(result.txn?.amount).toBe(-40);
  });

  it('excludes an already-pending withdrawal from the next available-balance check', async () => {
    const caller = await signedInCaller();
    await caller.wallet.deposit({ amount: 100, provider: 'momo' });
    await caller.wallet.requestWithdrawal({ amount: 60, momoNumber: '0244567890' });
    const second = await caller.wallet.requestWithdrawal({ amount: 60, momoNumber: '0244567890' });
    expect(second.error).toBe('Insufficient available balance');
  });
});

describe('wallet.listTxns', () => {
  it('returns only the caller\'s own txns, newest first', async () => {
    const caller = await signedInCaller();
    const other = callerWithSession();
    await other.auth.signUp({ email: 'other@example.com', password: 'correcthorse', phone: '+233200000009', fullName: 'Other' });
    await other.wallet.deposit({ amount: 999, provider: 'momo' });

    await caller.wallet.deposit({ amount: 10, provider: 'momo' });
    await caller.wallet.deposit({ amount: 20, provider: 'momo' });

    const txns = await caller.wallet.listTxns();
    expect(txns).toHaveLength(2);
    expect(txns[0].amount).toBe(20);
    expect(txns.every((t) => t.userId === txns[0].userId)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=server -- wallet.test.ts`
Expected: FAIL — `caller.wallet` is undefined

- [ ] **Step 3: Create `server/src/routers/wallet.ts`**

```ts
import { z } from 'zod';
import { protectedProcedure, router } from '../trpc';
import { mapTxn } from '../mappers';
import { round2 } from '../../../src/lib/format';
import type { Context } from '../context';

async function balanceOf(db: Context['db'], userId: string): Promise<number> {
  const txns = await db.txn.findMany({ where: { userId, status: 'success' } });
  return round2(txns.reduce((sum, t) => sum + Number(t.amount), 0));
}

async function lockedOf(db: Context['db'], userId: string): Promise<number> {
  const pending = await db.txn.findMany({ where: { userId, type: 'withdrawal', status: 'pending' } });
  return round2(pending.reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0));
}

export const walletRouter = router({
  deposit: protectedProcedure
    .input(z.object({ amount: z.number().positive(), provider: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const txn = await ctx.db.txn.create({
        data: {
          userId: ctx.currentUser.id,
          type: 'deposit',
          amount: round2(input.amount),
          status: 'success',
          ref: `${input.provider.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`,
        },
      });
      return mapTxn(txn);
    }),

  requestWithdrawal: protectedProcedure
    .input(z.object({ amount: z.number().positive(), momoNumber: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const [balance, locked] = await Promise.all([
        balanceOf(ctx.db, ctx.currentUser.id),
        lockedOf(ctx.db, ctx.currentUser.id),
      ]);
      const available = round2(balance - locked);
      if (round2(input.amount) > available) return { error: 'Insufficient available balance' };
      const txn = await ctx.db.txn.create({
        data: {
          userId: ctx.currentUser.id,
          type: 'withdrawal',
          amount: -round2(input.amount),
          status: 'pending',
          ref: `WD-${Date.now().toString(36).toUpperCase()}`,
          meta: { momo: input.momoNumber },
        },
      });
      return { txn: mapTxn(txn) };
    }),

  listTxns: protectedProcedure.query(async ({ ctx }) => {
    const txns = await ctx.db.txn.findMany({
      where: { userId: ctx.currentUser.id },
      orderBy: { createdAt: 'desc' },
    });
    return txns.map(mapTxn);
  }),
});

export { balanceOf, lockedOf };
```

- [ ] **Step 4: Mount the router**

In `server/src/routers/_app.ts`:

```ts
import { walletRouter } from './wallet';
```

Add `wallet: walletRouter,` alongside the existing `auth: authRouter, admin: adminRouter,`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test --workspace=server -- wallet.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add server/src/routers/wallet.ts server/src/routers/_app.ts server/tests/wallet.test.ts
git commit -m "feat(server): wallet.deposit, requestWithdrawal, listTxns"
```

---

### Task 8: `wallet` router — admin actions (`resolveWithdrawal`, `adminAdjust`)

**Files:**
- Modify: `server/src/routers/wallet.ts`
- Modify: `server/tests/wallet.test.ts`

**Interfaces:**
- Consumes: `balanceOf`/`lockedOf` (Task 7, same file)
- Produces: `wallet.resolveWithdrawal`, `wallet.adminAdjust` — consumed by 1c's admin wallet screen
  (not built in this plan; the endpoints exist so `AdminOps.tsx`'s existing buttons have something
  real to call once 1c wires them up).

- [ ] **Step 1: Write the failing tests**

Append to `server/tests/wallet.test.ts`:

```ts
async function adminCaller() {
  const caller = callerWithSession();
  await caller.auth.signUp({ email: 'wallet-admin@example.com', password: 'correcthorse', phone: '+233200000009', fullName: 'Wallet Admin' });
  await db.user.update({ where: { email: 'wallet-admin@example.com' }, data: { role: 'admin' } });
  return caller;
}

describe('wallet.resolveWithdrawal', () => {
  it('approving marks the txn successful with no refund', async () => {
    const caller = await signedInCaller();
    await caller.wallet.deposit({ amount: 100, provider: 'momo' });
    const { txn } = await caller.wallet.requestWithdrawal({ amount: 40, momoNumber: '0244567890' });

    const admin = await adminCaller();
    await admin.wallet.resolveWithdrawal({ txnId: txn!.id, approve: true });

    const txns = await caller.wallet.listTxns();
    const resolved = txns.find((t) => t.id === txn!.id);
    expect(resolved?.status).toBe('success');
  });

  it('rejecting marks the txn failed and refunds the amount', async () => {
    const caller = await signedInCaller();
    await caller.wallet.deposit({ amount: 100, provider: 'momo' });
    const { txn } = await caller.wallet.requestWithdrawal({ amount: 40, momoNumber: '0244567890' });

    const admin = await adminCaller();
    await admin.wallet.resolveWithdrawal({ txnId: txn!.id, approve: false });

    const txns = await caller.wallet.listTxns();
    expect(txns.find((t) => t.id === txn!.id)?.status).toBe('failed');
    const refund = txns.find((t) => t.type === 'refund');
    expect(refund?.amount).toBe(40);
  });

  it('rejects a non-admin caller', async () => {
    const caller = await signedInCaller();
    await caller.wallet.deposit({ amount: 100, provider: 'momo' });
    const { txn } = await caller.wallet.requestWithdrawal({ amount: 40, momoNumber: '0244567890' });
    await expect(caller.wallet.resolveWithdrawal({ txnId: txn!.id, approve: true })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('wallet.adminAdjust', () => {
  it('creates an adjustment txn on the target user', async () => {
    const caller = await signedInCaller();
    const admin = await adminCaller();
    await admin.wallet.adminAdjust({ userId: (await caller.auth.me())!.id, amount: 15, reason: 'goodwill' });

    const txns = await caller.wallet.listTxns();
    expect(txns.find((t) => t.type === 'adjustment')?.amount).toBe(15);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=server -- wallet.test.ts`
Expected: FAIL — `resolveWithdrawal`/`adminAdjust` undefined

- [ ] **Step 3: Add the two procedures**

In `server/src/routers/wallet.ts`, change the existing
`import { protectedProcedure, router } from '../trpc';` to also import `adminProcedure`, and add a
new import line `import { TRPCError } from '@trpc/server';`. Then append inside `walletRouter`:

```ts
  resolveWithdrawal: adminProcedure
    .input(z.object({ txnId: z.string(), approve: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const txn = await ctx.db.txn.findUnique({ where: { id: input.txnId } });
      if (!txn || txn.type !== 'withdrawal' || txn.status !== 'pending') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Withdrawal not found or already resolved' });
      }
      await ctx.db.$transaction(async (tx) => {
        await tx.txn.update({ where: { id: txn.id }, data: { status: input.approve ? 'success' : 'failed', resolvedAt: new Date() } });
        if (!input.approve) {
          await tx.txn.create({
            data: {
              userId: txn.userId,
              type: 'refund',
              amount: Math.abs(Number(txn.amount)),
              status: 'success',
              ref: `REFUND-${txn.ref}`,
              meta: { reason: 'Withdrawal rejected' },
              resolvedAt: new Date(),
            },
          });
        }
      });
      return { ok: true };
    }),

  adminAdjust: adminProcedure
    .input(z.object({ userId: z.string(), amount: z.number(), reason: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const txn = await ctx.db.txn.create({
        data: {
          userId: input.userId,
          type: 'adjustment',
          amount: round2(input.amount),
          status: 'success',
          ref: `ADJ-${input.reason}`,
          resolvedAt: new Date(),
        },
      });
      return mapTxn(txn);
    }),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=server -- wallet.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add server/src/routers/wallet.ts server/tests/wallet.test.ts
git commit -m "feat(server): wallet.resolveWithdrawal, adminAdjust"
```

---

### Task 9: Server-side withdrawal auto-approve sweep

**Files:**
- Create: `server/src/walletSweep.ts`
- Modify: `server/src/index.ts` (run the sweep on an interval)
- Create: `server/tests/walletSweep.test.ts`

**Interfaces:**
- Produces: `sweepWithdrawals(db: Context['db']): Promise<number>` from
  `server/src/walletSweep.ts` — returns the count of withdrawals it approved, independently
  testable without touching the process-level `setInterval`.

The sweep now owns *every* user's pending withdrawal queue, not just whichever the current browser
tab happens to see — it has to run in the server process, unconditionally, matching the reasoning
in the design spec.

- [ ] **Step 1: Write the failing test**

Create `server/tests/walletSweep.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db';
import { sweepWithdrawals } from '../src/walletSweep';

beforeEach(async () => {
  await db.txn.deleteMany();
  await db.bet.deleteMany();
  await db.deviceSession.deleteMany();
  await db.rgLimits.deleteMany();
  await db.notificationPrefs.deleteMany();
  await db.user.deleteMany();
});

async function makeUser() {
  return db.user.create({
    data: { email: `sweep-${Date.now()}@example.com`, passwordHash: 'x', phone: '+233200000009', fullName: 'Sweep User' },
  });
}

describe('sweepWithdrawals', () => {
  it('approves a pending withdrawal older than the threshold', async () => {
    const user = await makeUser();
    await db.txn.create({
      data: {
        userId: user.id,
        type: 'withdrawal',
        amount: -40,
        status: 'pending',
        ref: 'WD-OLD',
        createdAt: new Date(Date.now() - 200_000),
      },
    });
    const approved = await sweepWithdrawals(db);
    expect(approved).toBe(1);
    const txn = await db.txn.findFirst({ where: { userId: user.id } });
    expect(txn?.status).toBe('success');
  });

  it('leaves a recent pending withdrawal untouched', async () => {
    const user = await makeUser();
    await db.txn.create({
      data: { userId: user.id, type: 'withdrawal', amount: -40, status: 'pending', ref: 'WD-NEW' },
    });
    const approved = await sweepWithdrawals(db);
    expect(approved).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=server -- walletSweep.test.ts`
Expected: FAIL — `Cannot find module '../src/walletSweep'`

- [ ] **Step 3: Create `server/src/walletSweep.ts`**

```ts
import type { Context } from './context';

// Local to the server on purpose — same reasoning as SESSION_DAYS in
// server/src/routers/auth.ts: the frontend's copy lives in a Vite-only
// module the server can't import under plain tsx.
const WITHDRAWAL_AUTO_APPROVE_MS = 120_000;

export async function sweepWithdrawals(db: Context['db']): Promise<number> {
  const cutoff = new Date(Date.now() - WITHDRAWAL_AUTO_APPROVE_MS);
  const pending = await db.txn.findMany({
    where: { type: 'withdrawal', status: 'pending', createdAt: { lte: cutoff } },
  });
  for (const txn of pending) {
    await db.txn.update({ where: { id: txn.id }, data: { status: 'success', resolvedAt: new Date() } });
  }
  return pending.length;
}
```

- [ ] **Step 4: Wire it into `server/src/index.ts`**

```ts
import { db } from './db';
import { sweepWithdrawals } from './walletSweep';
```

After `server.listen(port)`:

```ts
setInterval(() => {
  sweepWithdrawals(db).catch((e) => console.error('[server] withdrawal sweep failed', e));
}, 15_000);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test --workspace=server -- walletSweep.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck --workspace=server`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add server/src/walletSweep.ts server/src/index.ts server/tests/walletSweep.test.ts
git commit -m "feat(server): server-side withdrawal auto-approve sweep"
```

---

### Task 10: `bets` router — `place`

**Files:**
- Create: `server/src/routers/bets.ts`
- Modify: `server/src/routers/_app.ts` (mount `bets: betsRouter`)
- Create: `server/tests/bets.test.ts`

**Interfaces:**
- Consumes: `validateSlipSelections`, `validateStake`, `potentialFor` (`src/lib/betsMath.ts`,
  Tasks 2 & 4), `LIMITS` (`src/lib/limits.ts`, Task 2), `mapBet` (Task 6), `balanceOf` (Task 7,
  exported from `wallet.ts`)
- Produces: `betsRouter.place` — the first procedure on the new router; `listBets`, `cashOut`,
  `settle`, `voidBet` are added in Tasks 11-13.

This is the most involved procedure in the plan: it re-implements every check
`src/store/bets.ts#placeBet` does today, using the now-shared pure functions instead of
hand-copying the logic a third time, and persists atomically.

- [ ] **Step 1: Write the failing tests**

Create `server/tests/bets.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db';
import { callerWithSession } from './testContext';

beforeEach(async () => {
  await db.bet.deleteMany();
  await db.txn.deleteMany();
  await db.deviceSession.deleteMany();
  await db.rgLimits.deleteMany();
  await db.notificationPrefs.deleteMany();
  await db.user.deleteMany();
});

async function signedInCaller() {
  const caller = callerWithSession();
  await caller.auth.signUp({
    email: 'bets-user@example.com',
    password: 'correcthorse',
    phone: '+233200000009',
    fullName: 'Bets User',
  });
  await caller.wallet.deposit({ amount: 100, provider: 'momo' });
  return caller;
}

function openLeg(overrides: Record<string, unknown> = {}) {
  return {
    matchId: 'm1',
    matchName: 'Home vs Away',
    leagueName: 'Test League',
    marketKey: '1x2',
    marketName: 'Match Result',
    outcomeCode: '1',
    outcomeLabel: 'Home',
    odds: 2,
    kickoff: Date.now() + 3_600_000,
    status: 'open' as const,
    matchStatus: 'upcoming' as const,
    marketSuspended: false,
    outcomeSuspended: false,
    ...overrides,
  };
}

describe('bets.place', () => {
  it('places a single bet and debits the stake', async () => {
    const caller = await signedInCaller();
    const result = await caller.bets.place({ type: 'single', stakePerCombo: 10, legs: [openLeg()] });
    expect(result.ok).toBe(true);
    expect(result.betIds).toHaveLength(1);

    const txns = await caller.wallet.listTxns();
    expect(txns.find((t) => t.type === 'stake')?.amount).toBe(-10);
  });

  it('rejects a stake exceeding available balance', async () => {
    const caller = await signedInCaller();
    const result = await caller.bets.place({ type: 'single', stakePerCombo: 500, legs: [openLeg()] });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Insufficient balance/);
  });

  it('rejects a leg reported as suspended', async () => {
    const caller = await signedInCaller();
    const result = await caller.bets.place({
      type: 'single',
      stakePerCombo: 10,
      legs: [openLeg({ outcomeSuspended: true })],
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/unavailable/i);
  });

  it('rejects a duplicate selection', async () => {
    const caller = await signedInCaller();
    const leg = openLeg();
    const result = await caller.bets.place({ type: 'multi', stakePerCombo: 10, legs: [leg, leg] });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Duplicate/);
  });

  it('debits bonus balance before cash, and never below zero', async () => {
    const caller = await signedInCaller();
    await db.user.update({ where: { email: 'bets-user@example.com' }, data: { bonusBalance: 5 } });
    const result = await caller.bets.place({
      type: 'single',
      stakePerCombo: 10,
      legs: [openLeg()],
      useBonus: 5,
    });
    expect(result.ok).toBe(true);
    const me = await caller.auth.me();
    expect(me?.bonusBalance).toBe(0);
    const txns = await caller.wallet.listTxns();
    // Only the cash portion (10 - 5 bonus) is debited from the wallet.
    expect(txns.find((t) => t.type === 'stake')?.amount).toBe(-5);
  });

  it('does not create a Bet row if the transaction fails partway (atomicity)', async () => {
    const caller = await signedInCaller();
    // A stake that clears the balance check but exceeds LIMITS.maxPayout
    // fails the potential-payout check *after* the balance check passes,
    // proving nothing was written before that point.
    const result = await caller.bets.place({
      type: 'single',
      stakePerCombo: 90,
      legs: [openLeg({ odds: 6000 })],
    });
    expect(result.ok).toBe(false);
    const bets = await db.bet.findMany({ where: { userId: (await caller.auth.me())!.id } });
    expect(bets).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=server -- bets.test.ts`
Expected: FAIL — `caller.bets` is undefined

- [ ] **Step 3: Create `server/src/routers/bets.ts`**

```ts
import { z } from 'zod';
import { protectedProcedure, router } from '../trpc';
import { mapBet } from '../mappers';
import { round2 } from '../../../src/lib/format';
import { LIMITS } from '../../../src/lib/limits';
import { validateSlipSelections, validateStake, potentialFor } from '../../../src/lib/betsMath';
import { balanceOf } from './wallet';
import type { BetLeg, Bet } from '../../../src/lib/types';

const matchStatusSchema = z.enum(['upcoming', 'live', 'finished', 'postponed', 'cancelled']);

const legInput = z.object({
  matchId: z.string(),
  matchName: z.string(),
  leagueName: z.string(),
  marketKey: z.string(),
  marketName: z.string(),
  outcomeCode: z.string(),
  outcomeLabel: z.string(),
  odds: z.number().positive(),
  kickoff: z.number(),
  status: z.literal('open'),
  matchStatus: matchStatusSchema,
  marketSuspended: z.boolean(),
  outcomeSuspended: z.boolean(),
});

function newBookingCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 8; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

function newBetId(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `BET-${ymd}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export const betsRouter = router({
  place: protectedProcedure
    .input(
      z.object({
        type: z.enum(['single', 'multi', 'system', 'builder']),
        stakePerCombo: z.number(),
        legs: z.array(legInput).min(1),
        systemPicks: z.number().optional(),
        useBonus: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { type, legs, systemPicks = 3 } = input;
      const useBonus = input.useBonus ?? 0;

      const selectionCheck = validateSlipSelections(legs, type);
      if (!selectionCheck.ok) return { ok: false, error: selectionCheck.error };

      for (const leg of legs) {
        if (leg.matchStatus === 'cancelled' || leg.matchStatus === 'postponed') {
          return { ok: false, error: `Event unavailable: ${leg.matchName}` };
        }
        if (leg.matchStatus === 'finished') {
          return { ok: false, error: `Event already finished: ${leg.matchName}` };
        }
        if (leg.marketSuspended) return { ok: false, error: `Market suspended: ${leg.marketName}` };
        if (leg.outcomeSuspended) return { ok: false, error: `Selection unavailable: ${leg.outcomeLabel}` };
      }

      const stakeVal = round2(input.stakePerCombo);
      const stakeCheck = validateStake(stakeVal);
      if (!stakeCheck.ok) return { ok: false, error: stakeCheck.error };

      const picksForSystem = Math.min(systemPicks, Math.max(2, legs.length - 1));
      const totals = potentialFor(type, stakeVal, legs, picksForSystem);
      const totalStake = round2(totals.comboCount * stakeVal);
      if (totals.potential > LIMITS.maxPayout) {
        return { ok: false, error: `Maximum payout is ${LIMITS.maxPayout.toLocaleString()}` };
      }

      const [available, user] = await Promise.all([
        balanceOf(ctx.db, ctx.currentUser.id),
        ctx.db.user.findUnique({ where: { id: ctx.currentUser.id } }),
      ]);
      const bonusToUse = Math.min(round2(useBonus), Number(user?.bonusBalance ?? 0), totalStake);
      const cashNeeded = round2(totalStake - bonusToUse);
      if (cashNeeded > available) {
        return { ok: false, error: `Insufficient balance. Available: ${available.toFixed(2)}` };
      }

      const bookingCode = newBookingCode();
      const storedLegs: BetLeg[] = legs.map((l) => ({
        matchId: l.matchId,
        matchName: l.matchName,
        leagueName: l.leagueName,
        marketKey: l.marketKey as BetLeg['marketKey'],
        marketName: l.marketName,
        outcomeCode: l.outcomeCode,
        outcomeLabel: l.outcomeLabel,
        odds: l.odds,
        kickoff: l.kickoff,
        status: 'open',
      }));

      const rows: Array<{ legs: BetLeg[]; stake: number; totalOdds: number; potential: number; usedBonus: number }> =
        type === 'single'
          ? storedLegs.map((leg, idx) => ({
              legs: [leg],
              stake: stakeVal,
              totalOdds: round2(leg.odds),
              potential: round2(stakeVal * leg.odds),
              usedBonus: idx === 0 ? bonusToUse : 0,
            }))
          : [
              {
                legs: storedLegs,
                stake: totalStake,
                totalOdds: totals.totalOdds,
                potential: totals.potential,
                usedBonus: bonusToUse,
              },
            ];

      const betIds = await ctx.db.$transaction(async (tx) => {
        const ids: string[] = [];
        for (const row of rows) {
          const bet = await tx.bet.create({
            data: {
              id: newBetId(),
              userId: ctx.currentUser.id,
              bookingCode,
              type,
              stake: row.stake,
              totalOdds: row.totalOdds,
              potential: row.potential,
              comboCount: type === 'system' ? totals.comboCount : undefined,
              systemConfig: type === 'system' ? { picksPerCombo: picksForSystem } : undefined,
              legs: row.legs,
              status: 'open',
              usedBonus: row.usedBonus,
            },
          });
          ids.push(bet.id);
        }
        await tx.txn.create({
          data: {
            userId: ctx.currentUser.id,
            type: 'stake',
            amount: -cashNeeded,
            status: 'success',
            ref: bookingCode,
            meta: bonusToUse > 0 ? { bonusUsed: bonusToUse } : undefined,
          },
        });
        if (bonusToUse > 0) {
          await tx.user.update({
            where: { id: ctx.currentUser.id },
            data: { bonusBalance: round2(Number(user!.bonusBalance) - bonusToUse) },
          });
        }
        return ids;
      });

      return { ok: true, betIds };
    }),
});

export { newBetId, newBookingCode };
```

- [ ] **Step 4: Mount the router**

In `server/src/routers/_app.ts`, import and add `bets: betsRouter,`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test --workspace=server -- bets.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck --workspace=server`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add server/src/routers/bets.ts server/src/routers/_app.ts server/tests/bets.test.ts
git commit -m "feat(server): bets.place"
```

---

### Task 11: `bets` router — `listBets`, `cashOut`

**Files:**
- Modify: `server/src/routers/bets.ts`
- Modify: `server/tests/bets.test.ts`

**Interfaces:**
- Consumes: `cashoutValue`, `MatchCashoutInput` (`src/lib/cashout.ts`, Task 3)
- Produces: `betsRouter.listBets`, `betsRouter.cashOut`

- [ ] **Step 1: Write the failing tests**

Append to `server/tests/bets.test.ts`:

```ts
function matchSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm1',
    status: 'live' as const,
    score: { home: 1, away: 0 },
    minute: 60,
    markets: [{ key: '1x2', suspended: false, outcomes: [{ code: '1', odds: 1.5, suspended: false }] }],
    ...overrides,
  };
}

describe('bets.listBets', () => {
  it('returns only the caller\'s own bets, newest first', async () => {
    const caller = await signedInCaller();
    await caller.bets.place({ type: 'single', stakePerCombo: 10, legs: [openLeg()] });
    const bets = await caller.bets.listBets();
    expect(bets).toHaveLength(1);
    expect(bets[0].userId).toBe((await caller.auth.me())!.id);
  });
});

describe('bets.cashOut', () => {
  it('credits the wallet and marks the bet cashed out on a full cash-out', async () => {
    const caller = await signedInCaller();
    const placed = await caller.bets.place({ type: 'single', stakePerCombo: 10, legs: [openLeg()] });
    const result = await caller.bets.cashOut({
      betId: placed.betIds![0],
      portion: 1,
      matches: [matchSnapshot()],
    });
    expect(result.ok).toBe(true);
    expect(result.amount).toBeGreaterThan(0);

    const bets = await caller.bets.listBets();
    expect(bets[0].status).toBe('cashed_out');
    const txns = await caller.wallet.listTxns();
    expect(txns.find((t) => t.type === 'cashout')?.amount).toBe(result.amount);
  });

  it('rejects cashing out a bet that is not open', async () => {
    const caller = await signedInCaller();
    const placed = await caller.bets.place({ type: 'single', stakePerCombo: 10, legs: [openLeg()] });
    await caller.bets.cashOut({ betId: placed.betIds![0], portion: 1, matches: [matchSnapshot()] });
    const second = await caller.bets.cashOut({ betId: placed.betIds![0], portion: 1, matches: [matchSnapshot()] });
    expect(second.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=server -- bets.test.ts`
Expected: FAIL — `listBets`/`cashOut` undefined

- [ ] **Step 3: Add the two procedures**

Add the `cashoutValue`/`MatchCashoutInput` import to `server/src/routers/bets.ts`:

```ts
import { cashoutValue, type MatchCashoutInput } from '../../../src/lib/cashout';
```

A zod schema for the match-snapshot input, reused by `settle` in Task 12:

```ts
const matchSnapshotInput = z.object({
  id: z.string(),
  status: matchStatusSchema,
  score: z.object({ home: z.number(), away: z.number() }).optional(),
  minute: z.number().optional(),
  markets: z.array(
    z.object({
      key: z.string(),
      suspended: z.boolean(),
      outcomes: z.array(z.object({ code: z.string(), odds: z.number(), suspended: z.boolean().optional() })),
    })
  ),
});
```

Append inside `betsRouter`:

```ts
  listBets: protectedProcedure.query(async ({ ctx }) => {
    const bets = await ctx.db.bet.findMany({
      where: { userId: ctx.currentUser.id },
      orderBy: { placedAt: 'desc' },
    });
    return bets.map(mapBet);
  }),

  cashOut: protectedProcedure
    .input(z.object({ betId: z.string(), portion: z.number().min(0).max(1), matches: z.array(matchSnapshotInput) }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.bet.findUnique({ where: { id: input.betId, userId: ctx.currentUser.id } });
      if (!row || row.status !== 'open') return { ok: false, error: 'Bet not active' };
      const bet = mapBet(row);

      const matchesByid: Record<string, MatchCashoutInput> = {};
      for (const m of input.matches) matchesByid[m.id] = m;
      const value = cashoutValue(bet, matchesByid);
      if (!value.available) return { ok: false, error: value.reason || 'Cash out unavailable' };

      const amount = round2(value.amount * input.portion);

      await ctx.db.$transaction(async (tx) => {
        if (input.portion < 1) {
          const cashoutHistory = [...(bet.cashoutHistory ?? []), { amount, portion: input.portion, at: Date.now() }];
          await tx.bet.update({
            where: { id: bet.id },
            data: {
              stake: round2(bet.stake * (1 - input.portion)),
              potential: round2(bet.potential * (1 - input.portion)),
              cashoutHistory,
            },
          });
        } else {
          await tx.bet.update({
            where: { id: bet.id },
            data: { status: 'cashed_out', cashoutAmount: amount, payout: amount, settledAt: new Date() },
          });
        }
        await tx.txn.create({
          data: {
            userId: ctx.currentUser.id,
            type: 'cashout',
            amount,
            status: 'success',
            ref: `CO-${bet.bookingCode}`,
            resolvedAt: new Date(),
          },
        });
      });

      return { ok: true, amount };
    }),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=server -- bets.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add server/src/routers/bets.ts server/tests/bets.test.ts
git commit -m "feat(server): bets.listBets, cashOut"
```

---

### Task 12: `bets` router — `settle`

**Files:**
- Modify: `server/src/routers/bets.ts`
- Modify: `server/tests/bets.test.ts`

**Interfaces:**
- Consumes: `settleBetAgainstMatch`, `MatchSettlementInput` (`src/lib/settlement.ts`, Task 3),
  `matchSnapshotInput` (Task 11, same file)
- Produces: `betsRouter.settle`

- [ ] **Step 1: Write the failing tests**

Append to `server/tests/bets.test.ts`:

```ts
describe('bets.settle', () => {
  it('settles a won single and credits the payout', async () => {
    const caller = await signedInCaller();
    const placed = await caller.bets.place({ type: 'single', stakePerCombo: 10, legs: [openLeg()] });

    await caller.bets.settle({
      match: { id: 'm1', status: 'finished', score: { home: 1, away: 0 }, markets: [] },
    });

    const bets = await caller.bets.listBets();
    expect(bets.find((b) => b.id === placed.betIds![0])?.status).toBe('won');
    const txns = await caller.wallet.listTxns();
    expect(txns.find((t) => t.type === 'payout')?.amount).toBe(20);
  });

  it('ignores bets that reference a different match', async () => {
    const caller = await signedInCaller();
    const placed = await caller.bets.place({ type: 'single', stakePerCombo: 10, legs: [openLeg({ matchId: 'other-match' })] });
    await caller.bets.settle({ match: { id: 'm1', status: 'finished', score: { home: 1, away: 0 }, markets: [] } });
    const bets = await caller.bets.listBets();
    expect(bets.find((b) => b.id === placed.betIds![0])?.status).toBe('open');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=server -- bets.test.ts`
Expected: FAIL — `settle` undefined

- [ ] **Step 3: Add the procedure**

Import in `server/src/routers/bets.ts`:

```ts
import { settleBetAgainstMatch, type MatchSettlementInput } from '../../../src/lib/settlement';
```

Append inside `betsRouter`:

```ts
  settle: protectedProcedure
    .input(z.object({ match: matchSnapshotInput }))
    .mutation(async ({ ctx, input }) => {
      const match: MatchSettlementInput = input.match;
      const open = await ctx.db.bet.findMany({ where: { status: 'open' } });
      const relevant = open.filter((row) => (row.legs as BetLeg[]).some((l) => l.matchId === match.id));

      let settledCount = 0;
      for (const row of relevant) {
        const bet = mapBet(row);
        const next = settleBetAgainstMatch(bet, match);
        if (!next) continue;
        settledCount += 1;

        await ctx.db.$transaction(async (tx) => {
          await tx.bet.update({
            where: { id: bet.id },
            data: {
              legs: next.legs,
              status: next.status,
              payout: next.payout,
              settledAt: next.status !== 'open' ? new Date() : undefined,
            },
          });
          if (next.status !== 'open' && next.payout && next.payout > 0) {
            await tx.txn.create({
              data: {
                userId: bet.userId,
                type: 'payout',
                amount: round2(next.payout),
                status: 'success',
                ref: `WIN-${bet.bookingCode}`,
                resolvedAt: new Date(),
              },
            });
          }
        });
      }
      return { settledCount };
    }),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=server -- bets.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 5: Commit**

```bash
git add server/src/routers/bets.ts server/tests/bets.test.ts
git commit -m "feat(server): bets.settle"
```

---

### Task 13: `bets` router — `voidBet` (admin)

**Files:**
- Modify: `server/src/routers/bets.ts`
- Modify: `server/tests/bets.test.ts`

**Interfaces:**
- Produces: `betsRouter.voidBet` (adminProcedure) — the endpoint `admin-bets.spec.ts` (e2e, Task 15)
  needs.

- [ ] **Step 1: Write the failing tests**

Append to `server/tests/bets.test.ts`:

```ts
describe('bets.voidBet', () => {
  it('refunds the stake and marks the bet void', async () => {
    const caller = await signedInCaller();
    const placed = await caller.bets.place({ type: 'single', stakePerCombo: 10, legs: [openLeg()] });
    const admin = await adminCaller();

    await admin.bets.voidBet({ betId: placed.betIds![0], reason: 'trading_error' });

    const bets = await caller.bets.listBets();
    expect(bets.find((b) => b.id === placed.betIds![0])?.status).toBe('void');
    const txns = await caller.wallet.listTxns();
    expect(txns.find((t) => t.type === 'refund')?.amount).toBe(10);
  });

  it('rejects a non-admin caller', async () => {
    const caller = await signedInCaller();
    const placed = await caller.bets.place({ type: 'single', stakePerCombo: 10, legs: [openLeg()] });
    await expect(caller.bets.voidBet({ betId: placed.betIds![0], reason: 'x' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=server -- bets.test.ts`
Expected: FAIL — `voidBet` undefined

- [ ] **Step 3: Add the procedure**

In `server/src/routers/bets.ts`, change the existing `import { protectedProcedure, router } from '../trpc';`
to also import `adminProcedure`. Append inside `betsRouter`:

```ts
  voidBet: adminProcedure
    .input(z.object({ betId: z.string(), reason: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.bet.findUnique({ where: { id: input.betId } });
      if (!row || row.status !== 'open') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Bet not found or already settled' });
      }
      const bet = mapBet(row);
      const refund = Math.max(0, bet.stake - (bet.usedBonus ?? 0));

      await ctx.db.$transaction(async (tx) => {
        await tx.bet.update({
          where: { id: bet.id },
          data: { status: 'void', payout: bet.stake, settledAt: new Date(), cashoutAmount: null },
        });
        await tx.txn.create({
          data: {
            userId: bet.userId,
            type: 'refund',
            amount: refund,
            status: 'success',
            ref: `VOID-${input.reason}`,
            resolvedAt: new Date(),
          },
        });
      });
      return { ok: true };
    }),
```

Add a new import line: `import { TRPCError } from '@trpc/server';`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=server -- bets.test.ts`
Expected: PASS (13 tests)

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck --workspace=server`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/src/routers/bets.ts server/tests/bets.test.ts
git commit -m "feat(server): bets.voidBet"
```

---

### Task 14: Rewrite `src/store/wallet.ts` against the server

**Files:**
- Modify: `src/store/wallet.ts`
- Modify: `tests/` — any test that mutates `useWallet`'s store directly needs to mock
  `trpcClient.wallet.*` instead (check `tests/slip.test.ts` and any other test importing
  `useWallet` for direct state manipulation).

**Interfaces:**
- Consumes: `trpcClient.wallet.*` (Tasks 7-9)
- Produces: `useWallet` keeps its exact current `WalletState` interface — every screen that reads
  `balanceOf`/`lockedOf`/`pendingWithdrawals`/`userTxns` needs no changes.

- [ ] **Step 1: Identify tests that touch `useWallet` directly**

Run: `grep -rln "useWallet" tests/`
Expected: a short list (likely `tests/slip.test.ts` and possibly others) — read each to see
whether it calls `useWallet.getState().deposit(...)` etc. directly (needs a `trpcClient` mock
added) or only reads derived state after another store's action already populated it (no change
needed).

- [ ] **Step 2: Rewrite `src/store/wallet.ts`**

Replace the `localStorage`-backed implementation with one that hydrates from and mutates through
`trpcClient.wallet`, keeping the exact same interface. Key changes: `txns` starts empty and is
populated by a new `hydrate()` method (called from `useAuth`'s `init`/`signIn`/`signUp` success
paths — wire this in Step 3); every mutating method becomes `async` and calls the matching
`trpcClient.wallet.*` procedure, then refetches or optimistically merges the response;
`startWithdrawalAutoApprover` and its `setInterval` are deleted entirely (Task 9 moved this
server-side).

```ts
import { create } from 'zustand';
import type { Txn } from '@/lib/types';
import { round2 } from '@/lib/format';
import { trpcClient } from '@/lib/trpc';

interface WalletState {
  txns: Record<string, Txn[]>;
  hydrate: (userId: string) => Promise<void>;
  clear: () => void;
  deposit: (userId: string, amount: number, provider: string) => Promise<Txn>;
  requestWithdrawal: (userId: string, amount: number, momoNumber: string) => Promise<{ txn?: Txn; error?: string }>;
  userTxns: (userId: string) => Txn[];
  balanceOf: (userId: string) => number;
  lockedOf: (userId: string) => number;
  pendingWithdrawals: () => Array<Txn & { userId: string }>;
}

export const useWallet = create<WalletState>((set, get) => ({
  txns: {},

  hydrate: async (userId) => {
    const list = await trpcClient.wallet.listTxns.query();
    set({ txns: { ...get().txns, [userId]: list } });
  },

  clear: () => set({ txns: {} }),

  deposit: async (userId, amount, provider) => {
    const txn = await trpcClient.wallet.deposit.mutate({ amount, provider });
    set({ txns: { ...get().txns, [userId]: [txn, ...(get().txns[userId] || [])] } });
    return txn;
  },

  requestWithdrawal: async (userId, amount, momoNumber) => {
    const result = await trpcClient.wallet.requestWithdrawal.mutate({ amount, momoNumber });
    if (result.error) return result;
    set({ txns: { ...get().txns, [userId]: [result.txn!, ...(get().txns[userId] || [])] } });
    return result;
  },

  userTxns: (userId) => get().txns[userId] || [],

  balanceOf: (userId) =>
    round2((get().txns[userId] || []).filter((t) => t.status === 'success').reduce((sum, t) => sum + t.amount, 0)),

  lockedOf: (userId) =>
    round2(
      (get().txns[userId] || [])
        .filter((t) => t.type === 'withdrawal' && t.status === 'pending')
        .reduce((sum, t) => sum + Math.abs(t.amount), 0)
    ),

  pendingWithdrawals: () =>
    Object.entries(get().txns).flatMap(([userId, list]) =>
      list.filter((t) => t.type === 'withdrawal' && t.status === 'pending').map((t) => ({ ...t, userId }))
    ),
}));
```

Notes on what's deliberately dropped from the old interface: `applyStake`, `credit`, `refundStake`,
`resolveWithdrawal`, and `adminAdjust` are removed from `WalletState` — they were the client's own
ledger-writing primitives, and every one of their call sites moves to the server (`bets.place`,
`bets.cashOut`, `bets.settle`, `bets.voidBet` write their own `Txn`s directly; `AdminOps.tsx`'s
admin-adjust and manual-resolve buttons call `trpcClient.wallet.adminAdjust`/`resolveWithdrawal`
directly rather than through this store — update those two call sites in `AdminOps.tsx` to call
`trpcClient` directly and then call `hydrate()` to refresh, since they're one-off admin actions,
not part of the store's own state machine).

- [ ] **Step 3: Wire `hydrate`/`clear` into `useAuth`**

In `src/store/auth.ts`, after a successful `signUp`/`signIn`/`init`'s `me` resolution
(`set({ profile })`), call `useWallet.getState().hydrate(profile.id)`; on `signOut`, call
`useWallet.getState().clear()`. (This mirrors how `useBets` will be wired identically in Task 15 —
do both stores' hydration in the same pass through `auth.ts` to avoid two separate edits touching
the same lines.)

- [ ] **Step 4: Update any test that called the removed methods**

For each test found in Step 1 that called a removed method (`applyStake`, `credit`, etc.) directly:
replace the direct store call with a `vi.mock('@/lib/trpc', ...)` stub returning the expected
`Txn`, matching the mocking pattern already used elsewhere in `tests/` for `trpcClient` (if none
exists yet, add a minimal `vi.fn().mockResolvedValue(...)` per procedure the test needs).

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test -- --run`
Expected: PASS

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/store/wallet.ts src/store/auth.ts src/screens/AdminOps.tsx tests/
git commit -m "feat: rewrite wallet store against the server"
```

---

### Task 15: Rewrite `src/store/bets.ts` against the server

**Files:**
- Modify: `src/store/bets.ts`
- Modify: `src/components/Betslip.tsx` (send the three extra per-leg validation fields `place`
  needs: `matchStatus`, `marketSuspended`, `outcomeSuspended`)
- Modify: `src/store/auth.ts` (wire `useBets.hydrate`/`clear`, same pass as Task 14 Step 3)
- Modify: any test importing `useBets` directly (same audit as Task 14 Step 1, applied to `bets`)

**Interfaces:**
- Consumes: `trpcClient.bets.*` (Tasks 10-13)
- Produces: `useBets` keeps its exact current `BetsState` interface.

- [ ] **Step 1: Update `src/components/Betslip.tsx`'s leg construction**

The server's `place` input needs three fields per leg that today's client-built `BetLeg[]` doesn't
carry (Task 10's `legInput` schema). At the point `legs` is built (around line 230), each leg needs
its source match looked up so these fields can be read:

```ts
const legs = items.map((i) => {
  const match = liveEngine.get(i.matchId);
  const market = match?.markets.find((mk) => mk.key === i.marketKey);
  const outcome = market?.outcomes.find((o) => o.code === i.outcomeCode);
  return {
    matchId: i.matchId,
    matchName: i.matchName,
    leagueName: i.leagueName,
    marketKey: i.marketKey,
    marketName: i.marketName,
    outcomeCode: i.outcomeCode,
    outcomeLabel: i.outcomeLabel,
    odds: i.odds,
    kickoff: i.kickoff,
    status: 'open' as const,
    matchStatus: match?.status ?? 'cancelled',
    marketSuspended: market?.suspended ?? true,
    outcomeSuspended: outcome?.suspended ?? true,
  };
});
```

(`?? 'cancelled'` / `?? true` are the safe-fail defaults if the match somehow isn't in the live
engine's map anymore at submit time — the same "reject rather than guess" stance the pre-1b code
had.) Add `import { liveEngine } from '@/lib/liveEngine';` if not already present.

- [ ] **Step 2: Rewrite `src/store/bets.ts`**

The structural/limit/RG validation that used to run entirely client-side before calling
`wallet.applyStake` now lives server-side (Task 10) — this store becomes a thin
hydrate-then-call-the-server wrapper, matching Task 14's wallet rewrite:

```ts
import { create } from 'zustand';
import type { Bet } from '@/lib/types';
import { trpcClient } from '@/lib/trpc';
import { liveEngine } from '@/lib/liveEngine';
import { cashoutValueLive } from '@/lib/cashoutLive';
import type { MatchCashoutInput } from '@/lib/cashout';
import { useAuth } from './auth';
import { useNotifs } from './notifs';
import { logger } from '@/lib/logger';

interface PlaceInput {
  type: Bet['type'];
  stakePerCombo: number;
  legs: Array<Bet['legs'][number] & { matchStatus: string; marketSuspended: boolean; outcomeSuspended: boolean }>;
  systemPicks?: number;
  useBonus?: number;
}

interface BetsState {
  bets: Bet[];
  placing: boolean;
  lastPlacedIds: string[];
  hydrate: () => Promise<void>;
  clear: () => void;
  placeBet: (input: PlaceInput) => Promise<{ ok: boolean; error?: string; betIds?: string[] }>;
  cashOut: (betId: string, portion: number) => Promise<{ ok: boolean; error?: string; amount?: number }>;
  settleOnMatchFinish: (matchId: string) => Promise<void>;
}

export const useBets = create<BetsState>((set, get) => ({
  bets: [],
  placing: false,
  lastPlacedIds: [],

  hydrate: async () => {
    const bets = await trpcClient.bets.listBets.query();
    set({ bets });
  },

  clear: () => set({ bets: [], lastPlacedIds: [] }),

  placeBet: async (input) => {
    set({ placing: true });
    const result = await trpcClient.bets.place.mutate(input as never);
    set({ placing: false });
    if (!result.ok) return result;
    await get().hydrate();
    set({ lastPlacedIds: result.betIds ?? [] });

    const profile = useAuth.getState().profile;
    if (profile) {
      useNotifs.getState().push(
        { userId: profile.id, kind: 'bet_placed', title: 'Bet placed successfully', body: `Booking code sent` },
        profile.notifPrefs
      );
    }
    logger.info('bet.placed', { betIds: result.betIds });
    return result;
  },

  cashOut: async (betId, portion) => {
    const bet = get().bets.find((b) => b.id === betId);
    if (!bet) return { ok: false, error: 'Bet not active' };
    const matchIds = [...new Set(bet.legs.map((l) => l.matchId))];
    const matches: MatchCashoutInput[] = matchIds.map((id) => liveEngine.get(id)).filter((m): m is NonNullable<typeof m> => !!m);

    set({ placing: true });
    const result = await trpcClient.bets.cashOut.mutate({ betId, portion, matches });
    set({ placing: false });
    if (!result.ok) return result;
    await get().hydrate();

    const profile = useAuth.getState().profile;
    if (profile) {
      useNotifs.getState().push(
        { userId: profile.id, kind: 'cashout', title: 'Cash out successful', body: `${result.amount!.toFixed(2)} credited to your wallet` },
        profile.notifPrefs
      );
    }
    logger.info('bet.cashout', { betId, amount: result.amount, portion });
    return result;
  },

  settleOnMatchFinish: async (matchId) => {
    const snapshot = liveEngine.get(matchId);
    if (!snapshot) return;
    const result = await trpcClient.bets.settle.mutate({ match: snapshot });
    if (result.settledCount > 0) await get().hydrate();
  },
}));
```

`cashoutValueLive` (imported above, used by `BetPieces.tsx` directly — Task 3, no change needed
here) stays the client-side live-estimate display; `cashOut` itself no longer calls it, since the
server is now the source of truth for the actual payout amount.

- [ ] **Step 3: Wire `hydrate`/`clear` into `useAuth`**

Same pass as Task 14 Step 3: in `src/store/auth.ts`, alongside `useWallet.getState().hydrate(...)`,
call `useBets.getState().hydrate()`; alongside `useWallet.getState().clear()`, call
`useBets.getState().clear()`.

- [ ] **Step 4: Wire `settleOnMatchFinish` at its existing trigger point**

`src/main.tsx`'s `useMatches.getState().onFinish((matchId) => useBets.getState().settleOnMatchFinish(matchId))`
call site needs no change — `settleOnMatchFinish` keeps the same signature, it's just `async` now.

- [ ] **Step 5: Update any test that called the removed methods**

Same audit as Task 14 Step 4, applied to `useBets` (`voidBet` is removed from the client store
entirely — it's admin-only server-side now via `trpcClient.bets.voidBet`; update `AdminOps.tsx`'s
void-bet UI to call that directly, then `useBets.getState().hydrate()`).

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test -- --run`
Expected: PASS

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/store/bets.ts src/components/Betslip.tsx src/store/auth.ts src/main.tsx src/screens/AdminOps.tsx tests/
git commit -m "feat: rewrite bets store against the server"
```

---

### Task 16: Final integration — full suite green against the real backend

**Files:** none new — this task is verification and whatever fixes it surfaces.

**Interfaces:** none new.

This mirrors Phase 1a's Task 14: everything up to here has been verified in isolation (server unit
tests, frontend unit tests with mocks), but the full stack — real Postgres, real HTTP round trips,
Playwright driving the real browser — has not run end to end yet. Expect this task to surface
integration bugs the per-task tests couldn't catch (timing, serialization edge cases, a
`Decimal`-vs-`number` mismatch, etc.) — budget real time for it, don't treat it as a formality.

- [ ] **Step 1: Reseed and run the full server unit suite**

```bash
npm run db:seed --workspace=server
npm run test --workspace=server
npm run db:seed --workspace=server
```

Expected: all suites pass (the second reseed restores demo accounts before e2e, since the test
run's `beforeEach` truncates them — established Phase 1a operational pattern).

- [ ] **Step 2: Run the full frontend unit suite**

Run: `npm run test -- --run`
Expected: PASS

- [ ] **Step 3: Typecheck both workspaces**

```bash
npm run typecheck
npm run typecheck --workspace=server
```

Expected: PASS

- [ ] **Step 4: Run the full e2e suite**

Run: `npx playwright test --project=mobile --workers=1 --reporter=list`
Expected: PASS. Specs most likely to need fixes given this plan's changes:
`betting.spec.ts`, `booking-and-wallet.spec.ts`, `bet-builder.spec.ts`, `admin-bets.spec.ts`,
`notification-prefs.spec.ts` (the withdrawal-approved-notice test — the sweep is now server-side on
a 15s interval, so this test's `page.clock` fake-timer approach from Phase 1a no longer controls
when the sweep fires; it will likely need to poll/wait for the real 15s interval instead of
advancing a fake clock).

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 6: Fix whatever step 1-5 surfaced, then re-verify**

Repeat steps 1-5 until every check is green. Do not skip or weaken a test to make it pass — if a
test's assumption is genuinely obsolete (like the withdrawal-sweep timing above), rewrite it to
assert the real new behavior, and say so in the commit message.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "test: fix integration breakage found running Phase 1b end-to-end"
```
