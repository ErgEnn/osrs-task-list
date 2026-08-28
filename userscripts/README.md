# Standalone wiki userscripts

Personal OSRS wiki quality-of-life scripts that have **nothing to do with the
task list app**. They are kept here rather than in `public/` on purpose: nothing
in this directory is part of the Vite build, so none of it is published with the
app or referenced from its Settings panel.

**Install** by opening the script's raw URL — userscript managers
(Tampermonkey / Violentmonkey / Greasemonkey) intercept a `.user.js` link and
offer to install it:

<https://raw.githubusercontent.com/ErgEnn/osrs-task-list/main/userscripts/osrs-quest-status.user.js>

Each script points its `@updateURL` at that same raw address, so once installed
it follows `main` and later fixes arrive on their own. Pasting the source into
the manager by hand also works, and keeps update checks as long as the header
comes with it — but a copy without the header will never update.

Note this serves from `main` rather than from the app's Pages site: these
scripts stay out of the Vite build, so they are versioned here without being
published with the app.

> Not to be confused with `public/osrs-task-capture.user.js`, which *is* part of
> the app and is handed out from its Settings panel.

## `osrs-quest-status.user.js`

On an OSRS wiki **quest page**, marks the article title with your own completion
state for that quest:

| Mark | Meaning |
| --- | --- |
| ✔ (green) | Completed |
| … (amber) | Started, not finished |
| ✘ (red) | Not started |
| ? (grey) | The lookup failed, or that quest name is not in your data |
| set RSN (blue link) | No RSN known yet — click it and type one |

The wiki already ticks off the *required* quests listed on the page; the page's
own quest is the one thing that never gets a mark, which is the gap this fills.
It reads the same by-username dataset:
`https://sync.runescape.wiki/runelite/player/<rsn>/STANDARD`, whose `quests`
field maps a quest name to `0` (not started), `1` (in progress) or `2`
(complete) — confirmed against a real response. That data only exists for
characters that have logged in with the
[WikiSync](https://oldschool.runescape.wiki/w/RuneScape:WikiSync) plugin on
RuneLite/HDOS. The script only ever reads it.

**Matching the name.** Both sides are reduced to lowercase alphanumerics, so
punctuation never decides a match. That is what lets the wiki's subpage titles
line up with WikiSync's dashed ones — `Recipe for Disaster/Another Cook's Quest`
against `Recipe for Disaster - Another Cook's Quest` — and makes curly
apostrophes in headings a non-issue. Values are read leniently too (numbers,
numeric strings, `FINISHED`-style strings, or a bare list of completed names),
so a change of shape degrades to `?` with an explanation rather than a wrong
mark.

**Which RSN.** It prefers one you set explicitly (click the mark to set, change
or clear it, stored under `osrs-qs:rsn`). Failing that it tries to reuse an RSN
the wiki itself has already stored, by scanning `localStorage` for a plausible
value — a bare string only when the key name mentions an RSN, or any JSON object
carrying an `rsn`/`username`-style field. That scan is best-effort: the wiki's
own storage key is not contracted anywhere, so if it comes up empty just click
the mark and type the name once.

Responses are cached in `localStorage` (`osrs-qs:cache`) for 15 minutes, so
browsing a chain of quest pages costs one request; changing the RSN clears it.

### Running alongside the capture userscript

Both scripts append to the article heading, so both read the article's title
from MediaWiki's own page config (`wgTitle`) rather than from the heading's
text, falling back to a heading read with injected controls stripped. Without
that they corrupt each other: the capture script's *+ Task* button turned the
quest name into `King's Ransom+ Task` (so every quest read `?`), and the tick
turned captured task names into `King's Ransom✔`. Both directions are covered
by tests, in both load orders.

### When a mark says `?`

Hover it: the tooltip names the reason. There is also one `[quest status]`
console line, followed by a details object carrying the page title, the
normalized form of it, the quest count and the full WikiSync response — between
them those identify a name mismatch versus a failed request immediately.

### Caveats worth knowing

The response shape is confirmed against a real capture. One thing still is not,
because the container this was written in is blocked from reaching
`*.runescape.wiki`:

- **Quest-page detection** assumes the quest-details infobox matches
  `.questdetails, table.questdetails, .infobox-quest`. If the wiki's markup
  differs, no mark appears at all — it fails closed, never mis-marks.

The **RSN auto-discovery** is likewise a heuristic rather than a known key, so
expect to click *set RSN* once. That is not a failure state, which is why it
says so in words instead of showing a `?`.

Everything else is exercised in a headless browser against mock pages and mocked
responses, including 11 titles from a real capture: all states, the subpage and
apostrophe cases above, caching, junk keys, unreadable values and failed
lookups.

Miniquests may legitimately be missing from the dataset and show `?`.
