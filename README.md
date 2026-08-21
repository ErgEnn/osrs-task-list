# Old School Task List

A client-side-rendered SPA todo tracker skinned like the Old School RuneScape
interface. Two views over the same tasks:

- **Board** — jira-style columns (*To do / In progress / Completed*) with
  drag & drop reordering and cross-column moves.
- **Progression** — a Minecraft-advancements-style dependency graph: a task's
  dependencies sit above it, connected with right-angle pipes; pan by
  dragging, zoom with the wheel, click a tile to edit.

Tasks are typed — **collect item**, **level up**, **quest**, **kill**,
**collection log**, **combat achievement** — and carry an icon, title, status,
description, and dependencies. Everything is stored in `localStorage`; no
backend.

## Standout behavior

- **Auto level chains** — level-up tasks of one skill automatically depend on
  the nearest lower-level task of that skill (Herblore 50 auto-depends on
  Herblore 30). These edges are *derived*, never stored: delete the middle of
  a chain and it re-links itself. They render gold in the graph.
- **Quest requirement import** — on a quest task, one click fetches the quest
  page's wikitext, parses `{{Quest details}}` requirements (skill clickpics +
  quest links filtered against the real quest list), then links-or-creates the
  dependency tasks.
- **WikiSync auto-completion** — enter your username in settings and refresh
  (manually or on an interval): quest tasks whose quest is complete and level
  tasks whose level you've reached get promoted to *Completed*. Requires the
  character to have logged in with the [WikiSync](https://oldschool.runescape.wiki/w/RuneScape:WikiSync)
  plugin (RuneLite/HDOS). Promotion only — a sync never un-completes a task.
- **Icon pipeline** — icons come from the OSRS wiki, but are **never
  hotlinked** in normal operation: image bytes are fetched once over CORS
  through a polite one-at-a-time queue, converted to data URLs, and cached in
  `localStorage` (byte-capped LRU). Item searches use the realtime-prices item
  mapping (cached locally) so suggestions are instant. If a CORS fetch fails,
  item icons degrade to a lazily-loaded `Special:FilePath` hotlink, then to a
  drawn badge.

## Development

```bash
npm ci
npm run fetch-assets   # one-time: vendored fonts + skill icons (see Licenses)
npm run dev            # vite dev server
npm test               # vitest (pure logic + API clients against fixtures)
npm run lint
npm run build          # tsc -b && vite build → dist/
npm run e2e            # playwright smoke against the built app, network mocked
```

`npm run e2e` builds nothing itself — run `npm run build` first. To use a
system Chromium instead of downloading browsers: `CHROMIUM_PATH=/path/to/chromium npm run e2e`.

## Deployment

`.github/workflows/deploy.yml` builds and publishes `dist/` to GitHub Pages on
every push to `main`. One-time repo setup: **Settings → Pages → Source →
"GitHub Actions"**. The Vite `base: './'` keeps the bundle path-relative, so
it works from the `/osrs-task-list/` project path.

## Architecture

```
src/domain    pure logic: task types, auto level-dep derivation, cycle guard, search
src/store     zustand stores; tasks persist to localStorage (osrs-tl:tasks, versioned)
src/api       wiki / prices / wikisync clients + request queue (+ __fixtures__ for tests)
src/icons     icon cache (own localStorage key) + resolution service + useIcon hook
src/board     dnd-kit kanban        src/graph  custom SVG layered-DAG layout + pan/zoom
src/editor    task editor modal, icon picker, autocompletes
src/quests    {{Quest details}} wikitext parser + requirement import
src/sync      WikiSync refresh service + auto-refresh hook
src/settings  settings modal, JSON export/import backup
```

Board order is the source of truth as per-status id arrays; a `reconcile()`
pass repairs any drift on rehydrate/import. Dependency cycles are prevented on
manual adds and sanitized deterministically after edits (auto edges always
win; the offending explicit edge is dropped with a toast).

### localStorage keys

| Key | Content |
| --- | --- |
| `osrs-tl:tasks` | tasks + column order (zustand persist, versioned) |
| `osrs-tl:settings` | username, auto-refresh interval, active view |
| `osrs-tl:icon-cache:v1` | data-URL icon cache (LRU, ~2.5 MB cap) |
| `osrs-tl:item-mapping:v1` | slimmed item list for instant search (7-day TTL) |
| `osrs-tl:quest-list:v1` | quest titles from Category:Quests (7-day TTL) |

Use **Settings → Export tasks** for backups; import replaces all tasks after
confirmation.

## Live-wiki verification checklist

The dev container that built this cannot reach `*.runescape.wiki`, so all API
clients are tested against recorded fixtures. After `npm run dev`, verify once
in a real browser:

1. **Icon caching** — create a *Collect item* task, pick "Abyssal whip" from
   the autocomplete. The icon should appear within a couple of seconds and
   `osrs-tl:icon-cache:v1` should grow (DevTools → Application → Local
   Storage). Reload: the icon must render with **no** request to the wiki.
2. **CORS fallback** — if icons never cache and the console shows CORS errors
   for `oldschool.runescape.wiki/images/...`, the wiki stopped sending CORS
   headers on images; items should still display via the `Special:FilePath`
   hotlink fallback. (Metadata calls to `api.php` carry `origin=*` and must
   succeed regardless.)
3. **Monster thumbs** — a *Kill* task for "Zulrah" gets the page thumbnail.
4. **Quest import** — on a "Lunar Diplomacy" quest task, *Import requirements
   from wiki* should create/link 7 level tasks and 4 quest tasks.
5. **WikiSync** — set a username whose character has the plugin enabled and
   *Refresh now*; check quest/level tasks complete. If the response shape
   drifted, update `src/api/__fixtures__/wikisync-player.json` from DevTools
   and adjust `isWikiSyncPlayer`.
6. **Rate limiting** — bulk-create ~20 item tasks; requests should trickle
   (≈1 per 300 ms) without 429s.

## Licenses & attribution

- App code: no license declared yet (private project default).
- **Fonts**: [RuneStar/fonts](https://github.com/RuneStar/fonts) — CC0-1.0,
  exact recreations of the in-game fonts. Vendored in `src/assets/fonts/`.
- **Skill icons**: [RuneLite](https://github.com/runelite/runelite)
  (`runelite-client` resources) — BSD-2-Clause, © RuneLite contributors.
  Vendored in `src/assets/skills/` via `npm run fetch-assets`.
- Item/monster images fetched at runtime come from the
  [OSRS Wiki](https://oldschool.runescape.wiki) (CC BY-NC-SA 3.0); they are
  cached locally in your browser only.
- Old School RuneScape is a trademark of Jagex Ltd. This is a fan-made tool,
  unaffiliated with Jagex.
