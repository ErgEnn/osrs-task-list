import { HttpError } from './http';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function shouldRetry(error: unknown): boolean {
  // Network/CORS failures surface as TypeError; HTTP errors only retry when
  // the server asked us to back off or hiccuped.
  if (error instanceof HttpError) return error.status === 429 || error.status >= 500;
  return true;
}

/**
 * Polite serial queue for wiki requests: one request at a time, a fixed gap
 * between requests, in-flight de-duplication by key, and a single retry with
 * backoff for transient failures. Keeps bulk icon loading well under any
 * sane rate limit.
 */
export class RequestQueue {
  private chain: Promise<void> = Promise.resolve();
  private inFlight = new Map<string, Promise<unknown>>();

  constructor(
    private readonly delayMs = 300,
    private readonly retryDelayMs = 2000,
  ) {}

  enqueue<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key);
    if (existing) return existing as Promise<T>;

    const run = this.chain.then(() => this.attempt(fn));
    this.chain = run.then(
      () => sleep(this.delayMs),
      () => sleep(this.delayMs),
    );

    const tracked = run.finally(() => {
      this.inFlight.delete(key);
    });
    this.inFlight.set(key, tracked);
    return tracked;
  }

  private async attempt<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (!shouldRetry(error)) throw error;
      await sleep(this.retryDelayMs);
      return fn();
    }
  }
}

/** Shared queue for all image fetches against the wiki. */
export const wikiQueue = new RequestQueue();
