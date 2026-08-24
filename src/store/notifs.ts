import { create } from 'zustand';
import type { AppNotification, NotificationPrefs } from '@/lib/types';
import { loadJson, saveJson } from '@/lib/storage';
import { uid } from '@/lib/rng';
import { findProfileById } from '@/store/auth';

interface NotifsState {
  items: AppNotification[];
  push: (n: Omit<AppNotification, 'id' | 'read' | 'createdAt'> & { createdAt?: number }) => void;
  markAllRead: () => void;
  markRead: (id: string) => void;
  clear: (userId: string) => void;
  unreadFor: (userId: string) => number;
  itemsFor: (userId: string) => AppNotification[];
}

/**
 * Maps a notification's `kind` to the preference toggle that governs it.
 * Wallet movements (deposit/withdrawal) and system notices aren't covered by
 * any toggle in Settings — like a bank, we don't let those be muted, since
 * they're the user's own money moving, not marketing.
 */
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

  push: (n) => {
    const prefKey = prefKeyFor(n.kind);
    if (prefKey) {
      const profile = findProfileById(n.userId);
      // No profile on record (e.g. a stale/removed account) fails open rather
      // than silently dropping a notification for a user we can't check.
      if (profile && !profile.notifPrefs[prefKey]) return;
    }

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
    const next = [item, ...get().items].slice(0, 100);
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
