import { afterEach, describe, expect, it } from 'vitest';
import type { Task } from '@/domain/types';
import { emptyColumns } from '@/store/taskStore';
import { BUNDLE_VERSION, type SyncBundle } from './bundle';
import {
  decodeTransfer,
  encodeTransfer,
  extractCode,
  readTransferHash,
  transferLink,
} from './transfer';

function task(id: string, over: Partial<Task> = {}): Task {
  return {
    id,
    title: id,
    description: '',
    status: 'todo',
    iconRef: { kind: 'none' },
    payload: { kind: 'quest', questName: id },
    explicitDeps: [],
    createdAt: 1,
    updatedAt: 1,
    ...over,
  };
}

function sample(count = 3): SyncBundle {
  const tasks = Object.fromEntries(
    Array.from({ length: count }, (_, i) => [`t${i}`, task(`t${i}`)]),
  );
  return {
    v: BUNDLE_VERSION,
    exportedAt: '2026-01-01T00:00:00.000Z',
    tasks,
    columns: { ...emptyColumns(), todo: Object.keys(tasks) },
    deleted: { old: 42 },
  };
}

const compression = globalThis.CompressionStream;
afterEach(() => {
  Object.defineProperty(globalThis, 'CompressionStream', {
    value: compression,
    configurable: true,
  });
});

describe('transfer codes', () => {
  it('round-trips a bundle through a compressed code', async () => {
    const code = await encodeTransfer(sample());
    expect(code.startsWith('OSTL2Z.')).toBe(true);
    const { bundle } = await decodeTransfer(code);
    expect(bundle.tasks).toEqual(sample().tasks);
    expect(bundle.deleted).toEqual({ old: 42 });
  });

  it('compresses enough to matter on a realistic board', async () => {
    const big = sample(60);
    const code = await encodeTransfer(big);
    expect(code.length).toBeLessThan(JSON.stringify(big).length / 2);
  });

  it('falls back to an uncompressed code when the browser has no CompressionStream', async () => {
    Object.defineProperty(globalThis, 'CompressionStream', {
      value: undefined,
      configurable: true,
    });
    const code = await encodeTransfer(sample());
    expect(code.startsWith('OSTL2R.')).toBe(true);
    // Decoding an uncompressed code must not need the API either.
    const { bundle } = await decodeTransfer(code);
    expect(Object.keys(bundle.tasks)).toHaveLength(3);
  });

  it('survives whitespace and line wrapping', async () => {
    const code = await encodeTransfer(sample());
    const wrapped = code.replace(/(.{20})/g, '$1\n  ');
    const { bundle } = await decodeTransfer(wrapped);
    expect(Object.keys(bundle.tasks)).toHaveLength(3);
  });

  it('accepts a whole transfer link, not just the bare code', async () => {
    const code = await encodeTransfer(sample());
    const link = transferLink(code, 'https://example.com/osrs-task-list/');
    expect(extractCode(link)).toBe(code);
    const { bundle } = await decodeTransfer(link);
    expect(Object.keys(bundle.tasks)).toHaveLength(3);
  });

  it('rejects junk, foreign text, and codes from a newer version', async () => {
    await expect(decodeTransfer('')).rejects.toThrow(/paste a transfer code/i);
    await expect(decodeTransfer('hello there')).rejects.toThrow(/does not look like/i);
    await expect(decodeTransfer('OSTL9Z.abcd')).rejects.toThrow(/newer version/i);
    await expect(decodeTransfer('OSTL2Z.!!!!')).rejects.toThrow(/damaged/i);
  });

  it('reads a code out of a URL fragment and ignores unrelated ones', () => {
    expect(readTransferHash('#transfer=OSTL2R.abc')).toBe('OSTL2R.abc');
    expect(readTransferHash('#view=graph')).toBeNull();
    expect(readTransferHash('')).toBeNull();
  });
});
