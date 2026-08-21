import { afterEach, describe, expect, it } from 'vitest';
import playerFixture from './__fixtures__/wikisync-player.json';
import { setFetchImpl } from './http';
import { getPlayerState, isWikiSyncPlayer, WikiSyncNotFoundError } from './wikiSync';

afterEach(() => setFetchImpl(null));

describe('isWikiSyncPlayer', () => {
  it('accepts the documented shape and rejects garbage', () => {
    expect(isWikiSyncPlayer(playerFixture)).toBe(true);
    expect(isWikiSyncPlayer(null)).toBe(false);
    expect(isWikiSyncPlayer({ levels: { a: 'high' }, quests: {} })).toBe(false);
    expect(isWikiSyncPlayer({ levels: {}, quests: [] })).toBe(false);
  });
});

describe('getPlayerState', () => {
  it('encodes the username into the STANDARD profile url', async () => {
    let seen = '';
    setFetchImpl(async (input) => {
      seen = String(input);
      return new Response(JSON.stringify(playerFixture), { status: 200 });
    });
    const player = await getPlayerState('iron man 42');
    expect(player.quests["Cook's Assistant"]).toBe(2);
    expect(seen).toBe('https://sync.runescape.wiki/runelite/player/iron%20man%2042/STANDARD');
  });

  it('maps 404 to a friendly WikiSync error', async () => {
    setFetchImpl(async () => new Response('not found', { status: 404 }));
    await expect(getPlayerState('nobody')).rejects.toBeInstanceOf(WikiSyncNotFoundError);
  });

  it('rejects unexpected response shapes', async () => {
    setFetchImpl(async () => new Response(JSON.stringify({ hello: 'world' }), { status: 200 }));
    await expect(getPlayerState('someone')).rejects.toThrow(/shape/);
  });
});
