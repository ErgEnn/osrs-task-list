import { describe, expect, it } from 'vitest';
import { defaultIconFor, defaultTitleFor } from './title';

describe('defaultTitleFor', () => {
  it('formats each task kind', () => {
    expect(defaultTitleFor({ kind: 'level', skill: 'Herblore', level: 50 })).toBe('Herblore 50');
    expect(defaultTitleFor({ kind: 'quest', questName: 'Dragon Slayer I' })).toBe(
      'Dragon Slayer I',
    );
    expect(defaultTitleFor({ kind: 'item', itemName: 'Ranarr seed', quantity: 3 })).toBe(
      '3× Ranarr seed',
    );
    expect(defaultTitleFor({ kind: 'item', itemName: 'Dragon scimitar', quantity: 1 })).toBe(
      'Dragon scimitar',
    );
    expect(defaultTitleFor({ kind: 'item', itemName: 'Dragon scimitar' })).toBe('Dragon scimitar');
    expect(defaultTitleFor({ kind: 'activity', activityName: 'Wintertodt' })).toBe('Do Wintertodt');
    expect(
      defaultTitleFor({ kind: 'activity', activityName: 'Barbarian Assault', count: 5 }),
    ).toBe('Do 5× Barbarian Assault');
    expect(defaultTitleFor({ kind: 'kill', monsterName: 'Zulrah', count: 50 })).toBe(
      'Kill 50× Zulrah',
    );
    expect(defaultTitleFor({ kind: 'kill', monsterName: 'Vorkath' })).toBe('Kill Vorkath');
    expect(defaultTitleFor({ kind: 'clog', target: 'Barrows' })).toBe('Log: Barrows');
    expect(defaultTitleFor({ kind: 'ca', name: 'Perfect Zulrah' })).toBe('Perfect Zulrah');
  });
});

describe('defaultIconFor', () => {
  it('picks builtin skill icons for level tasks', () => {
    expect(defaultIconFor({ kind: 'level', skill: 'Herblore', level: 50 })).toEqual({
      kind: 'builtin',
      id: 'skill:herblore',
    });
  });
  it('uses wiki refs when a concrete subject is known', () => {
    expect(defaultIconFor({ kind: 'item', itemName: 'Abyssal whip', quantity: 1 })).toEqual({
      kind: 'wikiFile',
      fileName: 'Abyssal whip.png',
    });
    expect(defaultIconFor({ kind: 'kill', monsterName: 'Zulrah' })).toEqual({
      kind: 'wikiThumb',
      pageTitle: 'Zulrah',
    });
    expect(defaultIconFor({ kind: 'activity', activityName: 'Wintertodt' })).toEqual({
      kind: 'wikiThumb',
      pageTitle: 'Wintertodt',
    });
  });
  it('falls back to the activity badge with no subject yet', () => {
    expect(defaultIconFor({ kind: 'activity', activityName: '' })).toEqual({
      kind: 'builtin',
      id: 'badge:activity',
    });
  });
});
