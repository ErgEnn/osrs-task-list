import { describe, expect, it } from 'vitest';

/**
 * A share link renders somebody else's tasks in the viewer's browser. The
 * guarantee is that it cannot touch what the viewer has stored: the persisted
 * stores are never even loaded, so nothing rehydrates, nothing writes them
 * back, and no second tab can race the viewer's own app over them.
 *
 * This walks the real import graph rather than trusting a comment — reaching
 * for a store from anything the shared page renders fails here.
 */
const SOURCES: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }),
  ).map(([path, source]) => [path.replace(/^\/src\//, ''), source as string]),
);

const PERSISTED_STORES = ['store/taskStore.ts', 'store/settingsStore.ts'];

/** Resolve `@/…` and relative specifiers to a key of {@link SOURCES}. */
function resolveImport(specifier: string, fromFile: string): string | null {
  if (/\.(css|png|svg|otf|json)$/.test(specifier)) return null;
  let parts: string[];
  if (specifier.startsWith('@/')) {
    parts = specifier.slice(2).split('/');
  } else if (specifier.startsWith('.')) {
    parts = [...fromFile.split('/').slice(0, -1), ...specifier.split('/')];
  } else {
    return null; // A package, not our source.
  }

  const path: string[] = [];
  for (const part of parts) {
    if (part === '.' || part === '') continue;
    if (part === '..') path.pop();
    else path.push(part);
  }
  const base = path.join('/');
  return (
    ['.ts', '.tsx', '/index.ts', '/index.tsx']
      .map((ext) => `${base}${ext}`)
      .find((c) => SOURCES[c]) ?? null
  );
}

/**
 * Specifiers a module pulls in at runtime. `import type` is left out: it is
 * erased at build time and loads nothing.
 */
function runtimeImportsOf(source: string): string[] {
  const withBindings = [
    ...source.matchAll(/(?:^|\n)\s*(?:import|export)(\s+type)?\b[^;]*?from\s*['"]([^'"]+)['"]/g),
  ]
    .filter((match) => !match[1])
    .map((match) => match[2]);
  const sideEffect = [...source.matchAll(/(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g)].map(
    (match) => match[1],
  );
  return [...withBindings, ...sideEffect];
}

/** Every module reachable from `entry`, as paths relative to `src/`. */
function importGraph(entry: string): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (graph.has(file)) continue;
    const source = SOURCES[file];
    expect(source, `${file} is not a source file`).toBeTypeOf('string');
    const imports = runtimeImportsOf(source)
      .map((specifier) => resolveImport(specifier, file))
      .filter((path): path is string => path !== null);
    graph.set(file, imports);
    queue.push(...imports);
  }
  return graph;
}

describe('the read-only share page', () => {
  const graph = importGraph('share/SharedApp.tsx');

  it('reaches the modules it actually renders', () => {
    // Guards the walker itself: a broken resolver would pass every other test.
    expect([...graph.keys()]).toEqual(
      expect.arrayContaining(['share/SharedBoard.tsx', 'graph/GraphCanvas.tsx', 'sync/bundle.ts']),
    );
  });

  it.each(PERSISTED_STORES)('would see %s if it were there', (store) => {
    // Control: the normal app does load both, so a walker that quietly found
    // nothing cannot pass the checks below.
    expect(importGraph('App.tsx').has(store)).toBe(true);
  });

  it.each(PERSISTED_STORES)('never loads %s', (store) => {
    const importers = [...graph.entries()]
      .filter(([, imports]) => imports.includes(store))
      .map(([file]) => file);
    expect(importers).toEqual([]);
    expect(graph.has(store)).toBe(false);
  });

  it('is not bundled with a store by the entry point', () => {
    // main.tsx loads its page with a dynamic import (which this walker does
    // not follow, exactly like the bundler splitting them apart): a static
    // import of App here would put both stores in every page's chunk.
    const entry = importGraph('main.tsx');
    for (const store of PERSISTED_STORES) expect(entry.has(store)).toBe(false);
  });

  it('never reaches anything that writes tasks', () => {
    // apply.ts (mergeIntoStore/replaceStore), the backup restore and both sync
    // paths are the only ways a bundle can become the viewer's own tasks.
    for (const writer of ['sync/apply.ts', 'settings/backup.ts', 'sync/gistSync.ts']) {
      expect(graph.has(writer)).toBe(false);
    }
  });
});
