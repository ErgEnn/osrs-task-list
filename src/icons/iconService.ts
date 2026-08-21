import { getBlobAsDataUrl } from '@/api/http';
import { wikiQueue } from '@/api/queue';
import { getFileUrl, getPageThumbUrl } from '@/api/wiki';
import type { IconRef } from '@/domain/types';
import { builtinIconUrl } from './builtin';
import { iconCache } from './iconCache';

export type IconStatus = 'builtin' | 'cached' | 'pending' | 'failed' | 'none';

export interface ResolvedIcon {
  src: string | null;
  status: IconStatus;
}

const FAILURE_RETRY_MS = 5 * 60 * 1000;
/** Failures are remembered in memory only — a fresh session retries. */
const failedAt = new Map<string, number>();

export function cacheKeyFor(ref: IconRef): string | null {
  if (ref.kind === 'wikiFile') return `file:${ref.fileName}`;
  if (ref.kind === 'wikiThumb') return `thumb:${ref.pageTitle}`;
  return null;
}

function recentlyFailed(key: string): boolean {
  const at = failedAt.get(key);
  return at !== undefined && Date.now() - at < FAILURE_RETRY_MS;
}

export function resolveIcon(ref: IconRef): ResolvedIcon {
  if (ref.kind === 'builtin') return { src: builtinIconUrl(ref.id), status: 'builtin' };
  if (ref.kind === 'none') return { src: null, status: 'none' };
  const key = cacheKeyFor(ref)!;
  const cached = iconCache.get(key);
  if (cached) return { src: cached, status: 'cached' };
  return { src: null, status: recentlyFailed(key) ? 'failed' : 'pending' };
}

/**
 * Kick off (queued) fetch-and-cache for a wiki icon: resolve the thumbnail
 * URL via the CORS API, download the bytes once, keep them forever. No-op
 * for builtin/cached/recently-failed refs.
 */
export function ensureIcon(ref: IconRef): void {
  const key = cacheKeyFor(ref);
  if (!key || iconCache.has(key) || recentlyFailed(key)) return;

  wikiQueue
    .enqueue(key, async () => {
      const url =
        ref.kind === 'wikiFile'
          ? await getFileUrl(ref.fileName, 64)
          : await getPageThumbUrl((ref as { pageTitle: string }).pageTitle, 64);
      if (!url) throw new Error(`No wiki image found for ${key}`);
      const dataUrl = await getBlobAsDataUrl(url);
      iconCache.put(key, dataUrl);
    })
    .catch(() => {
      failedAt.set(key, Date.now());
      iconCache.bump(); // let subscribers re-render into the fallback path
    });
}

/** Test seam. */
export function resetIconFailures(): void {
  failedAt.clear();
}
