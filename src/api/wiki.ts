import { getJson } from './http';

const WIKI_API = 'https://oldschool.runescape.wiki/api.php';
export const WIKI_BASE = 'https://oldschool.runescape.wiki';

/** Every request carries origin=* — the MediaWiki anonymous-CORS switch. */
export function wikiUrl(params: Record<string, string>): string {
  const search = new URLSearchParams({
    format: 'json',
    formatversion: '2',
    origin: '*',
    ...params,
  });
  return `${WIKI_API}?${search.toString()}`;
}

type OpenSearchResponse = [string, string[], string[], string[]];

/** Page-title suggestions (items, monsters, quests, anything). */
export async function searchWiki(query: string, limit = 10): Promise<string[]> {
  if (!query.trim()) return [];
  const data = await getJson<OpenSearchResponse>(
    wikiUrl({ action: 'opensearch', search: query, limit: String(limit), redirects: 'resolve' }),
  );
  return Array.isArray(data?.[1]) ? data[1] : [];
}

interface PageImagesResponse {
  query?: { pages?: Array<{ title: string; thumbnail?: { source?: string } }> };
}

/** Lead-image thumbnail of a page — the monster picture for monster pages. */
export async function getPageThumbUrl(pageTitle: string, size = 64): Promise<string | null> {
  const data = await getJson<PageImagesResponse>(
    wikiUrl({
      action: 'query',
      prop: 'pageimages',
      piprop: 'thumbnail',
      pithumbsize: String(size),
      titles: pageTitle,
      redirects: '1',
    }),
  );
  return data.query?.pages?.[0]?.thumbnail?.source ?? null;
}

interface ImageInfoResponse {
  query?: {
    pages?: Array<{
      title: string;
      missing?: boolean;
      imageinfo?: Array<{ url?: string; thumburl?: string }>;
    }>;
  };
}

/** Direct URL of File:{fileName} — item inventory icons live at File:{Item name}.png. */
export async function getFileUrl(fileName: string, width = 64): Promise<string | null> {
  const data = await getJson<ImageInfoResponse>(
    wikiUrl({
      action: 'query',
      prop: 'imageinfo',
      iiprop: 'url',
      iiurlwidth: String(width),
      titles: `File:${fileName}`,
      redirects: '1',
    }),
  );
  const info = data.query?.pages?.[0]?.imageinfo?.[0];
  return info?.thumburl ?? info?.url ?? null;
}

/** Hotlink-of-last-resort for a wiki file (used only when CORS caching failed). */
export function fileHotlinkUrl(fileName: string, width = 64): string {
  return `${WIKI_BASE}/w/Special:FilePath/${encodeURIComponent(fileName)}?width=${width}`;
}

interface RevisionsResponse {
  query?: {
    pages?: Array<{
      title: string;
      missing?: boolean;
      revisions?: Array<{ slots?: { main?: { content?: string } } }>;
    }>;
  };
}

/** Raw wikitext for up to many pages (chunked ≤50 titles per request). */
export async function getWikitext(titles: string[]): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (let i = 0; i < titles.length; i += 50) {
    const chunk = titles.slice(i, i + 50);
    const data = await getJson<RevisionsResponse>(
      wikiUrl({
        action: 'query',
        prop: 'revisions',
        rvprop: 'content',
        rvslots: 'main',
        titles: chunk.join('|'),
        redirects: '1',
      }),
    );
    for (const page of data.query?.pages ?? []) {
      const content = page.revisions?.[0]?.slots?.main?.content;
      if (typeof content === 'string') result[page.title] = content;
    }
  }
  return result;
}

interface CategoryMembersResponse {
  continue?: { cmcontinue?: string };
  query?: { categorymembers?: Array<{ title: string; ns: number }> };
}

const QUEST_LIST_KEY = 'osrs-tl:quest-list:v1';
const QUEST_LIST_TTL = 7 * 24 * 60 * 60 * 1000;

interface QuestListCache {
  fetchedAt: number;
  titles: string[];
}

function readQuestCache(): QuestListCache | null {
  try {
    const raw = localStorage.getItem(QUEST_LIST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as QuestListCache;
    if (!Array.isArray(parsed.titles) || typeof parsed.fetchedAt !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

/** All quest page titles from Category:Quests, cached for a week. */
export async function listQuestTitles(force = false): Promise<string[]> {
  const cached = readQuestCache();
  if (!force && cached && Date.now() - cached.fetchedAt < QUEST_LIST_TTL) {
    return cached.titles;
  }
  const titles: string[] = [];
  let cmcontinue: string | undefined;
  do {
    const params: Record<string, string> = {
      action: 'query',
      list: 'categorymembers',
      cmtitle: 'Category:Quests',
      cmnamespace: '0',
      cmlimit: '500',
    };
    if (cmcontinue) params.cmcontinue = cmcontinue;
    const data = await getJson<CategoryMembersResponse>(wikiUrl(params));
    for (const member of data.query?.categorymembers ?? []) {
      if (member.ns === 0) titles.push(member.title);
    }
    cmcontinue = data.continue?.cmcontinue;
  } while (cmcontinue);

  if (titles.length > 0) {
    try {
      localStorage.setItem(
        QUEST_LIST_KEY,
        JSON.stringify({ fetchedAt: Date.now(), titles } satisfies QuestListCache),
      );
    } catch {
      // cache is a nicety — ignore quota errors
    }
  } else if (cached) {
    return cached.titles;
  }
  return titles;
}
