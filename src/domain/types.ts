import type { Skill } from './skills';

export type Status = 'todo' | 'inprogress' | 'done';

export const STATUSES: readonly Status[] = ['todo', 'inprogress', 'done'];

export const STATUS_LABELS: Record<Status, string> = {
  todo: 'To do',
  inprogress: 'In progress',
  done: 'Completed',
};

export type TaskKind = 'item' | 'level' | 'quest' | 'kill' | 'clog' | 'ca';

export const TASK_KIND_LABELS: Record<TaskKind, string> = {
  item: 'Collect item',
  level: 'Level up',
  quest: 'Quest',
  kill: 'Kill',
  clog: 'Collection log',
  ca: 'Combat achievement',
};

export type IconRef =
  | { kind: 'builtin'; id: string }
  | { kind: 'wikiFile'; fileName: string }
  | { kind: 'wikiThumb'; pageTitle: string }
  | { kind: 'none' };

export type TaskPayload =
  | { kind: 'item'; itemName: string; quantity: number }
  | { kind: 'level'; skill: Skill; level: number }
  | { kind: 'quest'; questName: string }
  | { kind: 'kill'; monsterName: string; count?: number }
  | { kind: 'clog'; target: string }
  | { kind: 'ca'; name: string };

export interface Task {
  id: string;
  title: string;
  description: string;
  status: Status;
  iconRef: IconRef;
  payload: TaskPayload;
  /** Ids of tasks this task depends on (manually added). Auto level-deps are derived, never stored. */
  explicitDeps: string[];
  createdAt: number;
}

export type TaskMap = Record<string, Task>;
