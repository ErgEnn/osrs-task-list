// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { withTabLock } from './tabLock';

/** A minimal Web Locks stand-in: one queue per name, exclusive by construction. */
function fakeLockManager() {
  const queues = new Map<string, Promise<unknown>>();
  return {
    request: vi.fn((name: string, ...rest: unknown[]) => {
      const callback = rest.at(-1) as () => Promise<unknown>;
      const next = (queues.get(name) ?? Promise.resolve()).then(callback, callback);
      // The queue must not stop at the first rejection, hence the settled tail.
      queues.set(
        name,
        next.then(
          () => undefined,
          () => undefined,
        ),
      );
      return next;
    }),
  };
}

function withLockManager(manager: unknown) {
  Object.defineProperty(navigator, 'locks', { value: manager, configurable: true });
}

afterEach(() => {
  // jsdom has no Web Locks of its own; put the absence back.
  Reflect.deleteProperty(navigator, 'locks');
});

describe('withTabLock', () => {
  it('runs the job unguarded where the API is missing', async () => {
    expect(navigator.locks).toBeUndefined();
    await expect(withTabLock('lock', async () => 'ran')).resolves.toBe('ran');
  });

  it('keeps two callers from overlapping', async () => {
    withLockManager(fakeLockManager());
    const log: string[] = [];
    const job = (name: string) => async () => {
      log.push(`${name}:start`);
      await Promise.resolve();
      log.push(`${name}:end`);
    };

    await Promise.all([withTabLock('gist', job('a')), withTabLock('gist', job('b'))]);

    expect(log).toEqual(['a:start', 'a:end', 'b:start', 'b:end']);
  });

  it('lets the next caller through after one throws', async () => {
    withLockManager(fakeLockManager());
    const boom = withTabLock('gist', () => Promise.reject(new Error('network')));

    await expect(boom).rejects.toThrow('network');
    await expect(withTabLock('gist', async () => 'ran')).resolves.toBe('ran');
  });

  it('goes ahead anyway when the wait times out', async () => {
    // A tab that holds the lock for ever must not silence this one for ever.
    withLockManager({
      request: (_name: string, options: { signal: AbortSignal }) =>
        Promise.reject(
          options.signal.aborted
            ? options.signal.reason
            : new DOMException('timed out', 'TimeoutError'),
        ),
    });

    await expect(withTabLock('gist', async () => 'ran')).resolves.toBe('ran');
  });

  it('does not swallow a real failure to take the lock', async () => {
    withLockManager({ request: () => Promise.reject(new Error('locks are broken')) });

    await expect(withTabLock('gist', async () => 'ran')).rejects.toThrow('locks are broken');
  });
});
