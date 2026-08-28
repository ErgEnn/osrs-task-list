import { computeAutoLevelEdges, depClosure } from '@/domain/deps';
import type { Status, TaskMap } from '@/domain/types';
import { STATUSES } from '@/domain/types';

/**
 * How a dropped card relates to the card it lands on, named after the role the
 * *dragged* card takes. The board mirrors the progression graph, where
 * dependencies sit above their dependents: drop on a card's upper half and the
 * dragged card becomes a dependency of it, on the lower half and it comes to
 * depend on it.
 */
export type DepRole = 'dependency' | 'dependent';

/** Where a board drag can land. Encoded into the dnd-kit droppable ids. */
export type DropTarget =
  /** Between two cards (or at either end of a column) — reorder / move. */
  | { kind: 'gap'; status: Status; beforeId: string | null }
  /** One half of a card — link the two tasks. */
  | { kind: 'dep'; role: DepRole; taskId: string }
  /** Anywhere else in a column — move to the end of it. */
  | { kind: 'column'; status: Status };

/** `beforeId` of the gap that trails the last card. Task ids are never empty. */
const END = '';

export function gapDropId(status: Status, beforeId: string | null): string {
  return `gap:${status}:${beforeId ?? END}`;
}

export function depDropId(role: DepRole, taskId: string): string {
  return `dep:${role}:${taskId}`;
}

export function columnDropId(status: Status): string {
  return `column:${status}`;
}

export function decodeDropId(id: string): DropTarget | null {
  const [kind, a, ...rest] = id.split(':');
  const b = rest.join(':');
  if (kind === 'column') return isStatus(a) ? { kind: 'column', status: a } : null;
  if (kind === 'gap') {
    return isStatus(a) ? { kind: 'gap', status: a, beforeId: b === END ? null : b } : null;
  }
  if (kind === 'dep' && b && (a === 'dependency' || a === 'dependent')) {
    return { kind: 'dep', role: a, taskId: b };
  }
  return null;
}

function isStatus(id: string | undefined): id is Status {
  return typeof id === 'string' && (STATUSES as readonly string[]).includes(id);
}

/**
 * Index to hand `moveTask` for a drop in the gap before `beforeId` (null for
 * the end of the column). The dragged card is pulled out of every column first,
 * so the index is counted against the order *without* it.
 */
export function insertIndexFor(
  columnIds: readonly string[],
  activeId: string,
  beforeId: string | null,
): number {
  const rest = columnIds.filter((id) => id !== activeId);
  if (beforeId === null) return rest.length;
  const index = rest.indexOf(beforeId);
  return index === -1 ? rest.length : index;
}

export type LinkStatus =
  /** Droppable: the link is new and acyclic. */
  | 'ok'
  /** The two tasks are already linked that way (explicitly or by a level chain). */
  | 'linked'
  /** Linking them that way would close a dependency cycle. */
  | 'cycle';

export interface LinkOptions {
  activeId: string;
  /** taskId → what happens if the dragged card is dropped on its upper half. */
  asDependency: Map<string, LinkStatus>;
  /** taskId → what happens if the dragged card is dropped on its lower half. */
  asDependent: Map<string, LinkStatus>;
}

/**
 * What every card on the board would do with the card being dragged, both ways
 * round, so the drop zones can label themselves before the drop instead of
 * failing after it. One closure walk for the whole board.
 */
export function computeLinkOptions(tasks: TaskMap, activeId: string): LinkOptions | null {
  if (!tasks[activeId]) return null;
  const auto = computeAutoLevelEdges(tasks);
  const { dependencies, dependents } = depClosure(tasks, activeId);
  const directDepsOf = (id: string) => {
    const direct = new Set(tasks[id]?.explicitDeps ?? []);
    const autoDep = auto.get(id);
    if (autoDep) direct.add(autoDep);
    return direct;
  };

  const activeDeps = directDepsOf(activeId);
  const asDependency = new Map<string, LinkStatus>();
  const asDependent = new Map<string, LinkStatus>();
  for (const id of Object.keys(tasks)) {
    if (id === activeId) continue;
    asDependency.set(
      id,
      directDepsOf(id).has(activeId) ? 'linked' : dependencies.has(id) ? 'cycle' : 'ok',
    );
    asDependent.set(id, activeDeps.has(id) ? 'linked' : dependents.has(id) ? 'cycle' : 'ok');
  }
  return { activeId, asDependency, asDependent };
}

/** The (dependent, dependency) pair a card-half drop asks for. */
export function linkPairFor(
  activeId: string,
  target: { role: DepRole; taskId: string },
): { dependentId: string; depId: string } {
  return target.role === 'dependency'
    ? { dependentId: target.taskId, depId: activeId }
    : { dependentId: activeId, depId: target.taskId };
}
