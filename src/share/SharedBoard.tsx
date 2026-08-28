import { useCallback, useMemo, useState } from 'react';
import clsx from 'clsx';
import { TaskCardContent } from '@/board/TaskCard';
import { buildEffectiveEdges, computeBlockedIds } from '@/domain/deps';
import { computeDepHighlight, highlightRoleOf, type HighlightRole } from '@/domain/highlight';
import { matchesSearch } from '@/domain/search';
import type { Status, Task, TaskMap } from '@/domain/types';
import { STATUS_LABELS, STATUSES } from '@/domain/types';
import { useUiStore } from '@/store/uiStore';
import '@/board/board.css';

interface SharedBoardProps {
  tasks: TaskMap;
  columns: Record<Status, string[]>;
}

/**
 * The board as a viewer of a share link sees it: same columns, cards and
 * padlocks, but nothing to drag, add or edit. It renders straight from the
 * shared bundle and never goes near the task store, so opening someone's
 * link cannot disturb your own list.
 */
export function SharedBoard({ tasks, columns }: SharedBoardProps) {
  const searchQuery = useUiStore((s) => s.searchQuery);
  const blockedIds = useMemo(() => computeBlockedIds(tasks), [tasks]);
  const depEdges = useMemo(() => buildEffectiveEdges(tasks), [tasks]);

  const [hoverId, setHoverId] = useState<string | null>(null);
  const highlight = useMemo(
    () => computeDepHighlight(depEdges, hoverId !== null && tasks[hoverId] ? hoverId : null),
    [depEdges, tasks, hoverId],
  );
  const onHover = useCallback((id: string | null) => setHoverId(id), []);

  const byColumn = useMemo(() => {
    const result = {} as Record<Status, { visible: Task[]; hidden: number }>;
    for (const status of STATUSES) {
      const all = (columns[status] ?? []).map((id) => tasks[id]).filter(Boolean);
      const visible = all.filter((task) => matchesSearch(task, searchQuery));
      result[status] = { visible, hidden: all.length - visible.length };
    }
    return result;
  }, [columns, tasks, searchQuery]);

  return (
    <div className="board share-board" onMouseLeave={() => setHoverId(null)}>
      {STATUSES.map((status) => (
        <section key={status} className="board__column osrs-panel">
          <h2 className="osrs-panel__title board-column__header">
            <span className={clsx('board-column__name', `board-column__name--${status}`)}>
              {STATUS_LABELS[status]}
              <span className="board-column__count">({byColumn[status].visible.length})</span>
            </span>
          </h2>
          <div className="board-column__list">
            {byColumn[status].visible.map((task) => (
              <SharedCard
                key={task.id}
                task={task}
                blocked={blockedIds.has(task.id)}
                highlight={highlightRoleOf(highlight, task.id)}
                onHover={onHover}
              />
            ))}
            {byColumn[status].visible.length === 0 && (
              <div className="board-column__empty">
                {byColumn[status].hidden > 0
                  ? `${byColumn[status].hidden} hidden by search`
                  : 'Nothing here'}
              </div>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

interface SharedCardProps {
  task: Task;
  blocked: boolean;
  /** This card's part in the hovered prerequisite chain; null at rest. */
  highlight: HighlightRole | null;
  onHover: (id: string | null) => void;
}

function SharedCard({ task, blocked, highlight, onHover }: SharedCardProps) {
  return (
    <div
      className={clsx('board-card', highlight && `board-card--${highlight}`)}
      onMouseEnter={() => onHover(task.id)}
      onMouseLeave={() => onHover(null)}
    >
      <TaskCardContent task={task} blocked={blocked} />
    </div>
  );
}
