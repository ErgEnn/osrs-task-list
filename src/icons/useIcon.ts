import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { IconRef } from '@/domain/types';
import { iconCache } from './iconCache';
import { cacheKeyFor, ensureIcon, resolveIcon, type ResolvedIcon } from './iconService';

function identityOf(ref: IconRef): string {
  const key = cacheKeyFor(ref);
  if (key) return key;
  return ref.kind === 'builtin' ? `builtin:${ref.id}` : 'none';
}

/**
 * Resolve a task icon reactively: builtin icons immediately, wiki icons from
 * the cache — scheduling a queued fetch on miss and re-rendering when the
 * cache (or a failure) lands.
 */
export function useIcon(ref: IconRef): ResolvedIcon {
  const version = useSyncExternalStore(iconCache.subscribe, iconCache.getVersion);
  const identity = identityOf(ref);

  useEffect(() => {
    if (cacheKeyFor(ref)) ensureIcon(ref);
    // identity captures everything that matters about the ref object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity, version]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => resolveIcon(ref), [identity, version]);
}
