// ==UserScript==
// @name         OSRS Wiki — quest status on the title
// @namespace    https://github.com/ErgEnn/osrs-task-list
// @version      1.1.0
// @description  On an OSRS wiki quest page, marks the article title with ✔/✘ for whether you have completed that quest, using the same by-username WikiSync data the wiki's own quest-requirement checkmarks come from.
// @author       osrs-quest-status
// @match        https://oldschool.runescape.wiki/*
// @connect      sync.runescape.wiki
// @grant        GM.xmlHttpRequest
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
// ==/UserScript==

/*
 * Standalone wiki quality-of-life script — nothing to do with the task list
 * app; it only reads and never writes anything about your account.
 *
 * The wiki already ticks off the *required* quests listed on a quest page from
 * your WikiSync data (sync.runescape.wiki, keyed by RSN, populated by the
 * WikiSync plugin on RuneLite/HDOS). The page's own quest is the one thing that
 * never gets a mark, so this adds it next to the title:
 *
 *   ✔  complete        ✘  not started
 *   …  in progress     ?  not present in your data (miniquest, or a name this
 *                         script could not line up — see NAME MATCHING below)
 *
 * Click the mark to change or clear the remembered RSN.
 *
 * When a mark comes out "?", the reason is in its tooltip and on one
 * "[quest status]" console line — including sample quest names from the
 * response, which is what tells you a name-matching problem from a lookup one.
 */
(function () {
  'use strict';

  var RSN_KEY = 'osrs-qs:rsn';
  var CACHE_KEY = 'osrs-qs:cache';
  var CACHE_TTL_MS = 15 * 60 * 1000;
  var MARK_CLASS = 'osrs-qs-mark';

  // WikiSync quest states.
  var NOT_STARTED = 0;
  var IN_PROGRESS = 1;
  var COMPLETE = 2;

  // ---------- storage helpers (never throw: private mode, blocked storage) ----------

  function readLocal(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function writeLocal(key, value) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch (e) {
      /* nothing we can do; the script still works for this page view */
    }
  }

  function plausibleRsn(value) {
    // RSNs are 1-12 chars of letters, digits, space, underscore or hyphen.
    return typeof value === 'string' && /^[A-Za-z0-9 _-]{1,12}$/.test(value.trim());
  }

  /**
   * The RSN to look up. Prefers one this script was told explicitly, then tries
   * to reuse whatever the wiki itself already stored for its own checkmarks.
   * That second step is best-effort: the wiki's storage key is not contracted
   * anywhere, so it is a scan for a plausible-looking value rather than a
   * lookup of one known key.
   */
  function findRsn() {
    var own = readLocal(RSN_KEY);
    if (plausibleRsn(own)) return own.trim();

    var keys = [];
    try {
      for (var i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
    } catch (e) {
      return null;
    }
    // Only fields that unambiguously mean "player name". "name" and "user" are
    // deliberately absent: they are common enough in unrelated blobs (a skin,
    // a locale) that trusting them risks looking up a bogus RSN on every page.
    var FIELDS = ['rsn', 'username', 'userName', 'displayName', 'player', 'playerName'];
    for (var k = 0; k < keys.length; k++) {
      var key = keys[k];
      if (!key || key.indexOf('osrs-qs:') === 0) continue;
      var raw = readLocal(key);
      if (!raw) continue;

      // A bare string is only evidence when the key itself names an RSN —
      // otherwise short unrelated values ("dark", "en") would qualify.
      if (plausibleRsn(raw) && /rsn|user(name)?|player|display.?name/i.test(key)) {
        return raw.trim();
      }

      // A JSON object with an RSN-ish field is evidence on its own, whatever
      // the key is called — the wiki's own key name is not contracted anywhere.
      var parsed = null;
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        continue;
      }
      if (!parsed || typeof parsed !== 'object') continue;
      for (var f = 0; f < FIELDS.length; f++) {
        if (plausibleRsn(parsed[FIELDS[f]])) return String(parsed[FIELDS[f]]).trim();
      }
    }
    return null;
  }

  // ---------- fetching ----------

  /**
   * GET JSON. Prefers the manager's cross-origin request API so a missing CORS
   * header on sync.runescape.wiki cannot break the script, and falls back to
   * plain fetch when the manager grants no such API.
   */
  function getJson(url) {
    var gmRequest = null;
    if (typeof GM !== 'undefined' && GM && typeof GM.xmlHttpRequest === 'function') {
      gmRequest = function (options) {
        GM.xmlHttpRequest(options);
      };
    } else if (typeof GM_xmlhttpRequest === 'function') {
      gmRequest = GM_xmlhttpRequest;
    }

    if (!gmRequest) {
      return fetch(url, { mode: 'cors', headers: { Accept: 'application/json' } }).then(
        function (response) {
          if (!response.ok) throw new Error('HTTP ' + response.status);
          return response.json();
        },
      );
    }

    return new Promise(function (resolve, reject) {
      gmRequest({
        method: 'GET',
        url: url,
        headers: { Accept: 'application/json' },
        onload: function (response) {
          if (response.status < 200 || response.status >= 300) {
            reject(new Error('HTTP ' + response.status));
            return;
          }
          try {
            resolve(JSON.parse(response.responseText));
          } catch (e) {
            reject(new Error('Unreadable response'));
          }
        },
        onerror: function () {
          reject(new Error('Request failed'));
        },
        ontimeout: function () {
          reject(new Error('Request timed out'));
        },
      });
    });
  }

  /**
   * `{ quests, raw }` for `rsn`, from cache when it is fresh — `raw` is the
   * whole response, kept only so a failed match can be diagnosed against it,
   * and null on a cache hit (only the quest map is stored, not the profile).
   */
  function loadQuests(rsn) {
    var cached = null;
    try {
      cached = JSON.parse(readLocal(CACHE_KEY) || 'null');
    } catch (e) {
      cached = null;
    }
    if (
      cached &&
      cached.rsn === rsn &&
      cached.quests &&
      typeof cached.fetchedAt === 'number' &&
      Date.now() - cached.fetchedAt < CACHE_TTL_MS
    ) {
      return Promise.resolve({ quests: cached.quests, raw: null });
    }

    var url =
      'https://sync.runescape.wiki/runelite/player/' + encodeURIComponent(rsn) + '/STANDARD';
    return getJson(url).then(function (data) {
      var quests = data && typeof data.quests === 'object' && data.quests ? data.quests : null;
      if (!quests) {
        // Name what did come back: if the field ever moves or is renamed, that
        // is the one fact needed to fix this.
        var top = data && typeof data === 'object' ? Object.keys(data).join(', ') : typeof data;
        throw new Error('no "quests" field in the WikiSync response (top-level: ' + top + ')');
      }
      writeLocal(CACHE_KEY, JSON.stringify({ rsn: rsn, fetchedAt: Date.now(), quests: quests }));
      return { quests: quests, raw: data };
    });
  }

  // ---------- NAME MATCHING ----------

  /**
   * Reduce a quest name to lowercase alphanumerics, so identifying the quest
   * never depends on how the two sides happen to punctuate it. That covers
   * display names ("Cook's Assistant"), enum-style keys ("COOKS_ASSISTANT"),
   * subpage titles ("Recipe for Disaster/Another Cook's Quest") and curly
   * apostrophes alike — all become "cooksassistant". Collision risk between
   * distinct quests is nil, and it costs nothing to be this permissive.
   */
  function normalizeQuestName(name) {
    return String(name)
      .replace(/[‘’ʼ]/g, "'")
      .replace(/\s*\((?:quest|miniquest)\)\s*$/i, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
  }

  /**
   * WikiSync's per-quest value, mapped to one of our states. Numeric 0/1/2 is
   * the shape this was built against, but the response was never confirmed
   * against a live capture, so string states and a plain completed-name list
   * are accepted too rather than silently falling through to "unknown".
   */
  function interpretState(value) {
    if (value === true) return 'complete';
    if (value === false) return 'notStarted';

    var asNumber = typeof value === 'number' ? value : null;
    if (asNumber === null && typeof value === 'string' && /^\d+$/.test(value.trim())) {
      asNumber = Number(value.trim());
    }
    if (asNumber !== null) {
      if (asNumber >= COMPLETE) return 'complete';
      if (asNumber === IN_PROGRESS) return 'started';
      if (asNumber === NOT_STARTED) return 'notStarted';
      return null;
    }

    if (typeof value === 'string') {
      var text = value.trim().toUpperCase().replace(/[\s-]+/g, '_');
      if (/^(FINISHED|COMPLETE|COMPLETED|DONE)$/.test(text)) return 'complete';
      if (/^(IN_PROGRESS|STARTED)$/.test(text)) return 'started';
      if (/^(NOT_STARTED|UNSTARTED|NOT_COMPLETED)$/.test(text)) return 'notStarted';
    }
    return null;
  }

  /**
   * The state of `title` in `quests`, or null when the quest is not there.
   * `quests` is normally a name -> state map; a bare array of completed names
   * is also understood.
   */
  function lookupQuest(quests, title) {
    var wanted = normalizeQuestName(title);
    // Real responses carry junk keys (a "." entry), which normalize to "".
    // Without this an empty name would match one of them.
    if (!wanted) return null;

    if (Array.isArray(quests)) {
      for (var a = 0; a < quests.length; a++) {
        if (normalizeQuestName(quests[a]) === wanted) return 'complete';
      }
      return null;
    }

    var names = Object.keys(quests);
    for (var i = 0; i < names.length; i++) {
      if (normalizeQuestName(names[i]) !== wanted) continue;
      var state = interpretState(quests[names[i]]);
      if (state) return state;
      // Matched the quest but not its value: report the value so the shape can
      // be fixed, rather than pretending the quest is missing.
      throw new Error('Unrecognized quest state ' + JSON.stringify(quests[names[i]]));
    }
    return null;
  }

  // ---------- the page ----------

  function isQuestPage() {
    var body = document.body;
    if (!body || !body.classList.contains('ns-0')) return false;
    // The quest-details infobox is what makes a quest article a quest article.
    return !!document.querySelector('.questdetails, table.questdetails, .infobox-quest');
  }

  function questTitle() {
    var heading = document.getElementById('firstHeading');
    if (!heading) return null;
    // Read a clone so an already-added mark cannot leak into the name.
    var clone = heading.cloneNode(true);
    var marks = clone.querySelectorAll('.' + MARK_CLASS);
    for (var i = 0; i < marks.length; i++) marks[i].remove();
    return clone.textContent.trim();
  }

  var STATES = {
    complete: { text: '✔', color: '#128b12', label: 'Completed' },
    // An ellipsis rather than a half-filled circle: the circle's empty half is
    // invisible at heading size, which reads as a smudge instead of a state.
    started: { text: '…', color: '#b8860b', label: 'Started, not finished' },
    notStarted: { text: '✘', color: '#a11', label: 'Not started' },
    unknown: { text: '?', color: '#777', label: 'Unknown' },
    // Not a state of the quest but of this script: it needs a name to look up,
    // and says so in words, since a bare "?" looked like a failure.
    needsRsn: { text: 'set RSN', color: '#36c', label: 'No RSN set', small: true },
  };

  /**
   * Say why a mark came out "unknown". `details` is logged as an object so the
   * whole WikiSync response can be inspected in devtools without flooding the
   * console — that plus the page title is what identifies a name mismatch.
   */
  function diagnose(reason, details) {
    try {
      console.info('[quest status] ' + reason);
      if (details) console.log('[quest status] details:', details);
    } catch (e) {
      /* no console: the tooltip still carries the reason */
    }
  }

  function render(stateKey, detail) {
    var heading = document.getElementById('firstHeading');
    if (!heading) return;
    var state = STATES[stateKey] || STATES.unknown;

    var mark = heading.querySelector('.' + MARK_CLASS);
    if (!mark) {
      mark = document.createElement('span');
      mark.className = MARK_CLASS;
      mark.style.cssText =
        'margin-left:.45em;font-size:.8em;vertical-align:middle;cursor:pointer;' +
        'font-family:sans-serif;font-weight:bold;';
      mark.addEventListener('click', changeRsn);
      heading.appendChild(mark);
    }
    mark.textContent = state.text;
    mark.style.color = state.color;
    // The word form needs to read as a small control, not as part of the title.
    mark.style.fontSize = state.small ? '.5em' : '.8em';
    mark.style.textDecoration = state.small ? 'underline' : 'none';
    mark.title = state.label + (detail ? ' — ' + detail : '') + '\nClick to change the RSN used.';
  }

  function changeRsn() {
    var current = readLocal(RSN_KEY) || '';
    var next = window.prompt(
      'RSN to check quest completion for (leave empty to forget it):',
      current,
    );
    if (next === null) return;
    next = next.trim();
    if (next && !plausibleRsn(next)) {
      window.alert('"' + next + '" does not look like an RSN.');
      return;
    }
    writeLocal(RSN_KEY, next || null);
    writeLocal(CACHE_KEY, null);
    run();
  }

  function run() {
    if (!isQuestPage()) return;
    var title = questTitle();
    if (!title) return;

    var rsn = findRsn();
    if (!rsn) {
      // Distinct from the other unknowns on purpose: nothing is wrong, the
      // script just needs a name, and a grey "?" gave no hint of that.
      render('needsRsn', 'Click to set the RSN to check');
      diagnose('no RSN set, and none found in localStorage — click "set RSN" on the title', {
        pageTitle: title,
      });
      return;
    }

    render('unknown', 'Checking ' + rsn + '…');
    loadQuests(rsn)
      .then(function (loaded) {
        var quests = loaded.quests;
        var state = lookupQuest(quests, title);
        if (state) {
          render(state, title + ' — ' + rsn);
          return;
        }
        render('unknown', 'Not listed in ' + rsn + "'s quest data");
        // Every quest reading "unknown" almost always means the names on the
        // two sides do not line up, so log both sides and the whole response.
        var names = Array.isArray(quests) ? quests : Object.keys(quests);
        diagnose('no entry for "' + title + '" among ' + names.length + ' quests for ' + rsn, {
          pageTitle: title,
          normalizedPageTitle: normalizeQuestName(title),
          rsn: rsn,
          questCount: names.length,
          sampleNames: names.slice(0, 10),
          response: loaded.raw || { note: 'served from cache', quests: quests },
        });
      })
      .catch(function (error) {
        var message = (error && error.message) || String(error);
        render('unknown', 'Lookup failed for ' + rsn + ': ' + message);
        diagnose('lookup failed for ' + rsn + ': ' + message, {
          pageTitle: title,
          rsn: rsn,
          error: error,
        });
      });
  }

  run();
})();
