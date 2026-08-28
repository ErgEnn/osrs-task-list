// ==UserScript==
// @name         OSRS Wiki — your progress on the page
// @namespace    https://github.com/ErgEnn/osrs-task-list
// @version      1.3.0
// @description  Marks an OSRS wiki page with your own progress from WikiSync: ✔/✘ on a quest page's title for whether you have done it, and on every skill level a recipe or requirement asks for.
// @author       osrs-quest-status
// @homepageURL  https://github.com/ErgEnn/osrs-task-list/tree/main/userscripts
// @downloadURL  https://raw.githubusercontent.com/ErgEnn/osrs-task-list/main/userscripts/osrs-quest-status.user.js
// @updateURL    https://raw.githubusercontent.com/ErgEnn/osrs-task-list/main/userscripts/osrs-quest-status.user.js
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
 * Two marks, both from your WikiSync data (sync.runescape.wiki, keyed by RSN,
 * populated by the WikiSync plugin on RuneLite/HDOS):
 *
 *   1. the quest page's own quest, next to the title — the wiki already ticks
 *      off the quests a page *requires*, but never the page's own;
 *   2. every skill level the page asks for — the Fletching 26 in an item's
 *      creation recipe, and any other {{scp}} requirement — against the level
 *      you actually have.
 *
 * The title mark reads:
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
  var SKILL_CLASS = 'osrs-qs-skill';

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
   * `{ quests, levels, raw }` for `rsn`, from cache when it is fresh — `raw` is
   * the whole response, kept only so a failed match can be diagnosed against
   * it, and null on a cache hit (only quests and levels are stored, not the
   * rest of the profile, which runs to tens of kilobytes).
   */
  function loadPlayer(rsn) {
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
      return Promise.resolve({ quests: cached.quests, levels: cached.levels || {}, raw: null });
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
      var levels = data.levels && typeof data.levels === 'object' ? data.levels : {};
      writeLocal(
        CACHE_KEY,
        JSON.stringify({ rsn: rsn, fetchedAt: Date.now(), quests: quests, levels: levels }),
      );
      return { quests: quests, levels: levels, raw: data };
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

  // ---------- SKILL REQUIREMENTS ----------

  /**
   * Skill requirements rendered on the page, as `{ el, skillText, level }`.
   *
   * The wiki writes these with `{{scp|Skill|Level}}` ("skill clickpic"), which
   * renders a skill icon plus the number — in an item's creation recipe, a
   * quest's requirement list, and so on. Three ways of reading one, most
   * reliable first; nothing is invented when none of them apply, so a page this
   * cannot read is simply left alone.
   *
   * The skill name is captured as free text here and only validated against the
   * player's own skills later, so finding candidates costs no network call.
   */
  function findSkillCandidates(root) {
    var found = [];
    var seen = [];

    function add(el, skillText, levelText) {
      if (!el || !skillText) return;
      // First number only: a cell reading "85 Smithing, 3 bars" asks for 85,
      // and stripping every non-digit would have made that 853.
      var digits = /\d{1,3}/.exec(String(levelText));
      var level = digits ? parseInt(digits[0], 10) : NaN;
      if (!Number.isFinite(level) || level < 1 || level > 99) return;
      if (seen.indexOf(el) !== -1) return;
      seen.push(el);
      found.push({ el: el, skillText: String(skillText).trim(), level: level });
    }

    // 1. The attributes the template exposes for the wiki's own checkers.
    var tagged = root.querySelectorAll('[data-skill]');
    for (var i = 0; i < tagged.length; i++) {
      var el = tagged[i];
      add(el, el.getAttribute('data-skill'), el.getAttribute('data-level') || el.textContent);
    }

    // 2. A clickpic without those attributes: read the icon and the number.
    var pics = root.querySelectorAll('.scp');
    for (var p = 0; p < pics.length; p++) {
      var pic = pics[p];
      if (pic.hasAttribute('data-skill')) continue;
      add(pic, skillNameNear(pic), pic.textContent);
    }

    // 3. Neither: a skill icon followed by a number, inside a table or infobox
    //    only — loose enough to catch a recipe, tight enough not to mark prose.
    var images = root.querySelectorAll('table img[alt], .infobox img[alt]');
    for (var m = 0; m < images.length; m++) {
      var image = images[m];
      var named = skillFromImage(image);
      if (!named) continue;
      var cell = image.closest('td, th, li, span, div');
      if (!cell) continue;
      add(cell, named, cell.textContent);
    }

    return found;
  }

  /** Skill name from an icon's alt/src, e.g. "Fletching icon" or Magic_icon.png. */
  function skillFromImage(image) {
    var alt = image.getAttribute('alt') || '';
    var source = image.getAttribute('src') || '';
    var match = /^\s*([A-Za-z ]+?)\s*icon\s*$/i.exec(alt) || /\/([A-Za-z_]+?)_icon\./i.exec(source);
    return match ? match[1].replace(/_/g, ' ') : null;
  }

  /** The skill an element points at, via a contained icon or skill link. */
  function skillNameNear(el) {
    var image = el.querySelector('img[alt]');
    var named = image ? skillFromImage(image) : null;
    if (named) return named;
    var link = el.querySelector('a[title], a[href^="/w/"]');
    if (!link) return null;
    return (link.getAttribute('title') || decodeURIComponent(link.getAttribute('href').slice(3)))
      .replace(/_/g, ' ')
      .trim();
  }

  /** The player's level in `skillText`, or null when that is not a skill. */
  function levelOf(levels, skillText) {
    var wanted = String(skillText).trim().toLowerCase();
    // The hiscores say "Runecrafting", the game and the wiki say "Runecraft".
    if (wanted === 'runecrafting') wanted = 'runecraft';
    var names = Object.keys(levels);
    for (var i = 0; i < names.length; i++) {
      var name = names[i].toLowerCase();
      if (name === wanted || (name === 'runecraft' && wanted === 'runecrafting')) {
        var level = levels[names[i]];
        return typeof level === 'number' && Number.isFinite(level) ? level : null;
      }
    }
    return null;
  }

  /** Put a ✔/✘ after each requirement the player's levels can be judged against. */
  function markSkillCandidates(candidates, levels, rsn) {
    var marked = 0;
    var unknown = [];
    for (var i = 0; i < candidates.length; i++) {
      var candidate = candidates[i];
      var have = levelOf(levels, candidate.skillText);
      if (have === null) {
        unknown.push(candidate.skillText);
        continue;
      }
      var met = have >= candidate.level;
      var state = met ? STATES.complete : STATES.notStarted;
      var existing = candidate.el.parentNode
        ? candidate.el.parentNode.querySelector(':scope > .' + SKILL_CLASS)
        : null;
      var mark = existing;
      if (!mark) {
        mark = document.createElement('span');
        mark.className = SKILL_CLASS;
        mark.style.cssText = 'margin-left:.3em;font-weight:bold;cursor:help;';
        candidate.el.insertAdjacentElement('afterend', mark);
      }
      mark.textContent = state.text;
      mark.style.color = state.color;
      mark.title =
        candidate.skillText +
        ' ' +
        candidate.level +
        ' — you have ' +
        have +
        ' (' +
        rsn +
        ')' +
        (met ? '' : ', ' + (candidate.level - have) + ' short');
      marked++;
    }
    return { marked: marked, unknown: unknown };
  }

  // ---------- the page ----------

  function isQuestPage() {
    var body = document.body;
    if (!body || !body.classList.contains('ns-0')) return false;
    // The quest-details infobox is what makes a quest article a quest article.
    return !!document.querySelector('.questdetails, table.questdetails, .infobox-quest');
  }

  /**
   * The article's own title, proof against anything other scripts have appended
   * to the heading — this script's own mark, or the task-capture script's
   * "+ Task" button, which otherwise turns the name into "King's Ransom+ Task".
   *
   * MediaWiki's own page config is the authority: it is data, not DOM, so
   * nothing can pollute it. Reading the heading is the fallback, with injected
   * controls stripped out.
   */
  function questTitle() {
    var mediaWiki = null;
    try {
      mediaWiki = typeof mw !== 'undefined' && mw ? mw : null;
    } catch (e) {
      mediaWiki = null;
    }
    if (!mediaWiki) {
      // Sandboxing userscript managers hide page globals behind unsafeWindow.
      try {
        mediaWiki = unsafeWindow.mw;
      } catch (e) {
        mediaWiki = null;
      }
    }
    if (mediaWiki && mediaWiki.config && typeof mediaWiki.config.get === 'function') {
      try {
        var configured = mediaWiki.config.get('wgTitle');
        if (typeof configured === 'string' && configured.trim()) return configured.trim();
      } catch (e) {
        /* fall through to the DOM */
      }
    }

    var heading = document.getElementById('firstHeading');
    if (!heading) return null;
    var clone = heading.cloneNode(true);
    // A wiki heading never natively holds a control, so anything like this was
    // injected by a script — ours or someone else's.
    var injected = clone.querySelectorAll(
      'button, input, select, textarea, .' + MARK_CLASS + ', [class*="osrs-tlc-"]',
    );
    for (var i = 0; i < injected.length; i++) injected[i].remove();
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

  /** Mark the page's own quest, once the data is in. */
  function applyQuestMark(title, quests, rsn, raw) {
    var state = lookupQuest(quests, title);
    if (state) {
      render(state, title + ' — ' + rsn);
      return;
    }
    render('unknown', 'Not listed in ' + rsn + "'s quest data");
    // Every quest reading "unknown" almost always means the names on the two
    // sides do not line up, so log both sides and the whole response.
    var names = Array.isArray(quests) ? quests : Object.keys(quests);
    diagnose('no entry for "' + title + '" among ' + names.length + ' quests for ' + rsn, {
      pageTitle: title,
      normalizedPageTitle: normalizeQuestName(title),
      rsn: rsn,
      questCount: names.length,
      sampleNames: names.slice(0, 10),
      response: raw || { note: 'served from cache', quests: quests },
    });
  }

  function run() {
    var content = document.querySelector('#mw-content-text .mw-parser-output');
    var onQuestPage = isQuestPage();
    var title = onQuestPage ? questTitle() : null;
    // Found before any request, so a page with nothing to mark costs nothing.
    var candidates = content ? findSkillCandidates(content) : [];

    if ((!onQuestPage || !title) && candidates.length === 0) return;

    var rsn = findRsn();
    if (!rsn) {
      // Distinct from the other unknowns on purpose: nothing is wrong, the
      // script just needs a name, and a grey "?" gave no hint of that.
      if (onQuestPage && title) {
        render('needsRsn', 'Click to set the RSN to check');
      }
      diagnose('no RSN set, and none found in localStorage — click "set RSN" on a quest title', {
        pageTitle: title,
        skillRequirementsFound: candidates.length,
      });
      return;
    }

    if (onQuestPage && title) render('unknown', 'Checking ' + rsn + '…');
    loadPlayer(rsn)
      .then(function (loaded) {
        if (onQuestPage && title) applyQuestMark(title, loaded.quests, rsn, loaded.raw);

        if (candidates.length === 0) return;
        var result = markSkillCandidates(candidates, loaded.levels, rsn);
        if (result.marked === 0) {
          diagnose(
            'found ' +
              candidates.length +
              ' skill requirement(s) but none named a skill in ' +
              rsn +
              "'s levels",
            {
              names: result.unknown.slice(0, 10),
              knownSkills: Object.keys(loaded.levels),
            },
          );
        }
      })
      .catch(function (error) {
        var message = (error && error.message) || String(error);
        if (onQuestPage && title) {
          render('unknown', 'Lookup failed for ' + rsn + ': ' + message);
        }
        diagnose('lookup failed for ' + rsn + ': ' + message, {
          pageTitle: title,
          rsn: rsn,
          error: error,
        });
      });
  }

  run();
})();
