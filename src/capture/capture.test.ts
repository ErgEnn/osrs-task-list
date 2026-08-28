import { describe, expect, it } from 'vitest';
import { captureFromHash, parseCapture } from './capture';

function encode(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

describe('parseCapture', () => {
  it('parses a full item capture', () => {
    const parsed = parseCapture(
      encode({
        v: 1,
        title: 'Get a whip',
        description: 'From https://oldschool.runescape.wiki/w/Abyssal_whip',
        status: 'inprogress',
        payload: { kind: 'item', itemName: 'Abyssal whip', quantity: 2 },
      }),
    );
    expect(parsed).toEqual({
      ok: true,
      draft: {
        title: 'Get a whip',
        description: 'From https://oldschool.runescape.wiki/w/Abyssal_whip',
        status: 'inprogress',
        payload: { kind: 'item', itemName: 'Abyssal whip', quantity: 2 },
      },
    });
  });

  it('defaults omitted fields and clamps numbers', () => {
    const parsed = parseCapture(
      encode({ v: 1, payload: { kind: 'level', skill: 'runecrafting', level: 250 } }),
    );
    expect(parsed).toEqual({
      ok: true,
      draft: {
        title: undefined,
        description: undefined,
        status: 'todo',
        payload: { kind: 'level', skill: 'Runecraft', level: 99 },
      },
    });
  });

  it('keeps unicode titles intact through base64url', () => {
    const parsed = parseCapture(
      encode({ v: 1, payload: { kind: 'quest', questName: 'Recipe for Disaster — Kōschei' } }),
    );
    expect(parsed.ok && parsed.draft.payload).toEqual({
      kind: 'quest',
      questName: 'Recipe for Disaster — Kōschei',
    });
  });

  it('drops an invalid kill count but keeps the capture', () => {
    const parsed = parseCapture(
      encode({ v: 1, payload: { kind: 'kill', monsterName: 'Zulrah', count: 'many' } }),
    );
    expect(parsed.ok && parsed.draft.payload).toEqual({ kind: 'kill', monsterName: 'Zulrah' });
  });

  it('leaves an omitted item quantity unset', () => {
    const parsed = parseCapture(encode({ v: 1, payload: { kind: 'item', itemName: 'Coal' } }));
    expect(parsed.ok && parsed.draft.payload).toEqual({ kind: 'item', itemName: 'Coal' });
  });

  it('parses an activity capture with and without a count', () => {
    const bare = parseCapture(
      encode({ v: 1, payload: { kind: 'activity', activityName: 'Wintertodt' } }),
    );
    expect(bare.ok && bare.draft.payload).toEqual({ kind: 'activity', activityName: 'Wintertodt' });
    const counted = parseCapture(
      encode({ v: 1, payload: { kind: 'activity', activityName: 'Pest Control', count: 10 } }),
    );
    expect(counted.ok && counted.draft.payload).toEqual({
      kind: 'activity',
      activityName: 'Pest Control',
      count: 10,
    });
  });

  it('ignores an unknown status', () => {
    const parsed = parseCapture(
      encode({ v: 1, status: 'blocked', payload: { kind: 'clog', target: 'Vorkath' } }),
    );
    expect(parsed.ok && parsed.draft.status).toBe('todo');
  });

  it.each([
    [{ v: 2, payload: { kind: 'ca', name: 'x' } }, /version/],
    [{ v: 1 }, /missing payload/],
    [{ v: 1, payload: { kind: 'pet', name: 'x' } }, /unknown task type/],
    [{ v: 1, payload: { kind: 'item', itemName: '  ' } }, /item name/],
    [{ v: 1, payload: { kind: 'activity', activityName: '' } }, /activity name/],
    [{ v: 1, payload: { kind: 'level', skill: 'Sailing', level: 10 } }, /unknown skill/],
  ])('rejects %j', (envelope, message) => {
    const parsed = parseCapture(encode(envelope));
    expect(parsed.ok).toBe(false);
    expect(!parsed.ok && parsed.error).toMatch(message);
  });

  it('rejects garbage data without throwing', () => {
    expect(parseCapture('not-base64!!!').ok).toBe(false);
    expect(parseCapture(encode('"just a string"')).ok).toBe(false);
  });
});

describe('captureFromHash', () => {
  it('is null for non-capture hashes', () => {
    expect(captureFromHash('')).toBeNull();
    expect(captureFromHash('#/other')).toBeNull();
  });

  it('accepts both #/capture and #capture forms', () => {
    const data = encode({ v: 1, payload: { kind: 'ca', name: 'Perfect Zulrah' } });
    for (const prefix of ['#/capture?', '#capture?']) {
      const parsed = captureFromHash(`${prefix}d=${data}`);
      expect(parsed?.ok).toBe(true);
    }
  });

  it('reports a capture link with no data', () => {
    const parsed = captureFromHash('#/capture?x=1');
    expect(parsed?.ok).toBe(false);
  });
});
