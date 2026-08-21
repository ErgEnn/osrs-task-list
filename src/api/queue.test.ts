import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpError } from './http';
import { RequestQueue } from './queue';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('RequestQueue', () => {
  it('runs requests one at a time with a gap in between', async () => {
    const queue = new RequestQueue(300);
    const calls: string[] = [];
    const a = queue.enqueue('a', async () => {
      calls.push('a');
    });
    const b = queue.enqueue('b', async () => {
      calls.push('b');
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toEqual(['a']);
    await vi.advanceTimersByTimeAsync(299);
    expect(calls).toEqual(['a']);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toEqual(['a', 'b']);
    await expect(Promise.all([a, b])).resolves.toBeDefined();
  });

  it('de-duplicates concurrent requests by key', async () => {
    const queue = new RequestQueue(0);
    let runs = 0;
    const first = queue.enqueue('same', async () => {
      runs++;
      return 'value';
    });
    const second = queue.enqueue('same', async () => {
      runs++;
      return 'other';
    });
    await vi.advanceTimersByTimeAsync(0);
    await expect(first).resolves.toBe('value');
    await expect(second).resolves.toBe('value');
    expect(runs).toBe(1);
  });

  it('retries transient failures once after a backoff', async () => {
    const queue = new RequestQueue(0, 2000);
    let attempts = 0;
    const result = queue.enqueue('flaky', async () => {
      attempts++;
      if (attempts === 1) throw new TypeError('network down');
      return 'recovered';
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(attempts).toBe(1);
    await vi.advanceTimersByTimeAsync(2000);
    await expect(result).resolves.toBe('recovered');
    expect(attempts).toBe(2);
  });

  it('does not retry definite HTTP failures like 404', async () => {
    const queue = new RequestQueue(0, 2000);
    let attempts = 0;
    const result = queue.enqueue('missing', async () => {
      attempts++;
      throw new HttpError(404, 'https://example.test/x');
    });
    result.catch(() => {}); // avoid unhandled rejection noise before assertion
    await vi.advanceTimersByTimeAsync(5000);
    await expect(result).rejects.toBeInstanceOf(HttpError);
    expect(attempts).toBe(1);
  });

  it('keeps the queue alive after a failure', async () => {
    const queue = new RequestQueue(100, 0);
    const calls: string[] = [];
    const bad = queue.enqueue('bad', async () => {
      throw new HttpError(404, 'x');
    });
    bad.catch(() => {});
    const good = queue.enqueue('good', async () => {
      calls.push('good');
    });
    await vi.advanceTimersByTimeAsync(500);
    await expect(good).resolves.toBeUndefined();
    expect(calls).toEqual(['good']);
  });
});
