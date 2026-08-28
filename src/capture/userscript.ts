/**
 * Serving the wiki capture userscript to the user.
 *
 * The script ships in `public/` so a userscript manager can install it straight
 * from a URL. Its baked-in defaults point at the canonical GitHub Pages
 * deployment, which is wrong for a fork or a dev server — so a copy taken from
 * inside the app is rewritten to point back at the app it came from, update
 * checks included.
 */

export const USERSCRIPT_FILENAME = 'osrs-task-capture.user.js';

/**
 * The deployment the shipped script targets before personalization. Asserted
 * against `public/` in the tests, so it cannot drift from the file.
 */
export const CANONICAL_APP_URL = 'https://ergenn.github.io/osrs-task-list/';

/** True when the script served from `public/` already targets the running app. */
export function isCanonicalDeployment(href?: string): boolean {
  return appBaseUrl(href) === CANONICAL_APP_URL;
}

/** Base URL of the running app, always with a trailing slash and no query/hash. */
export function appBaseUrl(href: string = window.location.href): string {
  const url = new URL(href);
  url.hash = '';
  url.search = '';
  // Drop a trailing file name (…/index.html) so the base is the directory.
  url.pathname = url.pathname.replace(/[^/]*$/, '');
  return url.toString();
}

export function userscriptUrl(href?: string): string {
  return appBaseUrl(href) + USERSCRIPT_FILENAME;
}

/**
 * Point a copy of the script at `appUrl`: the app it opens captures in, the app
 * page it announces its version on (`@include`), and the URLs its manager checks
 * for updates. Throws on a non-http(s) URL rather than writing something
 * unusable into the script.
 */
export function personalizeUserscript(source: string, appUrl: string): string {
  const base = appBaseUrl(appUrl);
  const { protocol } = new URL(base);
  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new Error(`Refusing to point the userscript at a ${protocol} URL.`);
  }
  // JSON.stringify gives a safely escaped JS string literal. @include is the app
  // itself, so it follows the deployment too; @match stays as it is, since that
  // one is the wiki and the wiki is the same everywhere.
  return source
    .replace(
      /(\bvar DEFAULT_APP_URL = )'[^']*';/,
      (_match, prefix: string) => `${prefix}${JSON.stringify(base)};`,
    )
    .replace(
      /^(\/\/ @(?:downloadURL|updateURL)\s+)\S+$/gm,
      (_match, prefix: string) => `${prefix}${base}${USERSCRIPT_FILENAME}`,
    )
    .replace(/^(\/\/ @include\s+)\S+$/gm, (_match, prefix: string) => `${prefix}${base}*`);
}

/** Fetch the shipped script and point it at this deployment. */
export async function fetchUserscript(href?: string): Promise<string> {
  const url = userscriptUrl(href);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not load the userscript (HTTP ${response.status}).`);
  }
  return personalizeUserscript(await response.text(), appBaseUrl(href));
}
