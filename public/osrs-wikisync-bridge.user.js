// ==UserScript==
// @name         OSRS Task List — WikiSync bridge
// @namespace    https://github.com/ErgEnn/osrs-task-list
// @version      1.0.0
// @description  Lets your OSRS Task List read your own WikiSync profile, which a web page cannot fetch on its own.
// @author       osrs-task-list
// @homepageURL  https://github.com/ErgEnn/osrs-task-list
// @downloadURL  https://ergenn.github.io/osrs-task-list/osrs-wikisync-bridge.user.js
// @updateURL    https://ergenn.github.io/osrs-task-list/osrs-wikisync-bridge.user.js
// @match        https://ergenn.github.io/osrs-task-list/*
// @connect      sync.runescape.wiki
// @grant        GM.xmlHttpRequest
// @grant        GM_xmlhttpRequest
// @run-at       document-start
// ==/UserScript==

/*
 * WikiSync (sync.runescape.wiki) serves no CORS headers, so the task list —
 * a static page on another origin — cannot fetch your profile itself. This
 * script runs alongside the app and does that one request on its behalf,
 * through the userscript manager's cross-origin GM.xmlHttpRequest.
 *
 * It is deliberately narrow. The page cannot hand it a URL: it sends a
 * username, and the URL is built here, against sync.runescape.wiki alone. So
 * the only power this grants the page is reading a WikiSync player profile by
 * name — the same public data as opening that address in a tab — and never a
 * general cross-origin fetch. Nothing is sent anywhere, and nothing is written.
 *
 * Protocol (window.postMessage, same page and same origin only):
 *
 *   page   → { bridge: 'osrs-tl-wikisync', type: 'request', id, username }
 *   bridge → { bridge: 'osrs-tl-wikisync', type: 'response', id, ok, status, body }
 *   page   → { bridge: 'osrs-tl-wikisync', type: 'ping' }
 *   bridge → { bridge: 'osrs-tl-wikisync', type: 'hello', version }
 *
 * The app also detects the bridge synchronously through the
 * `data-osrs-tl-wikisync-bridge` attribute set on <html> below.
 *
 * Install from the app's Settings panel, which hands out a copy already
 * pointed at the deployment you are running.
 */
(function () {
  'use strict';

  var CHANNEL = 'osrs-tl-wikisync';
  var VERSION = '1.0.0';
  var MARKER = 'data-osrs-tl-wikisync-bridge';
  // Only the standard profile: the app has no account-type setting, and an
  // allowlist beats letting the page name the path segment.
  var PROFILE = 'STANDARD';
  var TIMEOUT_MS = 20000;

  window.addEventListener('message', onMessage, false);
  mark();
  announce();

  /*
   * Presence marker for a synchronous check by the app. At document-start the
   * root element may not have been parsed yet — depending on the manager, this
   * can run on an empty document — so retry until it exists. The app only reads
   * the marker when the user asks for a refresh, long after that.
   */
  function mark() {
    if (document.documentElement) {
      document.documentElement.setAttribute(MARKER, VERSION);
      return;
    }
    document.addEventListener('readystatechange', mark, { once: true });
    document.addEventListener('DOMContentLoaded', mark, { once: true });
  }

  function post(message) {
    message.bridge = CHANNEL;
    window.postMessage(message, window.location.origin);
  }

  function announce() {
    post({ type: 'hello', version: VERSION });
  }

  function onMessage(event) {
    // Same document, same origin: nothing framed or cross-site gets to ask.
    if (event.source !== window) return;
    if (event.origin !== window.location.origin) return;
    var message = event.data;
    if (!message || message.bridge !== CHANNEL) return;

    if (message.type === 'ping') {
      announce();
      return;
    }
    if (message.type !== 'request') return;

    var id = message.id;
    var username = typeof message.username === 'string' ? message.username.trim() : '';
    if (!username) {
      post({ type: 'response', id: id, ok: false, error: 'No username given.' });
      return;
    }
    request(id, username);
  }

  /** Tampermonkey/Violentmonkey expose GM.xmlHttpRequest; older ones GM_xmlhttpRequest. */
  function xhr(options) {
    if (typeof GM !== 'undefined' && GM && typeof GM.xmlHttpRequest === 'function') {
      return GM.xmlHttpRequest(options);
    }
    if (typeof GM_xmlhttpRequest === 'function') {
      return GM_xmlhttpRequest(options);
    }
    throw new Error('This userscript manager does not provide GM.xmlHttpRequest.');
  }

  function request(id, username) {
    var url =
      'https://sync.runescape.wiki/runelite/player/' +
      encodeURIComponent(username) +
      '/' +
      PROFILE;

    var settled = false;
    function respond(payload) {
      if (settled) return;
      settled = true;
      payload.type = 'response';
      payload.id = id;
      post(payload);
    }

    try {
      xhr({
        method: 'GET',
        url: url,
        headers: { Accept: 'application/json' },
        timeout: TIMEOUT_MS,
        onload: function (response) {
          respond({ ok: true, status: response.status, body: response.responseText });
        },
        onerror: function () {
          respond({ ok: false, error: 'WikiSync could not be reached.' });
        },
        ontimeout: function () {
          respond({ ok: false, error: 'WikiSync timed out.' });
        },
      });
    } catch (error) {
      respond({ ok: false, error: String((error && error.message) || error) });
    }
  }
})();
