import type { IconRef, TaskPayload } from './types';

export function defaultTitleFor(payload: TaskPayload): string {
  switch (payload.kind) {
    case 'level':
      return `${payload.skill} ${payload.level}`;
    case 'quest':
      return payload.questName || 'Quest';
    case 'item':
      return payload.quantity > 1
        ? `${payload.quantity}× ${payload.itemName}`
        : payload.itemName || 'Item';
    case 'kill':
      return payload.count && payload.count > 1
        ? `Kill ${payload.count}× ${payload.monsterName}`
        : `Kill ${payload.monsterName}`.trim();
    case 'clog':
      return payload.target ? `Log: ${payload.target}` : 'Collection log';
    case 'ca':
      return payload.name || 'Combat achievement';
  }
}

export function defaultIconFor(payload: TaskPayload): IconRef {
  switch (payload.kind) {
    case 'level':
      return { kind: 'builtin', id: `skill:${payload.skill.toLowerCase()}` };
    case 'quest':
      return { kind: 'builtin', id: 'badge:quest' };
    case 'clog':
      return { kind: 'builtin', id: 'badge:clog' };
    case 'ca':
      return { kind: 'builtin', id: 'badge:ca' };
    case 'kill':
      return payload.monsterName
        ? { kind: 'wikiThumb', pageTitle: payload.monsterName }
        : { kind: 'builtin', id: 'badge:kill' };
    case 'item':
      return payload.itemName
        ? { kind: 'wikiFile', fileName: `${payload.itemName}.png` }
        : { kind: 'builtin', id: 'badge:item' };
  }
}
