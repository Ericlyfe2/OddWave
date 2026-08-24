import { create } from 'zustand';
import { uid } from '@/lib/rng';
import { loadJson, saveJson } from '@/lib/storage';

export interface Toast {
  id: string;
  kind: 'success' | 'error' | 'info';
  message: string;
}

interface UIState {
  toasts: Toast[];
  recentSearches: string[];
  betslipOpen: boolean;
  sideNavOpen: boolean;
  toast: (kind: Toast['kind'], message: string) => void;
  dismissToast: (id: string) => void;
  addRecentSearch: (q: string) => void;
  clearRecentSearches: () => void;
  setBetslipOpen: (open: boolean) => void;
  setSideNavOpen: (open: boolean) => void;
}

export const useUI = create<UIState>((set, get) => ({
  toasts: [],
  recentSearches: loadJson<string[]>('recent_searches', []),
  betslipOpen: false,
  sideNavOpen: false,

  toast: (kind, message) => {
    const t: Toast = { id: uid('t-'), kind, message };
    const next = [...get().toasts, t].slice(-4);
    set({ toasts: next });
    setTimeout(() => get().dismissToast(t.id), 3500);
  },

  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),

  addRecentSearch: (q) => {
    const clean = q.trim();
    if (!clean) return;
    const next = [clean, ...get().recentSearches.filter((s) => s.toLowerCase() !== clean.toLowerCase())].slice(0, 8);
    set({ recentSearches: next });
    saveJson('recent_searches', next);
  },

  clearRecentSearches: () => {
    set({ recentSearches: [] });
    saveJson('recent_searches', []);
  },

  setBetslipOpen: (betslipOpen) => set({ betslipOpen }),

  setSideNavOpen: (sideNavOpen) => set({ sideNavOpen }),
}));
