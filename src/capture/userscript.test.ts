import { describe, expect, it } from 'vitest';
// The real shipped script, so these tests fail if it drifts from what the app
// rewrites. Test-only: the app fetches it at runtime, never bundles it.
import SHIPPED from '../../public/osrs-task-capture.user.js?raw';
import {
  appBaseUrl,
  CANONICAL_APP_URL,
  isCanonicalDeployment,
  personalizeUserscript,
  USERSCRIPT_FILENAME,
  userscriptUrl,
} from './userscript';

describe('appBaseUrl', () => {
  it.each([
    ['https://ergenn.github.io/osrs-task-list/', 'https://ergenn.github.io/osrs-task-list/'],
    ['https://ergenn.github.io/osrs-task-list', 'https://ergenn.github.io/'],
    [
      'https://ergenn.github.io/osrs-task-list/index.html',
      'https://ergenn.github.io/osrs-task-list/',
    ],
    ['http://localhost:5173/#/capture?d=abc', 'http://localhost:5173/'],
    ['http://localhost:5173/?x=1#transfer=y', 'http://localhost:5173/'],
  ])('%s → %s', (href, expected) => {
    expect(appBaseUrl(href)).toBe(expected);
  });

  it('builds the script URL under the app base', () => {
    expect(userscriptUrl('https://example.com/app/index.html')).toBe(
      `https://example.com/app/${USERSCRIPT_FILENAME}`,
    );
  });
});

describe('CANONICAL_APP_URL', () => {
  it('is what the shipped script actually targets', () => {
    expect(SHIPPED).toContain(`var DEFAULT_APP_URL = '${CANONICAL_APP_URL}';`);
    expect(SHIPPED).toContain(`// @downloadURL  ${CANONICAL_APP_URL}${USERSCRIPT_FILENAME}`);
    expect(SHIPPED).toContain(`// @updateURL    ${CANONICAL_APP_URL}${USERSCRIPT_FILENAME}`);
    expect(SHIPPED).toContain(`// @include      ${CANONICAL_APP_URL}*`);
  });

  it('recognizes the canonical deployment, ignoring the current route', () => {
    expect(isCanonicalDeployment(`${CANONICAL_APP_URL}#/capture?d=x`)).toBe(true);
    expect(isCanonicalDeployment(`${CANONICAL_APP_URL}index.html`)).toBe(true);
    expect(isCanonicalDeployment('http://localhost:5173/')).toBe(false);
    expect(isCanonicalDeployment('https://fork.example/osrs-task-list/')).toBe(false);
  });
});

describe('personalizeUserscript', () => {
  it('repoints the shipped script at this deployment', () => {
    const out = personalizeUserscript(SHIPPED, 'http://localhost:5173/');
    expect(out).toContain('var DEFAULT_APP_URL = "http://localhost:5173/";');
    expect(out).toContain(`// @downloadURL  http://localhost:5173/${USERSCRIPT_FILENAME}`);
    expect(out).toContain(`// @updateURL    http://localhost:5173/${USERSCRIPT_FILENAME}`);
    // Version announcements have to happen on this deployment's pages, not the
    // canonical ones.
    expect(out).toContain('// @include      http://localhost:5173/*');
    // Nothing of the canonical deployment is left to send captures elsewhere.
    expect(out).not.toContain('ergenn.github.io');
  });

  it('leaves the wiki @match alone — that side is the same everywhere', () => {
    const out = personalizeUserscript(SHIPPED, 'http://localhost:5173/');
    expect(out).toContain('// @match        https://oldschool.runescape.wiki/*');
  });

  it('rewrites exactly four lines and nothing else', () => {
    const before = SHIPPED.split('\n');
    const after = personalizeUserscript(SHIPPED, 'http://localhost:5173/').split('\n');
    expect(after).toHaveLength(before.length);
    expect(before.filter((line, i) => line !== after[i])).toHaveLength(4);
  });

  it('is idempotent', () => {
    const once = personalizeUserscript(SHIPPED, 'https://fork.example/tasks/');
    expect(personalizeUserscript(once, 'https://fork.example/tasks/')).toBe(once);
  });

  it('normalizes the app URL it is given', () => {
    const out = personalizeUserscript(
      SHIPPED,
      'https://fork.example/tasks/index.html#/capture?d=x',
    );
    expect(out).toContain('var DEFAULT_APP_URL = "https://fork.example/tasks/";');
  });

  it('escapes a URL that would otherwise break out of the string literal', () => {
    // Percent-encoded by URL parsing, so the literal stays a plain string.
    const out = personalizeUserscript(SHIPPED, "https://evil.example/a'+alert(1)+'/");
    expect(out).toContain('var DEFAULT_APP_URL = "https://evil.example/a\'+alert(1)+\'/";');
    expect(out).not.toMatch(/DEFAULT_APP_URL = .*';.*alert/);
  });

  it('rejects a non-http scheme', () => {
    expect(() => personalizeUserscript(SHIPPED, 'javascript:alert(1)')).toThrow(/Refusing/);
    expect(() => personalizeUserscript(SHIPPED, 'file:///tmp/app/')).toThrow(/Refusing/);
  });
});
