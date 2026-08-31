/**
 * How long to wait for another tab to finish its round before giving up on the
 * lock and going ahead anyway. A tab that dies mid-request releases the lock on
 * its own, so this only covers the pathological case of one that is still alive
 * with a request that never settles — better a rare overlap than a tab that can
 * never sync again.
 */
const LOCK_TIMEOUT_MS = 30_000;

/**
 * Run `job` with a lock held across every tab of this browser profile, so two
 * tabs cannot interleave a read-modify-write of the same gist: without it both
 * could `GET` the same version and each `PATCH` back a merge that never saw the
 * other's, losing whichever landed first.
 *
 * Falls back to running unguarded where the Web Locks API is missing (older
 * browsers, jsdom), which is exactly the single-tab behavior it replaces.
 */
export async function withTabLock<T>(name: string, job: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  if (!locks) return job();
  try {
    return await locks.request(name, { signal: AbortSignal.timeout(LOCK_TIMEOUT_MS) }, job);
  } catch (error) {
    // Only the wait was abandoned — the job itself never ran, so run it now.
    if (error instanceof DOMException && error.name === 'TimeoutError') return job();
    throw error;
  }
}
