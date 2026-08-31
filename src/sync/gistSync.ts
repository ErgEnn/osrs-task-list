import { createSyncGist, readSyncGist, writeSyncGist } from '@/api/gist';
import { useSettingsStore } from '@/store/settingsStore';
import { mergeIntoStore } from './apply';
import { exportBundle } from './apply';
import { bundleSignature, parseBundleJson, type SyncBundle } from './bundle';
import { isEmptyReport, type MergeReport } from './merge';
import { withTabLock } from './tabLock';

/**
 * Held for a whole round, so two tabs take their turns instead of both reading
 * the same gist and pushing a merge that never saw the other's.
 */
const GIST_LOCK = 'osrs-tl:gist-sync';

export interface GistSyncReport extends MergeReport {
  /** True when the merged bundle was written back to the gist. */
  pushed: boolean;
  /** True when this sync created the gist. */
  created: boolean;
  gistUrl: string;
}

function toFile(bundle: SyncBundle): string {
  return JSON.stringify(bundle, null, 2);
}

/**
 * One sync round with the gist: pull, merge into the local store, and push the
 * result back when it differs from what the gist holds. Both halves use the
 * same merge as the transfer codes, so a device that has been offline for a
 * week converges in one pass instead of clobbering either side.
 *
 * Rounds are serialized across this browser's tabs: whichever tab gets there
 * first pushes, and the next one's pull already holds that push, so it finds
 * nothing to write. Tabs having the same thought at the same time is normal —
 * they share a store, so a change in one is a change in all of them.
 */
export function syncWithGist(): Promise<GistSyncReport> {
  return withTabLock(GIST_LOCK, syncRound);
}

async function syncRound(): Promise<GistSyncReport> {
  const settings = useSettingsStore.getState();
  const token = settings.gistToken.trim();
  if (!token) throw new Error('Add a GitHub token with the "gist" scope in the settings first.');

  if (!settings.gistId) {
    const local = exportBundle();
    const remote = await createSyncGist(token, toFile(local));
    useSettingsStore.getState().setGistLink({ id: remote.id, url: remote.htmlUrl });
    useSettingsStore.getState().setGistLastSyncAt(Date.now());
    return {
      added: [],
      updated: [],
      removed: [],
      unchanged: Object.keys(local.tasks).length,
      pushed: true,
      created: true,
      gistUrl: remote.htmlUrl,
    };
  }

  const remote = await readSyncGist(token, settings.gistId);
  const incoming = remote.content ? parseBundleJson(remote.content).bundle : null;

  const report = incoming ? mergeIntoStore(incoming) : emptyMergeReport();
  const merged = exportBundle();

  // Compare against the gist's own content, not against the pre-merge local
  // state: an unchanged local store can still owe the gist a push (this
  // device's deletes, or tasks the gist never saw).
  const stale = !incoming || bundleSignature(incoming) !== bundleSignature(merged);
  const pushed = stale;
  if (pushed) {
    const written = await writeSyncGist(token, settings.gistId, toFile(merged));
    useSettingsStore.getState().setGistLink({ id: written.id, url: written.htmlUrl });
  }
  useSettingsStore.getState().setGistLastSyncAt(Date.now());

  return { ...report, pushed, created: false, gistUrl: remote.htmlUrl };
}

function emptyMergeReport(): MergeReport {
  return { added: [], updated: [], removed: [], unchanged: 0 };
}

export function summarizeGistSync(report: GistSyncReport): string {
  if (report.created) return 'Created a private gist and uploaded your tasks.';
  const local = isEmptyReport(report)
    ? 'nothing new for this device'
    : [
        report.added.length > 0 ? `${report.added.length} added` : '',
        report.updated.length > 0 ? `${report.updated.length} updated` : '',
        report.removed.length > 0 ? `${report.removed.length} removed` : '',
      ]
        .filter(Boolean)
        .join(', ');
  return `Synced — ${local}${report.pushed ? '; pushed this device’s changes' : ''}.`;
}

/** Overwrite the gist with this device's state (no merge). */
export function pushToGist(): Promise<void> {
  return withTabLock(GIST_LOCK, pushRound);
}

async function pushRound(): Promise<void> {
  const { gistToken, gistId } = useSettingsStore.getState();
  const token = gistToken.trim();
  if (!token) throw new Error('Add a GitHub token with the "gist" scope first.');
  const local = exportBundle();
  const remote = gistId
    ? await writeSyncGist(token, gistId, toFile(local))
    : await createSyncGist(token, toFile(local));
  useSettingsStore.getState().setGistLink({ id: remote.id, url: remote.htmlUrl });
  useSettingsStore.getState().setGistLastSyncAt(Date.now());
}
