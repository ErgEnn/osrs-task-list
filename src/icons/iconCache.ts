/**
 * Persistent icon cache: wiki images fetched once, stored as data URLs in
 * localStorage under its own key — deliberately OUTSIDE the task store's
 * persist blob so task edits never re-serialize megabytes of image data.
 * Byte-accounted LRU keeps the cache under a fixed cap. Consumers subscribe
 * via useSyncExternalStore.
 */

const STORAGE_KEY = 'osrs-tl:icon-cache:v1';
const BYTE_CAP = 2_500_000;

interface CacheEntry {
  dataUrl: string;
  bytes: number;
  lastUsed: number;
}

interface CacheShape {
  entries: Record<string, CacheEntry>;
  totalBytes: number;
}

function emptyState(): CacheShape {
  return { entries: {}, totalBytes: 0 };
}

function load(): CacheShape {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as CacheShape;
    if (typeof parsed !== 'object' || parsed === null || typeof parsed.entries !== 'object') {
      return emptyState();
    }
    let total = 0;
    for (const entry of Object.values(parsed.entries)) {
      if (typeof entry.dataUrl !== 'string') return emptyState();
      total += entry.bytes;
    }
    return { entries: parsed.entries, totalBytes: total };
  } catch {
    return emptyState();
  }
}

let state = load();
let version = 0;
const listeners = new Set<() => void>();

function notify() {
  version++;
  for (const listener of listeners) listener();
}

function persistState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota pressure: halve the cache and try once more.
    evictToCap(Math.floor(BYTE_CAP / 2));
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Give up quietly — icons will refetch next session.
    }
  }
}

function evictToCap(cap: number) {
  const entries = Object.entries(state.entries);
  entries.sort((a, b) => a[1].lastUsed - b[1].lastUsed);
  while (state.totalBytes > cap && entries.length) {
    const [key, entry] = entries.shift()!;
    delete state.entries[key];
    state.totalBytes -= entry.bytes;
  }
}

export const iconCache = {
  get(key: string): string | null {
    const entry = state.entries[key];
    if (!entry) return null;
    entry.lastUsed = Date.now(); // in-memory bump; persisted on the next write
    return entry.dataUrl;
  },

  has(key: string): boolean {
    return key in state.entries;
  },

  put(key: string, dataUrl: string): void {
    const previous = state.entries[key];
    if (previous) state.totalBytes -= previous.bytes;
    const bytes = dataUrl.length;
    state.entries[key] = { dataUrl, bytes, lastUsed: Date.now() };
    state.totalBytes += bytes;
    evictToCap(BYTE_CAP);
    persistState();
    notify();
  },

  clear(): void {
    state = emptyState();
    persistState();
    notify();
  },

  stats(): { count: number; totalBytes: number } {
    return { count: Object.keys(state.entries).length, totalBytes: state.totalBytes };
  },

  /** Signal a state change that isn't a put (e.g. a fetch marked as failed). */
  bump(): void {
    notify();
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getVersion(): number {
    return version;
  },
};
