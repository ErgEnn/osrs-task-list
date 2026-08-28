import { useEffect, useState } from 'react';
import { describeSharedGistError, readSharedGist } from '@/api/gist';
import { SearchBox } from '@/app/SearchBox';
import { ViewTabs } from '@/app/ViewTabs';
import { reconcileBundle, type TaskBundle } from '@/domain/board';
import { GraphCanvas } from '@/graph/GraphCanvas';
import type { ViewMode } from '@/store/settingsStore';
import { parseBundleJson } from '@/sync/bundle';
import { SharedBoard } from './SharedBoard';
import { ownListLink } from './shareLink';
import '@/app/app.css';
import './share.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; bundle: TaskBundle; updatedAt: string };

function ago(iso: string): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return 'unknown';
  const minutes = Math.round((Date.now() - at) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute(s) ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} hour(s) ago` : new Date(at).toLocaleDateString();
}

/**
 * The whole app when a `?share=<gistId>` link is opened: the linked gist's
 * bundle, rendered read-only. It reaches no persisted store at all — not the
 * tasks it would only rewrite, not the settings, which is why the view tabs
 * live in local state here — so looking at somebody's list cannot touch, or
 * race with another tab over, your own. A share link is a look, not a merge.
 */
export function SharedApp({ gistId }: { gistId: string }) {
  const [view, setView] = useState<ViewMode>('graph');
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    readSharedGist(gistId)
      .then((remote) => {
        if (cancelled) return;
        if (!remote.content) {
          setState({ status: 'error', message: 'That gist holds no task list.' });
          return;
        }
        // Same repair pass the store runs on import: a gist can be hand-edited,
        // and column drift or a dependency cycle in it must not reach the views.
        const { tasks, columns } = parseBundleJson(remote.content).bundle;
        setState({
          status: 'ready',
          bundle: reconcileBundle(tasks, columns),
          updatedAt: remote.updatedAt,
        });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ status: 'error', message: describeSharedGistError(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [gistId]);

  return (
    <div className="app">
      <header className="app__header osrs-panel">
        <h1 className="app__title">Old School Task List</h1>
        <span className="share-badge" title={`Shared gist ${gistId}`}>
          Shared · read-only
          {state.status === 'ready' && ` · updated ${ago(state.updatedAt)}`}
        </span>
        {state.status === 'ready' && <ViewTabs view={view} onChange={setView} />}
        <div className="app__spacer" />
        {state.status === 'ready' && <SearchBox />}
        <a className="osrs-btn" href={ownListLink()}>
          Open my list
        </a>
      </header>
      <main className="app__main">
        {state.status === 'loading' && (
          <div className="view-placeholder">Loading the shared list…</div>
        )}
        {state.status === 'error' && <div className="view-placeholder">{state.message}</div>}
        {state.status === 'ready' &&
          (view === 'board' ? (
            <SharedBoard tasks={state.bundle.tasks} columns={state.bundle.columns} />
          ) : (
            <GraphCanvas tasks={state.bundle.tasks} />
          ))}
      </main>
    </div>
  );
}
