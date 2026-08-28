import { describe, expect, it } from 'vitest';
import type { DepEdge } from './deps';
import { computeDepHighlight, depEdgeKey, highlightEdgeRoleOf, highlightRoleOf } from './highlight';

const edge = (from: string, to: string): DepEdge => ({ from, to, kind: 'explicit' });

describe('computeDepHighlight', () => {
  it('is null with nothing hovered', () => {
    expect(computeDepHighlight([edge('a', 'b')], null)).toBeNull();
  });

  it('walks the dependency chain all the way up', () => {
    // a -> b -> c, and a side branch off b that must stay out.
    const edges = [edge('a', 'b'), edge('b', 'c'), edge('b', 'side')];
    const highlight = computeDepHighlight(edges, 'c')!;
    expect([...highlight.nodes].sort()).toEqual(['a', 'b', 'c']);
    expect([...highlight.edges].sort()).toEqual([depEdgeKey('a', 'b'), depEdgeKey('b', 'c')]);
  });

  it('takes every branch of a diamond', () => {
    const edges = [edge('a', 'b'), edge('a', 'c'), edge('b', 'd'), edge('c', 'd')];
    const highlight = computeDepHighlight(edges, 'd')!;
    expect([...highlight.nodes].sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(highlight.edges.size).toBe(4);
  });

  it('leaves dependents out of the prerequisite chain', () => {
    const highlight = computeDepHighlight([edge('a', 'b'), edge('b', 'c')], 'b')!;
    expect([...highlight.nodes].sort()).toEqual(['a', 'b']);
    expect([...highlight.edges]).toEqual([depEdgeKey('a', 'b')]);
  });

  it('reports no unlocks unless asked', () => {
    const highlight = computeDepHighlight([edge('a', 'b'), edge('b', 'c')], 'b')!;
    expect(highlight.unlockNodes.size).toBe(0);
    expect(highlight.unlockEdges.size).toBe(0);
  });

  it('highlights a lone task as just itself', () => {
    const highlight = computeDepHighlight([edge('a', 'b')], 'x')!;
    expect([...highlight.nodes]).toEqual(['x']);
    expect(highlight.edges.size).toBe(0);
    expect(highlight.rootId).toBe('x');
  });

  it('walks the unlock chain all the way down when asked', () => {
    // a -> b -> c -> d, plus a branch off c: everything below b unlocks.
    const edges = [edge('a', 'b'), edge('b', 'c'), edge('c', 'd'), edge('c', 'side')];
    const highlight = computeDepHighlight(edges, 'b', { withUnlocks: true })!;
    expect([...highlight.nodes].sort()).toEqual(['a', 'b']);
    expect([...highlight.unlockNodes].sort()).toEqual(['c', 'd', 'side']);
    expect([...highlight.unlockEdges].sort()).toEqual([
      depEdgeKey('b', 'c'),
      depEdgeKey('c', 'd'),
      depEdgeKey('c', 'side'),
    ]);
  });

  it('keeps the root out of its own unlocks', () => {
    const highlight = computeDepHighlight([edge('a', 'b')], 'a', { withUnlocks: true })!;
    expect(highlight.unlockNodes.has('a')).toBe(false);
    expect([...highlight.unlockNodes]).toEqual(['b']);
  });

  it('terminates on an unlock cycle', () => {
    const edges = [edge('a', 'b'), edge('b', 'a'), edge('b', 'c')];
    const highlight = computeDepHighlight(edges, 'a', { withUnlocks: true })!;
    expect([...highlight.unlockNodes].sort()).toEqual(['b', 'c']);
    expect(highlight.unlockEdges.size).toBe(3);
  });

  it('terminates on a cycle', () => {
    const edges = [edge('a', 'b'), edge('b', 'a'), edge('b', 'c')];
    const highlight = computeDepHighlight(edges, 'c')!;
    expect([...highlight.nodes].sort()).toEqual(['a', 'b', 'c']);
    expect(highlight.edges.size).toBe(3);
  });
});

describe('highlightRoleOf', () => {
  const edges = [edge('a', 'b'), edge('b', 'c'), edge('x', 'y')];

  it('is null with nothing hovered', () => {
    expect(highlightRoleOf(null, 'a')).toBeNull();
  });

  it('names each task by where it sits relative to the hover', () => {
    const highlight = computeDepHighlight(edges, 'b', { withUnlocks: true });
    expect(highlightRoleOf(highlight, 'b')).toBe('root');
    expect(highlightRoleOf(highlight, 'a')).toBe('dep');
    expect(highlightRoleOf(highlight, 'c')).toBe('unlock');
    expect(highlightRoleOf(highlight, 'y')).toBe('muted');
  });

  it('calls a task on both sides of a cycle a prerequisite', () => {
    const highlight = computeDepHighlight([edge('a', 'b'), edge('b', 'a')], 'a', {
      withUnlocks: true,
    });
    expect(highlightRoleOf(highlight, 'b')).toBe('dep');
  });
});

describe('highlightEdgeRoleOf', () => {
  const edges = [edge('a', 'b'), edge('b', 'c'), edge('x', 'y')];

  it('is null with nothing hovered', () => {
    expect(highlightEdgeRoleOf(null, 'a', 'b')).toBeNull();
  });

  it('splits the edges into the chain behind, the chain ahead, and the rest', () => {
    const highlight = computeDepHighlight(edges, 'b', { withUnlocks: true });
    expect(highlightEdgeRoleOf(highlight, 'a', 'b')).toBe('dep');
    expect(highlightEdgeRoleOf(highlight, 'b', 'c')).toBe('unlock');
    expect(highlightEdgeRoleOf(highlight, 'x', 'y')).toBe('muted');
  });

  it('mutes every edge when unlocks were not asked for', () => {
    const highlight = computeDepHighlight(edges, 'b');
    expect(highlightEdgeRoleOf(highlight, 'b', 'c')).toBe('muted');
  });
});
