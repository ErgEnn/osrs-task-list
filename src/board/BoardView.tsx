import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { computeAutoLevelEdges } from '@/domain/deps';
import { matchesSearch } from '@/domain/search';
import type { Status, Task } from '@/domain/types';
import { STATUSES } from '@/domain/types';
import { useTaskStore } from '@/store/taskStore';
import { useUiStore } from '@/store/uiStore';
import { BoardColumn } from './BoardColumn';
import { TaskCardContent } from './TaskCard';
import './board.css';

/** Prefer what the pointer is actually inside; fall back for keyboard drags. */
const collisionDetection: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  return within.length ? within : closestCorners(args);
};

function isStatus(id: unknown): id is Status {
  return typeof id === 'string' && (STATUSES as readonly string[]).includes(id);
}

export function BoardView() {
  const tasks = useTaskStore((s) => s.tasks);
  const columns = useTaskStore((s) => s.columns);
  const moveTask = useTaskStore((s) => s.moveTask);
  const searchQuery = useUiStore((s) => s.searchQuery);
  const [activeId, setActiveId] = useState<string | null>(null);

  const dragDisabled = searchQuery.trim().length > 0;

  const blockedIds = useMemo(() => {
    // One auto-edge pass for the whole board instead of per-card scans.
    const auto = computeAutoLevelEdges(tasks);
    const blocked = new Set<string>();
    for (const task of Object.values(tasks)) {
      const deps = new Set(task.explicitDeps.filter((d) => tasks[d]));
      const autoDep = auto.get(task.id);
      if (autoDep) deps.add(autoDep);
      for (const dep of deps) {
        if (tasks[dep]?.status !== 'done') {
          blocked.add(task.id);
          break;
        }
      }
    }
    return blocked;
  }, [tasks]);

  const byColumn = useMemo(() => {
    const result = {} as Record<Status, { visible: Task[]; hidden: number }>;
    for (const status of STATUSES) {
      const all = columns[status].map((id) => tasks[id]).filter(Boolean);
      const visible = all.filter((task) => matchesSearch(task, searchQuery));
      result[status] = { visible, hidden: all.length - visible.length };
    }
    return result;
  }, [columns, tasks, searchQuery]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function statusOf(id: string): Status | null {
    if (isStatus(id)) return id;
    return tasks[id]?.status ?? null;
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeStatus = statusOf(String(active.id));
    const overStatus = statusOf(String(over.id));
    if (!activeStatus || !overStatus || activeStatus === overStatus) return;
    // Live preview while crossing columns: drop in at the hovered card's slot.
    const overIndex = isStatus(over.id)
      ? columns[overStatus].length
      : columns[overStatus].indexOf(String(over.id));
    moveTask(String(active.id), overStatus, overIndex < 0 ? columns[overStatus].length : overIndex);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over || active.id === over.id) return;
    const activeStatus = statusOf(String(active.id));
    const overStatus = statusOf(String(over.id));
    if (!activeStatus || !overStatus || activeStatus !== overStatus) return;
    if (isStatus(over.id)) return;
    const from = columns[activeStatus].indexOf(String(active.id));
    const to = columns[activeStatus].indexOf(String(over.id));
    if (from === -1 || to === -1 || from === to) return;
    moveTask(String(active.id), activeStatus, to);
  }

  const activeTask = activeId ? tasks[activeId] : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={(event) => setActiveId(String(event.active.id))}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="board">
        {STATUSES.map((status) => (
          <BoardColumn
            key={status}
            status={status}
            tasks={byColumn[status].visible}
            blockedIds={blockedIds}
            dragDisabled={dragDisabled}
            hiddenCount={byColumn[status].hidden}
          />
        ))}
      </div>
      <DragOverlay>
        {activeTask ? (
          <TaskCardContent
            task={activeTask}
            blocked={blockedIds.has(activeTask.id)}
            overlay
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
