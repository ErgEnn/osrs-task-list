/**
 * Serving the app's userscripts to the user.
 *
 * They ship in `public/` so a userscript manager can install one straight from
 * a URL. Their baked-in defaults point at the canonical GitHub Pages
 * deployment, which is wrong for a fork or a dev server — so a copy taken from
 * inside the app is rewritten to point back at the app it came from, update
 * checks included.
 */

/** Adds capture buttons to the wiki; runs on the wiki's origin. */
export const USERSCRIPT_FILENAME = 'osrs-task-capture.user.js';

/** Fetches WikiSync for the app past CORS; runs on the app's own origin. */
export const BRIDGE_USERSCRIPT_FILENAME = 'osrs-wikisync-bridge.user.js';

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

export function userscriptUrl(href?: string, filename: string = USERSCRIPT_FILENAME): string {
  return appBaseUrl(href) + filename;
}

/**
 * Point a copy of the script at `appUrl`: the app it opens captures in (or, for
 * the bridge, the app it runs on), and the URLs its manager checks for updates.
 * Throws on a non-http(s) URL rather than writing something unusable into the
 * script.
 */
export function personalizeUserscript(
  source: string,
  appUrl: string,
  filename: string = USERSCRIPT_FILENAME,
): string {
  const base = appBaseUrl(appUrl);
  const { protocol } = new URL(base);
  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new Error(`Refusing to point the userscript at a ${protocol} URL.`);
  }
  // JSON.stringify gives a safely escaped JS string literal.
  return (
    source
      .replace(
        /(\bvar DEFAULT_APP_URL = )'[^']*';/,
        (_match, prefix: string) => `${prefix}${JSON.stringify(base)};`,
      )
      .replace(
        /^(\/\/ @(?:downloadURL|updateURL)\s+)\S+$/gm,
        (_match, prefix: string) => `${prefix}${base}${filename}`,
      )
      // Only an @match on the app itself moves — the capture script's match on
      // the wiki has nothing to do with where the app is deployed.
      .replace(
        new RegExp(`^(// @match\\s+)${escapeRegExp(CANONICAL_APP_URL)}\\S*$`, 'gm'),
        (_match, prefix: string) => `${prefix}${base}*`,
      )
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Fetch a shipped script and point it at this deployment. */
export async function fetchUserscript(
  href?: string,
  filename: string = USERSCRIPT_FILENAME,
): Promise<string> {
  const url = userscriptUrl(href, filename);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not load the userscript (HTTP ${response.status}).`);
  }
  return personalizeUserscript(await response.text(), appBaseUrl(href), filename);
}
