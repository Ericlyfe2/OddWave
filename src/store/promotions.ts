import { create } from 'zustand';
import type { Promotion, PromoKind } from '@/lib/types';
import { loadJson, saveJson } from '@/lib/storage';
import { uid } from '@/lib/rng';
import { logger } from '@/lib/logger';

const STORAGE_KEY = 'promotions';

/**
 * Ships as the default campaign set so the app has something to show on first
 * run, but every field here is editable (and campaigns creatable/removable)
 * from the admin Promotions tab — nothing about a campaign is hardcoded into
 * the UI beyond its `kind`, which selects which eligibility rule applies.
 */
const SEED_PROMOTIONS: Promotion[] = [
  {
    id: 'welcome',
    kind: 'welcome',
    title: '100% Welcome Boost',
    blurb: 'First bet on us — get a 25 bonus stake credited instantly when you place your first wager.',
    terms: ['New accounts only', 'One-time claim', 'Bonus stake usable on any market', 'Winnings from bonus are withdrawable'],
    value: 25,
    accent: '#1d64d8',
    active: true,
    createdAt: Date.now(),
  },
  {
    id: 'freebet-friday',
    kind: 'freebet',
    title: 'Free Bet Friday',
    blurb: 'Stake 50+ on any multi with 3+ legs today and claim a 10 free bet.',
    terms: ['Minimum qualifying stake 50', 'Multi must contain 3+ selections', 'One claim per Friday', 'Free bet expires in 7 days'],
    value: 10,
    accent: '#b26a06',
    active: true,
    createdAt: Date.now(),
  },
  {
    id: 'acca-boost',
    kind: 'boost',
    title: 'Acca Boost up to +20%',
    blurb: 'Automatic payout boost on winning multis. The more legs, the bigger the boost.',
    terms: ['Applies automatically', '5+ legs qualify', 'Boost tiers: 3% to 20%', 'Excludes system bets'],
    value: 0,
    accent: '#0f4092',
    active: true,
    createdAt: Date.now(),
  },
  {
    id: 'cashback-weekend',
    kind: 'cashback',
    title: 'Weekend Cashback 10%',
    blurb: 'Lose your weekend multis? Get 10% back as a bonus stake every Monday.',
    terms: ['Multis with 4+ legs only', 'Max cashback 100', 'Credited Mondays', 'Opt-in required'],
    value: 0,
    accent: '#3b82f6',
    active: true,
    createdAt: Date.now(),
  },
];

export interface PromotionInput {
  kind: PromoKind;
  title: string;
  blurb: string;
  terms: string[];
  value: number;
  accent: string;
}

interface PromotionsState {
  promotions: Promotion[];
  /** All campaigns, newest first — for the admin console. */
  list: () => Promotion[];
  /** Only what customers should see. */
  activeList: () => Promotion[];
  getById: (id: string) => Promotion | undefined;
  create: (input: PromotionInput) => Promotion;
  update: (id: string, patch: Partial<PromotionInput>) => void;
  setActive: (id: string, active: boolean) => void;
  remove: (id: string) => void;
}

function persist(promotions: Promotion[]): void {
  saveJson(STORAGE_KEY, promotions);
}

export const usePromotions = create<PromotionsState>((set, get) => ({
  promotions: loadJson<Promotion[]>(STORAGE_KEY, SEED_PROMOTIONS),

  list: () => [...get().promotions].sort((a, b) => b.createdAt - a.createdAt),

  activeList: () => get().promotions.filter((p) => p.active),

  getById: (id) => get().promotions.find((p) => p.id === id),

  create: (input) => {
    const promo: Promotion = { ...input, id: uid('promo-'), active: true, createdAt: Date.now() };
    const next = [...get().promotions, promo];
    set({ promotions: next });
    persist(next);
    logger.info('promotions.created', { promoId: promo.id, kind: promo.kind });
    return promo;
  },

  update: (id, patch) => {
    const next = get().promotions.map((p) => (p.id === id ? { ...p, ...patch } : p));
    set({ promotions: next });
    persist(next);
    logger.info('promotions.updated', { promoId: id, keys: Object.keys(patch) });
  },

  setActive: (id, active) => {
    const next = get().promotions.map((p) => (p.id === id ? { ...p, active } : p));
    set({ promotions: next });
    persist(next);
    logger.info('promotions.active_toggled', { promoId: id, active });
  },

  remove: (id) => {
    const next = get().promotions.filter((p) => p.id !== id);
    set({ promotions: next });
    persist(next);
    logger.info('promotions.removed', { promoId: id });
  },
}));
