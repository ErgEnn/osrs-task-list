import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  announcedVersion,
  DETECT_GRACE_MS,
  statusFor,
  USERSCRIPT_PRESENCE_ATTR,
  type UserscriptStatus,
} from './userscriptStatus';

/** `<html>`'s announcement attribute, read as an external store. */
function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: [USERSCRIPT_PRESENCE_ATTR],
  });
  return () => observer.disconnect();
}

const getSnapshot = () => announcedVersion();

/**
 * App start, near enough: the grace period is counted from here rather than from
 * a component mounting, so the Settings panel opened minutes later reports what
 * it already knows instead of waiting all over again.
 */
const startedAt = Date.now();

const graceLeft = () => Math.max(0, DETECT_GRACE_MS - (Date.now() - startedAt));

/**
 * Watch for the capture userscript announcing itself on `<html>`.
 *
 * It runs at `document-idle`, so it can get there before this app renders or
 * well after — hence a read plus a subscription rather than either alone. The
 * subscription outlives the grace period: an install that turns up late still
 * flips a "missing" notice back off, with no reload.
 */
export function useUserscriptStatus(): UserscriptStatus {
  const installed = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const [settled, setSettled] = useState(() => graceLeft() === 0);

  useEffect(() => {
    if (settled) return;
    const timer = window.setTimeout(() => setSettled(true), graceLeft());
    return () => window.clearTimeout(timer);
  }, [settled]);

  return statusFor(installed, settled);
}
