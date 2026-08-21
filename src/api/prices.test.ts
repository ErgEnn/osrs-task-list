import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import mappingFixture from './__fixtures__/mapping-slim.json';
import { setFetchImpl } from './http';
import { getItemMapping, searchItems, type ItemMapEntry } from './prices';

beforeEach(() => localStorage.clear());
afterEach(() => setFetchImpl(null));

describe('getItemMapping', () => {
  it('slims entries to id/name/icon and caches them', async () => {
    let calls = 0;
    setFetchImpl(async () => {
      calls++;
      return new Response(JSON.stringify(mappingFixture), { status: 200 });
    });
    const items = await getItemMapping();
    expect(items[0]).toEqual({ id: 4151, name: 'Abyssal whip', icon: 'Abyssal whip.png' });
    expect(Object.keys(items[0])).toHaveLength(3);

    await getItemMapping();
    expect(calls).toBe(1); // second read served from cache

    const cached = JSON.parse(localStorage.getItem('osrs-tl:item-mapping:v1')!);
    expect(cached.items).toHaveLength(mappingFixture.length);
  });
});

describe('searchItems', () => {
  const items: ItemMapEntry[] = [
    { id: 1, name: 'Ranarr seed', icon: 'Ranarr seed.png' },
    { id: 2, name: 'Grimy ranarr weed', icon: 'Grimy ranarr weed.png' },
    { id: 3, name: 'Ranarr potion (unf)', icon: 'Ranarr potion (unf).png' },
    { id: 4, name: 'Dragon scimitar', icon: 'Dragon scimitar.png' },
  ];

  it('ranks prefix matches before substring matches', () => {
    const results = searchItems(items, 'ranarr');
    expect(results.map((r) => r.name)).toEqual([
      'Ranarr potion (unf)',
      'Ranarr seed',
      'Grimy ranarr weed',
    ]);
  });

  it('returns nothing for an empty query and respects the limit', () => {
    expect(searchItems(items, '  ')).toEqual([]);
    expect(searchItems(items, 'r', 2)).toHaveLength(2);
  });
});
