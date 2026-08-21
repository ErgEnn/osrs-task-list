import type { Skill } from '@/domain/skills';
import { normalizeSkillName } from '@/domain/skills';

/**
 * Wikitext parsing for the {{Quest details}} template on OSRS wiki quest
 * pages. Regex alone cannot handle nested templates, so template extraction
 * and parameter splitting walk {{ }} / [[ ]] depth explicitly.
 */

function findTemplateStart(lower: string, needle: string): number | null {
  for (let from = 0; ; ) {
    const found = lower.indexOf(needle, from);
    if (found === -1) return null;
    const after = lower[found + needle.length];
    if (after === undefined || '|}\n\r\t '.includes(after)) return found;
    from = found + 1;
  }
}

/** Extract the inner body of the first {{name ...}} template occurrence. */
export function extractTemplate(wikitext: string, name: string): string | null {
  const start = findTemplateStart(wikitext.toLowerCase(), `{{${name.toLowerCase()}`);
  if (start === null) return null;

  let depth = 0;
  let i = start;
  while (i < wikitext.length) {
    if (wikitext.startsWith('{{', i)) {
      depth++;
      i += 2;
      continue;
    }
    if (wikitext.startsWith('}}', i)) {
      depth--;
      i += 2;
      if (depth === 0) return wikitext.slice(start + 2, i - 2);
      continue;
    }
    i++;
  }
  return null;
}

/** Split a template body into |param=value pairs at top nesting depth only. */
export function splitTemplateParams(templateBody: string): Record<string, string> {
  const parts: string[] = [];
  let current = '';
  let templateDepth = 0;
  let linkDepth = 0;
  for (let i = 0; i < templateBody.length; i++) {
    if (templateBody.startsWith('{{', i)) {
      templateDepth++;
      current += '{{';
      i++;
      continue;
    }
    if (templateBody.startsWith('}}', i)) {
      templateDepth--;
      current += '}}';
      i++;
      continue;
    }
    if (templateBody.startsWith('[[', i)) {
      linkDepth++;
      current += '[[';
      i++;
      continue;
    }
    if (templateBody.startsWith(']]', i)) {
      linkDepth--;
      current += ']]';
      i++;
      continue;
    }
    const ch = templateBody[i];
    if (ch === '|' && templateDepth === 0 && linkDepth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  parts.push(current);

  const params: Record<string, string> = {};
  for (const part of parts.slice(1)) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    params[part.slice(0, eq).trim().toLowerCase()] = part.slice(eq + 1).trim();
  }
  return params;
}

/** Comparable quest-name form: lowercased, straight apostrophes, single spaces. */
export function normalizeQuestName(name: string): string {
  return name
    .replace(/[’‘]/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export interface ParsedRequirements {
  skills: Array<{ skill: Skill; level: number }>;
  quests: string[];
  questPoints: number | null;
  /** Requirement lines we could not turn into tasks — surfaced to the user. */
  unparsed: string[];
}

const SKILL_TEMPLATE = /\{\{\s*(?:scp|skill\s*clickpic)\s*\|\s*([^|}]+?)\s*\|\s*(\d+)[^}]*\}\}/gi;
const LINK = /\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]/g;
const QUEST_POINTS = /(\d+)\s*\[\[\s*quest\s*points?\s*(?:\||\]\])/i;

/**
 * Parse the |requirements= section of a quest page. Quest dependencies are
 * recognized by matching [[links]] against the known quest titles, so item
 * and skill links never become quest deps.
 */
export function parseQuestRequirements(
  wikitext: string,
  knownQuests: ReadonlySet<string>,
  selfTitle = '',
): ParsedRequirements {
  const body = extractTemplate(wikitext, 'Quest details');
  const requirements = body ? (splitTemplateParams(body)['requirements'] ?? '') : '';
  const result: ParsedRequirements = { skills: [], quests: [], questPoints: null, unparsed: [] };
  if (!requirements) return result;

  const self = normalizeQuestName(selfTitle);
  const bestSkill = new Map<Skill, number>();
  const quests: string[] = [];
  const seenQuests = new Set<string>();

  const qp = QUEST_POINTS.exec(requirements);
  if (qp) result.questPoints = Number(qp[1]);

  for (const match of requirements.matchAll(SKILL_TEMPLATE)) {
    const skill = normalizeSkillName(match[1]);
    const level = Number(match[2]);
    if (!skill || !Number.isFinite(level) || level < 1 || level > 99) continue;
    bestSkill.set(skill, Math.max(bestSkill.get(skill) ?? 0, level));
  }
  result.skills = [...bestSkill.entries()].map(([skill, level]) => ({ skill, level }));

  for (const match of requirements.matchAll(LINK)) {
    const title = match[1].trim();
    const normalized = normalizeQuestName(title);
    if (!knownQuests.has(normalized) || normalized === self || seenQuests.has(normalized)) continue;
    seenQuests.add(normalized);
    quests.push(title);
  }
  result.quests = quests;

  // Anything on a bullet line that produced no skill/quest/QP requirement.
  for (const rawLine of requirements.split('\n')) {
    const line = rawLine.trim();
    if (!/^\*+/.test(line)) continue;
    const hasSkill = new RegExp(SKILL_TEMPLATE.source, 'i').test(line);
    const hasQp = QUEST_POINTS.test(line);
    let hasQuest = false;
    for (const match of line.matchAll(new RegExp(LINK.source, 'g'))) {
      if (knownQuests.has(normalizeQuestName(match[1].trim()))) {
        hasQuest = true;
        break;
      }
    }
    if (hasSkill || hasQp || hasQuest) continue;
    const text = line
      .replace(/^\*+\s*/, '')
      .replace(/\{\{[^}]*\}\}/g, '')
      .replace(/\[\[([^\]|#]+)(?:\|([^\]]*))?\]\]/g, (_, page, label) => label || page)
      .replace(/'''?/g, '')
      .trim();
    // Lines ending with ':' are headings introducing sub-bullets ("Completion
    // of the following quests:"), not requirements of their own.
    if (text && !text.endsWith(':') && !/^(none|n\/a|-)[.!]?$/i.test(text)) {
      result.unparsed.push(text);
    }
  }

  return result;
}
