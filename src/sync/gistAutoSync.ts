import { useTaskStore } from '@/store/taskStore';
import { useUiStore } from '@/store/uiStore';
import { exportBundle } from './apply';
import { bundleSignature } from './bundle';
import { syncWithGist } from './gistSync';
import { isEmptyReport } from './merge';

/**
 * How long to sit on a local edit before pushing it. Long enough that dragging
 * a card across three columns is one push, short enough that closing the tab
 * right after ticking a task off does not strand the change on this device.
 */
export const PUSH_DEBOUNCE_MS = 2_000;

/**
 * Keep this device in step with the gist for as long as the returned stop
 * function is uncalled:
 *
 * - **on start**, so opening the app on the playing machine picks up whatever
 *   was written elsewhere without a button press;
 * - **on every local change**, debounced — this is the half that used to be
 *   missing. Without it a completed task only left the device on the next
 *   interval tick, so finishing a few tasks and closing the tab pushed
 *   nothing, and the other machine had nothing to pull;
 * - **when the tab is hidden or unloaded**, flushing a pending push while the
 *   page can still make a request;
 * - **when the tab becomes visible again**, to catch up on the ticks skipped
 *   while it was in the background;
 * - **on an interval** while visible, for changes made on the other devices.
 *
 * Rounds never overlap: a trigger arriving mid-sync queues one more round
 * instead of racing the one in flight over the store and the gist.
 */
export function startGistAutoSync(minutes: number): () => void {
  let disposed = false;
  let running = false;
  let rerun = false;
  let pushTimer: ReturnType<typeof setTimeout> | undefined;

  const sync = () => {
    if (disposed) return;
    if (running) {
      rerun = true;
      return;
    }
    running = true;
    syncWithGist()
      .then((report) => {
        if (!isEmptyReport(report)) {
          const counts = [
            report.added.length > 0 ? `${report.added.length} added` : '',
            report.updated.length > 0 ? `${report.updated.length} updated` : '',
            report.removed.length > 0 ? `${report.removed.length} removed` : '',
          ].filter(Boolean);
          useUiStore.getState().pushToast('success', `Gist sync — ${counts.join(', ')}.`);
        }
      })
      .catch(() => {
        // Background sync stays quiet; "Sync now" in settings surfaces errors.
      })
      .finally(() => {
        running = false;
        if (rerun && !disposed) {
          rerun = false;
          sync();
        }
      });
  };

  const schedulePush = () => {
    if (pushTimer !== undefined) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      pushTimer = undefined;
      sync();
    }, PUSH_DEBOUNCE_MS);
  };

  /** Send a pending push now — the tab may not be around in two seconds. */
  const flushPush = () => {
    if (pushTimer === undefined) return;
    clearTimeout(pushTimer);
    pushTimer = undefined;
    sync();
  };

  // A sync's own merge rewrites the store, so watch the data rather than the
  // fact that `set` ran: comparing signatures keeps a write-back from looking
  // like a local edit and pushing itself round and round.
  let lastSeen = bundleSignature(exportBundle());
  const unsubscribe = useTaskStore.subscribe(() => {
    const signature = bundleSignature(exportBundle());
    if (signature === lastSeen) return;
    lastSeen = signature;
    schedulePush();
  });

  const tick = () => {
    if (document.visibilityState === 'visible') sync();
  };

  const onVisibilityChange = () => {
    // Leaving: get the pending edit out while a request can still be made
    // (this fires on tab switch and minimise, well before `pagehide`).
    // Returning: pull whatever the other devices did in the meantime.
    if (document.visibilityState === 'visible') sync();
    else flushPush();
  };

  tick();
  const handle = setInterval(tick, minutes * 60_000);
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pagehide', flushPush);

  return () => {
    disposed = true;
    clearInterval(handle);
    if (pushTimer !== undefined) clearTimeout(pushTimer);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('pagehide', flushPush);
    unsubscribe();
  };
}
