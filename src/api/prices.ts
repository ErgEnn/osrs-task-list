import { getJson } from './http';

const MAPPING_URL = 'https://prices.runescape.wiki/api/v1/osrs/mapping';
const MAPPING_KEY = 'osrs-tl:item-mapping:v1';
const MAPPING_TTL = 7 * 24 * 60 * 60 * 1000;

export interface ItemMapEntry {
  id: number;
  name: string;
  /** Wiki file name of the inventory icon, e.g. "Abyssal whip.png". */
  icon: string;
}

interface MappingCache {
  fetchedAt: number;
  items: ItemMapEntry[];
}

function readCache(): MappingCache | null {
  try {
    const raw = localStorage.getItem(MAPPING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MappingCache;
    if (!Array.isArray(parsed.items) || typeof parsed.fetchedAt !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * The realtime-prices item mapping: every tradeable item with its icon file
 * name. Slimmed to three fields (~250KB) and cached for a week — it powers
 * instant local item search.
 */
export async function getItemMapping(force = false): Promise<ItemMapEntry[]> {
  const cached = readCache();
  if (!force && cached && Date.now() - cached.fetchedAt < MAPPING_TTL) {
    return cached.items;
  }
  try {
    const raw = await getJson<Array<{ id: number; name: string; icon: string }>>(MAPPING_URL);
    const items: ItemMapEntry[] = raw
      .filter((entry) => typeof entry.name === 'string' && typeof entry.icon === 'string')
      .map(({ id, name, icon }) => ({ id, name, icon }));
    try {
      localStorage.setItem(
        MAPPING_KEY,
        JSON.stringify({ fetchedAt: Date.now(), items } satisfies MappingCache),
      );
    } catch {
      // ignore quota errors — search just refetches next session
    }
    return items;
  } catch (error) {
    if (cached) return cached.items; // stale beats broken
    throw error;
  }
}

/** Rank: prefix matches first, then substring matches; alphabetical within groups. */
export function searchItems(items: ItemMapEntry[], query: string, limit = 10): ItemMapEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const starts: ItemMapEntry[] = [];
  const contains: ItemMapEntry[] = [];
  for (const item of items) {
    const name = item.name.toLowerCase();
    if (name.startsWith(q)) starts.push(item);
    else if (name.includes(q)) contains.push(item);
  }
  const byName = (a: ItemMapEntry, b: ItemMapEntry) => a.name.localeCompare(b.name);
  return [...starts.sort(byName), ...contains.sort(byName)].slice(0, limit);
}
