import { describe, expect, it } from 'vitest';
import { matchesSearch } from './search';
import type { Task } from './types';

const base: Task = {
  id: 't1',
  title: 'Herblore 50',
  description: 'For prayer potions',
  status: 'todo',
  iconRef: { kind: 'none' },
  payload: { kind: 'level', skill: 'Herblore', level: 50 },
  explicitDeps: [],
  createdAt: 1,
};

describe('matchesSearch', () => {
  it('matches empty queries, title, description, and payload fields', () => {
    expect(matchesSearch(base, '')).toBe(true);
    expect(matchesSearch(base, '  ')).toBe(true);
    expect(matchesSearch(base, 'herb')).toBe(true);
    expect(matchesSearch(base, 'PRAYER')).toBe(true);
    expect(matchesSearch(base, 'zulrah')).toBe(false);
  });

  it('requires every word to match', () => {
    expect(matchesSearch(base, 'herblore potions')).toBe(true);
    expect(matchesSearch(base, 'herblore zulrah')).toBe(false);
  });

  it('matches the task kind label', () => {
    expect(matchesSearch(base, 'level up')).toBe(true);
  });
});
