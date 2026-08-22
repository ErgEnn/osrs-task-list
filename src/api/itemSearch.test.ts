import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setFetchImpl } from './http';
import { searchItemsAndPages } from './itemSearch';

const MAPPING = [
  { id: 4151, name: 'Abyssal whip', icon: 'Abyssal whip.png', members: true },
  { id: 4587, name: 'Dragon scimitar', icon: 'Dragon scimitar.png', members: true },
];

const GHOMMAL_PAGES = [
  "ghommal",
  ["Ghommal's hilt 1", "Ghommal's hilt 2", 'Ghommal'],
  ['', '', ''],
  ['https://x/1', 'https://x/2', 'https://x/3'],
];

beforeEach(() => {
  localStorage.clear();
  setFetchImpl(async (input) => {
    const url = String(input);
    if (url.includes('prices.runescape.wiki')) {
      return new Response(JSON.stringify(MAPPING), { status: 200 });
    }
    if (url.includes('action=opensearch')) {
      const payload = url.includes('search=ghommal') ? GHOMMAL_PAGES : ['q', [], [], []];
      return new Response(JSON.stringify(payload), { status: 200 });
    }
    throw new Error(`Unexpected request ${url}`);
  });
});

afterEach(() => setFetchImpl(null));

describe('searchItemsAndPages', () => {
  it('finds untradeable items through wiki page search', async () => {
    const results = await searchItemsAndPages('ghommal');
    const hilt = results.find((r) => r.name === "Ghommal's hilt 1");
    expect(hilt).toBeDefined();
    expect(hilt!.source).toBe('wiki');
    expect(hilt!.iconRef).toEqual({ kind: 'wikiFile', fileName: "Ghommal's hilt 1.png" });
  });

  it('keeps tradeable mapping hits first and dedupes against page titles', async () => {
    setFetchImpl(async (input) => {
      const url = String(input);
      if (url.includes('prices.runescape.wiki')) {
        return new Response(JSON.stringify(MAPPING), { status: 200 });
      }
      // opensearch returns the same item plus one extra page
      return new Response(
        JSON.stringify(['whip', ['Abyssal whip', 'Whip vine'], ['', ''], ['', '']]),
        { status: 200 },
      );
    });
    const results = await searchItemsAndPages('whip');
    const names = results.map((r) => r.name);
    expect(names.filter((n) => n === 'Abyssal whip')).toHaveLength(1);
    expect(results[0]).toMatchObject({ name: 'Abyssal whip', source: 'tradeable' });
    expect(names).toContain('Whip vine');
  });

  it('survives one source failing', async () => {
    setFetchImpl(async (input) => {
      const url = String(input);
      if (url.includes('prices.runescape.wiki')) {
        return new Response('nope', { status: 500 });
      }
      return new Response(JSON.stringify(GHOMMAL_PAGES), { status: 200 });
    });
    const results = await searchItemsAndPages('ghommal');
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.source === 'wiki')).toBe(true);
  });
});
