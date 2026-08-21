import { describe, expect, it } from 'vitest';
import cooksAssistant from './__fixtures__/cooks-assistant.wikitext.txt?raw';
import dragonSlayer from './__fixtures__/dragon-slayer-i.wikitext.txt?raw';
import lunarDiplomacy from './__fixtures__/lunar-diplomacy.wikitext.txt?raw';
import {
  extractTemplate,
  normalizeQuestName,
  parseQuestRequirements,
  splitTemplateParams,
} from './questParser';

const KNOWN = new Set(
  [
    'Dragon Slayer I',
    'Dragon Slayer II',
    'Lunar Diplomacy',
    'The Fremennik Trials',
    'Lost City',
    'Rune Mysteries',
    'Shilo Village',
    "Cook's Assistant",
  ].map(normalizeQuestName),
);

describe('extractTemplate / splitTemplateParams', () => {
  it('extracts the quest details block despite nested templates and links', () => {
    const body = extractTemplate(dragonSlayer, 'Quest details');
    expect(body).toBeTruthy();
    const params = splitTemplateParams(body!);
    expect(params['name']).toBe('Dragon Slayer I');
    expect(params['number']).toBe('44');
    // The nested {{Boostable|no}} and [[File:...|300px]] pipes must not split params.
    expect(params['requirements']).toContain('{{SCP|Crafting|8|link=yes}}');
    expect(params['image']).toContain('300px');
  });

  it('returns null when the template is absent', () => {
    expect(extractTemplate('no templates here', 'Quest details')).toBeNull();
  });
});

describe('parseQuestRequirements', () => {
  it('parses skills, quest points, and reports unparsable ability lines', () => {
    const parsed = parseQuestRequirements(dragonSlayer, KNOWN, 'Dragon Slayer I');
    expect(parsed.skills).toEqual([{ skill: 'Crafting', level: 8 }]);
    expect(parsed.questPoints).toBe(32);
    expect(parsed.quests).toEqual([]); // Elvarg/skeleton links are not quests
    expect(parsed.unparsed.some((line) => line.includes('level 83'))).toBe(true);
  });

  it('parses quest dependencies from links filtered by the known quest list', () => {
    const parsed = parseQuestRequirements(lunarDiplomacy, KNOWN, 'Lunar Diplomacy');
    expect(parsed.quests).toEqual([
      'The Fremennik Trials',
      'Lost City',
      'Rune Mysteries',
      'Shilo Village',
    ]);
    expect(parsed.skills).toEqual(
      expect.arrayContaining([
        { skill: 'Herblore', level: 5 },
        { skill: 'Crafting', level: 61 },
        { skill: 'Defence', level: 40 },
        { skill: 'Firemaking', level: 49 },
        { skill: 'Magic', level: 65 },
        { skill: 'Mining', level: 60 },
        { skill: 'Woodcutting', level: 55 },
      ]),
    );
    expect(parsed.skills).toHaveLength(7); // "Combat" from |recommended= must not leak in
    expect(parsed.unparsed).toEqual([]); // the "Completion of..." heading line has quest links below it
  });

  it('handles quests with no requirements', () => {
    const parsed = parseQuestRequirements(cooksAssistant, KNOWN, "Cook's Assistant");
    expect(parsed).toEqual({ skills: [], quests: [], questPoints: null, unparsed: [] });
  });

  it('never depends on itself', () => {
    const text = `{{Quest details\n|name = Lost City\n|requirements =\n* [[Lost City]]\n* [[Shilo Village]]\n}}`;
    const parsed = parseQuestRequirements(text, KNOWN, 'Lost City');
    expect(parsed.quests).toEqual(['Shilo Village']);
  });
});

describe('normalizeQuestName', () => {
  it('normalizes apostrophes, entities, and whitespace', () => {
    expect(normalizeQuestName('Cook’s   Assistant ')).toBe("cook's assistant");
    expect(normalizeQuestName('Throne of Miscellania &amp; more')).toBe(
      'throne of miscellania & more',
    );
  });
});
