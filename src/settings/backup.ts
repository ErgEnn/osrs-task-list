import { exportBundle, mergeIntoStore, replaceStore } from '@/sync/apply';
import { parseBundleJson } from '@/sync/bundle';
import type { MergeReport } from '@/sync/merge';

export function downloadBackup(): void {
  const bundle = exportBundle();
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `osrs-task-list-${bundle.exportedAt.slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Replace all tasks with the file's content (invalid entries are dropped). */
export function restoreFromJson(json: string): { imported: number; skipped: number } {
  const { bundle, skipped } = parseBundleJson(json);
  replaceStore(bundle);
  return { imported: Object.keys(bundle.tasks).length, skipped };
}

/** Fold the file's tasks into what this device already has. */
export function mergeFromJson(json: string): { report: MergeReport; skipped: number } {
  const { bundle, skipped } = parseBundleJson(json);
  return { report: mergeIntoStore(bundle), skipped };
}
