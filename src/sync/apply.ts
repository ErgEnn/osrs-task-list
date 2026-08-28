import { useTaskStore } from '@/store/taskStore';
import { exportBundle, type SyncBundle } from './bundle';
import { mergeBundles, type MergeReport } from './merge';

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
