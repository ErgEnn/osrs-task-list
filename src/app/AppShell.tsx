import type { ReactNode } from 'react';
import clsx from 'clsx';
import { StatsPanel } from '@/stats/StatsPanel';
import { useAutoSync } from '@/sync/useAutoSync';
import { useGistAutoSync } from '@/sync/useGistAutoSync';
import { useSettingsStore } from '@/store/settingsStore';
import { useUiStore } from '@/store/uiStore';
import { SearchBox } from './SearchBox';
import { Toasts } from './Toasts';
import { ViewTabs } from './ViewTabs';
import './app.css';

export function AppShell({ children }: { children: ReactNode }) {
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);
  const statsOpen = useUiStore((s) => s.statsOpen);
  const toggleStats = useUiStore((s) => s.toggleStats);
  const view = useSettingsStore((s) => s.view);
  const setView = useSettingsStore((s) => s.setView);
  useAutoSync();
  useGistAutoSync();
  return (
    <div className="app">
      <header className="app__header osrs-panel">
        <h1 className="app__title">Old School Task List</h1>
        <ViewTabs view={view} onChange={setView} />
        <div className="app__spacer" />
        <SearchBox />
        <button
          type="button"
          className={clsx('osrs-btn', statsOpen && 'osrs-btn--pressed')}
          title="Player stats from WikiSync"
          aria-label="Player stats"
          aria-pressed={statsOpen}
          onClick={toggleStats}
        >
          Stats
        </button>
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
      <main className="app__main">
        {children}
        <StatsPanel />
      </main>
      <Toasts />
    </div>
  );
}
