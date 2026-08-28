import type { Status, Task, TaskMap } from '@/domain/types';
import { STATUSES } from '@/domain/types';
import { emptyColumns } from '@/store/taskStore';
import { BUNDLE_VERSION, type SyncBundle } from './bundle';

export interface MergeReport {
  added: string[];
  updated: string[];
  /** Tasks removed locally because the other side had deleted them. */
  removed: string[];
  unchanged: number;
}

export function isEmptyReport(report: MergeReport): boolean {
  return report.added.length === 0 && report.updated.length === 0 && report.removed.length === 0;
}

/** Progress rank, used only to break exact `updatedAt` ties. */
const STATUS_RANK: Record<Status, number> = { todo: 0, inprogress: 1, done: 2 };

/**
 * Pick the surviving version of one task.
 *
 * Last write wins on the whole record: whichever side has the newer
 * `updatedAt` supplies every field, so an edit that *removes* something (a
 * dependency, text in the description) propagates rather than being undone by
 * a union. Exact ties go to the more advanced status — the one case where
 * guessing wrong is annoying rather than merely stale.
 */
function pickTask(local: Task | undefined, incoming: Task | undefined): Task | undefined {
  if (!local) return incoming;
  if (!incoming) return local;
  if (incoming.updatedAt > local.updatedAt) return incoming;
  if (incoming.updatedAt < local.updatedAt) return local;
  return STATUS_RANK[incoming.status] > STATUS_RANK[local.status] ? incoming : local;
}

function sameTask(a: Task, b: Task): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Merge column order: keep the local order for tasks the device already knew
 * about, then append ids the other side introduced, in its order. Order is the
 * one field we do not resolve by timestamp — it is per-column, not per-task,
 * and quietly reshuffling a board the user has arranged is worse than letting
 * new cards land at the bottom.
 */
function mergeColumns(
  local: Record<Status, string[]>,
  incoming: Record<Status, string[]>,
  tasks: TaskMap,
): Record<Status, string[]> {
  const columns = emptyColumns();
  const placed = new Set<string>();
  for (const status of STATUSES) {
    for (const id of [...(local[status] ?? []), ...(incoming[status] ?? [])]) {
      // A task whose status changed on one side is still listed in the other
      // side's old column; the merged status decides where it actually goes.
      if (placed.has(id) || tasks[id]?.status !== status) continue;
      columns[status].push(id);
      placed.add(id);
    }
  }
  for (const task of Object.values(tasks).sort((a, b) => a.createdAt - b.createdAt)) {
    if (!placed.has(task.id)) columns[task.status].push(task.id);
  }
  return columns;
}

/**
 * Fold `incoming` into `local` without ever discarding local work: tasks are
 * unioned by id, conflicts resolved per {@link pickTask}, and a task is only
 * dropped when the other side holds a tombstone newer than the surviving
 * version's last edit (so "deleted there" beats "still here", but an edit made
 * after the delete resurrects the task on purpose).
 */
export function mergeBundles(
  local: SyncBundle,
  incoming: SyncBundle,
): { bundle: SyncBundle; report: MergeReport } {
  const deleted: Record<string, number> = { ...local.deleted };
  for (const [id, at] of Object.entries(incoming.deleted)) {
    deleted[id] = Math.max(deleted[id] ?? 0, at);
  }

  const tasks: TaskMap = {};
  const report: MergeReport = { added: [], updated: [], removed: [], unchanged: 0 };

  for (const id of new Set([...Object.keys(local.tasks), ...Object.keys(incoming.tasks)])) {
    const localTask = local.tasks[id];
    const winner = pickTask(localTask, incoming.tasks[id]);
    if (!winner) continue;

    const tombstone = deleted[id];
    if (tombstone !== undefined && tombstone >= winner.updatedAt) {
      if (localTask) report.removed.push(localTask.title);
      continue;
    }
    delete deleted[id];

    tasks[id] = winner;
    if (!localTask) report.added.push(winner.title);
    else if (!sameTask(localTask, winner)) report.updated.push(winner.title);
    else report.unchanged++;
  }

  // Deps pointing at tasks the other side never had (or that lost to a
  // tombstone) would dangle; the store's reconcile() drops them on apply.
  return {
    bundle: {
      v: BUNDLE_VERSION,
      exportedAt: new Date().toISOString(),
      tasks,
      columns: mergeColumns(local.columns, incoming.columns, tasks),
      deleted,
    },
    report,
  };
}

/** Sentence for a confirm dialog, from a dry-run merge. */
export function describeMergePlan(report: MergeReport): string {
  const parts: string[] = [];
  if (report.added.length > 0) parts.push(`add ${report.added.length} new task(s)`);
  if (report.updated.length > 0) parts.push(`update ${report.updated.length} existing task(s)`);
  if (report.removed.length > 0) {
    parts.push(`remove ${report.removed.length} task(s) deleted on the other device`);
  }
  if (parts.length === 0) return 'This transfer holds nothing this device does not already have.';
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0];
  return `This will ${list}. Everything else here is left alone.`;
}

export function summarizeReport(report: MergeReport): string {
  const parts: string[] = [];
  if (report.added.length > 0) parts.push(`${report.added.length} added`);
  if (report.updated.length > 0) parts.push(`${report.updated.length} updated`);
  if (report.removed.length > 0) parts.push(`${report.removed.length} removed`);
  if (parts.length === 0) return 'already up to date';
  return parts.join(', ');
}
