import { create } from 'zustand';
import { getPlayerState, type WikiSyncPlayer } from '@/api/wikiSync';
import { useSettingsStore } from '@/store/settingsStore';

interface StatsState {
  /** Last successful profile, kept so reopening the sidebar is instant. */
  player: WikiSyncPlayer | null;
  /** Username the held profile belongs to, so a rename refetches. */
  loadedFor: string;
  loading: boolean;
  error: string | null;
  fetchedAt: number | null;
  /** Fetch the settings username's profile; cached unless `force`. */
  load: (force?: boolean) => Promise<void>;
}

export const useStatsStore = create<StatsState>()((set, get) => ({
  player: null,
  loadedFor: '',
  loading: false,
  error: null,
  fetchedAt: null,
  load: async (force = false) => {
    const username = useSettingsStore.getState().username.trim();
    if (!username) {
      set({
        player: null,
        loadedFor: '',
        error: 'Set your RuneScape username in the settings first.',
      });
      return;
    }
    const state = get();
    if (state.loading) return;
    if (!force && state.player && state.loadedFor === username) return;

    set({ loading: true, error: null });
    try {
      const player = await getPlayerState(username);
      set({ player, loadedFor: username, fetchedAt: Date.now(), loading: false });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : 'Could not load WikiSync stats.',
      });
    }
  },
}));
