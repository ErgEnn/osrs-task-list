import { useState } from 'react';
import clsx from 'clsx';
import { fileHotlinkUrl } from '@/api/wiki';
import type { IconRef, TaskKind } from '@/domain/types';
import { builtinIconUrl } from '@/icons/builtin';
import { useIcon } from '@/icons/useIcon';

interface IconProps {
  iconRef: IconRef;
  size?: number;
  alt?: string;
  className?: string;
  /** Task kind used for the badge fallback when a wiki icon can't be loaded. */
  fallbackKind?: TaskKind;
}

/**
 * Task icon. Builtins render from bundled assets; wiki icons come from the
 * localStorage cache (fetched once over CORS). If CORS caching failed, item
 * file icons degrade to a lazily hotlinked <img> and everything else to a
 * kind badge.
 */
export function Icon({ iconRef, size = 28, alt = '', className, fallbackKind }: IconProps) {
  const { src, status } = useIcon(iconRef);
  // Identity of the ref whose hotlink 404'd, so a ref change retries.
  const [brokenFor, setBrokenFor] = useState<string | null>(null);
  const identity = JSON.stringify(iconRef);

  if (status === 'none') {
    return (
      <span className={clsx('icon', 'icon--empty', className)} style={{ width: size, height: size }} />
    );
  }

  if (src) {
    return (
      <img
        src={src}
        width={size}
        height={size}
        alt={alt}
        draggable={false}
        className={clsx('icon', 'pixel', className)}
      />
    );
  }

  if (status === 'pending') {
    return (
      <span
        className={clsx('icon', 'icon--pending', className)}
        style={{ width: size, height: size }}
        title="Loading icon from the wiki…"
      >
        …
      </span>
    );
  }

  // status === 'failed'
  if (iconRef.kind === 'wikiFile' && brokenFor !== identity) {
    return (
      <img
        src={fileHotlinkUrl(iconRef.fileName, 64)}
        width={size}
        height={size}
        alt={alt}
        loading="lazy"
        referrerPolicy="no-referrer"
        draggable={false}
        className={clsx('icon', 'pixel', className)}
        onError={() => setBrokenFor(identity)}
        title="Shown via wiki hotlink (cached copy unavailable)"
      />
    );
  }

  return (
    <img
      src={builtinIconUrl(`badge:${fallbackKind ?? 'task'}`)}
      width={size}
      height={size}
      alt={alt}
      draggable={false}
      className={clsx('icon', 'pixel', className)}
    />
  );
}
