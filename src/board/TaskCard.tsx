import { useDraggable, useDroppable } from '@dnd-kit/core';
import clsx from 'clsx';
import { Icon } from '@/components/Icon';
import type { HighlightRole } from '@/domain/highlight';
import type { Task } from '@/domain/types';
import { TASK_KIND_LABELS } from '@/domain/types';
import { useUiStore } from '@/store/uiStore';
import { depDropId, type DepRole, type LinkOptions, type LinkStatus } from './dropTargets';

interface TaskCardContentProps {
  task: Task;
  blocked: boolean;
  overlay?: boolean;
}

/** Presentational card, shared by the draggable card and the drag overlay. */
export function TaskCardContent({ task, blocked, overlay = false }: TaskCardContentProps) {
  return (
    <div
      className={clsx(
        'task-card',
        'osrs-panel--parchment',
        overlay && 'task-card--overlay',
        task.status === 'done' && 'task-card--done',
      )}
    >
      <span className="task-card__icon-well">
        <Icon iconRef={task.iconRef} size={28} fallbackKind={task.payload.kind} />
      </span>
      <span className="task-card__body">
        <span className="task-card__title">{task.title}</span>
        <span className="task-card__meta">
          <span className="task-card__kind">{TASK_KIND_LABELS[task.payload.kind]}</span>
        </span>
      </span>
      {blocked && (
        <span className="task-card__lock" title="Blocked: dependencies are not completed yet">
          🔒
        </span>
      )}
    </div>
  );
}

interface TaskCardProps {
  task: Task;
  blocked: boolean;
  dragDisabled: boolean;
  linkOptions: LinkOptions | null;
  /** This card's part in the hovered prerequisite chain; null when nothing is hovered. */
  highlight: HighlightRole | null;
  onHover: (id: string | null) => void;
}

export function TaskCard({
  task,
  blocked,
  dragDisabled,
  linkOptions,
  highlight,
  onHover,
}: TaskCardProps) {
  const openEditor = useUiStore((s) => s.openEditor);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    disabled: dragDisabled,
  });

  return (
    <div
      ref={setNodeRef}
      className={clsx(
        'board-card',
        highlight && `board-card--${highlight}`,
        isDragging && 'task-card--dragging',
      )}
      {...attributes}
      {...listeners}
      onClick={() => openEditor(task.id)}
      onMouseEnter={() => onHover(task.id)}
      onMouseLeave={() => onHover(null)}
    >
      <TaskCardContent task={task} blocked={blocked} />
      {linkOptions && linkOptions.activeId !== task.id && (
        <DepZones task={task} linkOptions={linkOptions} />
      )}
    </div>
  );
}

/**
 * The two halves a dragged card can be dropped on, laid over the card and
 * inset so the reorder gaps keep its top and bottom edges. Upper half: the
 * dragged card becomes a dependency of this one — the same "prerequisites
 * above" reading as the progression graph. Lower half: the other way round.
 */
function DepZones({ task, linkOptions }: { task: Task; linkOptions: LinkOptions }) {
  const above = useDroppable({ id: depDropId('dependency', task.id) });
  const below = useDroppable({ id: depDropId('dependent', task.id) });
  const hovered = above.isOver || below.isOver;

  return (
    <div className={clsx('board-dep-zones', hovered && 'board-dep-zones--hovered')} aria-hidden>
      <DepZone
        role="dependency"
        title={task.title}
        status={linkOptions.asDependency.get(task.id) ?? 'ok'}
        isOver={above.isOver}
        setNodeRef={above.setNodeRef}
      />
      <DepZone
        role="dependent"
        title={task.title}
        status={linkOptions.asDependent.get(task.id) ?? 'ok'}
        isOver={below.isOver}
        setNodeRef={below.setNodeRef}
      />
    </div>
  );
}

/**
 * Both read with the dragged card as the unwritten subject, and name the card
 * being dropped on — "Unlocks this" left it to the reader to work out which of
 * the two cards was which.
 */
const ZONE_LABELS: Record<DepRole, (title: string) => string> = {
  dependency: (title) => `Unlocks ${title}`,
  dependent: (title) => `Needs ${title} first`,
};

const REFUSAL_LABELS: Record<Exclude<LinkStatus, 'ok'>, string> = {
  linked: 'Already linked',
  cycle: 'Would loop',
};

interface DepZoneProps {
  role: DepRole;
  /** Title of the card being dropped on — the one the label names. */
  title: string;
  status: LinkStatus;
  isOver: boolean;
  setNodeRef: (element: HTMLElement | null) => void;
}

function DepZone({ role, title, status, isOver, setNodeRef }: DepZoneProps) {
  return (
    <div
      ref={setNodeRef}
      className={clsx(
        'board-dep-zone',
        `board-dep-zone--${role}`,
        isOver && 'board-dep-zone--over',
        status !== 'ok' && 'board-dep-zone--refused',
      )}
    >
      <span className="board-dep-zone__label">
        {status === 'ok' ? ZONE_LABELS[role](title) : REFUSAL_LABELS[status]}
      </span>
    </div>
  );
}
