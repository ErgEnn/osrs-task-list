export const SKILLS = [
  'Attack',
  'Strength',
  'Defence',
  'Ranged',
  'Prayer',
  'Magic',
  'Runecraft',
  'Construction',
  'Hitpoints',
  'Agility',
  'Herblore',
  'Thieving',
  'Crafting',
  'Fletching',
  'Slayer',
  'Hunter',
  'Mining',
  'Smithing',
  'Fishing',
  'Cooking',
  'Firemaking',
  'Woodcutting',
  'Farming',
] as const;

export type Skill = (typeof SKILLS)[number];

const BY_LOWER = new Map<string, Skill>(SKILLS.map((s) => [s.toLowerCase(), s]));
// Sources disagree on this one: the hiscores say "Runecrafting", the game says "Runecraft".
BY_LOWER.set('runecrafting', 'Runecraft');

export function isSkill(value: string): value is Skill {
  return BY_LOWER.get(value.toLowerCase()) === value;
}

/** Case-insensitive lookup accepting known aliases; null when not a skill. */
export function normalizeSkillName(value: string): Skill | null {
  return BY_LOWER.get(value.trim().toLowerCase()) ?? null;
}
