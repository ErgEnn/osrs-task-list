import { beforeEach, describe, expect, it, vi } from 'vitest';
import { iconCache } from './iconCache';

beforeEach(() => {
  iconCache.clear();
});

describe('iconCache', () => {
  it('stores and returns data urls, tracking byte totals', () => {
    iconCache.put('file:A.png', 'data:image/png;base64,AAAA');
    expect(iconCache.get('file:A.png')).toBe('data:image/png;base64,AAAA');
    expect(iconCache.get('file:missing.png')).toBeNull();
    expect(iconCache.stats()).toEqual({ count: 1, totalBytes: 26 });
  });

  it('replaces entries without double counting', () => {
    iconCache.put('k', 'x'.repeat(100));
    iconCache.put('k', 'y'.repeat(40));
    expect(iconCache.stats()).toEqual({ count: 1, totalBytes: 40 });
  });

  it('evicts least-recently-used entries beyond the byte cap', () => {
    vi.useFakeTimers();
    const megabyte = 1_000_000;
    vi.setSystemTime(1000);
    iconCache.put('old', 'a'.repeat(megabyte));
    vi.setSystemTime(2000);
    iconCache.put('mid', 'b'.repeat(megabyte));
    vi.setSystemTime(3000);
    iconCache.get('old'); // freshen "old" so "mid" is now the LRU entry
    vi.setSystemTime(4000);
    iconCache.put('new', 'c'.repeat(megabyte)); // 3MB total > 2.5MB cap
    expect(iconCache.has('mid')).toBe(false);
    expect(iconCache.has('old')).toBe(true);
    expect(iconCache.has('new')).toBe(true);
    vi.useRealTimers();
  });

  it('notifies subscribers on puts and clears', () => {
    let events = 0;
    const unsubscribe = iconCache.subscribe(() => events++);
    iconCache.put('k', 'v');
    iconCache.clear();
    unsubscribe();
    iconCache.put('k2', 'v2');
    expect(events).toBe(2);
  });

  it('survives corrupted persisted json', () => {
    localStorage.setItem('osrs-tl:icon-cache:v1', '{not json');
    // Force a fresh read path through clear+reload semantics.
    iconCache.put('k', 'v');
    expect(iconCache.get('k')).toBe('v');
  });
});
