import { getJson, HttpError } from './http';

/**
 * WikiSync: the OSRS wiki's by-username player data service, populated for
 * players running the WikiSync plugin on RuneLite/HDOS. Response shape
 * validated defensively — reconfirm against a live capture if it drifts
 * (fixture: src/api/__fixtures__/wikisync-player.json).
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

export async function getPlayerState(username: string): Promise<WikiSyncPlayer> {
  const url = `https://sync.runescape.wiki/runelite/player/${encodeURIComponent(username.trim())}/STANDARD`;
  let data: unknown;
  try {
    data = await getJson<unknown>(url);
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) {
      throw new WikiSyncNotFoundError(username);
    }
    throw error;
  }
  if (!isWikiSyncPlayer(data)) {
    throw new Error('Unexpected WikiSync response shape — the API may have changed.');
  }
  return data;
}
