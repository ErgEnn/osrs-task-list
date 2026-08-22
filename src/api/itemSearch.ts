import type { IconRef } from '@/domain/types';
import { getItemMapping, searchItems } from './prices';
import { searchWiki } from './wiki';

export interface ItemSuggestion {
  name: string;
  iconRef: IconRef;
  /** 'tradeable' = realtime-prices mapping (instant, canonical icon file);
   *  'wiki' = opensearch page title (covers untradeables like Ghommal's hilt). */
  source: 'tradeable' | 'wiki';
}

/**
 * Item suggestions from both sources, deduped by name: the tradeable mapping
 * first (exact icon file names), then wiki page titles for everything the
 * mapping misses — untradeables, quest items, CA rewards. For wiki hits the
 * inventory icon is assumed at File:{title}.png, the wiki's convention for
 * item pages; non-item pages simply fall back to badge icons downstream.
 */
export async function searchItemsAndPages(query: string, limit = 10): Promise<ItemSuggestion[]> {
  const [mapping, pages] = await Promise.all([
    getItemMapping().catch(() => []),
    searchWiki(query, limit).catch(() => [] as string[]),
  ]);

  const results: ItemSuggestion[] = searchItems(mapping, query, limit).map((item) => ({
    name: item.name,
    iconRef: { kind: 'wikiFile', fileName: item.icon },
    source: 'tradeable',
  }));

  const seen = new Set(results.map((r) => r.name.toLowerCase()));
  for (const title of pages) {
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      name: title,
      iconRef: { kind: 'wikiFile', fileName: `${title}.png` },
      source: 'wiki',
    });
  }

  return results.slice(0, limit);
}
