# Old School Task List

A client-side-rendered SPA todo tracker skinned like the Old School RuneScape
interface. Two views over the same tasks:

- **Board** — jira-style columns (*To do / In progress / Completed*) with
  drag & drop reordering, cross-column moves, and
  [drag-to-link dependencies](#linking-by-drag).
- **Progression** — a Minecraft-advancements-style dependency graph: a task's
  dependencies sit above it, connected with right-angle pipes; pan by
  dragging, zoom with the wheel, click a tile to edit.

Tasks are typed — **collect item**, **level up**, **quest**, **kill**,
**collection log**, **combat achievement** — and carry an icon, title, status,
description, and dependencies. Everything is stored in `localStorage`; no
backend.

## Standout behavior

- **Linking by drag** — a board drag has two kinds of destination. Drop a card
  *between* two cards (or at either end of a column) and it moves there, as
  before. Drop it *on* another card and it links the two instead: the card's
  upper half makes the dragged card a **prerequisite** of it ("Unlocks this"),
  the lower half makes the dragged card **depend** on it ("Needs this first") —
  the same "prerequisites above" reading as the progression graph. Both halves
  label themselves as the pointer enters the card, and a half that cannot take
  the link says why (*Already linked*, *Would loop*) instead of failing after
  the drop. Dropping never moves *and* links: a link leaves both cards in their
  columns. Keyboard drags only ever reorder — linking without a pointer stays
  the editor's dependency picker.
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
- **Wiki capture** — a [userscript](#wiki-capture-userscript) puts an *add task*
  button next to every OSRS wiki article title and after every article link, so
  a page becomes a typed task without leaving the wiki.
- **Device sync** — write tasks on one machine, play on another. Two routes,
  both built on the same merge: a **transfer code** (or link) you copy across by
  hand, and optional **cloud sync through a private GitHub gist**. See
  [Syncing between devices](#syncing-between-devices).
- **Icon pipeline** — icons come from the OSRS wiki, but are **never
  hotlinked** in normal operation: image bytes are fetched once over CORS
  through a polite one-at-a-time queue, converted to data URLs, and cached in
  `localStorage` (byte-capped LRU). Item searches use the realtime-prices item
  mapping (cached locally) so suggestions are instant. If a CORS fetch fails,
  item icons degrade to a lazily-loaded `Special:FilePath` hotlink, then to a
  drawn badge.

## Syncing between devices

There is still no backend. Both routes move the same *bundle* (tasks + column
order + delete tombstones) and both **merge** — the device you paste into never
loses its own progress.

### Transfer code / link (no account, no token)

On the machine where you wrote the tasks: **Settings → Send tasks to another
device → Copy transfer code** (or *Copy link*). Tick *only tasks changed since
my last send* to carry over just the new ones; dependencies of whatever you send
always come along, so nothing lands half-linked. The code is deflate-compressed
base64url (`OSTL2Z.…`, ~10× smaller than the raw JSON), so a whole board fits in
a chat message.

On the playing machine: paste it into **Receive tasks from another device →
Review & merge**, which first tells you exactly what the merge will do. A
pasted *link* works in that box too, and opening the link merges after the same
prompt. **Merge file…** in the backup section does the same thing from a `.json`
export, for machines that share a folder but not a clipboard.

### Cloud sync (private GitHub gist)

**Settings → Cloud sync**: paste a [personal access
token](https://github.com/settings/tokens/new?scopes=gist) with **only** the
`gist` scope. The first sync creates a secret gist; paste that gist id into the
same panel on your other devices and they all converge. Auto-sync can run every
5/15/60 minutes (and once on load) while the tab is visible.

The token lives in this browser's `localStorage`, like everything else here —
use a token you can revoke, and skip this on a shared machine. The gist is
secret but not encrypted; anyone with its URL can read your task list.

### Merge rules

| Situation | Result |
| --- | --- |
| Task only on one side | Copied over |
| Same task edited on both | Newer `updatedAt` wins, whole record at a time |
| Exactly equal timestamps | The more advanced status wins (`todo` < `inprogress` < `done`) |
| Deleted on the other device | Deleted here too — a tombstone (kept 90 days) travels with the bundle |
| Deleted there, edited here afterwards | The edit wins; the task comes back |
| Column order | Local order kept; new tasks append to the bottom |

Whole-record last-write-wins is deliberate: it means an edit that *removes*
something (a dependency, description text) propagates, instead of a union
quietly resurrecting it. The merge is idempotent and order-independent — syncing
twice, or from either side first, lands on the same tasks.

## Wiki capture userscript

`public/osrs-task-capture.user.js` is a Greasemonkey/Tampermonkey/Violentmonkey
userscript that adds capture buttons to the OSRS wiki:

- a **“+ Task” button next to the article title** on every mainspace article;
- a small **“+” button after every article link** in the page body (visible on
  hover), so linked pages can be captured without navigating to them.

Either button opens a modal on the wiki page itself where you pick the task type
(auto-guessed from the article's infobox), tweak type-specific fields (quantity,
kill count, skill/level…), title, notes, and starting status.

The wiki and the app are different origins, so the script cannot write to the
app's `localStorage` directly. Submitting instead opens
`<app>#/capture?d=<base64url JSON>`, which `src/capture` validates, imports, and
strips from the address bar. Captures share **one named tab**, so working down
an article's links reuses that tab instead of opening one per task — the import
runs on `hashchange` as well as on load. The script remembers its app URL in the
*wiki's* `localStorage` under `osrs-tlc:app-url`.

### Installing it

**Settings → Wiki capture userscript**:

- **Install…** opens the script so your userscript manager offers to install it
  and keeps it updated afterwards.
- **Copy source** puts it on your clipboard, for managers that only take a paste
  — and for reading it before you trust it.

The copied source is **pointed at the app you copied it from**: its default app
URL and its own `@updateURL`/`@downloadURL` are rewritten to that address, so a
fork's Pages site or a `localhost:5173` dev server needs no further setup, and
its update checks won't pull the canonical script over your copy. The file behind
*Install…* is served as-is and therefore targets the canonical deployment, so on
any other deployment the panel points you at *Copy source* instead. Either way
the ⚙ button inside the wiki capture modal can repoint it later.

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
src/capture   #/capture deep-link parsing + import (fed by public/osrs-task-capture.user.js)
src/sync      bundle format, device merge, transfer codes, gist + WikiSync sync
src/settings  settings modal, JSON backup, transfer + cloud-sync panels
```

Board order is the source of truth as per-status id arrays; a `reconcile()`
pass repairs any drift on rehydrate/import. Dependency cycles are prevented on
manual adds and sanitized deterministically after edits (auto edges always
win; the offending explicit edge is dropped with a toast).

### localStorage keys

| Key | Content |
| --- | --- |
| `osrs-tl:tasks` | tasks + column order + delete tombstones (zustand persist, v2) |
| `osrs-tl:settings` | username, refresh intervals, active view, gist token + id |
| `osrs-tl:icon-cache:v1` | data-URL icon cache (LRU, ~2.5 MB cap) |
| `osrs-tl:item-mapping:v1` | slimmed item list for instant search (7-day TTL) |
| `osrs-tl:quest-list:v1` | quest titles from Category:Quests (7-day TTL) |

Use **Settings → Export tasks** for backups; *Import (replace)* swaps all tasks
after confirmation, *Merge file* folds the file in instead. Tasks carry an
`updatedAt` stamp and deletes leave a tombstone — both exist so two devices can
merge; a v1 store is migrated on load (`updatedAt = createdAt`).

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
7. **Wiki capture** — install the userscript from *Settings → Wiki capture
   userscript* (use *Copy source* against a dev server) and open a real article
   such as "Abyssal whip": the *+ Task* button sits by the title and *+* buttons
   trail the body links. Capture two pages in a row — both land in the same app
   tab. Wiki markup varies, so also check a quest page (guessed type *Quest*)
   and that skill pages like "Herblore" guess *Level up*; the DOM classes the
   guess reads (`.infobox-monster`, `.infobox-item`, `.questdetails`) are the
   part most likely to drift.

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
