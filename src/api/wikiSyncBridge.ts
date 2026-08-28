/**
 * Page half of the WikiSync bridge userscript
 * (public/osrs-wikisync-bridge.user.js).
 *
 * WikiSync serves no CORS headers, so this origin cannot fetch a profile
 * itself. When the bridge userscript is installed it runs alongside the app and
 * does that one request through GM.xmlHttpRequest; here we ask it over
 * window.postMessage and wait for the matching reply.
 *
 * The bridge builds the WikiSync URL itself from the username we send — it is
 * not a general fetch proxy — so this module only ever names a player.
 */

export const BRIDGE_CHANNEL = 'osrs-tl-wikisync';
export const BRIDGE_MARKER = 'data-osrs-tl-wikisync-bridge';

const REQUEST_TIMEOUT_MS = 25_000;

export interface BridgeResponse {
  status: number;
  body: string;
}

interface Pending {
  resolve: (value: BridgeResponse) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const pending = new Map<number, Pending>();
let sequence = 0;
let listening = false;

/** Version the installed bridge announces, or null when it is not installed. */
export function bridgeVersion(): string | null {
  if (typeof document === 'undefined') return null;
  return document.documentElement.getAttribute(BRIDGE_MARKER);
}

export function hasBridge(): boolean {
  return bridgeVersion() !== null;
}

function listen(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const message = event.data as Record<string, unknown> | null;
    if (!message || message.bridge !== BRIDGE_CHANNEL || message.type !== 'response') return;

    const entry = pending.get(message.id as number);
    if (!entry) return;
    pending.delete(message.id as number);
    clearTimeout(entry.timer);

    if (message.ok === true && typeof message.body === 'string') {
      entry.resolve({ status: Number(message.status), body: message.body });
    } else {
      entry.reject(new Error(String(message.error ?? 'The WikiSync bridge failed.')));
    }
  });
}

/**
 * Ask the bridge for a player's profile. Resolves with whatever WikiSync
 * answered — including error statuses, which the caller maps — and rejects when
 * the bridge itself could not reach it or never replied.
 */
export function fetchPlayerViaBridge(username: string): Promise<BridgeResponse> {
  listen();
  const id = ++sequence;
  return new Promise<BridgeResponse>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('The WikiSync bridge userscript did not answer.'));
    }, REQUEST_TIMEOUT_MS);
    pending.set(id, { resolve, reject, timer });
    window.postMessage(
      { bridge: BRIDGE_CHANNEL, type: 'request', id, username },
      window.location.origin,
    );
  });
}
