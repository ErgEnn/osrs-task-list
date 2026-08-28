import clsx from 'clsx';
import { highlightEdgeRoleOf, type DepHighlight } from '@/domain/highlight';
import type { GraphEdgePath } from './layout';

interface GraphEdgesProps {
  edges: GraphEdgePath[];
  dimIds: ReadonlySet<string> | null;
  /**
   * The hovered chains; prerequisite edges light, unlock edges light in their
   * own color, and everything else mutes.
   */
  highlight: DepHighlight | null;
}

export function GraphEdges({ edges, dimIds, highlight }: GraphEdgesProps) {
  return (
    <g>
      {edges.map((edge) => {
        const points = edge.points.map((p) => `${p.x},${p.y}`).join(' ');
        const dim = dimIds !== null && (dimIds.has(edge.from) || dimIds.has(edge.to));
        const role = highlightEdgeRoleOf(highlight, edge.from, edge.to);
        return (
          <g
            key={`${edge.from}->${edge.to}`}
            className={clsx(
              'graph-edge',
              `graph-edge--${edge.kind}`,
              role === 'dep' && 'graph-edge--lit',
              role === 'unlock' && 'graph-edge--unlock',
              role === 'muted' && 'graph-edge--muted',
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
