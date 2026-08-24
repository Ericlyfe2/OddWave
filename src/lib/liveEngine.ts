import type { Match, Outcome } from './types';
import { seededRng } from './rng';
import { clamp } from './format';

type Listener = (dirtyIds: string[]) => void;

const TICK_MS = 1800;
const VIRTUAL_RESTART_MS = 12_000;
/** Staggers restarts so virtual leagues never all go dark at the same moment. */
const VIRTUAL_RESTART_JITTER_MS = 25_000;

class LiveEngine {
  private timer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<Listener>();
  private matches = new Map<string, Match>();
  private rng = seededRng('oddwave-live');
  private dirty = new Set<string>();
  private openingOdds = new Map<string, Record<string, number>>();

  private markDirty(id: string): void {
    this.dirty.add(id);
  }

  registerAll(matches: Match[]): void {
    for (const m of matches) {
      this.matches.set(m.id, m);
      if (m.virtual) {
        // Virtual rounds recycle, so keep the opening prices to reset back to.
        this.openingOdds.set(
          m.id,
          Object.fromEntries(m.markets.flatMap((mk) => mk.outcomes.map((o) => [o.id, o.odds] as const)))
        );
      }
    }
  }

  get(id: string): Match | undefined {
    return this.matches.get(id);
  }

  getAll(): Match[] {
    return [...this.matches.values()];
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    if (!this.timer) this.start();
    return () => {
      this.listeners.delete(fn);
      if (this.listeners.size === 0) this.stop();
    };
  }

  updateMatch(id: string, mutator: (m: Match) => void): void {
    const m = this.matches.get(id);
    if (!m) return;
    mutator(m);
  }

  private start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  private stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private emit(): void {
    const ids = [...this.dirty];
    this.dirty.clear();
    for (const fn of this.listeners) fn(ids);
  }

  private driftOdds(m: Match): boolean {
    let changed = false;
    for (const market of m.markets) {
      if (market.suspended) continue;
      for (const o of market.outcomes) {
        if (o.suspended || m.status !== 'live') continue;
        if (this.rng() > 0.12) continue;
        const deltaPct = (this.rng() - 0.5) * 0.09;
        const next = clamp(Math.round(o.odds * (1 + deltaPct) * 100) / 100, 1.01, 60);
        if (next === o.odds) continue;
        o.prevOdds = o.odds;
        o.trend = next > o.odds ? 'down' : 'up';
        o.odds = next;
        o.updatedAt = Date.now();
        changed = true;
      }
    }
    return changed;
  }

  tick(): void {
    let structural = false;
    for (const m of [...this.matches.values()]) {
      if (m.status === 'live') {
        const speed = m.virtual ? 3 : 1;
        const advance = Math.max(1, Math.floor(this.rng() * 4)) * speed;
        const prevMinute = m.minute ?? 0;
        const nextMinute = prevMinute + advance;
        const limit = m.sportId === 'football' ? 90 : m.sportId === 'basketball' ? 56 : 80;
        m.minute = Math.min(limit, nextMinute);
        m.period =
          m.sportId === 'football'
            ? (m.minute ?? 0) <= 45
              ? '1st Half'
              : '2nd Half'
            : m.period;
        this.markDirty(m.id);

        if (!m.score) m.score = { home: 0, away: 0 };
        // Scoring is modelled per game-minute, not per tick. Virtual rounds run 6x
        // faster in wall-clock time but must still produce realistic scorelines.
        const perMinute = m.sportId === 'football' ? 0.031 : 0.018;
        let goals = 0;
        for (let i = 0; i < advance; i++) {
          if (this.rng() < perMinute) goals++;
        }
        if (goals > 0) {
          let { home, away } = m.score;
          for (let i = 0; i < goals; i++) {
            if (this.rng() < 0.53) home++;
            else away++;
          }
          m.score = { home, away };
          for (const mk of m.markets) mk.suspended = true;
        setTimeout(
          () => {
            const mm = this.matches.get(m.id);
            if (!mm || mm.status !== 'live') return;
            for (const mk of mm.markets) {
              mk.outcomes.forEach((o: Outcome) => this.repriceOutcome(o, mm));
              mk.suspended = false;
            }
            this.markDirty(mm.id);
            this.emit();
          },
          4500
        );
        structural = true;
      } else if (this.driftOdds(m)) {
        structural = true;
      }

      if ((m.minute ?? 0) >= limit) {
          this.finishMatch(m);
          structural = true;
        }
      }
    }
    if (structural) this.emit();
  }

  repriceOutcome(o: Outcome, m: Match): void {
    const s = m.score ?? { home: 0, away: 0 };
    const diff = s.home - s.away;
    const timeLeft = Math.max(0.06, 1 - (m.minute ?? 0) / 90);
    let bias = 0;
    if (o.code === '1') bias = diff > 0 ? -timeLeft * 0.7 : timeLeft * 0.25;
    else if (o.code === '2') bias = diff < 0 ? -timeLeft * 0.7 : timeLeft * 0.25;
    else if (o.code === 'X') bias = diff === 0 ? timeLeft * 0.9 : -0.3;
    else if (o.code.startsWith('under')) bias = (s.home + s.away >= 2 ? 0.8 : -timeLeft * 0.5);
    else if (o.code.startsWith('over')) bias = (s.home + s.away >= 2 ? -0.5 : timeLeft * 0.4);
    else if (o.code === 'btts_yes') bias = s.home > 0 && s.away > 0 ? -0.75 : 0.15;
    else if (o.code === 'btts_no') bias = s.home > 0 && s.away > 0 ? 2.2 : -0.1;

    const next = clamp(Math.round(o.odds * (1 + bias) * 100) / 100, 1.01, 80);
    if (next === o.odds) return;
    o.prevOdds = o.odds;
    o.trend = next > o.odds ? 'down' : 'up';
    o.odds = next;
    o.updatedAt = Date.now();
  }

  finishMatch(m: Match): void {
    m.status = 'finished';
    m.finishedAt = Date.now();
    m.minute = undefined;
    m.period = undefined;
    this.markDirty(m.id);
    if (m.virtual) this.scheduleVirtualRestart(m.id);
  }

  /** Virtual leagues run continuously: a finished round settles, then a fresh one kicks off. */
  private scheduleVirtualRestart(id: string): void {
    setTimeout(() => {
      const m = this.matches.get(id);
      if (!m || m.status !== 'finished') return;
      const opening = this.openingOdds.get(id);
      m.status = 'live';
      m.minute = 1;
      m.period = m.sportId === 'football' ? '1st Half' : m.period;
      m.score = { home: 0, away: 0 };
      m.kickoff = Date.now();
      m.finishedAt = undefined;
      for (const mk of m.markets) {
        mk.suspended = false;
        for (const o of mk.outcomes) {
          if (opening && opening[o.id] !== undefined) o.odds = opening[o.id];
          o.suspended = false;
          o.prevOdds = undefined;
          o.trend = undefined;
          o.updatedAt = Date.now();
        }
      }
      this.markDirty(id);
      this.emit();
    }, VIRTUAL_RESTART_MS + Math.floor(this.rng() * VIRTUAL_RESTART_JITTER_MS));
  }

  endNow(id: string): boolean {
    const m = this.matches.get(id);
    if (m && m.status === 'live') {
      this.finishMatch(m);
      this.emit();
      return true;
    }
    return false;
  }

  postpone(id: string): boolean {
    const m = this.matches.get(id);
    if (m && (m.status === 'upcoming' || m.status === 'live')) {
      m.status = 'postponed';
      m.kickoff += 3600_000;
      this.markDirty(id);
      this.emit();
      return true;
    }
    return false;
  }

  cancel(id: string): boolean {
    const m = this.matches.get(id);
    if (m && (m.status === 'upcoming' || m.status === 'live')) {
      m.status = 'cancelled';
      this.markDirty(id);
      this.emit();
      return true;
    }
    return false;
  }

  setMarketSuspended(id: string, marketKey: string, suspended: boolean): void {
    const m = this.matches.get(id);
    if (!m) return;
    const mk = m.markets.find((x) => x.key === marketKey);
    if (mk) {
      mk.suspended = suspended;
      this.markDirty(id);
      this.emit();
    }
  }
}

export const liveEngine = new LiveEngine();

export function outcomeResult(match: Match, marketKey: string, code: string): 'won' | 'lost' | 'void' {
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
