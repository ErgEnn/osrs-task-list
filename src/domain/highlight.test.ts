import { describe, expect, it } from 'vitest';
import type { DepEdge } from './deps';
import { computeDepHighlight, depEdgeKey } from './highlight';

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

  it('leaves dependents out — only prerequisites highlight', () => {
    const highlight = computeDepHighlight([edge('a', 'b'), edge('b', 'c')], 'b')!;
    expect([...highlight.nodes].sort()).toEqual(['a', 'b']);
    expect([...highlight.edges]).toEqual([depEdgeKey('a', 'b')]);
  });

  it('highlights a lone task as just itself', () => {
    const highlight = computeDepHighlight([edge('a', 'b')], 'x')!;
    expect([...highlight.nodes]).toEqual(['x']);
    expect(highlight.edges.size).toBe(0);
    expect(highlight.rootId).toBe('x');
  });

  it('terminates on a cycle', () => {
    const edges = [edge('a', 'b'), edge('b', 'a'), edge('b', 'c')];
    const highlight = computeDepHighlight(edges, 'c')!;
    expect([...highlight.nodes].sort()).toEqual(['a', 'b', 'c']);
    expect(highlight.edges.size).toBe(3);
  });
});
