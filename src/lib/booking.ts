import type { SlipItem } from './types';
import { BOOKING_CODE_TTL_MS } from './config';

interface BookingPayload {
  items: Array<Pick<SlipItem, 'outcomeId' | 'matchId' | 'marketKey' | 'outcomeCode' | 'odds'>>;
  createdAt: number;
}

const STORE_KEY = 'booking_codes';

function readStore(): Record<string, BookingPayload> {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, BookingPayload>): void {
  localStorage.setItem(STORE_KEY, JSON.stringify(store));
}

function codeFrom(items: string[]): string {
  let h = 5381;
  for (const s of items.join('|')) h = ((h << 5) + h + s.charCodeAt(0)) >>> 0;
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  let x = h;
  for (let i = 0; i < 8; i++) {
    out += alphabet[x % alphabet.length];
    x = Math.floor(x / alphabet.length) + 31 * i;
  }
  return out;
}

export function generateBookingCode(items: SlipItem[]): { code: string; expiresAt: number } | null {
  if (items.length === 0) return null;
  const store = readStore();
  const payload: BookingPayload = {
    items: items.map(({ outcomeId, matchId, marketKey, outcomeCode, odds }) => ({ outcomeId, matchId, marketKey, outcomeCode, odds })),
    createdAt: Date.now(),
  };
  const base = codeFrom(payload.items.map((i) => `${i.matchId}:${i.outcomeCode}`));
  let code = base;
  let n = 1;
  while (store[code] && Date.now() - store[code].createdAt < BOOKING_CODE_TTL_MS) {
    code = `${base}${n}`;
    n++;
  }
  store[code] = payload;
  writeStore(pruneExpired(store));
  return { code, expiresAt: payload.createdAt + BOOKING_CODE_TTL_MS };
}

export function loadBookingCode(code: string): { ok: boolean; error?: string; payload?: BookingPayload } {
  const clean = code.trim().toUpperCase();
  if (!clean) return { ok: false, error: 'Enter a booking code' };
  const store = readStore();
  const entry = store[clean];
  if (!entry) return { ok: false, error: 'Booking code not found' };
  if (Date.now() - entry.createdAt > BOOKING_CODE_TTL_MS) return { ok: false, error: 'This booking code has expired' };
  return { ok: true, payload: entry };
}

function pruneExpired(store: Record<string, BookingPayload>): Record<string, BookingPayload> {
  const next: Record<string, BookingPayload> = {};
  for (const [k, v] of Object.entries(store)) {
    if (Date.now() - v.createdAt < BOOKING_CODE_TTL_MS * 7) next[k] = v;
  }
  return next;
}
