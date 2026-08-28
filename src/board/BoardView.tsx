import { useCallback, useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  closestCorners,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { buildEffectiveEdges, computeAutoLevelEdges } from '@/domain/deps';
import { computeDepHighlight } from '@/domain/highlight';
import { matchesSearch } from '@/domain/search';
import type { Status, Task } from '@/domain/types';
import { STATUSES } from '@/domain/types';
import { useTaskStore } from '@/store/taskStore';
import { useUiStore } from '@/store/uiStore';
import { BoardColumn } from './BoardColumn';
import { TaskCardContent } from './TaskCard';
import {
  computeLinkOptions,
  decodeDropId,
  insertIndexFor,
  linkPairFor,
  type DepRole,
  type LinkOptions,
} from './dropTargets';
import './board.css';

/**
 * Prefer what the pointer is actually inside, and within that the gap or card
 * half over the column behind them — the column is only the fallback for the
 * empty space around the cards. Keyboard drags have no pointer, so they fall
 * back to the nearest target.
 */
const collisionDetection: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  const hits = within.length ? within : closestCorners(args);
  const precise = hits.filter((hit) => decodeDropId(String(hit.id))?.kind !== 'column');
  return precise.length ? precise : hits;
};

interface DragState {
  id: string;
  /**
   * Card halves are a pointer gesture: a keyboard drag steps through drop
   * targets one arrow press at a time, so it only ever reorders. Linking by
   * keyboard stays the editor's dependency picker.
   */
  withPointer: boolean;
}

export function BoardView() {
  const tasks = useTaskStore((s) => s.tasks);
  const columns = useTaskStore((s) => s.columns);
  const moveTask = useTaskStore((s) => s.moveTask);
  const addDep = useTaskStore((s) => s.addDep);
  const pushToast = useUiStore((s) => s.pushToast);
  const searchQuery = useUiStore((s) => s.searchQuery);
  const [drag, setDrag] = useState<DragState | null>(null);

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

  // Pointing at a card picks out its prerequisite chain across all columns.
  // A card in the air owns the board instead, so hovering steps aside for it.
  const [hoverId, setHoverId] = useState<string | null>(null);
  const depEdges = useMemo(() => buildEffectiveEdges(tasks), [tasks]);
  const hoverTarget = drag === null && hoverId !== null && tasks[hoverId] ? hoverId : null;
  const highlight = useMemo(
    () => computeDepHighlight(depEdges, hoverTarget),
    [depEdges, hoverTarget],
  );
  const onHover = useCallback((id: string | null) => setHoverId(id), []);

  /** Null unless a pointer drag is live: doubles as "show the link zones". */
  const linkOptions: LinkOptions | null = useMemo(
    () => (drag?.withPointer ? computeLinkOptions(tasks, drag.id) : null),
    [drag, tasks],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  function handleDragStart(event: DragStartEvent) {
    setDrag({
      id: String(event.active.id),
      withPointer: !(event.activatorEvent instanceof KeyboardEvent),
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const activeId = String(event.active.id);
    setDrag(null);
    const target = event.over ? decodeDropId(String(event.over.id)) : null;
    if (!target || !tasks[activeId]) return;
    if (target.kind === 'dep') {
      linkDep(activeId, target);
      return;
    }
    const index =
      target.kind === 'gap'
        ? insertIndexFor(columns[target.status], activeId, target.beforeId)
        : columns[target.status].length;
    moveTask(activeId, target.status, index);
  }

  function linkDep(activeId: string, target: { role: DepRole; taskId: string }) {
    const { dependentId, depId } = linkPairFor(activeId, target);
    const dependent = tasks[dependentId]?.title ?? '';
    const dep = tasks[depId]?.title ?? '';
    const status =
      target.role === 'dependency'
        ? linkOptions?.asDependency.get(target.taskId)
        : linkOptions?.asDependent.get(target.taskId);
    if (status === 'linked') {
      pushToast('info', `“${dependent}” already depends on “${dep}”.`);
      return;
    }
    if (status === 'cycle' || !addDep(dependentId, depId)) {
      pushToast('error', `“${dependent}” cannot depend on “${dep}” — that would create a cycle.`);
      return;
    }
    pushToast('success', `“${dependent}” now depends on “${dep}”.`);
  }

  const activeTask = drag ? tasks[drag.id] : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      // Gaps and card halves only become droppable once a drag starts, so the
      // rects have to be taken after they mount.
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDrag(null)}
    >
      <div className="board" onMouseLeave={() => setHoverId(null)}>
        {STATUSES.map((status) => (
          <BoardColumn
            key={status}
            status={status}
            tasks={byColumn[status].visible}
            blockedIds={blockedIds}
            dragDisabled={dragDisabled}
            dragging={drag !== null}
            linkOptions={linkOptions}
            highlight={highlight}
            onHover={onHover}
            hiddenCount={byColumn[status].hidden}
          />
        ))}
      </div>
      <DragOverlay>
        {activeTask ? (
          <TaskCardContent task={activeTask} blocked={blockedIds.has(activeTask.id)} overlay />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
