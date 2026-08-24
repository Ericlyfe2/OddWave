const NS = 'oddwave:v1:';

export function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(NS + key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(NS + key, JSON.stringify(value));
  } catch {
    // storage full or unavailable
  }
}

export function removeKey(key: string): void {
  try {
    localStorage.removeItem(NS + key);
  } catch {
    // ignore
  }
}

let throttleTimer: ReturnType<typeof setTimeout> | null = null;
const pendingSaves = new Map<string, () => void>();

export function saveThrottled(key: string, getValue: () => unknown): void {
  pendingSaves.set(key, () => saveJson(key, getValue()));
  if (throttleTimer) return;
  throttleTimer = setTimeout(() => {
    throttleTimer = null;
    for (const [k, fn] of pendingSaves) {
      fn();
      pendingSaves.delete(k);
    }
  }, 400);
}

export function wipeAll(): void {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(NS))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignore
  }
}
