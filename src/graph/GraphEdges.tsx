import clsx from 'clsx';
import { depEdgeKey, type DepHighlight } from '@/domain/highlight';
import type { GraphEdgePath } from './layout';

interface GraphEdgesProps {
  edges: GraphEdgePath[];
  dimIds: ReadonlySet<string> | null;
  /** The hovered prerequisite chain; its edges stay lit and the rest mute. */
  highlight: DepHighlight | null;
}

export function GraphEdges({ edges, dimIds, highlight }: GraphEdgesProps) {
  return (
    <g>
      {edges.map((edge) => {
        const points = edge.points.map((p) => `${p.x},${p.y}`).join(' ');
        const dim = dimIds !== null && (dimIds.has(edge.from) || dimIds.has(edge.to));
        const lit = highlight?.edges.has(depEdgeKey(edge.from, edge.to)) ?? null;
        return (
          <g
            key={`${edge.from}->${edge.to}`}
            className={clsx(
              'graph-edge',
              `graph-edge--${edge.kind}`,
              lit === true && 'graph-edge--lit',
              lit === false && 'graph-edge--muted',
              dim && 'graph-edge--dim',
            )}
          >
            <polyline className="graph-edge__outline" points={points} />
            <polyline className="graph-edge__core" points={points} />
          </g>
        );
      })}
    </g>
  );
}
