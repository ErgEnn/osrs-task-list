# Standalone wiki userscripts

Personal OSRS wiki quality-of-life scripts that have **nothing to do with the
task list app**. They are kept here rather than in `public/` on purpose: nothing
in this directory is part of the Vite build, so none of it is published with the
app or referenced from its Settings panel.

Install by opening the `.user.js` file's raw content and pasting it into your
userscript manager (Greasemonkey / Tampermonkey / Violentmonkey). There is no
install URL, since these are not deployed anywhere.

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
| ? (grey) | No RSN set yet, the lookup failed, or that quest name is not in your data |

The wiki already ticks off the *required* quests listed on the page; the page's
own quest is the one thing that never gets a mark, which is the gap this fills.
It reads the same by-username dataset:
`https://sync.runescape.wiki/runelite/player/<rsn>/STANDARD`, whose `quests`
field maps a quest name to `0` (not started), `1` (in progress) or `2`
(complete). That data only exists for characters that have logged in with the
[WikiSync](https://oldschool.runescape.wiki/w/RuneScape:WikiSync) plugin on
RuneLite/HDOS. The script only ever reads it.

**Which RSN.** It prefers one you set explicitly (click the mark to set, change
or clear it, stored under `osrs-qs:rsn`). Failing that it tries to reuse an RSN
the wiki itself has already stored, by scanning `localStorage` for a plausible
value — a bare string only when the key name mentions an RSN, or any JSON object
carrying an `rsn`/`username`-style field. That scan is best-effort: the wiki's
own storage key is not contracted anywhere, so if it comes up empty just click
the mark and type the name once.

Responses are cached in `localStorage` (`osrs-qs:cache`) for 15 minutes, so
browsing a chain of quest pages costs one request; changing the RSN clears it.

### Caveats worth knowing

Two things could not be checked against the live site, because the container
this was written in is blocked from reaching `*.runescape.wiki`:

- **Quest-page detection** assumes the quest-details infobox matches
  `.questdetails, table.questdetails, .infobox-quest`. If the wiki's markup
  differs, no mark appears at all (it fails closed, never mis-marks).
- **The RSN auto-discovery** above is a heuristic, not a known key.

Both were exercised in a headless browser against mock pages and mocked
WikiSync responses. Everything else — the four states, name matching across
case and curly apostrophes, caching, failure handling — is verified there.

Miniquests may legitimately be missing from the dataset and show `?`.
