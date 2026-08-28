import { useEffect } from 'react';
import { useSettingsStore } from '@/store/settingsStore';
import { useUiStore } from '@/store/uiStore';
import { isEmptyReport } from './merge';
import { syncWithGist } from './gistSync';

/**
 * Interval gist sync while the tab is visible, plus one sync on load — the
 * common case is opening the app on the playing device after adding tasks
 * elsewhere, and that should not need a button press.
 */
export function useGistAutoSync() {
  const minutes = useSettingsStore((s) => s.gistSyncMinutes);
  const token = useSettingsStore((s) => s.gistToken);
  const gistId = useSettingsStore((s) => s.gistId);

  useEffect(() => {
    if (!minutes || !token.trim() || !gistId) return;

    let running = false;
    const tick = () => {
      if (document.visibilityState !== 'visible' || running) return;
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
        });
    };

    tick();
    const handle = setInterval(tick, minutes * 60_000);
    return () => clearInterval(handle);
  }, [minutes, token, gistId]);
}
