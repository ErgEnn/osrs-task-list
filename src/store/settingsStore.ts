import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type AutoSyncMinutes = 0 | 5 | 15 | 60;
export type ViewMode = 'board' | 'graph';

interface SettingsState {
  username: string;
  autoSyncMinutes: AutoSyncMinutes;
  lastSyncAt: number | null;
  view: ViewMode;
  setUsername: (username: string) => void;
  setAutoSyncMinutes: (minutes: AutoSyncMinutes) => void;
  setLastSyncAt: (at: number | null) => void;
  setView: (view: ViewMode) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      username: '',
      autoSyncMinutes: 0,
      lastSyncAt: null,
      view: 'board',
      setUsername: (username) => set({ username }),
      setAutoSyncMinutes: (autoSyncMinutes) => set({ autoSyncMinutes }),
      setLastSyncAt: (lastSyncAt) => set({ lastSyncAt }),
      setView: (view) => set({ view }),
    }),
    {
      name: 'osrs-tl:settings',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ username, autoSyncMinutes, lastSyncAt, view }) => ({
        username,
        autoSyncMinutes,
        lastSyncAt,
        view,
      }),
    },
  ),
);
