import { parseBundleJson, type ParseResult, type SyncBundle } from './bundle';

/**
 * A transfer code is a bundle you can carry between devices by hand: copy it
 * to the clipboard, paste it into a chat, or hang it off a URL fragment.
 *
 *   OSTL2Z.<base64url>   deflate-raw compressed JSON (the normal case)
 *   OSTL2R.<base64url>   plain JSON, for browsers without CompressionStream
 *
 * The prefix is the version handshake: an older build refuses a newer code
 * with a clear message instead of decoding it into nonsense.
 */
const PREFIX = 'OSTL2';
const COMPRESSED = `${PREFIX}Z.`;
const RAW = `${PREFIX}R.`;

/** URL fragment key carrying a transfer code. */
export const TRANSFER_HASH_KEY = 'transfer';

/**
 * Codes longer than this still work when pasted, but make for links that some
 * chat apps and QR readers mangle, so the UI warns instead of pretending.
 */
export const LINK_LENGTH_WARN = 8000;

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function pipeThrough(
  bytes: Uint8Array,
  transform: 'CompressionStream' | 'DecompressionStream',
) {
  const Ctor = globalThis[transform] as
    (new (format: string) => { readable: ReadableStream; writable: WritableStream }) | undefined;
  if (!Ctor) return null;
  const stream = new Ctor('deflate-raw');
  const writer = stream.writable.getWriter();
  void writer.write(bytes).then(() => writer.close());
  const buffer = await new Response(stream.readable).arrayBuffer();
  return new Uint8Array(buffer);
}

/** Encode a bundle as a transfer code, compressing when the browser can. */
export async function encodeTransfer(bundle: SyncBundle): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(bundle));
  try {
    const deflated = await pipeThrough(json, 'CompressionStream');
    if (deflated) return COMPRESSED + toBase64Url(deflated);
  } catch {
    // Fall through to the uncompressed form rather than failing the export.
  }
  return RAW + toBase64Url(json);
}

/**
 * Decode a transfer code. Whitespace anywhere is ignored, so a code that got
 * line-wrapped by a mail client or terminal still reads back.
 */
export async function decodeTransfer(code: string): Promise<ParseResult> {
  const cleaned = extractCode(code).replace(/\s+/g, '');
  if (!cleaned) throw new Error('Paste a transfer code first.');

  const compressed = cleaned.startsWith(COMPRESSED);
  if (!compressed && !cleaned.startsWith(RAW)) {
    throw new Error(
      cleaned.startsWith('OSTL')
        ? 'That code came from a newer version of the app — update this device first.'
        : 'That does not look like a transfer code (it should start with OSTL2).',
    );
  }

  let bytes: Uint8Array;
  try {
    bytes = fromBase64Url(cleaned.slice(COMPRESSED.length));
  } catch {
    throw new Error('That transfer code is damaged — copy it again in full.');
  }

  if (compressed) {
    const inflated = await pipeThrough(bytes, 'DecompressionStream').catch(() => null);
    if (!inflated) throw new Error('That transfer code is damaged — copy it again in full.');
    bytes = inflated;
  }

  return parseBundleJson(new TextDecoder().decode(bytes));
}

/**
 * Accept either a bare code or a whole transfer link — pasting the URL you were
 * sent is the obvious thing to try, so it should work.
 */
export function extractCode(input: string): string {
  const trimmed = input.trim();
  const hash = trimmed.indexOf('#');
  if (hash >= 0 && /^https?:\/\//i.test(trimmed)) {
    return readTransferHash(trimmed.slice(hash)) ?? trimmed;
  }
  return trimmed;
}

/** Wrap a transfer code in a link that opens this app and offers the merge. */
export function transferLink(code: string, base = window.location.href): string {
  const url = new URL(base);
  url.hash = `${TRANSFER_HASH_KEY}=${code}`;
  return url.toString();
}

/** Pull a transfer code out of a URL fragment, if one is there. */
export function readTransferHash(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const code = params.get(TRANSFER_HASH_KEY);
  return code && code.trim() ? code.trim() : null;
}
