import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import clsx from 'clsx';
import type { Status, Task } from '@/domain/types';
import { STATUS_LABELS } from '@/domain/types';
import { useUiStore } from '@/store/uiStore';
import { TaskCard } from './TaskCard';

interface BoardColumnProps {
  status: Status;
  tasks: Task[];
  blockedIds: ReadonlySet<string>;
  dragDisabled: boolean;
  hiddenCount: number;
}

export function BoardColumn({
  status,
  tasks,
  blockedIds,
  dragDisabled,
  hiddenCount,
}: BoardColumnProps) {
  const openEditor = useUiStore((s) => s.openEditor);
  const { setNodeRef } = useDroppable({ id: status });

  return (
    <section className="board__column osrs-panel">
      <h2 className="osrs-panel__title board-column__header">
        <span className={clsx('board-column__name', `board-column__name--${status}`)}>
          {STATUS_LABELS[status]}
          <span className="board-column__count">({tasks.length})</span>
        </span>
        <button
          type="button"
          className="osrs-btn board-column__add"
          title={`New task in ${STATUS_LABELS[status]}`}
          onClick={() => openEditor('new', status)}
        >
          +
        </button>
      </h2>
      <SortableContext
        items={tasks.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
        disabled={dragDisabled}
      >
        <div ref={setNodeRef} className="board-column__list">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              blocked={blockedIds.has(task.id)}
              dragDisabled={dragDisabled}
            />
          ))}
          {tasks.length === 0 && (
            <div className="board-column__empty">
              {hiddenCount > 0 ? `${hiddenCount} hidden by search` : 'Nothing here yet'}
            </div>
          )}
        </div>
      </SortableContext>
    </section>
  );
}
