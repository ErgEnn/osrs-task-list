import { useEffect, useMemo } from 'react';
import clsx from 'clsx';
import { computeAutoLevelEdges } from '@/domain/deps';
import { matchesSearch } from '@/domain/search';
import { useTaskStore } from '@/store/taskStore';
import { useUiStore } from '@/store/uiStore';
import { GraphEdges } from './GraphEdges';
import { GraphNode } from './GraphNode';
import { computeGraphLayout } from './layout';
import { usePanZoom } from './usePanZoom';
import './graph.css';

export function GraphView() {
  const tasks = useTaskStore((s) => s.tasks);
  const searchQuery = useUiStore((s) => s.searchQuery);
  const openEditor = useUiStore((s) => s.openEditor);

  const layout = useMemo(() => computeGraphLayout(tasks), [tasks]);

  const blockedIds = useMemo(() => {
    const auto = computeAutoLevelEdges(tasks);
    const blocked = new Set<string>();
    for (const task of Object.values(tasks)) {
      const deps = task.explicitDeps.filter((d) => tasks[d]);
      const autoDep = auto.get(task.id);
      if (autoDep) deps.push(autoDep);
      if (deps.some((dep) => tasks[dep]?.status !== 'done')) blocked.add(task.id);
    }
    return blocked;
  }, [tasks]);

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

  const nodeCount = layout.nodes.length;
  // Fit once tasks exist (also handles the very first render after rehydrate).
  useEffect(() => {
    if (nodeCount > 0) fitToView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeCount > 0, fitToView]);

  return (
    <div
      ref={containerRef}
      className={clsx('graph', 'osrs-panel', panning && 'graph--panning')}
      {...handlers}
      onDoubleClick={fitToView}
    >
      <svg className="graph__svg">
        <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.k})`}>
          <GraphEdges edges={layout.edges} dimIds={dimIds} />
          {layout.nodes.map((node) => (
            <GraphNode
              key={node.id}
              node={node}
              task={tasks[node.id]}
              blocked={blockedIds.has(node.id)}
              dim={dimIds?.has(node.id) ?? false}
              onOpen={openEditor}
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
        <div className="graph__empty">No tasks yet — add some on the Board tab.</div>
      )}
    </div>
  );
}
