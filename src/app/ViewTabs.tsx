import clsx from 'clsx';
import type { ViewMode } from '@/store/settingsStore';

interface ViewTabsProps {
  view: ViewMode;
  onChange: (view: ViewMode) => void;
}

/**
 * Controlled on purpose: the app keeps the choice in its persisted settings,
 * while a read-only share page holds it in local state — nobody's stored
 * preference should change because they looked at someone else's list.
 */
export function ViewTabs({ view, onChange }: ViewTabsProps) {
  return (
    <div className="view-tabs" role="tablist" aria-label="View">
      <button
        type="button"
        role="tab"
        aria-selected={view === 'graph'}
        className={clsx('osrs-btn', view === 'graph' && 'osrs-btn--pressed')}
        onClick={() => onChange('graph')}
      >
        Progression
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={view === 'board'}
        className={clsx('osrs-btn', view === 'board' && 'osrs-btn--pressed')}
        onClick={() => onChange('board')}
      >
        Board
      </button>
    </div>
  );
}
