import clsx from 'clsx';
import type { IconRef } from '@/domain/types';
import { builtinIconUrl } from '@/icons/builtin';

interface IconProps {
  iconRef: IconRef;
  size?: number;
  alt?: string;
  className?: string;
}

/**
 * Renders a task icon. Builtin icons come from bundled assets; wiki icons are
 * resolved through the icon cache pipeline (M5) — until then they render as a
 * pending tile.
 */
export function Icon({ iconRef, size = 28, alt = '', className }: IconProps) {
  if (iconRef.kind === 'builtin') {
    return (
      <img
        src={builtinIconUrl(iconRef.id)}
        width={size}
        height={size}
        alt={alt}
        draggable={false}
        className={clsx('icon', 'pixel', className)}
      />
    );
  }
  if (iconRef.kind === 'none') {
    return <span className={clsx('icon', 'icon--empty', className)} style={{ width: size, height: size }} />;
  }
  return (
    <span
      className={clsx('icon', 'icon--pending', className)}
      style={{ width: size, height: size }}
      title="Icon loads from the wiki"
    >
      ?
    </span>
  );
}
