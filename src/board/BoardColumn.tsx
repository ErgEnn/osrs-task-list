import { Fragment } from 'react';
import { useDroppable } from '@dnd-kit/core';
import clsx from 'clsx';
import type { Status, Task } from '@/domain/types';
import { STATUS_LABELS } from '@/domain/types';
import { useUiStore } from '@/store/uiStore';
import { TaskCard } from './TaskCard';
import { columnDropId, gapDropId, type LinkOptions } from './dropTargets';

interface BoardColumnProps {
  status: Status;
  tasks: Task[];
  blockedIds: ReadonlySet<string>;
  dragDisabled: boolean;
  /** A card is in the air somewhere on the board — arm the reorder gaps. */
  dragging: boolean;
  /** Non-null while a pointer drag is live — arm the card halves too. */
  linkOptions: LinkOptions | null;
  hiddenCount: number;
}

export function BoardColumn({
  status,
  tasks,
  blockedIds,
  dragDisabled,
  dragging,
  linkOptions,
  hiddenCount,
}: BoardColumnProps) {
  const openEditor = useUiStore((s) => s.openEditor);
  const { setNodeRef } = useDroppable({ id: columnDropId(status), disabled: dragDisabled });
  const armed = dragging && !dragDisabled;

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
      <div ref={setNodeRef} className="board-column__list">
        {tasks.map((task) => (
          <Fragment key={task.id}>
            <DropGap status={status} beforeId={task.id} armed={armed} />
            <TaskCard
              task={task}
              blocked={blockedIds.has(task.id)}
              dragDisabled={dragDisabled}
              linkOptions={linkOptions}
            />
          </Fragment>
        ))}
        <DropGap status={status} beforeId={null} armed={armed} />
        {tasks.length === 0 && (
          <div className="board-column__empty">
            {hiddenCount > 0 ? `${hiddenCount} hidden by search` : 'Nothing here yet'}
          </div>
        )}
      </div>
    </section>
  );
}

interface DropGapProps {
  status: Status;
  /** The card this gap sits above, or null for the gap under the last one. */
  beforeId: string | null;
  armed: boolean;
}

/**
 * The space between two cards. It keeps the column's spacing at rest; during a
 * drag it also carries a droppable that reaches over the neighbouring card
 * edges, so "drop between these two" stays easy to hit without stealing room
 * from the link zones in the middle of the cards.
 */
function DropGap({ status, beforeId, armed }: DropGapProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: gapDropId(status, beforeId),
    disabled: !armed,
  });

  return (
    <div className="board-gap">
      {armed && (
        <div
          ref={setNodeRef}
          className={clsx('board-gap__zone', isOver && 'board-gap__zone--over')}
        />
      )}
    </div>
  );
}
