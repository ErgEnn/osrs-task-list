import { useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { computeBlockedIds } from '@/domain/deps';
import { computeDepHighlight, highlightRoleOf } from '@/domain/highlight';
import { matchesSearch } from '@/domain/search';
import type { TaskMap } from '@/domain/types';
import { useUiStore } from '@/store/uiStore';
import { GraphEdges } from './GraphEdges';
import { GraphNode } from './GraphNode';
import { computeGraphLayout, EMPTY_LAYOUT } from './layout';
import { usePanZoom } from './usePanZoom';
import './graph.css';

function noop() {}

interface GraphCanvasProps {
  /** Tasks to draw — the live store's, or a shared list's.  */
  tasks: TaskMap;
  /** Omit to make the graph read-only: tiles then do not open anything. */
  onOpenTask?: (id: string) => void;
}

/**
 * The progression graph over whatever tasks it is handed. It reads no store of
 * its own, so the read-only share view can render it without loading — and
 * rehydrating — the viewer's persisted tasks.
 */
export function GraphCanvas({ tasks, onOpenTask }: GraphCanvasProps) {
  const readOnly = !onOpenTask;
  const searchQuery = useUiStore((s) => s.searchQuery);

  // The layout comes back from ELK asynchronously; keep drawing the last one
  // until the new one lands, so an edit does not blank the graph mid-thought,
  // and drop answers that a newer edit has already made stale.
  const [layout, setLayout] = useState(EMPTY_LAYOUT);
  useEffect(() => {
    let current = true;
    void computeGraphLayout(tasks).then((next) => {
      if (current) setLayout(next);
    });
    return () => {
      current = false;
    };
  }, [tasks]);

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

  // Pointing at a tile picks out the chain behind it and the one in front of
  // it, each in its own color, and mutes the rest. A pan captures the pointer,
  // so the tile under it never gets its mouseleave: suppress the highlight for
  // the duration rather than trusting the last event.
  const [hoverId, setHoverId] = useState<string | null>(null);
  const hoverTarget = !panning && hoverId !== null && tasks[hoverId] ? hoverId : null;
  const highlight = useMemo(
    () => computeDepHighlight(layout.edges, hoverTarget, { withUnlocks: true }),
    [layout.edges, hoverTarget],
  );
  const onHover = useCallback((id: string | null) => setHoverId(id), []);

  const nodeCount = layout.nodes.length;
  const taskCount = Object.keys(tasks).length;
  // Fit once a layout exists (also handles the very first render after
  // rehydrate, and the first one to arrive from ELK).
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
              onOpen={onOpenTask ?? noop}
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
        <span>
          <span className="graph__legend-swatch" style={{ background: 'var(--c-hi)' }} />
          needed first (hover)
        </span>
        <span>
          <span className="graph__legend-swatch" style={{ background: 'var(--c-hi-unlock)' }} />
          unlocked by (hover)
        </span>
      </div>
      {/* Keyed off the tasks rather than the drawing: a graph waiting for its
          first layout is not an empty one — it says so itself. */}
      {taskCount === 0 ? (
        <div className="graph__empty">
          {readOnly
            ? 'This shared list has no tasks.'
            : 'No tasks yet — add some on the Board tab.'}
        </div>
      ) : (
        nodeCount === 0 && <div className="graph__empty">Working out the layout…</div>
      )}
    </div>
  );
}
