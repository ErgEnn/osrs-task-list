import { createSyncGist, readSyncGist, writeSyncGist } from '@/api/gist';
import { useSettingsStore } from '@/store/settingsStore';
import { mergeIntoStore } from './apply';
import { exportBundle } from './apply';
import { parseBundleJson, type SyncBundle } from './bundle';
import { isEmptyReport, type MergeReport } from './merge';

export interface GistSyncReport extends MergeReport {
  /** True when the merged bundle was written back to the gist. */
  pushed: boolean;
  /** True when this sync created the gist. */
  created: boolean;
  gistUrl: string;
}

/** Stable serialization, so "did anything change?" is a string compare. */
function serialize(bundle: SyncBundle): string {
  const ids = Object.keys(bundle.tasks).sort();
  const tasks = ids.map((id) => bundle.tasks[id]);
  const deleted = Object.keys(bundle.deleted)
    .sort()
    .map((id) => [id, bundle.deleted[id]] as const);
  return JSON.stringify({ v: bundle.v, tasks, columns: bundle.columns, deleted });
}

function toFile(bundle: SyncBundle): string {
  return JSON.stringify(bundle, null, 2);
}

/**
 * One sync round with the gist: pull, merge into the local store, and push the
 * result back when it differs from what the gist holds. Both halves use the
 * same merge as the transfer codes, so a device that has been offline for a
 * week converges in one pass instead of clobbering either side.
 */
export async function syncWithGist(): Promise<GistSyncReport> {
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
  const stale = !incoming || serialize(incoming) !== serialize(merged);
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
export async function pushToGist(): Promise<void> {
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
