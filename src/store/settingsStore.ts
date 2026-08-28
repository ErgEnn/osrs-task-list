import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type AutoSyncMinutes = 0 | 5 | 15 | 60;
export type ViewMode = 'board' | 'graph';

interface SettingsState {
  username: string;
  autoSyncMinutes: AutoSyncMinutes;
  lastSyncAt: number | null;
  view: ViewMode;
  /** GitHub PAT with the `gist` scope; stays in this browser's localStorage. */
  gistToken: string;
  /** Id of the private gist holding the shared bundle (created on first sync). */
  gistId: string;
  gistUrl: string;
  gistSyncMinutes: AutoSyncMinutes;
  gistLastSyncAt: number | null;
  /** When this device last produced a transfer code, for "only what's new". */
  lastTransferAt: number | null;
  setUsername: (username: string) => void;
  setAutoSyncMinutes: (minutes: AutoSyncMinutes) => void;
  setLastSyncAt: (at: number | null) => void;
  setView: (view: ViewMode) => void;
  setGistToken: (token: string) => void;
  setGistLink: (link: { id: string; url: string }) => void;
  clearGistLink: () => void;
  setGistSyncMinutes: (minutes: AutoSyncMinutes) => void;
  setGistLastSyncAt: (at: number | null) => void;
  setLastTransferAt: (at: number | null) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      username: '',
      autoSyncMinutes: 0,
      lastSyncAt: null,
      view: 'board',
      gistToken: '',
      gistId: '',
      gistUrl: '',
      gistSyncMinutes: 0,
      gistLastSyncAt: null,
      lastTransferAt: null,
      setUsername: (username) => set({ username }),
      setAutoSyncMinutes: (autoSyncMinutes) => set({ autoSyncMinutes }),
      setLastSyncAt: (lastSyncAt) => set({ lastSyncAt }),
      setView: (view) => set({ view }),
      setGistToken: (gistToken) => set({ gistToken }),
      setGistLink: ({ id, url }) => set({ gistId: id, gistUrl: url }),
      clearGistLink: () => set({ gistId: '', gistUrl: '', gistLastSyncAt: null }),
      setGistSyncMinutes: (gistSyncMinutes) => set({ gistSyncMinutes }),
      setGistLastSyncAt: (gistLastSyncAt) => set({ gistLastSyncAt }),
      setLastTransferAt: (lastTransferAt) => set({ lastTransferAt }),
    }),
    {
      name: 'osrs-tl:settings',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({
        username,
        autoSyncMinutes,
        lastSyncAt,
        view,
        gistToken,
        gistId,
        gistUrl,
        gistSyncMinutes,
        gistLastSyncAt,
        lastTransferAt,
      }) => ({
        username,
        autoSyncMinutes,
        lastSyncAt,
        view,
        gistToken,
        gistId,
        gistUrl,
        gistSyncMinutes,
        gistLastSyncAt,
        lastTransferAt,
      }),
    },
  ),
);
