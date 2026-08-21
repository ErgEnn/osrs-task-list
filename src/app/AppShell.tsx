import type { ReactNode } from 'react';
import { useAutoSync } from '@/sync/useAutoSync';
import { useUiStore } from '@/store/uiStore';
import { SearchBox } from './SearchBox';
import { Toasts } from './Toasts';
import { ViewTabs } from './ViewTabs';
import './app.css';

export function AppShell({ children }: { children: ReactNode }) {
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);
  useAutoSync();
  return (
    <div className="app">
      <header className="app__header osrs-panel">
        <h1 className="app__title">Old School Task List</h1>
        <ViewTabs />
        <div className="app__spacer" />
        <SearchBox />
        <button
          type="button"
          className="osrs-btn"
          title="Settings"
          aria-label="Settings"
          onClick={() => setSettingsOpen(true)}
        >
          ⚙
        </button>
      </header>
      <main className="app__main">{children}</main>
      <Toasts />
    </div>
  );
}
