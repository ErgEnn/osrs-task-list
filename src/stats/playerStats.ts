import type { WikiSyncPlayer } from '@/api/wikiSync';
import { normalizeSkillName, SKILLS, type Skill } from '@/domain/skills';
import type { Status } from '@/domain/types';

/**
 * Turns a raw WikiSync profile into everything the stats sidebar shows.
 * WikiSync only promises `levels` and `quests` (see api/wikiSync.ts); the
 * diaries and combat-achievement fields are parsed defensively so an unknown
 * shape degrades to "not reported" rather than blanking the panel.
 */

export const DIARY_TIERS = ['Easy', 'Medium', 'Hard', 'Elite'] as const;
export type DiaryTierName = (typeof DIARY_TIERS)[number];

/** Levels every account starts with, for skills WikiSync did not report. */
const BASE_LEVEL: Partial<Record<Skill, number>> = { Hitpoints: 10 };

const QUEST_STATUS: Record<number, Status> = { 0: 'todo', 1: 'inprogress', 2: 'done' };

export interface SkillStat {
  skill: Skill;
  level: number;
  /** False when WikiSync did not report the skill and the base level is shown. */
  reported: boolean;
}

export interface QuestStat {
  name: string;
  status: Status;
}

export interface DiaryTierStat {
  tier: DiaryTierName;
  complete: boolean;
  /** Individual diary tasks ticked off, when WikiSync reported them. */
  done: number;
  total: number;
}

export interface DiaryStat {
  region: string;
  tiers: DiaryTierStat[];
}

export interface PlayerStats {
  username: string;
  skills: SkillStat[];
  totalLevel: number;
  combatLevel: number;
  quests: QuestStat[];
  questCounts: Record<Status, number> & { total: number };
  diaries: DiaryStat[];
  /** Diary tiers finished / tiers reported. */
  diaryCounts: { done: number; total: number };
  /** Combat achievement tasks reported complete; null when not reported. */
  combatAchievements: number | null;
}

function baseLevel(skill: Skill): number {
  return BASE_LEVEL[skill] ?? 1;
}

/** Skill levels in the in-game skills-tab order, filling unreported skills. */
export function skillStats(levels: Record<string, number>): SkillStat[] {
  const bySkill = new Map<Skill, number>();
  for (const [name, level] of Object.entries(levels)) {
    const skill = normalizeSkillName(name);
    if (skill && Number.isFinite(level)) bySkill.set(skill, level);
  }
  return SKILLS.map((skill) => {
    const level = bySkill.get(skill);
    return {
      skill,
      level: level ?? baseLevel(skill),
      reported: level !== undefined,
    };
  });
}

/** Standard OSRS combat level, computed from the levels WikiSync reported. */
export function combatLevel(skills: SkillStat[]): number {
  const level = (skill: Skill) => skills.find((s) => s.skill === skill)?.level ?? baseLevel(skill);
  const base = 0.25 * (level('Defence') + level('Hitpoints') + Math.floor(level('Prayer') / 2));
  const melee = 0.325 * (level('Attack') + level('Strength'));
  const ranged = 0.325 * (Math.floor(level('Ranged') / 2) + level('Ranged'));
  const magic = 0.325 * (Math.floor(level('Magic') / 2) + level('Magic'));
  return Math.floor(base + Math.max(melee, ranged, magic));
}

function questStats(quests: Record<string, number>): QuestStat[] {
  return Object.entries(quests)
    .map(([name, raw]) => ({ name, status: QUEST_STATUS[raw] ?? 'todo' }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * `{ Ardougne: { Easy: { complete: true, tasks: [true, false] } } }` — regions
 * keep WikiSync's own order, tiers are forced into Easy→Elite order.
 */
export function diaryStats(value: unknown): DiaryStat[] {
  if (!isRecord(value)) return [];
  const regions: DiaryStat[] = [];
  for (const [region, tiersValue] of Object.entries(value)) {
    if (!isRecord(tiersValue)) continue;
    const byTier = new Map<string, unknown>(
      Object.entries(tiersValue).map(([tier, data]) => [tier.toLowerCase(), data]),
    );
    const tiers: DiaryTierStat[] = [];
    for (const tier of DIARY_TIERS) {
      const data = byTier.get(tier.toLowerCase());
      if (!isRecord(data)) continue;
      const tasks = Array.isArray(data.tasks) ? data.tasks : [];
      tiers.push({
        tier,
        complete: data.complete === true,
        done: tasks.filter(Boolean).length,
        total: tasks.length,
      });
    }
    if (tiers.length > 0) regions.push({ region, tiers });
  }
  return regions;
}

export function summarizePlayer(player: WikiSyncPlayer): PlayerStats {
  const skills = skillStats(player.levels);
  const quests = questStats(player.quests);
  const diaries = diaryStats(player.achievement_diaries);
  const allTiers = diaries.flatMap((d) => d.tiers);

  const questCounts = { todo: 0, inprogress: 0, done: 0, total: quests.length };
  for (const quest of quests) questCounts[quest.status] += 1;

  return {
    username: player.username,
    skills,
    totalLevel: skills.reduce((sum, s) => sum + s.level, 0),
    combatLevel: combatLevel(skills),
    quests,
    questCounts,
    diaries,
    diaryCounts: {
      done: allTiers.filter((t) => t.complete).length,
      total: allTiers.length,
    },
    combatAchievements: Array.isArray(player.combat_achievements)
      ? player.combat_achievements.length
      : null,
  };
}
