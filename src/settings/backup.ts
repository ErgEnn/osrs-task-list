import type { Status, Task, TaskMap } from '@/domain/types';
import { STATUSES, TASK_KIND_LABELS } from '@/domain/types';
import { emptyColumns, useTaskStore } from '@/store/taskStore';

export interface BackupBundle {
  v: 1;
  exportedAt: string;
  tasks: TaskMap;
  columns: Record<Status, string[]>;
}

export function exportBundle(): BackupBundle {
  const { tasks, columns } = useTaskStore.getState();
  return { v: 1, exportedAt: new Date().toISOString(), tasks, columns };
}

export function downloadBackup(): void {
  const bundle = exportBundle();
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `osrs-task-list-${bundle.exportedAt.slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
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

/**
 * Replace all tasks with the bundle's content. Invalid entries are dropped
 * (and counted); replaceAll() reconciles columns and dangling deps after.
 */
export function importBundle(json: string): { imported: number; skipped: number } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  const bundle = parsed as Partial<BackupBundle>;
  if (bundle.v !== 1 || typeof bundle.tasks !== 'object' || bundle.tasks === null) {
    throw new Error('That file is not an OSRS Task List backup.');
  }

  const tasks: TaskMap = {};
  let skipped = 0;
  for (const [id, task] of Object.entries(bundle.tasks)) {
    if (isValidTask(task) && task.id === id) {
      tasks[id] = {
        ...task,
        description: typeof task.description === 'string' ? task.description : '',
        iconRef: task.iconRef ?? { kind: 'none' },
        createdAt: typeof task.createdAt === 'number' ? task.createdAt : 0,
      };
    } else {
      skipped++;
    }
  }

  const columns = { ...emptyColumns(), ...(bundle.columns ?? {}) };
  useTaskStore.getState().replaceAll({ tasks, columns });
  return { imported: Object.keys(tasks).length, skipped };
}
