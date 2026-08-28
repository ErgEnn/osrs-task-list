import { describe, expect, it } from 'vitest';
// The real shipped script, so these tests fail if the version the app compares
// against drifts from the one the file actually announces.
import SHIPPED from '../../public/osrs-task-capture.user.js?raw';
import { CANONICAL_APP_URL } from './userscript';
import {
  announcedVersion,
  compareVersions,
  noticeKey,
  statusFor,
  USERSCRIPT_PRESENCE_ATTR,
  USERSCRIPT_VERSION,
} from './userscriptStatus';

/** Stand-in for `<html>`, so these tests need no DOM. */
function root(value: string | null) {
  return { getAttribute: () => value } as unknown as Element;
}

describe('the shipped script', () => {
  it('announces the version the app compares against', () => {
    expect(SHIPPED).toContain(`// @version      ${USERSCRIPT_VERSION}`);
    expect(SHIPPED).toContain(`var VERSION = '${USERSCRIPT_VERSION}';`);
  });

  it('stamps the attribute the app watches for', () => {
    expect(SHIPPED).toContain(`var PRESENCE_ATTR = '${USERSCRIPT_PRESENCE_ATTR}';`);
    expect(SHIPPED).toContain('document.documentElement.setAttribute(PRESENCE_ATTR, VERSION)');
  });

  it('runs on the app itself, so it can announce anything at all', () => {
    expect(SHIPPED).toContain(`// @include      ${CANONICAL_APP_URL}*`);
  });
});

describe('compareVersions', () => {
  it.each([
    ['1.3.0', '1.4.0', -1],
    ['1.4.0', '1.3.0', 1],
    ['1.4.0', '1.4.0', 0],
    // Missing segments are zero, so these are the same version.
    ['1.4', '1.4.0', 0],
    ['2', '1.99.99', 1],
    // Segments are numbers, not strings: 10 is newer than 9.
    ['1.10.0', '1.9.0', 1],
    ['1.4.1', '1.4', 1],
  ])('%s vs %s → %i', (a, b, expected) => {
    expect(compareVersions(a, b)).toBe(expected);
  });
});

describe('announcedVersion', () => {
  it('reads the stamped version', () => {
    expect(announcedVersion(root('1.4.0'))).toBe('1.4.0');
    expect(announcedVersion(root(' 1.4.0 '))).toBe('1.4.0');
  });

  it('is null when nothing stamped one', () => {
    expect(announcedVersion(root(null))).toBeNull();
    expect(announcedVersion(root(''))).toBeNull();
    expect(announcedVersion(null)).toBeNull();
  });
});

describe('statusFor', () => {
  it('says nothing until the grace period is up', () => {
    expect(statusFor(null, false).state).toBe('checking');
    expect(statusFor(null, true).state).toBe('missing');
  });

  it('does not wait out the grace period once a version is in', () => {
    expect(statusFor('1.3.0', false, '1.4.0').state).toBe('outdated');
    expect(statusFor('1.4.0', false, '1.4.0').state).toBe('ok');
  });

  it('treats a newer install as fine', () => {
    expect(statusFor('1.5.0', true, '1.4.0').state).toBe('ok');
  });

  it('reports both versions so the notice can name them', () => {
    expect(statusFor('1.3.0', true, '1.4.0')).toEqual({
      state: 'outdated',
      installed: '1.3.0',
      expected: '1.4.0',
    });
  });

  it('leaves an unreadable version alone rather than nagging about it', () => {
    expect(statusFor('1.4.0-fork', true, '1.4.0').state).toBe('ok');
    expect(statusFor('who knows', true, '1.4.0').state).toBe('ok');
  });
});

describe('noticeKey', () => {
  it('is null for the states with nothing to say', () => {
    expect(noticeKey(statusFor(null, false))).toBeNull();
    expect(noticeKey(statusFor(USERSCRIPT_VERSION, true))).toBeNull();
  });

  it('changes when the same problem comes back with a different version', () => {
    expect(noticeKey(statusFor(null, true))).toBe('missing');
    expect(noticeKey(statusFor('1.3.0', true, '1.4.0'))).toBe('outdated:1.3.0');
    expect(noticeKey(statusFor('1.4.0', true, '1.5.0'))).toBe('outdated:1.4.0');
  });
});
