import { getJson, HttpError } from './http';
import { fetchPlayerViaBridge, hasBridge } from './wikiSyncBridge';

/**
 * WikiSync: the OSRS wiki's by-username player data service, populated for
 * players running the WikiSync plugin on RuneLite/HDOS. Response shape
 * validated defensively — reconfirm against a live capture if it drifts
 * (fixture: src/api/__fixtures__/wikisync-player.json).
 *
 * The service sends no CORS headers, so a browser on this origin cannot read it
 * directly: the request is handed to the bridge userscript when one is
 * installed (see wikiSyncBridge.ts), and a direct fetch is only attempted as a
 * fallback — for a dev proxy, or should the service ever allow this origin.
 */
export interface WikiSyncPlayer {
  username: string;
  /** Skill name -> level, e.g. { "Herblore": 52 } */
  levels: Record<string, number>;
  /** Quest name -> 0 (not started) | 1 (in progress) | 2 (complete) */
  quests: Record<string, number>;
  combat_achievements?: number[];
  achievement_diaries?: unknown;
}

function isNumberRecord(value: unknown): value is Record<string, number> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((v) => typeof v === 'number')
  );
}

export function isWikiSyncPlayer(value: unknown): value is WikiSyncPlayer {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return isNumberRecord(record.levels) && isNumberRecord(record.quests);
}

export class WikiSyncNotFoundError extends Error {
  constructor(username: string) {
    super(
      `No WikiSync data for "${username}". The character must log in with the WikiSync plugin enabled (RuneLite/HDOS).`,
    );
    this.name = 'WikiSyncNotFoundError';
  }
}

/**
 * Raised when the profile could not be read at all: no bridge userscript, and
 * the browser refused the direct request. The message is the one the user sees,
 * so it names the way out rather than the failed fetch.
 */
export class WikiSyncBlockedError extends Error {
  constructor() {
    super(
      'This browser cannot read WikiSync directly — the service allows no other site to. Install the WikiSync bridge userscript from the settings, or paste your profile JSON.',
    );
    this.name = 'WikiSyncBlockedError';
  }
}

export function playerStateUrl(username: string): string {
  return `https://sync.runescape.wiki/runelite/player/${encodeURIComponent(username.trim())}/STANDARD`;
}

/** Through the bridge userscript: no CORS involved, but statuses still are. */
async function viaBridge(username: string): Promise<unknown> {
  const { status, body } = await fetchPlayerViaBridge(username.trim());
  if (status === 404) throw new WikiSyncNotFoundError(username);
  if (status < 200 || status >= 300) {
    throw new HttpError(status, playerStateUrl(username));
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new Error('WikiSync sent something that is not JSON.');
  }
}

async function direct(username: string): Promise<unknown> {
  try {
    return await getJson<unknown>(playerStateUrl(username));
  } catch (error) {
    if (error instanceof HttpError) {
      if (error.status === 404) throw new WikiSyncNotFoundError(username);
      throw error;
    }
    // fetch rejects without a status when CORS (or the network) blocked it.
    throw new WikiSyncBlockedError();
  }
}

export async function getPlayerState(username: string): Promise<WikiSyncPlayer> {
  const data = hasBridge() ? await viaBridge(username) : await direct(username);
  if (!isWikiSyncPlayer(data)) {
    throw new Error('Unexpected WikiSync response shape — the API may have changed.');
  }
  return data;
}
