import { sanitizeCycles } from './deps';
import type { Status, TaskMap } from './types';
import { STATUSES } from './types';

/**
 * The board's shape and the pass that repairs it, kept free of the store so a
 * read-only view (a share link) can straighten out a bundle it was handed
 * without pulling in — and rehydrating — anybody's persisted tasks.
 */
export interface TaskBundle {
  tasks: TaskMap;
  columns: Record<Status, string[]>;
  /**
   * id → deletion time (epoch ms). Tombstones let a merge tell "deleted here"
   * apart from "not created there yet", so a delete survives a round trip
   * instead of being resurrected by the other device's copy.
   */
  deleted?: Record<string, number>;
}

export const emptyColumns = (): Record<Status, string[]> => ({
  todo: [],
  inprogress: [],
  done: [],
});

/** Rebuild columns so every task sits exactly once in the column of its status. */
export function reconcileBundle(tasks: TaskMap, columns: Record<Status, string[]>): TaskBundle {
  const cleanTasks: TaskMap = {};
  for (const [id, task] of Object.entries(tasks)) {
    cleanTasks[id] = {
      ...task,
      explicitDeps: [...new Set(task.explicitDeps)].filter((d) => d !== id && tasks[d]),
    };
  }
  const { tasks: acyclic } = sanitizeCycles(cleanTasks);

  const next = emptyColumns();
  const placed = new Set<string>();
  for (const status of STATUSES) {
    for (const id of columns[status] ?? []) {
      const task = acyclic[id];
      if (!task || placed.has(id) || task.status !== status) continue;
      next[status].push(id);
      placed.add(id);
    }
  }
  for (const task of Object.values(acyclic).sort((a, b) => a.createdAt - b.createdAt)) {
    if (!placed.has(task.id)) next[task.status].push(task.id);
  }
  return { tasks: acyclic, columns: next };
}
