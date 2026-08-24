import { describe, it, expect, beforeEach, vi } from 'vitest';

function installLocalStorageMock(): void {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  });
}

function setSession(userId: string | null): void {
  if (userId === null) localStorage.removeItem('oddwave:v1:session');
  else localStorage.setItem('oddwave:v1:session', JSON.stringify({ userId }));
}

async function freshFavoritesStore() {
  installLocalStorageMock();
  vi.resetModules();
  const { useFavorites } = await import('../src/store/favorites');
  return useFavorites;
}

describe('favorites store', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('reflects a toggled favorite immediately (regression: isFav used to read the wrong key)', async () => {
    const useFavorites = await freshFavoritesStore();
    setSession('u-fan');

    expect(useFavorites.getState().isFav('events', 'match-1')).toBe(false);
    useFavorites.getState().toggle('events', 'match-1');
    expect(useFavorites.getState().isFav('events', 'match-1')).toBe(true);

    useFavorites.getState().toggle('events', 'match-1');
    expect(useFavorites.getState().isFav('events', 'match-1')).toBe(false);
  });

  it('keeps event and league favorites in separate buckets', async () => {
    const useFavorites = await freshFavoritesStore();
    setSession('u-fan');

    // Same id used for both types must not collide.
    useFavorites.getState().toggle('events', 'shared-id');
    expect(useFavorites.getState().isFav('events', 'shared-id')).toBe(true);
    expect(useFavorites.getState().isFav('leagues', 'shared-id')).toBe(false);

    useFavorites.getState().toggle('leagues', 'shared-id');
    expect(useFavorites.getState().isFav('leagues', 'shared-id')).toBe(true);
    expect(useFavorites.getState().isFav('events', 'shared-id')).toBe(true);
  });

  it('scopes favorites per signed-in account', async () => {
    const useFavorites = await freshFavoritesStore();

    setSession('u-alice');
    useFavorites.getState().toggle('events', 'match-1');
    expect(useFavorites.getState().isFav('events', 'match-1')).toBe(true);

    setSession('u-bob');
    expect(useFavorites.getState().isFav('events', 'match-1')).toBe(false);

    setSession('u-alice');
    expect(useFavorites.getState().isFav('events', 'match-1')).toBe(true);
  });

  it('falls back to a guest scope with no session', async () => {
    const useFavorites = await freshFavoritesStore();
    setSession(null);

    useFavorites.getState().toggle('events', 'match-1');
    expect(useFavorites.getState().isFav('events', 'match-1')).toBe(true);
    expect(useFavorites.getState().countFor('events')).toBe(1);
  });

  it('lists and counts only the requested type', async () => {
    const useFavorites = await freshFavoritesStore();
    setSession('u-fan');

    useFavorites.getState().toggle('events', 'match-1');
    useFavorites.getState().toggle('events', 'match-2');
    useFavorites.getState().toggle('leagues', 'ghpl');

    expect(useFavorites.getState().countFor('events')).toBe(2);
    expect(useFavorites.getState().countFor('leagues')).toBe(1);
    expect(useFavorites.getState().listFor('events').sort()).toEqual(['match-1', 'match-2']);
    expect(useFavorites.getState().totalCount()).toBe(3);
  });

  it('persists across a store reload', async () => {
    const useFavorites = await freshFavoritesStore();
    setSession('u-fan');
    useFavorites.getState().toggle('events', 'match-1');
    useFavorites.getState().toggle('leagues', 'ghpl');

    vi.resetModules();
    const { useFavorites: reloaded } = await import('../src/store/favorites');
    expect(reloaded.getState().isFav('events', 'match-1')).toBe(true);
    expect(reloaded.getState().isFav('leagues', 'ghpl')).toBe(true);
  });
});
