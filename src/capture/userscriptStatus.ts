/**
 * Telling whether the wiki capture userscript is installed, and current.
 *
 * The script's real job happens on the wiki, an origin this app cannot see into,
 * so it also matches the app itself (its `@include`, personalized alongside
 * everything else) purely to stamp its version onto `<html>`:
 *
 *     <html data-osrs-tlc-userscript="1.4.0">
 *
 * That attribute is the whole handshake. No attribute after the grace period
 * below means no install this app can see; an older version than
 * `USERSCRIPT_VERSION` means the manager hasn't picked up an update yet.
 *
 * The grace period exists because the script runs at `document-idle`, which can
 * land after this app has already rendered — so "nothing yet" is not an answer
 * until it has had time to run.
 */

/**
 * Version this deployment ships in `public/`. Asserted against the shipped
 * script's `@version` (and the copy in its body) in the tests, so it cannot
 * drift from the file the user actually installs.
 */
export const USERSCRIPT_VERSION = '1.4.0';

export const USERSCRIPT_PRESENCE_ATTR = 'data-osrs-tlc-userscript';

/** How long to wait for a `document-idle` script before calling it missing. */
export const DETECT_GRACE_MS = 3000;

export type UserscriptState =
  /** Still inside the grace period with nothing announced. */
  | 'checking'
  /** Installed, and at least as new as this deployment ships. */
  | 'ok'
  /** Installed, but an older version than this deployment ships. */
  | 'outdated'
  /** Nothing announced itself in time. */
  | 'missing';

export interface UserscriptStatus {
  state: UserscriptState;
  /** What the page announced, or null when nothing did. */
  installed: string | null;
  expected: string;
}

/** Numeric segments of a dotted version, or null when it isn't one. */
function parseVersion(version: string): number[] | null {
  if (!/^\d+(\.\d+)*$/.test(version)) return null;
  return version.split('.').map(Number);
}

/**
 * Dotted-numeric version compare: negative when `a` is older than `b`. Missing
 * segments count as 0, so 1.4 and 1.4.0 are the same version.
 */
export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a) ?? [];
  const right = parseVersion(b) ?? [];
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

/** The version the running page announced, if any. */
export function announcedVersion(root: Element | null = document.documentElement): string | null {
  const value = root?.getAttribute(USERSCRIPT_PRESENCE_ATTR)?.trim();
  return value ? value : null;
}

/**
 * Verdict on an announced version. `settled` is whether the grace period has
 * passed, which is what separates "nothing yet" from "nothing installed".
 *
 * A version that isn't dotted-numeric — a hand-edited copy — counts as fine
 * rather than outdated: something is installed, and guessing would only nag.
 */
export function statusFor(
  installed: string | null,
  settled: boolean,
  expected: string = USERSCRIPT_VERSION,
): UserscriptStatus {
  if (!installed) return { state: settled ? 'missing' : 'checking', installed: null, expected };
  const outdated = parseVersion(installed) !== null && compareVersions(installed, expected) < 0;
  return { state: outdated ? 'outdated' : 'ok', installed, expected };
}

/**
 * Identity of what a notice would say, so dismissing one is remembered only for
 * that: a later version going stale, or an install disappearing, speaks up again.
 */
export function noticeKey(status: UserscriptStatus): string | null {
  if (status.state === 'missing') return 'missing';
  if (status.state === 'outdated') return `outdated:${status.installed}`;
  return null;
}
