import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import clsx from 'clsx';
import { Icon } from '@/components/Icon';
import type { Task } from '@/domain/types';
import { TASK_KIND_LABELS } from '@/domain/types';
import { useUiStore } from '@/store/uiStore';

interface TaskCardContentProps {
  task: Task;
  blocked: boolean;
  overlay?: boolean;
}

/** Presentational card, shared by the sortable card and the drag overlay. */
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
}

export function TaskCard({ task, blocked, dragDisabled }: TaskCardProps) {
  const openEditor = useUiStore((s) => s.openEditor);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: dragDisabled,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={clsx(isDragging && 'task-card--dragging')}
      {...attributes}
      {...listeners}
      onClick={() => openEditor(task.id)}
    >
      <TaskCardContent task={task} blocked={blocked} />
    </div>
  );
}
