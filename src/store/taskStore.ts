import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { emptyColumns, reconcileBundle, type TaskBundle } from '@/domain/board';
import { sanitizeCycles, wouldCreateCycle } from '@/domain/deps';
import { defaultIconFor, defaultTitleFor } from '@/domain/title';
import type { IconRef, Status, Task, TaskMap, TaskPayload } from '@/domain/types';
import { STATUSES } from '@/domain/types';
import { useUiStore } from './uiStore';

export interface TaskDraft {
  title?: string;
  description?: string;
  status?: Status;
  iconRef?: IconRef;
  payload: TaskPayload;
  explicitDeps?: string[];
}

interface TaskState extends TaskBundle {
  deleted: Record<string, number>;
  createTask: (draft: TaskDraft) => string;
  updateTask: (id: string, patch: Partial<Omit<Task, 'id' | 'createdAt'>>) => void;
  deleteTask: (id: string) => void;
  /** Single source of board order: moves within/between the per-status id arrays. */
  moveTask: (id: string, toStatus: Status, toIndex: number) => void;
  setStatus: (id: string, status: Status) => void;
  addDep: (id: string, depId: string) => boolean;
  removeDep: (id: string, depId: string) => void;
  replaceAll: (bundle: TaskBundle) => void;
  reconcile: () => void;
}

/** Tombstones are pruned after this long — long enough for any realistic sync gap. */
export const TOMBSTONE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/** Where the tasks persist, and the shape they persist in — see `sync/crossTab.ts`. */
export const TASKS_STORAGE_KEY = 'osrs-tl:tasks';
export const TASKS_PERSIST_VERSION = 2;

function prunedTombstones(
  deleted: Record<string, number>,
  now = Date.now(),
): Record<string, number> {
  const kept: Record<string, number> = {};
  for (const [id, at] of Object.entries(deleted)) {
    if (now - at < TOMBSTONE_TTL_MS) kept[id] = at;
  }
  return kept;
}

function toastCycleRemovals(removed: Array<{ taskId: string; depId: string }>, tasks: TaskMap) {
  for (const { taskId, depId } of removed) {
    const to = tasks[taskId]?.title ?? taskId;
    const from = tasks[depId]?.title ?? depId;
    useUiStore
      .getState()
      .pushToast('info', `Removed dependency "${from}" → "${to}" to break a cycle.`);
  }
}

export const useTaskStore = create<TaskState>()(
  persist(
    (set, get) => ({
      tasks: {},
      columns: emptyColumns(),
      deleted: {},

      createTask: (draft) => {
        const id = crypto.randomUUID();
        const status = draft.status ?? 'todo';
        const now = Date.now();
        const task: Task = {
          id,
          title: draft.title?.trim() || defaultTitleFor(draft.payload),
          description: draft.description ?? '',
          status,
          iconRef: draft.iconRef ?? defaultIconFor(draft.payload),
          payload: draft.payload,
          explicitDeps: draft.explicitDeps ?? [],
          createdAt: now,
          updatedAt: now,
        };
        set((state) => {
          const tasks = { ...state.tasks, [id]: task };
          const { tasks: acyclic, removed } = sanitizeCycles(tasks);
          toastCycleRemovals(removed, acyclic);
          return {
            tasks: acyclic,
            columns: { ...state.columns, [status]: [...state.columns[status], id] },
          };
        });
        return id;
      },

      updateTask: (id, patch) => {
        const state = get();
        const existing = state.tasks[id];
        if (!existing) return;
        const updated: Task = {
          ...existing,
          ...patch,
          id,
          createdAt: existing.createdAt,
          updatedAt: Date.now(),
        };
        let next: TaskBundle = {
          tasks: { ...state.tasks, [id]: updated },
          columns: state.columns,
        };
        if (patch.status && patch.status !== existing.status) {
          const from = next.columns[existing.status].filter((x) => x !== id);
          const to = [...next.columns[patch.status], id];
          next = {
            ...next,
            columns: { ...next.columns, [existing.status]: from, [patch.status]: to },
          };
        }
        const { tasks: acyclic, removed } = sanitizeCycles(next.tasks);
        toastCycleRemovals(removed, acyclic);
        set({ tasks: acyclic, columns: next.columns });
      },

      deleteTask: (id) => {
        set((state) => {
          const now = Date.now();
          const tasks: TaskMap = {};
          for (const [tid, task] of Object.entries(state.tasks)) {
            if (tid === id) continue;
            tasks[tid] = task.explicitDeps.includes(id)
              ? {
                  ...task,
                  explicitDeps: task.explicitDeps.filter((d) => d !== id),
                  updatedAt: now,
                }
              : task;
          }
          const columns = emptyColumns();
          for (const status of STATUSES) {
            columns[status] = state.columns[status].filter((x) => x !== id);
          }
          const deleted = state.tasks[id] ? { ...state.deleted, [id]: now } : state.deleted;
          return { tasks, columns, deleted };
        });
      },

      moveTask: (id, toStatus, toIndex) => {
        set((state) => {
          const task = state.tasks[id];
          if (!task) return state;
          const columns = emptyColumns();
          for (const status of STATUSES) {
            columns[status] = state.columns[status].filter((x) => x !== id);
          }
          const clamped = Math.max(0, Math.min(toIndex, columns[toStatus].length));
          columns[toStatus].splice(clamped, 0, id);
          const tasks =
            task.status === toStatus
              ? state.tasks
              : { ...state.tasks, [id]: { ...task, status: toStatus, updatedAt: Date.now() } };
          return { tasks, columns };
        });
      },

      setStatus: (id, status) => {
        const task = get().tasks[id];
        if (!task || task.status === status) return;
        get().moveTask(id, status, get().columns[status].length);
      },

      addDep: (id, depId) => {
        const state = get();
        const task = state.tasks[id];
        if (!task || !state.tasks[depId] || id === depId) return false;
        if (task.explicitDeps.includes(depId)) return false;
        if (wouldCreateCycle(state.tasks, id, depId)) return false;
        set({
          tasks: {
            ...state.tasks,
            [id]: {
              ...task,
              explicitDeps: [...task.explicitDeps, depId],
              updatedAt: Date.now(),
            },
          },
        });
        return true;
      },

      removeDep: (id, depId) => {
        const task = get().tasks[id];
        if (!task) return;
        set((state) => ({
          tasks: {
            ...state.tasks,
            [id]: {
              ...task,
              explicitDeps: task.explicitDeps.filter((d) => d !== depId),
              updatedAt: Date.now(),
            },
          },
        }));
      },

      replaceAll: (bundle) => {
        set({
          ...reconcileBundle(bundle.tasks ?? {}, bundle.columns ?? emptyColumns()),
          deleted: prunedTombstones(bundle.deleted ?? {}),
        });
      },

      reconcile: () => {
        set((state) => ({
          ...reconcileBundle(state.tasks, state.columns),
          deleted: prunedTombstones(state.deleted ?? {}),
        }));
      },
    }),
    {
      name: TASKS_STORAGE_KEY,
      version: TASKS_PERSIST_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        tasks: state.tasks,
        columns: state.columns,
        deleted: state.deleted,
      }),
      /** v1 had neither per-task updatedAt nor tombstones. */
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Partial<TaskState>;
        if (version >= 2) return state as TaskState;
        const tasks: TaskMap = {};
        for (const [id, task] of Object.entries(state.tasks ?? {})) {
          tasks[id] = { ...task, updatedAt: task.updatedAt ?? task.createdAt ?? 0 };
        }
        return { ...state, tasks, deleted: {} } as TaskState;
      },
      onRehydrateStorage: () => (state) => {
        state?.reconcile();
      },
    },
  ),
);
