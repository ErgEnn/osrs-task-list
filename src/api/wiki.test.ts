import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import categoryFixture from './__fixtures__/categorymembers-quests.json';
import imageinfoFixture from './__fixtures__/imageinfo-whip.json';
import opensearchFixture from './__fixtures__/opensearch-whip.json';
import pageimagesFixture from './__fixtures__/pageimages-zulrah.json';
import { setFetchImpl } from './http';
import {
  fileHotlinkUrl,
  getFileUrl,
  getPageThumbUrl,
  getWikitext,
  listQuestTitles,
  searchWiki,
} from './wiki';

let requestedUrls: string[] = [];

function stubFetch(handler: (url: string) => unknown) {
  setFetchImpl(async (input) => {
    const url = String(input);
    requestedUrls.push(url);
    return new Response(JSON.stringify(handler(url)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
}

beforeEach(() => {
  requestedUrls = [];
  localStorage.clear();
});

afterEach(() => {
  setFetchImpl(null);
});

describe('wiki api', () => {
  it('searchWiki hits opensearch with origin=* and returns titles', async () => {
    stubFetch(() => opensearchFixture);
    const titles = await searchWiki('whip');
    expect(titles).toEqual(['Abyssal whip', 'Whip vine']);
    expect(requestedUrls[0]).toContain('origin=*');
    expect(requestedUrls[0]).toContain('action=opensearch');
  });

  it('getFileUrl prefers the sized thumbnail url', async () => {
    stubFetch(() => imageinfoFixture);
    const url = await getFileUrl('Abyssal whip.png', 64);
    expect(url).toBe(
      'https://oldschool.runescape.wiki/images/thumb/Abyssal_whip.png/64px-Abyssal_whip.png',
    );
    expect(requestedUrls[0]).toContain('titles=File%3AAbyssal+whip.png');
    expect(requestedUrls[0]).toContain('iiurlwidth=64');
  });

  it('getPageThumbUrl reads the pageimages thumbnail', async () => {
    stubFetch(() => pageimagesFixture);
    const url = await getPageThumbUrl('Zulrah');
    expect(url).toContain('64px-Zulrah.png');
  });

  it('getWikitext maps page titles to content and chunks requests', async () => {
    stubFetch(() => ({
      query: {
        pages: [
          { title: 'Dragon Slayer I', revisions: [{ slots: { main: { content: '{{Quest}}' } } }] },
        ],
      },
    }));
    const result = await getWikitext(['Dragon Slayer I']);
    expect(result).toEqual({ 'Dragon Slayer I': '{{Quest}}' });
    expect(requestedUrls[0]).toContain('rvslots=main');
  });

  it('listQuestTitles filters to mainspace, follows continuation, and caches', async () => {
    let call = 0;
    stubFetch(() => {
      call++;
      if (call === 1) {
        return { ...categoryFixture, continue: { cmcontinue: 'page|2' } };
      }
      return { query: { categorymembers: [{ pageid: 9, ns: 0, title: 'Monkey Madness I' }] } };
    });
    const titles = await listQuestTitles();
    expect(titles).toEqual([
      "Cook's Assistant",
      'Dragon Slayer I',
      'Druidic Ritual',
      'Lunar Diplomacy',
      'Monkey Madness I',
    ]);
    expect(call).toBe(2);

    // Second call comes from the localStorage cache — no new requests.
    const again = await listQuestTitles();
    expect(again).toEqual(titles);
    expect(call).toBe(2);
  });

  it('fileHotlinkUrl builds a Special:FilePath url', () => {
    expect(fileHotlinkUrl('Abyssal whip.png', 64)).toBe(
      'https://oldschool.runescape.wiki/w/Special:FilePath/Abyssal%20whip.png?width=64',
    );
  });
});
