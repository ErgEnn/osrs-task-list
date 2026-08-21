import clsx from 'clsx';
import type { GraphEdgePath } from './layout';

interface GraphEdgesProps {
  edges: GraphEdgePath[];
  dimIds: ReadonlySet<string> | null;
}

export function GraphEdges({ edges, dimIds }: GraphEdgesProps) {
  return (
    <g>
      {edges.map((edge) => {
        const points = edge.points.map((p) => `${p.x},${p.y}`).join(' ');
        const dim = dimIds !== null && (dimIds.has(edge.from) || dimIds.has(edge.to));
        return (
          <g
            key={`${edge.from}->${edge.to}`}
            className={clsx('graph-edge', `graph-edge--${edge.kind}`, dim && 'graph-edge--dim')}
          >
            <polyline className="graph-edge__outline" points={points} />
            <polyline className="graph-edge__core" points={points} />
          </g>
        );
      })}
    </g>
  );
}
