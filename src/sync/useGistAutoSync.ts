import { useEffect } from 'react';
import { useSettingsStore } from '@/store/settingsStore';
import { startGistAutoSync } from './gistAutoSync';

/**
 * Mount the gist sync loop while cloud sync is configured and switched on.
 * The loop itself lives in {@link startGistAutoSync}, free of React.
 */
export function useGistAutoSync() {
  const minutes = useSettingsStore((s) => s.gistSyncMinutes);
  const token = useSettingsStore((s) => s.gistToken);
  const gistId = useSettingsStore((s) => s.gistId);

  useEffect(() => {
    if (!minutes || !token.trim() || !gistId) return;
    return startGistAutoSync(minutes);
  }, [minutes, token, gistId]);
}
