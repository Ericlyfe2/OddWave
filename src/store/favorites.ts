import { create } from 'zustand';
import { loadJson, saveJson } from '@/lib/storage';

export type FavoriteType = 'events' | 'leagues';

type ScopedFavorites = Record<FavoriteType, string[]>;

interface FavState {
  /** userId (or 'guest') -> favorite type -> ids. */
  ids: Record<string, ScopedFavorites>;
  toggle: (type: FavoriteType, id: string) => void;
  isFav: (type: FavoriteType, id: string) => boolean;
  countFor: (type: FavoriteType) => number;
  listFor: (type: FavoriteType) => string[];
  totalCount: () => number;
}

const STORAGE_KEY = 'favorites';

// A shared, referentially-stable empty array. `listFor` is called directly as a
// zustand selector (`useFavorites((s) => s.listFor('events'))`); returning a
// fresh `[]` literal here would make every render see a "changed" snapshot and
// spin into an infinite update loop (the same failure mode fixed earlier in
// matches.ts and AccountScreens.tsx for the same reason).
const EMPTY_LIST: readonly string[] = [];

function emptyScope(): ScopedFavorites {
  return { events: [], leagues: [] };
}

function currentKey(): string {
  try {
    const raw = localStorage.getItem('oddwave:v1:session');
    if (!raw) return 'guest';
    return JSON.parse(raw).userId ?? 'guest';
  } catch {
    return 'guest';
  }
}

export const useFavorites = create<FavState>((set, get) => ({
  ids: loadJson<Record<string, ScopedFavorites>>(STORAGE_KEY, {}),

  toggle: (type, id) => {
    const scope = currentKey();
    const bucket = get().ids[scope] ?? emptyScope();
    const list = bucket[type] ?? [];
    const nextList = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
    const next = { ...get().ids, [scope]: { ...bucket, [type]: nextList } };
    set({ ids: next });
    saveJson(STORAGE_KEY, next);
  },

  isFav: (type, id) => {
    const scope = currentKey();
    return (get().ids[scope]?.[type] ?? []).includes(id);
  },

  countFor: (type) => {
    const scope = currentKey();
    return (get().ids[scope]?.[type] ?? []).length;
  },

  listFor: (type) => {
    const scope = currentKey();
    return get().ids[scope]?.[type] ?? EMPTY_LIST;
  },

  totalCount: () => {
    const scope = currentKey();
    const bucket = get().ids[scope];
    if (!bucket) return 0;
    return (bucket.events?.length ?? 0) + (bucket.leagues?.length ?? 0);
  },
}));
