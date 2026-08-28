import { useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { computeBlockedIds } from '@/domain/deps';
import { computeDepHighlight, highlightRoleOf } from '@/domain/highlight';
import { matchesSearch } from '@/domain/search';
import type { TaskMap } from '@/domain/types';
import { useTaskStore } from '@/store/taskStore';
import { useUiStore } from '@/store/uiStore';
import { GraphEdges } from './GraphEdges';
import { GraphNode } from './GraphNode';
import { computeGraphLayout } from './layout';
import { usePanZoom } from './usePanZoom';
import './graph.css';

function noop() {}

interface GraphViewProps {
  /** Tasks to draw. Defaults to the live store; a shared list passes its own. */
  tasks?: TaskMap;
  /** Read-only: tiles do not open the editor (the shared view has none). */
  readOnly?: boolean;
}

export function GraphView({ tasks: sharedTasks, readOnly = false }: GraphViewProps = {}) {
  const storeTasks = useTaskStore((s) => s.tasks);
  const tasks = sharedTasks ?? storeTasks;
  const searchQuery = useUiStore((s) => s.searchQuery);
  const openEditor = useUiStore((s) => s.openEditor);

  const layout = useMemo(() => computeGraphLayout(tasks), [tasks]);

  const blockedIds = useMemo(() => computeBlockedIds(tasks), [tasks]);

  const dimIds = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const dim = new Set<string>();
    for (const task of Object.values(tasks)) {
      if (!matchesSearch(task, searchQuery)) dim.add(task.id);
    }
    return dim;
  }, [tasks, searchQuery]);

  const { containerRef, transform, panning, movedRef, fitToView, zoomIn, zoomOut, handlers } =
    usePanZoom(layout.width, layout.height);

  // Pointing at a tile picks out its prerequisite chain and mutes the rest.
  // A pan captures the pointer, so the tile under it never gets its mouseleave:
  // suppress the highlight for the duration rather than trusting the last event.
  const [hoverId, setHoverId] = useState<string | null>(null);
  const hoverTarget = !panning && hoverId !== null && tasks[hoverId] ? hoverId : null;
  const highlight = useMemo(
    () => computeDepHighlight(layout.edges, hoverTarget),
    [layout.edges, hoverTarget],
  );
  const onHover = useCallback((id: string | null) => setHoverId(id), []);

  const nodeCount = layout.nodes.length;
  // Fit once tasks exist (also handles the very first render after rehydrate).
  useEffect(() => {
    if (nodeCount > 0) fitToView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeCount > 0, fitToView]);

  return (
    <div
      ref={containerRef}
      className={clsx(
        'graph',
        'osrs-panel',
        panning && 'graph--panning',
        readOnly && 'graph--readonly',
      )}
      {...handlers}
      onDoubleClick={fitToView}
      onMouseLeave={() => setHoverId(null)}
    >
      <svg className="graph__svg">
        <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.k})`}>
          <GraphEdges edges={layout.edges} dimIds={dimIds} highlight={highlight} />
          {layout.nodes.map((node) => (
            <GraphNode
              key={node.id}
              node={node}
              task={tasks[node.id]}
              blocked={blockedIds.has(node.id)}
              dim={dimIds?.has(node.id) ?? false}
              highlight={highlightRoleOf(highlight, node.id)}
              onOpen={readOnly ? noop : openEditor}
              onHover={onHover}
              movedRef={movedRef}
            />
          ))}
        </g>
      </svg>
      <div className="graph__controls">
        <button type="button" className="osrs-btn" onClick={zoomIn} title="Zoom in">
          +
        </button>
        <button type="button" className="osrs-btn" onClick={zoomOut} title="Zoom out">
          −
        </button>
        <button type="button" className="osrs-btn" onClick={fitToView} title="Fit to view">
          ⤢
        </button>
      </div>
      <div className="graph__legend osrs-panel">
        <span>
          <span className="graph__legend-swatch" style={{ background: 'var(--c-edge)' }} />
          dependency
        </span>
        <span>
          <span className="graph__legend-swatch" style={{ background: 'var(--c-edge-auto)' }} />
          level chain (auto)
        </span>
      </div>
      {nodeCount === 0 && (
        <div className="graph__empty">
          {readOnly
            ? 'This shared list has no tasks.'
            : 'No tasks yet — add some on the Board tab.'}
        </div>
      )}
    </div>
  );
}
