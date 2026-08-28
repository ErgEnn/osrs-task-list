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

function headers(token: string): HeadersInit {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
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
