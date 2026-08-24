export const APP_NAME = import.meta.env.VITE_APP_NAME || 'OddWave';
export const CURRENCY = import.meta.env.VITE_CURRENCY || 'GH₵';
export const DEMO_MODE = String(import.meta.env.VITE_DEMO_MODE ?? 'true') !== 'false';

export const LIMITS = {
  minStake: 1,
  maxStake: 20000,
  maxPayout: 500000,
  minDeposit: 5,
  maxDeposit: 10000,
  minWithdrawal: 20,
  maxWithdrawal: 50000,
};

export const BOOKING_CODE_TTL_MS = 24 * 60 * 60 * 1000;
export const WITHDRAWAL_AUTO_APPROVE_MS = 120_000;
export const SESSION_DAYS = 7;
export const ACCA_BONUS_TIERS: Array<{ picks: number; pct: number }> = [
  { picks: 5, pct: 3 },
  { picks: 6, pct: 5 },
  { picks: 8, pct: 8 },
  { picks: 10, pct: 12 },
  { picks: 15, pct: 20 },
];
