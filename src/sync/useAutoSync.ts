import { useEffect } from 'react';
import { useSettingsStore } from '@/store/settingsStore';
import { useUiStore } from '@/store/uiStore';
import { refreshFromWikiSync } from './wikiSyncService';

/** Interval-based WikiSync refresh, active only while the tab is visible. */
export function useAutoSync() {
  const minutes = useSettingsStore((s) => s.autoSyncMinutes);
  const username = useSettingsStore((s) => s.username);

  useEffect(() => {
    if (!minutes || !username.trim()) return;
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      refreshFromWikiSync()
        .then((report) => {
          if (report.completedTitles.length > 0) {
            useUiStore
              .getState()
              .pushToast(
                'success',
                `WikiSync: completed ${report.completedTitles.length} task(s) — ${summarize(report.completedTitles)}`,
              );
          }
        })
        .catch(() => {
          // Background refresh stays quiet; the manual button surfaces errors.
        });
    };
    const handle = setInterval(tick, minutes * 60_000);
    return () => clearInterval(handle);
  }, [minutes, username]);
}

function summarize(titles: string[]): string {
  const head = titles.slice(0, 3).join(', ');
  return titles.length > 3 ? `${head}…` : head;
}
