import clsx from 'clsx';
import { useSettingsStore } from '@/store/settingsStore';

export function ViewTabs() {
  const view = useSettingsStore((s) => s.view);
  const setView = useSettingsStore((s) => s.setView);
  return (
    <div className="view-tabs" role="tablist" aria-label="View">
      <button
        type="button"
        role="tab"
        aria-selected={view === 'board'}
        className={clsx('osrs-btn', view === 'board' && 'osrs-btn--pressed')}
        onClick={() => setView('board')}
      >
        Board
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={view === 'graph'}
        className={clsx('osrs-btn', view === 'graph' && 'osrs-btn--pressed')}
        onClick={() => setView('graph')}
      >
        Progression
      </button>
    </div>
  );
}
