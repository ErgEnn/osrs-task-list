import {
  SETTINGS_PERSIST_VERSION,
  SETTINGS_STORAGE_KEY,
  useSettingsStore,
  type SettingsState,
} from '@/store/settingsStore';
import { TASKS_PERSIST_VERSION, TASKS_STORAGE_KEY, useTaskStore } from '@/store/taskStore';
import { exportBundle } from './apply';
import { BUNDLE_VERSION, bundleSignature, parseBundle, type SyncBundle } from './bundle';
import { mergeBundles } from './merge';

/**
 * Keep every tab of this app on the same data.
 *
 * Two tabs are two copies of the same store over one `localStorage`: each holds
 * its own snapshot and rewrites the whole key on any change. Left alone, the
 * second tab's next write is a stale snapshot, and it silently undoes whatever
 * the first tab did — the tasks were never in conflict, the tabs simply never
 * spoke. So they speak: `storage` fires in every *other* tab on each write, and
 * the tab that hears it folds the write into what it already has.
 *
 * Tasks go through the very same merge as the gist and the transfer codes,
 * rather than being adopted wholesale, because both tabs may have moved since
 * the last write they saw: last-write-wins per task, tombstones beat stale
 * copies, local column order is kept. Settings, which carry no timestamps, are
 * adopted field by field.
 *
 * A merge is only written back when it actually changes this tab, which is what
 * keeps two tabs from bouncing the same state off each other for ever.
 */
export function startCrossTabSync(): () => void {
  const catchUp = () => {
    adoptTasks(readKey(TASKS_STORAGE_KEY));
    adoptSettings(readKey(SETTINGS_STORAGE_KEY));
  };

  const onStorage = (event: StorageEvent) => {
    if (event.storageArea && event.storageArea !== localStorage) return;
    if (event.key === TASKS_STORAGE_KEY) adoptTasks(event.newValue);
    else if (event.key === SETTINGS_STORAGE_KEY) adoptSettings(event.newValue);
    // A null key means the whole area was cleared or replaced; re-read both.
    else if (event.key === null) catchUp();
  };

  // A tab restored from the back/forward cache, or one that was hidden while
  // the browser throttled it, can have missed events outright: read the keys
  // back whenever this tab returns to the foreground.
  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') catchUp();
  };

  window.addEventListener('storage', onStorage);
  window.addEventListener('pageshow', catchUp);
  document.addEventListener('visibilitychange', onVisibilityChange);

  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('pageshow', catchUp);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}

function readKey(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // Storage disabled: this tab is on its own, which is fine.
  }
}

/**
 * The `{ state, version }` envelope zustand's persist middleware writes. A
 * version this build does not speak is left alone rather than half-read: an
 * older tab writing an older shape is a losing battle either way, and mangling
 * its write into this store would only spread the damage.
 */
function persistedState(raw: string | null, version: number): Record<string, unknown> | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const { state, version: written } = parsed as { state?: unknown; version?: unknown };
  if (written !== version) return null;
  if (typeof state !== 'object' || state === null) return null;
  return state as Record<string, unknown>;
}

/** The persisted task state, validated as strictly as any imported bundle. */
function bundleFrom(raw: string | null): SyncBundle | null {
  const state = persistedState(raw, TASKS_PERSIST_VERSION);
  if (!state) return null;
  try {
    return parseBundle({ ...state, v: BUNDLE_VERSION, exportedAt: new Date().toISOString() })
      .bundle;
  } catch {
    return null;
  }
}

/**
 * Fold another tab's tasks into this one. Returns whether the store moved —
 * false when the write was this tab's own state coming back, or held nothing
 * this tab does not already have, which is where the ping-pong stops.
 */
export function adoptTasks(raw: string | null): boolean {
  const incoming = bundleFrom(raw);
  if (!incoming) return false;
  const local = exportBundle();
  const before = bundleSignature(local);
  if (bundleSignature(incoming) === before) return false;
  const { bundle } = mergeBundles(local, incoming);
  if (bundleSignature(bundle) === before) return false;
  useTaskStore.getState().replaceAll(bundle);
  return true;
}

/**
 * Settings shared by every tab — which is all of them but `view`. Which tab
 * shows the board and which the progression graph is that tab's own business;
 * it is persisted only so a fresh load reopens where you left off, and having a
 * second tab yank the view out from under you would be the opposite of help.
 */
const SHARED_SETTINGS_KEYS = [
  'username',
  'autoSyncMinutes',
  'lastSyncAt',
  'gistToken',
  'gistId',
  'gistUrl',
  'gistSyncMinutes',
  'gistLastSyncAt',
  'lastTransferAt',
  'dismissedUserscriptNotice',
] as const satisfies readonly (keyof SettingsState)[];

/**
 * Adopt another tab's settings field by field. There are no timestamps here to
 * merge on, so the latest write wins per field — but only for fields it
 * actually carries, so pasting a gist token in one tab is not undone by the
 * other tab's next write of something else entirely.
 */
export function adoptSettings(raw: string | null): boolean {
  const state = persistedState(raw, SETTINGS_PERSIST_VERSION);
  if (!state) return false;
  const current = useSettingsStore.getState();
  const patch: Record<string, unknown> = {};
  let changed = false;
  for (const key of SHARED_SETTINGS_KEYS) {
    const value = state[key];
    if (value === undefined || Object.is(value, current[key])) continue;
    if (!comparable(value, current[key])) continue;
    patch[key] = value;
    changed = true;
  }
  if (!changed) return false;
  useSettingsStore.setState(patch as Partial<SettingsState>);
  return true;
}

/**
 * The written value came from this same build (the version gate saw to that),
 * so type agreement is the whole check — bar the fields that are legitimately
 * `null` until first set, such as `lastSyncAt`.
 */
function comparable(value: unknown, current: unknown): boolean {
  return value === null || current === null || typeof value === typeof current;
}
