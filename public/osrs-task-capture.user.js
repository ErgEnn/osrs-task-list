// ==UserScript==
// @name         OSRS Task List — wiki capture
// @namespace    https://github.com/ErgEnn/osrs-task-list
// @version      1.2.0
// @description  Adds "add task" buttons to Old School RuneScape Wiki articles and article links, sending pages to your OSRS Task List as new tasks.
// @author       osrs-task-list
// @homepageURL  https://github.com/ErgEnn/osrs-task-list
// @downloadURL  https://ergenn.github.io/osrs-task-list/osrs-task-capture.user.js
// @updateURL    https://ergenn.github.io/osrs-task-list/osrs-task-capture.user.js
// @match        https://oldschool.runescape.wiki/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

/*
 * How it works: the task list app lives on a different origin, so this script
 * cannot write into its localStorage. Instead it collects the task details in
 * a modal here on the wiki, encodes them as base64url JSON, and opens
 * `<app>#/capture?d=<data>` — the app imports it (src/capture) and clears the
 * fragment. Captures share one named tab, so adding ten tasks from one article
 * reuses that tab rather than opening ten.
 *
 * Settings → Wiki capture userscript in the app hands out a copy of this file
 * already pointed at that deployment.
 */
(function () {
  'use strict';

  var DEFAULT_APP_URL = 'https://ergenn.github.io/osrs-task-list/';
  var APP_URL_KEY = 'osrs-tlc:app-url';
  var APP_WINDOW_NAME = 'osrs-task-list-capture';
  var MAX_LINK_BUTTONS = 3000;

  var SKILLS = [
    'Attack', 'Strength', 'Defence', 'Ranged', 'Prayer', 'Magic', 'Runecraft',
    'Construction', 'Hitpoints', 'Agility', 'Herblore', 'Thieving', 'Crafting',
    'Fletching', 'Slayer', 'Hunter', 'Mining', 'Smithing', 'Fishing', 'Cooking',
    'Firemaking', 'Woodcutting', 'Farming',
  ];

  var KINDS = [
    ['item', 'Collect item'],
    ['level', 'Level up'],
    ['quest', 'Quest'],
    ['activity', 'Activity'],
    ['kill', 'Kill'],
    ['clog', 'Collection log'],
    ['ca', 'Combat achievement'],
  ];

  var STATUSES = [
    ['todo', 'To do'],
    ['inprogress', 'In progress'],
    ['done', 'Completed'],
  ];

  function getAppUrl() {
    try {
      return localStorage.getItem(APP_URL_KEY) || DEFAULT_APP_URL;
    } catch (e) {
      return DEFAULT_APP_URL;
    }
  }

  function setAppUrl(url) {
    try {
      if (url && url !== DEFAULT_APP_URL) localStorage.setItem(APP_URL_KEY, url);
      else localStorage.removeItem(APP_URL_KEY);
    } catch (e) {
      /* private browsing etc. — the default still works */
    }
  }

  function base64UrlEncode(text) {
    var bytes = new TextEncoder().encode(text);
    var binary = '';
    for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function captureUrl(envelope) {
    var base = getAppUrl().split('#')[0];
    return base + '#/capture?d=' + base64UrlEncode(JSON.stringify(envelope));
  }

  function normalizeSkill(name) {
    var lower = String(name).trim().toLowerCase();
    if (lower === 'runecrafting') return 'Runecraft';
    for (var i = 0; i < SKILLS.length; i++) {
      if (SKILLS[i].toLowerCase() === lower) return SKILLS[i];
    }
    return null;
  }

  /** Best-effort task type from the current article's DOM; links fall back to heuristics on the title alone. */
  function guessKind(title, useDom) {
    if (normalizeSkill(title)) return 'level';
    if (useDom) {
      if (document.querySelector('table.questdetails, .questdetails')) return 'quest';
      if (document.querySelector('.infobox-minigame, .infobox-activity')) return 'activity';
      if (document.querySelector('.infobox-monster')) return 'kill';
      if (document.querySelector('.infobox-item')) return 'item';
    }
    return 'item';
  }

  function articleUrlFor(title) {
    return (
      location.origin + '/w/' + encodeURIComponent(title.replace(/ /g, '_')).replace(/%2F/g, '/')
    );
  }

  // ---------- styles ----------

  var css =
    '.osrs-tlc-titlebtn{margin-left:.5em;vertical-align:middle;cursor:pointer;' +
    'font-size:.45em;font-weight:bold;font-family:sans-serif;padding:3px 10px;border-radius:3px;' +
    'border:1px solid #5a4634;background:#3e3529;color:#ff981f;}' +
    '.osrs-tlc-titlebtn:hover{background:#4d4234;}' +
    '.osrs-tlc-linkbtn{display:inline-block;cursor:pointer;margin:0 1px 0 2px;padding:0 4px;' +
    'font-size:10px;line-height:13px;font-weight:bold;font-family:sans-serif;vertical-align:super;' +
    'border:1px solid #5a4634;border-radius:3px;background:#3e3529;color:#ff981f;opacity:.45;}' +
    'a:hover+.osrs-tlc-linkbtn,.osrs-tlc-linkbtn:hover{opacity:1;}' +
    '.osrs-tlc-overlay{position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.6);' +
    'display:flex;align-items:center;justify-content:center;}' +
    '.osrs-tlc-modal{width:420px;max-width:92vw;max-height:90vh;overflow:auto;' +
    'background:#28221d;color:#d8ccb4;border:2px solid #5a4634;border-radius:4px;' +
    'font-family:sans-serif;font-size:14px;box-shadow:0 8px 30px rgba(0,0,0,.7);}' +
    '.osrs-tlc-modal *{box-sizing:border-box;}' +
    '.osrs-tlc-head{display:flex;align-items:center;justify-content:space-between;' +
    'padding:10px 14px;border-bottom:1px solid #5a4634;background:#3e3529;}' +
    '.osrs-tlc-head b{color:#ff981f;font-size:15px;}' +
    '.osrs-tlc-close{cursor:pointer;border:none;background:none;color:#d8ccb4;font-size:18px;line-height:1;}' +
    '.osrs-tlc-body{padding:12px 14px;display:flex;flex-direction:column;gap:10px;}' +
    '.osrs-tlc-page{font-size:12px;color:#a99f8a;word-break:break-all;}' +
    '.osrs-tlc-field{display:flex;flex-direction:column;gap:3px;}' +
    '.osrs-tlc-field>span{font-size:12px;color:#a99f8a;}' +
    '.osrs-tlc-row{display:flex;gap:10px;}.osrs-tlc-row>.osrs-tlc-field{flex:1;}' +
    '.osrs-tlc-modal input,.osrs-tlc-modal select,.osrs-tlc-modal textarea{' +
    'width:100%;padding:5px 7px;border:1px solid #5a4634;border-radius:3px;' +
    'background:#1d1812;color:#d8ccb4;font-size:13px;font-family:inherit;}' +
    '.osrs-tlc-modal textarea{resize:vertical;min-height:52px;}' +
    '.osrs-tlc-foot{display:flex;align-items:center;gap:8px;padding:10px 14px;' +
    'border-top:1px solid #5a4634;}' +
    '.osrs-tlc-submit{margin-left:auto;cursor:pointer;padding:6px 16px;border-radius:3px;' +
    'font-weight:bold;border:1px solid #5a4634;background:#ff981f;color:#28221d;}' +
    '.osrs-tlc-submit:hover{background:#ffb045;}' +
    '.osrs-tlc-gear{cursor:pointer;border:1px solid #5a4634;border-radius:3px;' +
    'background:#3e3529;color:#d8ccb4;padding:5px 9px;}' +
    '.osrs-tlc-settings{display:none;}' +
    '.osrs-tlc-settings.osrs-tlc-open{display:block;}';

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // ---------- modal ----------

  var overlay = null;

  function field(labelText, control) {
    var wrap = document.createElement('label');
    wrap.className = 'osrs-tlc-field';
    var span = document.createElement('span');
    span.textContent = labelText;
    wrap.appendChild(span);
    wrap.appendChild(control);
    return wrap;
  }

  function makeSelect(options, value) {
    var select = document.createElement('select');
    options.forEach(function (pair) {
      var opt = document.createElement('option');
      opt.value = pair[0];
      opt.textContent = pair[1];
      select.appendChild(opt);
    });
    select.value = value;
    return select;
  }

  function makeInput(type, value, attrs) {
    var input = document.createElement('input');
    input.type = type;
    input.value = value;
    Object.keys(attrs || {}).forEach(function (k) {
      input.setAttribute(k, attrs[k]);
    });
    return input;
  }

  function closeModal() {
    if (overlay) {
      overlay.remove();
      overlay = null;
      document.removeEventListener('keydown', onEscape, true);
    }
  }

  function onEscape(event) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      closeModal();
    }
  }

  /** Kind-specific inputs; each returns {node, payload()} where payload() may return an error string. */
  function kindFields(kind, pageTitle) {
    if (kind === 'item') {
      var itemName = makeInput('text', pageTitle, {});
      var quantity = makeInput('number', '', { min: '1', step: '1', placeholder: 'optional' });
      var row = document.createElement('div');
      row.className = 'osrs-tlc-row';
      row.appendChild(field('Item', itemName));
      row.appendChild(field('Quantity', quantity));
      return {
        node: row,
        payload: function () {
          if (!itemName.value.trim()) return 'Item name is required.';
          var item = { kind: 'item', itemName: itemName.value.trim() };
          var qty = Math.round(Number(quantity.value));
          if (quantity.value.trim() && qty >= 1) item.quantity = qty;
          return item;
        },
      };
    }
    if (kind === 'level') {
      var skillPairs = SKILLS.map(function (s) {
        return [s, s];
      });
      var skill = makeSelect(skillPairs, normalizeSkill(pageTitle) || 'Attack');
      var level = makeInput('number', '99', { min: '1', max: '99', step: '1' });
      var levelRow = document.createElement('div');
      levelRow.className = 'osrs-tlc-row';
      levelRow.appendChild(field('Skill', skill));
      levelRow.appendChild(field('Level (1–99)', level));
      return {
        node: levelRow,
        payload: function () {
          return {
            kind: 'level',
            skill: skill.value,
            level: Math.max(1, Math.min(99, Math.round(Number(level.value) || 1))),
          };
        },
      };
    }
    if (kind === 'activity') {
      var activity = makeInput('text', pageTitle, {});
      var times = makeInput('number', '', { min: '1', step: '1', placeholder: 'optional' });
      var actRow = document.createElement('div');
      actRow.className = 'osrs-tlc-row';
      actRow.appendChild(field('Activity / minigame', activity));
      actRow.appendChild(field('Times', times));
      return {
        node: actRow,
        payload: function () {
          if (!activity.value.trim()) return 'Activity name is required.';
          var act = { kind: 'activity', activityName: activity.value.trim() };
          var runs = Math.round(Number(times.value));
          if (times.value.trim() && runs >= 1) act.count = runs;
          return act;
        },
      };
    }
    if (kind === 'kill') {
      var monster = makeInput('text', pageTitle, {});
      var count = makeInput('number', '', { min: '1', step: '1', placeholder: 'optional' });
      var killRow = document.createElement('div');
      killRow.className = 'osrs-tlc-row';
      killRow.appendChild(field('Monster', monster));
      killRow.appendChild(field('Kill count', count));
      return {
        node: killRow,
        payload: function () {
          if (!monster.value.trim()) return 'Monster name is required.';
          var p = { kind: 'kill', monsterName: monster.value.trim() };
          var n = Math.round(Number(count.value));
          if (count.value.trim() && n >= 1) p.count = n;
          return p;
        },
      };
    }
    var label = kind === 'quest' ? 'Quest' : kind === 'clog' ? 'Collection log target' : 'Achievement';
    var key = kind === 'quest' ? 'questName' : kind === 'clog' ? 'target' : 'name';
    var name = makeInput('text', pageTitle, {});
    var node = field(label, name);
    return {
      node: node,
      payload: function () {
        if (!name.value.trim()) return label + ' is required.';
        var p = { kind: kind };
        p[key] = name.value.trim();
        return p;
      },
    };
  }

  function openModal(pageTitle, useDomGuess) {
    closeModal();

    overlay = document.createElement('div');
    overlay.className = 'osrs-tlc-overlay';
    overlay.addEventListener('mousedown', function (event) {
      if (event.target === overlay) closeModal();
    });
    document.addEventListener('keydown', onEscape, true);

    var modal = document.createElement('div');
    modal.className = 'osrs-tlc-modal';

    var head = document.createElement('div');
    head.className = 'osrs-tlc-head';
    var heading = document.createElement('b');
    heading.textContent = 'Add task to OSRS Task List';
    var close = document.createElement('button');
    close.className = 'osrs-tlc-close';
    close.type = 'button';
    close.textContent = '✕';
    close.title = 'Close';
    close.addEventListener('click', closeModal);
    head.appendChild(heading);
    head.appendChild(close);

    var body = document.createElement('div');
    body.className = 'osrs-tlc-body';

    var page = document.createElement('div');
    page.className = 'osrs-tlc-page';
    page.textContent = articleUrlFor(pageTitle);

    var kindSelect = makeSelect(KINDS, guessKind(pageTitle, useDomGuess));
    var kindSlot = document.createElement('div');
    var current = null;
    function renderKind() {
      current = kindFields(kindSelect.value, pageTitle);
      kindSlot.textContent = '';
      kindSlot.appendChild(current.node);
    }
    kindSelect.addEventListener('change', renderKind);
    renderKind();

    var title = makeInput('text', '', { placeholder: 'auto from the fields above' });
    var notes = document.createElement('textarea');
    notes.value = 'From ' + articleUrlFor(pageTitle);
    var statusSelect = makeSelect(STATUSES, 'todo');

    body.appendChild(page);
    body.appendChild(field('Task type', kindSelect));
    body.appendChild(kindSlot);
    body.appendChild(field('Title (optional)', title));
    body.appendChild(field('Notes', notes));
    body.appendChild(field('Status', statusSelect));

    var settingsRow = document.createElement('div');
    settingsRow.className = 'osrs-tlc-settings';
    var appUrlInput = makeInput('text', getAppUrl(), { placeholder: DEFAULT_APP_URL });
    settingsRow.appendChild(field('Task list app URL', appUrlInput));
    body.appendChild(settingsRow);

    var foot = document.createElement('div');
    foot.className = 'osrs-tlc-foot';
    var gear = document.createElement('button');
    gear.type = 'button';
    gear.className = 'osrs-tlc-gear';
    gear.textContent = '⚙';
    gear.title = 'Configure the task list app URL';
    gear.addEventListener('click', function () {
      settingsRow.classList.toggle('osrs-tlc-open');
    });
    var submit = document.createElement('button');
    submit.type = 'button';
    submit.className = 'osrs-tlc-submit';
    submit.textContent = 'Add task';
    submit.addEventListener('click', function () {
      var payload = current.payload();
      if (typeof payload === 'string') {
        alert(payload);
        return;
      }
      setAppUrl(appUrlInput.value.trim());
      var envelope = { v: 1, payload: payload, status: statusSelect.value };
      if (title.value.trim()) envelope.title = title.value.trim();
      if (notes.value.trim()) envelope.description = notes.value.trim();
      // A named target reuses the app tab across captures; focus() brings it
      // forward when the browser only navigated it in the background.
      var appWindow = window.open(captureUrl(envelope), APP_WINDOW_NAME);
      if (appWindow) {
        try {
          appWindow.focus();
        } catch (e) {
          /* cross-origin focus can be refused — the tab still got the capture */
        }
      }
      closeModal();
    });
    foot.appendChild(gear);
    foot.appendChild(submit);

    modal.appendChild(head);
    modal.appendChild(body);
    modal.appendChild(foot);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    kindSelect.focus();
  }

  // ---------- wiring into the wiki page ----------

  // Read once, before addTitleButton appends its own text to the heading.
  var heading = document.getElementById('firstHeading');
  var articleTitle = heading
    ? heading.textContent.trim()
    : document.title.replace(/ - OSRS Wiki.*$/, '');

  function currentArticleTitle() {
    return articleTitle;
  }

  function isCapturableArticle() {
    var cls = document.body.classList;
    return cls.contains('ns-0') && cls.contains('action-view') && !cls.contains('page-Main_Page');
  }

  function addTitleButton() {
    var heading = document.getElementById('firstHeading');
    if (!heading || heading.querySelector('.osrs-tlc-titlebtn')) return;
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'osrs-tlc-titlebtn';
    button.textContent = '+ Task';
    button.title = 'Add "' + currentArticleTitle() + '" to your OSRS task list';
    button.addEventListener('click', function () {
      openModal(currentArticleTitle(), true);
    });
    heading.appendChild(button);
  }

  /** Article title from a /w/ link, or null when the link shouldn't get a button. */
  function linkTitle(anchor) {
    var href = anchor.getAttribute('href') || '';
    if (href.indexOf('/w/') !== 0 || href.indexOf('?') !== -1) return null;
    var path = href.slice(3).split('#')[0];
    if (!path) return null;
    var title;
    try {
      title = decodeURIComponent(path).replace(/_/g, ' ').trim();
    } catch (e) {
      return null;
    }
    // Skip non-mainspace links (File:, Category:, Special:, RuneScape:, …).
    if (!title || title.indexOf(':') !== -1) return null;
    if (title === currentArticleTitle()) return null;
    return title;
  }

  function addLinkButtons() {
    var content = document.querySelector('#mw-content-text .mw-parser-output');
    if (!content) return;
    var anchors = content.querySelectorAll('a[href^="/w/"]');
    var added = 0;
    for (var i = 0; i < anchors.length && added < MAX_LINK_BUTTONS; i++) {
      var anchor = anchors[i];
      if (anchor.classList.contains('new') || anchor.classList.contains('mw-selflink')) continue;
      if (anchor.querySelector('img')) continue; // image links: a button would break the figure
      if (anchor.closest('.mw-editsection, #toc, .toc')) continue;
      if (anchor.nextElementSibling && anchor.nextElementSibling.classList.contains('osrs-tlc-linkbtn'))
        continue;
      var title = linkTitle(anchor);
      if (!title) continue;
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'osrs-tlc-linkbtn';
      button.textContent = '+';
      button.title = 'Add "' + title + '" to your OSRS task list';
      button.dataset.osrsTlcTitle = title;
      anchor.insertAdjacentElement('afterend', button);
      added++;
    }
  }

  // One delegated listener instead of one per button.
  document.addEventListener('click', function (event) {
    var target = event.target;
    if (target && target.classList && target.classList.contains('osrs-tlc-linkbtn')) {
      event.preventDefault();
      event.stopPropagation();
      openModal(target.dataset.osrsTlcTitle, false);
    }
  });

  if (isCapturableArticle()) {
    addTitleButton();
    addLinkButtons();
  }
})();
