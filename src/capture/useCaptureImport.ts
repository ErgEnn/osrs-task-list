import { useEffect } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useUiStore } from '@/store/uiStore';
import { captureFromHash } from './capture';

/**
 * Import tasks arriving as `#/capture?d=…` deep links from the wiki userscript.
 *
 * Runs on load and on every later hash change, because the userscript reuses one
 * app tab: capturing a second page only changes the fragment. The fragment is
 * consumed before the task is created, so a StrictMode double-run or a reload
 * cannot import the same capture twice.
 */
export function useCaptureImport() {
  useEffect(() => {
    const handle = () => {
      const parsed = captureFromHash(window.location.hash);
      if (!parsed) return;
      history.replaceState(null, '', window.location.pathname + window.location.search);
      const { pushToast } = useUiStore.getState();
      if (!parsed.ok) {
        pushToast('error', `Wiki capture failed: ${parsed.error}.`);
        return;
      }
      const id = useTaskStore.getState().createTask(parsed.draft);
      const title = useTaskStore.getState().tasks[id]?.title ?? 'task';
      pushToast('success', `Added "${title}" from the wiki.`);
    };

    handle();
    window.addEventListener('hashchange', handle);
    return () => window.removeEventListener('hashchange', handle);
  }, []);
}
