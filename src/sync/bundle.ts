import type { Status, Task, TaskMap } from '@/domain/types';
import { STATUSES, TASK_KIND_LABELS } from '@/domain/types';
import { emptyColumns } from '@/domain/board';

/**
 * The wire format shared by every transport (backup file, transfer code, gist).
 *
 * v1 bundles — written before per-task `updatedAt` and delete tombstones
 * existed — are still accepted by {@link parseBundle} and upgraded on read.
 */
export const BUNDLE_VERSION = 2;

export interface SyncBundle {
  v: number;
  exportedAt: string;
  tasks: TaskMap;
  columns: Record<Status, string[]>;
  /** id → deletion time (epoch ms); absent in v1 bundles. */
  deleted: Record<string, number>;
}

/**
 * Narrow a bundle to `ids` plus everything they transitively depend on, so a
 * partial transfer never lands tasks with dangling dependencies. Tombstones
 * ride along untouched — they are tiny and always safe to replay.
 */
export function subsetWithDeps(bundle: SyncBundle, ids: Iterable<string>): SyncBundle {
  const keep = new Set<string>();
  const queue = [...ids];
  while (queue.length > 0) {
    const id = queue.pop()!;
    const task = bundle.tasks[id];
    if (!task || keep.has(id)) continue;
    keep.add(id);
    queue.push(...task.explicitDeps);
  }

  const tasks: TaskMap = {};
  for (const id of keep) tasks[id] = bundle.tasks[id];
  const columns = emptyColumns();
  for (const status of STATUSES) {
    columns[status] = (bundle.columns[status] ?? []).filter((id) => keep.has(id));
  }
  return { ...bundle, tasks, columns };
}

function isValidTask(value: unknown): value is Task {
  if (typeof value !== 'object' || value === null) return false;
  const task = value as Record<string, unknown>;
  return (
    typeof task.id === 'string' &&
    typeof task.title === 'string' &&
    typeof task.status === 'string' &&
    (STATUSES as readonly string[]).includes(task.status) &&
    typeof task.payload === 'object' &&
    task.payload !== null &&
    typeof (task.payload as Record<string, unknown>).kind === 'string' &&
    (task.payload as { kind: string }).kind in TASK_KIND_LABELS &&
    Array.isArray(task.explicitDeps)
  );
}

/** Fill in fields that older bundles (or hand-edited JSON) may be missing. */
function normalizeTask(task: Task): Task {
  const createdAt = typeof task.createdAt === 'number' ? task.createdAt : 0;
  return {
    ...task,
    description: typeof task.description === 'string' ? task.description : '',
    iconRef: task.iconRef ?? { kind: 'none' },
    explicitDeps: task.explicitDeps.filter((d): d is string => typeof d === 'string'),
    createdAt,
    updatedAt: typeof task.updatedAt === 'number' ? task.updatedAt : createdAt,
  };
}

function normalizeTombstones(value: unknown, tasks: TaskMap): Record<string, number> {
  if (typeof value !== 'object' || value === null) return {};
  const deleted: Record<string, number> = {};
  for (const [id, at] of Object.entries(value as Record<string, unknown>)) {
    // A task that is present wins over a stale tombstone for the same id.
    if (typeof at === 'number' && Number.isFinite(at) && !tasks[id]) deleted[id] = at;
  }
  return deleted;
}

export interface ParseResult {
  bundle: SyncBundle;
  /** Entries dropped because they did not look like tasks. */
  skipped: number;
}

/**
 * Validate anything claiming to be a bundle. Throws with a user-facing message
 * when the shape is wrong; drops (and counts) individual bad tasks otherwise.
 */
export function parseBundle(parsed: unknown): ParseResult {
  const raw = parsed as Partial<SyncBundle> | null;
  if (
    typeof raw !== 'object' ||
    raw === null ||
    typeof raw.v !== 'number' ||
    raw.v < 1 ||
    raw.v > BUNDLE_VERSION ||
    typeof raw.tasks !== 'object' ||
    raw.tasks === null
  ) {
    throw new Error('That is not an OSRS Task List bundle.');
  }

  const tasks: TaskMap = {};
  let skipped = 0;
  for (const [id, task] of Object.entries(raw.tasks)) {
    if (isValidTask(task) && task.id === id) {
      tasks[id] = normalizeTask(task);
    } else {
      skipped++;
    }
  }

  const columns = emptyColumns();
  for (const status of STATUSES) {
    const ids = (raw.columns as Record<string, unknown> | undefined)?.[status];
    columns[status] = Array.isArray(ids)
      ? ids.filter((id): id is string => typeof id === 'string')
      : [];
  }

  return {
    bundle: {
      v: BUNDLE_VERSION,
      exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : new Date(0).toISOString(),
      tasks,
      columns,
      deleted: normalizeTombstones(raw.deleted, tasks),
    },
    skipped,
  };
}

/** Parse a JSON string into a bundle. */
export function parseBundleJson(json: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('That content is not valid JSON.');
  }
  return parseBundle(parsed);
}
