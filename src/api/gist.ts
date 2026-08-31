import { getText, HttpError, requestJson } from './http';

/**
 * Minimal GitHub Gist client — just enough to keep one private gist in step
 * with the local task bundle. The token never leaves these requests.
 */
const API = 'https://api.github.com';

export const GIST_FILENAME = 'osrs-task-list.sync.json';
const GIST_DESCRIPTION = 'OSRS Task List — device sync (managed by the app)';

interface GistFile {
  content?: string;
  truncated?: boolean;
  raw_url?: string;
}

interface GistResponse {
  id: string;
  html_url: string;
  updated_at: string;
  files: Record<string, GistFile | undefined>;
}

export interface RemoteGist {
  id: string;
  htmlUrl: string;
  updatedAt: string;
  /** File content, or null when the gist exists but holds no sync file yet. */
  content: string | null;
}

const BASE_HEADERS = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
};

/**
 * GitHub answers an authenticated read with `Cache-Control: private,
 * max-age=60`, so the browser will happily serve a sync a minute-old copy of
 * the gist — and a sync that merges a stale copy pushes it straight back,
 * undoing what the other device had just written. A sync read must reach the
 * network every time. (The read-only share page is left cacheable: it writes
 * nothing back, and an anonymous caller has only 60 requests an hour.)
 */
const NO_CACHE: RequestInit = { cache: 'no-store' };

function headers(token: string): HeadersInit {
  return {
    ...BASE_HEADERS,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function contentOf(gist: GistResponse): Promise<string | null> {
  const file = gist.files?.[GIST_FILENAME];
  if (!file) return null;
  // Files over ~1 MB come back truncated with a raw URL instead.
  if (file.truncated && file.raw_url) return getText(file.raw_url);
  return file.content ?? null;
}

async function toRemote(gist: GistResponse): Promise<RemoteGist> {
  return {
    id: gist.id,
    htmlUrl: gist.html_url,
    updatedAt: gist.updated_at,
    content: await contentOf(gist),
  };
}

export async function createSyncGist(token: string, content: string): Promise<RemoteGist> {
  const gist = await requestJson<GistResponse>(`${API}/gists`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({
      description: GIST_DESCRIPTION,
      public: false,
      files: { [GIST_FILENAME]: { content } },
    }),
  });
  return toRemote(gist);
}

export async function readSyncGist(token: string, id: string): Promise<RemoteGist> {
  const gist = await requestJson<GistResponse>(`${API}/gists/${encodeURIComponent(id)}`, {
    ...NO_CACHE,
    headers: headers(token),
  });
  return toRemote(gist);
}

export async function writeSyncGist(
  token: string,
  id: string,
  content: string,
): Promise<RemoteGist> {
  const gist = await requestJson<GistResponse>(`${API}/gists/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: headers(token),
    body: JSON.stringify({ files: { [GIST_FILENAME]: { content } } }),
  });
  return toRemote(gist);
}

/**
 * Read a gist without a token, for share links. A secret gist is not private:
 * anyone holding its id can read it, which is exactly what makes a share link
 * work on a device that has no token of its own.
 */
export async function readSharedGist(id: string): Promise<RemoteGist> {
  const gist = await requestJson<GistResponse>(`${API}/gists/${encodeURIComponent(id)}`, {
    headers: BASE_HEADERS,
  });
  return toRemote(gist);
}

/** Turn GitHub's status codes into something worth showing a user. */
export function describeGistError(error: unknown): string {
  if (error instanceof HttpError) {
    if (error.status === 401) return 'GitHub rejected the token. Check it and try again.';
    if (error.status === 403)
      return 'GitHub refused the request — the token needs the "gist" scope.';
    if (error.status === 404) return 'That gist no longer exists (or the token cannot see it).';
    if (error.status === 422) return 'GitHub rejected the sync file as invalid.';
    if (error.status >= 500) return 'GitHub is having trouble — try again in a moment.';
    return `GitHub returned HTTP ${error.status}.`;
  }
  return error instanceof Error ? error.message : 'Gist sync failed.';
}

/**
 * The same codes seen through a share link: there is no token to blame, and
 * an anonymous caller can run into GitHub's per-IP rate limit.
 */
export function describeSharedGistError(error: unknown): string {
  if (error instanceof HttpError) {
    if (error.status === 404) return 'This shared list no longer exists.';
    if (error.status === 403 || error.status === 429)
      return 'GitHub is rate-limiting this browser — try again in a few minutes.';
    if (error.status >= 500) return 'GitHub is having trouble — try again in a moment.';
    return `GitHub returned HTTP ${error.status}.`;
  }
  return error instanceof Error ? error.message : 'Could not load the shared list.';
}
