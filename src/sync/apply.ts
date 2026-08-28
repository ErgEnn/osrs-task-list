import { useTaskStore } from '@/store/taskStore';
import { BUNDLE_VERSION, type SyncBundle } from './bundle';
import { mergeBundles, type MergeReport } from './merge';

/**
 * Snapshot the whole store as a bundle. It lives here rather than in
 * `bundle.ts` so that parsing a bundle — all a read-only share view needs —
 * does not drag the persisted task store along with it.
 */
export function exportBundle(): SyncBundle {
  const { tasks, columns, deleted } = useTaskStore.getState();
  return {
    v: BUNDLE_VERSION,
    exportedAt: new Date().toISOString(),
    tasks,
    columns,
    deleted: deleted ?? {},
  };
}

/** Merge a bundle into the live store, keeping local work. */
export function mergeIntoStore(incoming: SyncBundle): MergeReport {
  const { bundle, report } = mergeBundles(exportBundle(), incoming);
  useTaskStore.getState().replaceAll(bundle);
  return report;
}

/** Throw away local state and adopt the bundle wholesale (backup restore). */
export function replaceStore(bundle: SyncBundle): void {
  useTaskStore.getState().replaceAll(bundle);
}
