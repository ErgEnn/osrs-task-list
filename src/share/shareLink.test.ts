import { describe, expect, it } from 'vitest';
import { ownListLink, readShareParam, shareLink } from './shareLink';

const BASE = 'https://ergenn.github.io/osrs-task-list/';

describe('shareLink', () => {
  it('hangs the gist id off the deployment URL', () => {
    expect(shareLink('abc123', BASE)).toBe(`${BASE}?share=abc123`);
  });

  it('drops a capture or transfer fragment from the link it builds', () => {
    expect(shareLink('abc123', `${BASE}#transfer=OSTL2R.xx`)).toBe(`${BASE}?share=abc123`);
  });

  it('replaces the id when the page is already a share link', () => {
    expect(shareLink('new1', `${BASE}?share=old1`)).toBe(`${BASE}?share=new1`);
  });

  it('keeps other query parameters', () => {
    expect(shareLink('abc123', `${BASE}?debug=1`)).toBe(`${BASE}?debug=1&share=abc123`);
  });
});

describe('readShareParam', () => {
  it('reads the id out of a query string', () => {
    expect(readShareParam('?share=1a2b3c')).toBe('1a2b3c');
  });

  it('is null for a normal load', () => {
    expect(readShareParam('')).toBeNull();
    expect(readShareParam('?debug=1')).toBeNull();
  });

  it('refuses ids that are not plain gist ids', () => {
    // A hand-crafted link must never steer the API request somewhere else.
    expect(readShareParam('?share=../../users/someone')).toBeNull();
    expect(readShareParam('?share=')).toBeNull();
    expect(readShareParam(`?share=${'a'.repeat(65)}`)).toBeNull();
  });
});

describe('ownListLink', () => {
  it('strips the share parameter', () => {
    expect(ownListLink(`${BASE}?share=abc123`)).toBe(BASE);
  });

  it('leaves a normal URL alone', () => {
    expect(ownListLink(BASE)).toBe(BASE);
  });
});
