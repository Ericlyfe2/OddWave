export type SportId =
  | 'football'
  | 'basketball'
  | 'tennis'
  | 'cricket'
  | 'rugby'
  | 'baseball'
  | 'volleyball'
  | 'esports';

export interface Sport {
  id: SportId;
  name: string;
  enabled: boolean;
}

export interface Team {
  id: string;
  name: string;
  short: string;
  color: string;
}

export interface League {
  id: string;
  sportId: SportId;
  name: string;
  country: string;
  featured: boolean;
}

export type MarketKey = '1x2' | 'dc' | 'ou' | 'btts' | 'moneyline' | 'hcp' | 'totalgames' | 'setwinner' | 'runline' | 'totalsr';

export interface Outcome {
  id: string;
  marketKey: MarketKey;
  label: string;
  code: string;
  odds: number;
  prevOdds?: number;
  trend?: 'up' | 'down';
  suspended?: boolean;
  updatedAt: number;
}

export interface Market {
  key: MarketKey;
  name: string;
  group: string;
  suspended: boolean;
  outcomes: Outcome[];
  builderAllowed: boolean;
}

export type MatchStatus = 'upcoming' | 'live' | 'finished' | 'postponed' | 'cancelled';

export interface Match {
  id: string;
  sportId: SportId;
  leagueId: string;
  leagueName: string;
  country: string;
  home: Team;
  away: Team;
  kickoff: number;
  status: MatchStatus;
  minute?: number;
  period?: string;
  score?: { home: number; away: number };
  markets: Market[];
  featured?: boolean;
  virtual?: boolean;
  finishedAt?: number;
}

export type UserRole = 'user' | 'admin';

export interface RGLimits {
  depositLimit: number | null;
  lossLimit: number | null;
  sessionReminderMin: number | null;
  selfExcludedUntil: number | null;
}

export interface NotificationPrefs {
  betUpdates: boolean;
  promotions: boolean;
  liveEvents: boolean;
}

/** A sign-in on one device. Revoking one invalidates that device's session. */
export interface DeviceSession {
  id: string;
  userId: string;
  device: string;
  createdAt: number;
  lastSeenAt: number;
  exp: number;
}

export interface Profile {
  id: string;
  email: string;
  phone: string;
  fullName: string;
  role: UserRole;
  createdAt: number;
  bonusBalance: number;
  suspended?: boolean;
  claimedPromos: string[];
  rgLimits: RGLimits;
  notifPrefs: NotificationPrefs;
  emailVerified?: boolean;
  phoneVerified?: boolean;
}

export type TxnType = 'deposit' | 'withdrawal' | 'stake' | 'payout' | 'cashout' | 'bonus' | 'refund' | 'adjustment';
export type TxnStatus = 'pending' | 'success' | 'failed';

export interface Txn {
  id: string;
  userId: string;
  type: TxnType;
  amount: number;
  status: TxnStatus;
  ref: string;
  meta?: Record<string, unknown>;
  createdAt: number;
  resolvedAt?: number;
}

export type BetType = 'single' | 'multi' | 'system' | 'builder';
export type BetStatus = 'open' | 'won' | 'lost' | 'cashed_out' | 'void';
export type LegStatus = 'open' | 'won' | 'lost' | 'void';

export interface BetLeg {
  matchId: string;
  matchName: string;
  leagueName: string;
  marketKey: MarketKey;
  marketName: string;
  outcomeCode: string;
  outcomeLabel: string;
  odds: number;
  kickoff: number;
  status: LegStatus;
  scoreAtPlacement?: string;
}

export interface SystemConfig {
  picksPerCombo: number;
}

export interface Bet {
  id: string;
  userId: string;
  bookingCode: string;
  type: BetType;
  stake: number;
  totalOdds: number;
  potential: number;
  comboCount?: number;
  systemConfig?: SystemConfig;
  legs: BetLeg[];
  status: BetStatus;
  payout?: number;
  cashoutAmount?: number;
  /** Every partial cash-out taken while the bet is still open, oldest first. */
  cashoutHistory?: Array<{ amount: number; portion: number; at: number }>;
  usedBonus: number;
  placedAt: number;
  settledAt?: number;
}

export interface AppNotification {
  id: string;
  userId: string;
  kind: 'bet_placed' | 'bet_won' | 'bet_lost' | 'cashout' | 'deposit' | 'withdrawal' | 'promo' | 'system' | 'live';
  title: string;
  body: string;
  link?: string;
  read: boolean;
  createdAt: number;
}

export type PromoKind = 'welcome' | 'freebet' | 'boost' | 'cashback';

export interface Promotion {
  id: string;
  kind: PromoKind;
  title: string;
  blurb: string;
  terms: string[];
  value: number;
  accent: string;
  /** Inactive campaigns are hidden from customers but kept for admin history. */
  active: boolean;
  createdAt: number;
}

export interface SlipItem {
  outcomeId: string;
  matchId: string;
  matchName: string;
  leagueName: string;
  marketKey: MarketKey;
  marketName: string;
  outcomeLabel: string;
  outcomeCode: string;
  odds: number;
  oddsSnapshot: number;
  kickoff: number;
  addedAt: number;
}
