import type { Task } from './types';
import { TASK_KIND_LABELS } from './types';

function haystack(task: Task): string {
  const parts = [task.title, task.description, TASK_KIND_LABELS[task.payload.kind]];
  switch (task.payload.kind) {
    case 'item':
      parts.push(task.payload.itemName);
      break;
    case 'level':
      parts.push(task.payload.skill);
      break;
    case 'quest':
      parts.push(task.payload.questName);
      break;
    case 'activity':
      parts.push(task.payload.activityName);
      break;
    case 'kill':
      parts.push(task.payload.monsterName);
      break;
    case 'clog':
      parts.push(task.payload.target);
      break;
    case 'ca':
      parts.push(task.payload.name);
      break;
  }
  return parts.join(' ').toLowerCase();
}

/** Every whitespace-separated word of the query must appear somewhere in the task. */
export function matchesSearch(task: Task, query: string): boolean {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return true;
  const hay = haystack(task);
  return trimmed.split(/\s+/).every((word) => hay.includes(word));
}
