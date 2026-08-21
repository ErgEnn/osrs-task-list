import { SKILLS } from '@/domain/skills';

/**
 * Built-in icons bundled with the app: the 23 skill icons (RuneLite,
 * BSD-2-Clause) plus generated task-type badges. Ids: 'skill:attack',
 * 'badge:quest', ... Missing files degrade to generated SVG placeholders so
 * the app also runs before `npm run fetch-assets` has been executed.
 */
const skillFiles = import.meta.glob('../assets/skills/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const skillUrls = new Map<string, string>();
for (const [path, url] of Object.entries(skillFiles)) {
  const name = path.split('/').pop()!.replace('.png', '');
  skillUrls.set(name, url);
}

function svgUri(body: string, viewBox = '0 0 16 16'): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" shape-rendering="crispEdges">${body}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const OUTLINE = 'stroke="#100c08" stroke-width="1" stroke-linejoin="round"';

const BADGES: Record<string, string> = {
  // Blue quest star, as on the quest tab.
  quest: svgUri(
    `<path d="M8 1 L10 5.5 L15 6 L11.5 9.2 L12.7 14.5 L8 11.8 L3.3 14.5 L4.5 9.2 L1 6 L6 5.5 Z" fill="#3b6bc4" ${OUTLINE}/><path d="M8 3.4 L9.3 6.4 L12.4 6.8 L10.2 8.9 L11 12.2 L8 10.5 Z" fill="#6f9be0" stroke="none"/>`,
  ),
  // Coin sack for collect-item tasks.
  item: svgUri(
    `<path d="M6 2 h4 l-1 2.5 c2.8 0.9 4 3 4 5.5 c0 2.6 -2 4 -5 4 s-5 -1.4 -5 -4 c0 -2.5 1.2 -4.6 4 -5.5 Z" fill="#b98d4f" ${OUTLINE}/><path d="M6.4 2.6 h3.2 l-0.7 1.6 h-1.8 Z" fill="#8a6534" stroke="none"/><circle cx="8" cy="9.5" r="2" fill="#e7c465" stroke="#8a6534"/>`,
  ),
  // Crossed swords for kill tasks.
  kill: svgUri(
    `<path d="M2.5 2.5 L11 11" stroke="#cfd2d6" stroke-width="2"/><path d="M13.5 2.5 L5 11" stroke="#9aa0a8" stroke-width="2"/><path d="M10 12.5 L12.5 10 M3.5 10 L6 12.5" stroke="#6b4a2a" stroke-width="2"/><path d="M11.5 13.2 a1.4 1.4 0 1 0 0.1 0 M4.4 13.2 a1.4 1.4 0 1 0 0.1 0" fill="#8a6534" stroke="#100c08" stroke-width="0.8"/>`,
  ),
  // Green log book for collection log tasks.
  clog: svgUri(
    `<path d="M3 2 h9 a1 1 0 0 1 1 1 v10 a1 1 0 0 1 -1 1 h-9 Z" fill="#3e6b3a" ${OUTLINE}/><path d="M3 2 v12" stroke="#264923" stroke-width="2"/><rect x="6" y="4.5" width="5" height="1.4" fill="#d8cc9a"/><rect x="6" y="7" width="5" height="1.4" fill="#d8cc9a"/><rect x="6" y="9.5" width="3.4" height="1.4" fill="#d8cc9a"/>`,
  ),
  // Combat achievement laurel shield.
  ca: svgUri(
    `<path d="M8 1.5 L14 3.5 V8 c0 3.6 -2.6 5.7 -6 6.8 C4.6 13.7 2 11.6 2 8 V3.5 Z" fill="#8a2f24" ${OUTLINE}/><path d="M8 3 L12.4 4.5 V8 c0 2.6 -1.9 4.2 -4.4 5.1 Z" fill="#b8442f" stroke="none"/><path d="M8 5 L9 7 h2 l-1.6 1.5 L10 11 8 9.8 6 11 l0.6 -2.5 L5 7 h2 Z" fill="#f5c15c" stroke="#5b2018" stroke-width="0.6"/>`,
  ),
  // Generic scroll, used as a last-resort fallback.
  task: svgUri(
    `<rect x="3" y="2" width="10" height="12" fill="#d8ccb4" ${OUTLINE}/><rect x="5" y="4.5" width="6" height="1.2" fill="#7a6a4f"/><rect x="5" y="7" width="6" height="1.2" fill="#7a6a4f"/><rect x="5" y="9.5" width="4" height="1.2" fill="#7a6a4f"/>`,
  ),
};

/** Placeholder tile with the skill's first letters, when the PNG is absent. */
function skillPlaceholder(skill: string): string {
  const label = skill.slice(0, 3);
  return svgUri(
    `<rect x="0.5" y="0.5" width="15" height="15" fill="#494034" stroke="#1b1612"/><text x="8" y="11" font-family="monospace" font-size="6" fill="#ff981f" text-anchor="middle">${label}</text>`,
  );
}

export function builtinIconUrl(id: string): string {
  const [kind, name] = id.split(':');
  if (kind === 'skill' && name) {
    return skillUrls.get(name) ?? skillPlaceholder(name);
  }
  if (kind === 'badge' && name && BADGES[name]) {
    return BADGES[name];
  }
  return BADGES.task;
}

export interface BuiltinIconEntry {
  id: string;
  label: string;
}

/** Everything selectable in the icon picker's "Built-in" tab. */
export const BUILTIN_ICONS: BuiltinIconEntry[] = [
  ...SKILLS.map((skill) => ({ id: `skill:${skill.toLowerCase()}`, label: skill })),
  { id: 'badge:quest', label: 'Quest' },
  { id: 'badge:item', label: 'Item' },
  { id: 'badge:kill', label: 'Kill' },
  { id: 'badge:clog', label: 'Collection log' },
  { id: 'badge:ca', label: 'Combat achievement' },
  { id: 'badge:task', label: 'Scroll' },
];
