import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
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

export interface TaskBundle {
  tasks: TaskMap;
  columns: Record<Status, string[]>;
}

interface TaskState extends TaskBundle {
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

export const emptyColumns = (): Record<Status, string[]> => ({
  todo: [],
  inprogress: [],
  done: [],
});

function toastCycleRemovals(removed: Array<{ taskId: string; depId: string }>, tasks: TaskMap) {
  for (const { taskId, depId } of removed) {
    const to = tasks[taskId]?.title ?? taskId;
    const from = tasks[depId]?.title ?? depId;
    useUiStore
      .getState()
      .pushToast('info', `Removed dependency "${from}" → "${to}" to break a cycle.`);
  }
}

/** Rebuild columns so every task sits exactly once in the column of its status. */
function reconcileBundle(tasks: TaskMap, columns: Record<Status, string[]>): TaskBundle {
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

export const useTaskStore = create<TaskState>()(
  persist(
    (set, get) => ({
      tasks: {},
      columns: emptyColumns(),

      createTask: (draft) => {
        const id = crypto.randomUUID();
        const status = draft.status ?? 'todo';
        const task: Task = {
          id,
          title: draft.title?.trim() || defaultTitleFor(draft.payload),
          description: draft.description ?? '',
          status,
          iconRef: draft.iconRef ?? defaultIconFor(draft.payload),
          payload: draft.payload,
          explicitDeps: draft.explicitDeps ?? [],
          createdAt: Date.now(),
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
        const updated: Task = { ...existing, ...patch, id, createdAt: existing.createdAt };
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
          const tasks: TaskMap = {};
          for (const [tid, task] of Object.entries(state.tasks)) {
            if (tid === id) continue;
            tasks[tid] = task.explicitDeps.includes(id)
              ? { ...task, explicitDeps: task.explicitDeps.filter((d) => d !== id) }
              : task;
          }
          const columns = emptyColumns();
          for (const status of STATUSES) {
            columns[status] = state.columns[status].filter((x) => x !== id);
          }
          return { tasks, columns };
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
              : { ...state.tasks, [id]: { ...task, status: toStatus } };
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
            [id]: { ...task, explicitDeps: [...task.explicitDeps, depId] },
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
            [id]: { ...task, explicitDeps: task.explicitDeps.filter((d) => d !== depId) },
          },
        }));
      },

      replaceAll: (bundle) => {
        set(reconcileBundle(bundle.tasks ?? {}, bundle.columns ?? emptyColumns()));
      },

      reconcile: () => {
        set((state) => reconcileBundle(state.tasks, state.columns));
      },
    }),
    {
      name: 'osrs-tl:tasks',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ tasks: state.tasks, columns: state.columns }),
      onRehydrateStorage: () => (state) => {
        state?.reconcile();
      },
    },
  ),
);
