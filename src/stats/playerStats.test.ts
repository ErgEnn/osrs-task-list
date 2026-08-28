import { describe, expect, it } from 'vitest';
import playerFixture from '@/api/__fixtures__/wikisync-player.json';
import type { WikiSyncPlayer } from '@/api/wikiSync';
import { SKILLS } from '@/domain/skills';
import { combatLevel, diaryStats, skillStats, summarizePlayer } from './playerStats';

const fixture = playerFixture as unknown as WikiSyncPlayer;

describe('skillStats', () => {
  it('lists every skill in game order, filling unreported ones', () => {
    const stats = skillStats({ Herblore: 52 });
    expect(stats).toHaveLength(SKILLS.length);
    expect(stats[0].skill).toBe('Attack');
    expect(stats.find((s) => s.skill === 'Herblore')).toEqual({
      skill: 'Herblore',
      level: 52,
      reported: true,
    });
    // Fresh accounts start at Hitpoints 10, everything else 1.
    expect(stats.find((s) => s.skill === 'Hitpoints')).toEqual({
      skill: 'Hitpoints',
      level: 10,
      reported: false,
    });
    expect(stats.find((s) => s.skill === 'Mining')?.level).toBe(1);
  });

  it('accepts the hiscores spelling of Runecraft', () => {
    expect(skillStats({ Runecrafting: 44 }).find((s) => s.skill === 'Runecraft')?.level).toBe(44);
  });
});

describe('combatLevel', () => {
  it('is 3 for a fresh account', () => {
    expect(combatLevel(skillStats({}))).toBe(3);
  });

  it('matches the in-game formula for a melee account', () => {
    const levels = { Attack: 60, Strength: 60, Defence: 60, Hitpoints: 60, Prayer: 43 };
    // base 0.25*(60+60+21) + melee 0.325*(60+60) = 74.25
    expect(combatLevel(skillStats(levels))).toBe(74);
  });

  it('takes the best of melee, ranged and magic', () => {
    const base = { Defence: 1, Hitpoints: 10, Prayer: 1, Attack: 1, Strength: 1 };
    expect(combatLevel(skillStats({ ...base, Ranged: 70 }))).toBe(
      combatLevel(skillStats({ ...base, Magic: 70 })),
    );
    expect(combatLevel(skillStats({ ...base, Ranged: 70 }))).toBeGreaterThan(
      combatLevel(skillStats(base)),
    );
  });
});

describe('diaryStats', () => {
  it('orders tiers easy to elite and counts ticked tasks', () => {
    const diaries = diaryStats({
      Varrock: {
        Elite: { complete: false, tasks: [false, false] },
        Easy: { complete: true, tasks: [true, true, true] },
        Medium: { complete: false, tasks: [true, false] },
      },
    });
    expect(diaries).toHaveLength(1);
    expect(diaries[0].tiers.map((t) => t.tier)).toEqual(['Easy', 'Medium', 'Elite']);
    expect(diaries[0].tiers[1]).toEqual({ tier: 'Medium', complete: false, done: 1, total: 2 });
  });

  it('degrades to nothing on shapes it does not recognize', () => {
    expect(diaryStats(undefined)).toEqual([]);
    expect(diaryStats('nope')).toEqual([]);
    expect(diaryStats({ Varrock: 'nope' })).toEqual([]);
    expect(diaryStats({ Varrock: {} })).toEqual([]);
  });
});

describe('summarizePlayer', () => {
  it('summarizes the documented WikiSync fixture', () => {
    const stats = summarizePlayer(fixture);
    expect(stats.username).toBe('example player');
    expect(stats.questCounts).toEqual({ todo: 1, inprogress: 1, done: 2, total: 4 });
    expect(stats.quests[0].name).toBe("Cook's Assistant");
    expect(stats.quests.find((q) => q.name === 'Dragon Slayer I')?.status).toBe('inprogress');
    expect(stats.combatAchievements).toBe(3);
    expect(stats.diaryCounts).toEqual({ done: 1, total: 1 });
    // 3 reported levels + the 20 skills left at their base level.
    expect(stats.totalLevel).toBe(70 + 52 + 61 + 10 + 19);
  });

  it('reports combat achievements as unknown when the field is absent', () => {
    const stats = summarizePlayer({ username: 'x', levels: {}, quests: {} });
    expect(stats.combatAchievements).toBeNull();
    expect(stats.diaries).toEqual([]);
    expect(stats.questCounts.total).toBe(0);
  });
});
