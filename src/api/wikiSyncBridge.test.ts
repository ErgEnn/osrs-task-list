// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
// The real shipped script, so these tests fail if the two halves of the
// protocol drift apart. Test-only: the app fetches it at runtime, never bundles it.
import BRIDGE_SCRIPT from '../../public/osrs-wikisync-bridge.user.js?raw';
import { setFetchImpl } from './http';
import { getPlayerState, WikiSyncBlockedError, WikiSyncNotFoundError } from './wikiSync';
import { BRIDGE_CHANNEL, BRIDGE_MARKER, bridgeVersion, hasBridge } from './wikiSyncBridge';
import playerFixture from './__fixtures__/wikisync-player.json';

/**
 * Stand-in for the userscript: answers `request` messages the way the shipped
 * script does. `reply` decides what WikiSync "returned".
 *
 * The reply is dispatched as a hand-built MessageEvent rather than through
 * postMessage because jsdom leaves `origin` empty and `source` null on a
 * same-window post — the two fields the client checks before trusting a
 * message, and the two a real browser fills in.
 */
function installFakeBridge(reply: (username: string) => Record<string, unknown>) {
  document.documentElement.setAttribute(BRIDGE_MARKER, '1.0.0');
  const listener = (event: MessageEvent) => {
    const message = event.data as Record<string, unknown> | null;
    if (!message || message.bridge !== BRIDGE_CHANNEL || message.type !== 'request') return;
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          bridge: BRIDGE_CHANNEL,
          type: 'response',
          id: message.id,
          ...reply(String(message.username)),
        },
        origin: window.location.origin,
        source: window,
      }),
    );
  };
  window.addEventListener('message', listener);
  return () => {
    window.removeEventListener('message', listener);
    document.documentElement.removeAttribute(BRIDGE_MARKER);
  };
}

let uninstall: (() => void) | null = null;

afterEach(() => {
  setFetchImpl(null);
  uninstall?.();
  uninstall = null;
});

describe('bridge detection', () => {
  it('is absent until the userscript marks the document', () => {
    expect(hasBridge()).toBe(false);
    expect(bridgeVersion()).toBeNull();
    uninstall = installFakeBridge(() => ({ ok: true, status: 200, body: '{}' }));
    expect(hasBridge()).toBe(true);
    expect(bridgeVersion()).toBe('1.0.0');
  });
});

describe('getPlayerState with a bridge installed', () => {
  it('reads the profile through it and never touches fetch', async () => {
    const fetchImpl = vi.fn();
    setFetchImpl(fetchImpl as unknown as typeof fetch);
    let asked = '';
    uninstall = installFakeBridge((username) => {
      asked = username;
      return { ok: true, status: 200, body: JSON.stringify(playerFixture) };
    });

    const player = await getPlayerState('iron man 42');
    expect(player.quests["Cook's Assistant"]).toBe(2);
    // The bridge is asked for a name, never a URL — it builds that itself.
    expect(asked).toBe('iron man 42');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('maps a 404 from the bridge to the friendly error', async () => {
    uninstall = installFakeBridge(() => ({ ok: true, status: 404, body: 'not found' }));
    await expect(getPlayerState('nobody')).rejects.toBeInstanceOf(WikiSyncNotFoundError);
  });

  it('surfaces a bridge-level failure', async () => {
    uninstall = installFakeBridge(() => ({ ok: false, error: 'WikiSync could not be reached.' }));
    await expect(getPlayerState('someone')).rejects.toThrow(/could not be reached/);
  });

  it('rejects a body that is not JSON', async () => {
    uninstall = installFakeBridge(() => ({ ok: true, status: 200, body: '<html>nope' }));
    await expect(getPlayerState('someone')).rejects.toThrow(/not JSON/);
  });
});

describe('getPlayerState without a bridge', () => {
  it('explains the CORS block instead of leaking "Failed to fetch"', async () => {
    setFetchImpl(async () => {
      throw new TypeError('Failed to fetch');
    });
    const error = await getPlayerState('someone').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WikiSyncBlockedError);
    expect((error as Error).message).toMatch(/bridge userscript/);
  });

  it('still uses a direct fetch when one works', async () => {
    setFetchImpl(async () => new Response(JSON.stringify(playerFixture), { status: 200 }));
    await expect(getPlayerState('someone')).resolves.toMatchObject({ username: 'example player' });
  });
});

describe('the shipped bridge userscript', () => {
  it('speaks the protocol this module expects', () => {
    expect(BRIDGE_SCRIPT).toContain(`var CHANNEL = '${BRIDGE_CHANNEL}';`);
    expect(BRIDGE_SCRIPT).toContain(`var MARKER = '${BRIDGE_MARKER}';`);
  });

  it('asks the userscript manager for WikiSync alone', () => {
    expect(BRIDGE_SCRIPT).toContain('// @connect      sync.runescape.wiki');
    expect(BRIDGE_SCRIPT).toContain("'https://sync.runescape.wiki/runelite/player/'");
    // The page sends a username; a page-supplied URL would make it a proxy.
    expect(BRIDGE_SCRIPT).toContain('encodeURIComponent(username)');
    expect(BRIDGE_SCRIPT).not.toMatch(/url:\s*message\./);
  });
});
