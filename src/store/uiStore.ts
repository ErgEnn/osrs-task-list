import { create } from 'zustand';
import type { Status } from '@/domain/types';

export type ToastKind = 'info' | 'success' | 'error';

export interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}

interface UiState {
  searchQuery: string;
  /** null = closed, 'new' = create dialog, otherwise the task id being edited. */
  editorTaskId: string | 'new' | null;
  editorPresetStatus: Status;
  settingsOpen: boolean;
  /** WikiSync player-stats sidebar. */
  statsOpen: boolean;
  toasts: Toast[];
  setSearchQuery: (query: string) => void;
  openEditor: (target: string | 'new', presetStatus?: Status) => void;
  closeEditor: () => void;
  setSettingsOpen: (open: boolean) => void;
  setStatsOpen: (open: boolean) => void;
  toggleStats: () => void;
  pushToast: (kind: ToastKind, text: string) => void;
  dismissToast: (id: number) => void;
}

let toastSeq = 0;

export const useUiStore = create<UiState>()((set) => ({
  searchQuery: '',
  editorTaskId: null,
  editorPresetStatus: 'todo',
  settingsOpen: false,
  statsOpen: false,
  toasts: [],
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  openEditor: (target, presetStatus = 'todo') =>
    set({ editorTaskId: target, editorPresetStatus: presetStatus }),
  closeEditor: () => set({ editorTaskId: null }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setStatsOpen: (statsOpen) => set({ statsOpen }),
  toggleStats: () => set((state) => ({ statsOpen: !state.statsOpen })),
  pushToast: (kind, text) =>
    set((state) => ({ toasts: [...state.toasts, { id: ++toastSeq, kind, text }] })),
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));
