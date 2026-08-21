import type { ReactNode } from 'react';
import { SearchBox } from './SearchBox';
import { Toasts } from './Toasts';
import { ViewTabs } from './ViewTabs';
import './app.css';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app">
      <header className="app__header osrs-panel">
        <h1 className="app__title">Old School Task List</h1>
        <ViewTabs />
        <div className="app__spacer" />
        <SearchBox />
      </header>
      <main className="app__main">{children}</main>
      <Toasts />
    </div>
  );
}
