import { useEffect } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useUiStore } from '@/store/uiStore';
import { captureFromHash } from './capture';

/**
 * Import a task from a `#/capture?d=…` deep link (created by the wiki
 * userscript) once on startup. The hash is consumed before the task is
 * created, so a StrictMode double-run or a reload cannot import twice.
 */
export function useCaptureImport() {
  useEffect(() => {
    const parsed = captureFromHash(window.location.hash);
    if (!parsed) return;
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    const { pushToast } = useUiStore.getState();
    if (!parsed.ok) {
      pushToast('error', `Wiki capture failed: ${parsed.error}.`);
      return;
    }
    const store = useTaskStore.getState();
    const id = store.createTask(parsed.draft);
    const title = useTaskStore.getState().tasks[id]?.title ?? 'task';
    pushToast('success', `Added "${title}" from the wiki.`);
  }, []);
}
