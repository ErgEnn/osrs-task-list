import clsx from 'clsx';
import type { Task } from '@/domain/types';
import { TASK_KIND_LABELS } from '@/domain/types';
import { builtinIconUrl } from '@/icons/builtin';
import type { GraphNodePos } from './layout';
import { TILE_H, TILE_W } from './layout';

const ICON = 30;
const TITLE_CHARS = 15;

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Until the wiki icon pipeline (M5), wiki-sourced icons fall back to kind badges. */
function iconUrlFor(task: Task): string {
  if (task.iconRef.kind === 'builtin') return builtinIconUrl(task.iconRef.id);
  return builtinIconUrl(`badge:${task.payload.kind}`);
}

interface GraphNodeProps {
  node: GraphNodePos;
  task: Task;
  blocked: boolean;
  dim: boolean;
  onOpen: (id: string) => void;
  /** Ref shared with the pan handler: true when the pointer moved (a pan, not a click). */
  movedRef: React.MutableRefObject<boolean>;
}

export function GraphNode({ node, task, blocked, dim, onOpen, movedRef }: GraphNodeProps) {
  return (
    <g
      transform={`translate(${node.x} ${node.y})`}
      className={clsx(
        'graph-node',
        `graph-node--${task.status}`,
        blocked && 'graph-node--blocked',
        dim && 'graph-node--dim',
      )}
      onClick={() => {
        if (!movedRef.current) onOpen(task.id);
      }}
    >
      <title>
        {task.title} — {TASK_KIND_LABELS[task.payload.kind]}
        {blocked ? ' (blocked)' : ''}
      </title>
      <rect className="graph-node__frame" width={TILE_W} height={TILE_H} rx={3} />
      <rect
        className="graph-node__accent"
        x={2.5}
        y={2.5}
        width={TILE_W - 5}
        height={TILE_H - 5}
        rx={2}
      />
      <image
        href={iconUrlFor(task)}
        x={8}
        y={(TILE_H - ICON) / 2}
        width={ICON}
        height={ICON}
        className="pixel"
        preserveAspectRatio="xMidYMid meet"
      />
      <text className="graph-node__title" x={46} y={21}>
        {truncate(task.title, TITLE_CHARS)}
      </text>
      <text className="graph-node__sub" x={46} y={37}>
        {truncate(TASK_KIND_LABELS[task.payload.kind], 18)}
      </text>
      {blocked && (
        <text x={TILE_W - 18} y={16} fontSize={11}>
          🔒
        </text>
      )}
    </g>
  );
}
