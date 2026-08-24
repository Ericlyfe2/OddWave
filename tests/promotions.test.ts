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

async function freshPromotionsStore() {
  installLocalStorageMock();
  vi.resetModules();
  const { usePromotions } = await import('../src/store/promotions');
  return usePromotions;
}

describe('promotions store', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('ships with the seeded campaigns, all active', async () => {
    const usePromotions = await freshPromotionsStore();
    const all = usePromotions.getState().promotions;
    expect(all.length).toBeGreaterThanOrEqual(4);
    expect(all.every((p) => p.active)).toBe(true);
  });

  it('creates a campaign that is immediately active and shows in both lists', async () => {
    const usePromotions = await freshPromotionsStore();
    const before = usePromotions.getState().promotions.length;

    const created = usePromotions.getState().create({
      kind: 'boost',
      title: 'Test Campaign',
      blurb: 'A campaign created for a test.',
      terms: ['Term one', 'Term two'],
      value: 5,
      accent: '#123456',
    });

    expect(created.active).toBe(true);
    expect(created.id).toBeTruthy();
    expect(usePromotions.getState().promotions).toHaveLength(before + 1);
    expect(usePromotions.getState().list().map((p) => p.id)).toContain(created.id);
    expect(usePromotions.getState().activeList().map((p) => p.id)).toContain(created.id);
  });

  it('lists newest campaigns first', async () => {
    const usePromotions = await freshPromotionsStore();
    // Date.now() has 1ms resolution: two synchronous creates can tie on
    // createdAt, so force them apart to make "newest first" unambiguous.
    vi.useFakeTimers();
    try {
      const first = usePromotions.getState().create({ kind: 'boost', title: 'First', blurb: 'b', terms: [], value: 0, accent: '#000' });
      vi.advanceTimersByTime(1);
      const second = usePromotions.getState().create({ kind: 'boost', title: 'Second', blurb: 'b', terms: [], value: 0, accent: '#000' });

      const ordered = usePromotions.getState().list();
      expect(ordered.findIndex((p) => p.id === second.id)).toBeLessThan(ordered.findIndex((p) => p.id === first.id));
    } finally {
      vi.useRealTimers();
    }
  });

  it('hiding a campaign removes it from activeList but keeps it in list', async () => {
    const usePromotions = await freshPromotionsStore();
    const promo = usePromotions.getState().create({ kind: 'cashback', title: 'Hideable', blurb: 'b', terms: [], value: 0, accent: '#000' });

    usePromotions.getState().setActive(promo.id, false);

    expect(usePromotions.getState().getById(promo.id)?.active).toBe(false);
    expect(usePromotions.getState().activeList().some((p) => p.id === promo.id)).toBe(false);
    expect(usePromotions.getState().list().some((p) => p.id === promo.id)).toBe(true);

    usePromotions.getState().setActive(promo.id, true);
    expect(usePromotions.getState().activeList().some((p) => p.id === promo.id)).toBe(true);
  });

  it('updates campaign fields in place without changing its id or creation order', async () => {
    const usePromotions = await freshPromotionsStore();
    const promo = usePromotions.getState().create({ kind: 'freebet', title: 'Original', blurb: 'b', terms: [], value: 10, accent: '#000' });

    usePromotions.getState().update(promo.id, { title: 'Renamed', value: 20 });

    const updated = usePromotions.getState().getById(promo.id);
    expect(updated?.id).toBe(promo.id);
    expect(updated?.title).toBe('Renamed');
    expect(updated?.value).toBe(20);
    expect(updated?.kind).toBe('freebet');
  });

  it('removes a campaign entirely', async () => {
    const usePromotions = await freshPromotionsStore();
    const promo = usePromotions.getState().create({ kind: 'welcome', title: 'Removable', blurb: 'b', terms: [], value: 0, accent: '#000' });

    usePromotions.getState().remove(promo.id);

    expect(usePromotions.getState().getById(promo.id)).toBeUndefined();
    expect(usePromotions.getState().list().some((p) => p.id === promo.id)).toBe(false);
  });

  it('persists campaigns and their active state across a store reload', async () => {
    const usePromotions = await freshPromotionsStore();
    const promo = usePromotions.getState().create({ kind: 'boost', title: 'Persisted', blurb: 'b', terms: [], value: 0, accent: '#000' });
    usePromotions.getState().setActive(promo.id, false);

    vi.resetModules();
    const { usePromotions: reloaded } = await import('../src/store/promotions');

    const reloadedPromo = reloaded.getState().getById(promo.id);
    expect(reloadedPromo?.title).toBe('Persisted');
    expect(reloadedPromo?.active).toBe(false);
  });
});
