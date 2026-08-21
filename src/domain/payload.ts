import type { TaskKind, TaskPayload } from './types';

export function emptyPayload(kind: TaskKind): TaskPayload {
  switch (kind) {
    case 'item':
      return { kind: 'item', itemName: '', quantity: 1 };
    case 'level':
      return { kind: 'level', skill: 'Attack', level: 1 };
    case 'quest':
      return { kind: 'quest', questName: '' };
    case 'kill':
      return { kind: 'kill', monsterName: '' };
    case 'clog':
      return { kind: 'clog', target: '' };
    case 'ca':
      return { kind: 'ca', name: '' };
  }
}
