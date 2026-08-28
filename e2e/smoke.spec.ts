import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

/**
 * Smoke test against the built app with ALL external services mocked —
 * the suite must pass with no network access beyond localhost.
 */

const SEED_TASKS = {
  t1: {
    id: 't1',
    title: 'Herblore 30',
    description: '',
    status: 'done',
    iconRef: { kind: 'builtin', id: 'skill:herblore' },
    payload: { kind: 'level', skill: 'Herblore', level: 30 },
    explicitDeps: [],
    createdAt: 1,
  },
  t2: {
    id: 't2',
    title: 'Herblore 50',
    description: '',
    status: 'todo',
    iconRef: { kind: 'builtin', id: 'skill:herblore' },
    payload: { kind: 'level', skill: 'Herblore', level: 50 },
    explicitDeps: [],
    createdAt: 2,
  },
  t3: {
    id: 't3',
    title: 'Dragon Slayer I',
    description: '',
    status: 'inprogress',
    iconRef: { kind: 'builtin', id: 'badge:quest' },
    payload: { kind: 'quest', questName: 'Dragon Slayer I' },
    explicitDeps: ['t2'],
    createdAt: 3,
  },
};

const SEED = JSON.stringify({
  state: {
    tasks: SEED_TASKS,
    columns: { todo: ['t2'], inprogress: ['t3'], done: ['t1'] },
  },
  version: 1,
});

async function mockExternal(page: Page) {
  await page.route('**/oldschool.runescape.wiki/**', (route) =>
    route.fulfill({ json: { query: {} } }),
  );
  await page.route('**/prices.runescape.wiki/**', (route) => route.fulfill({ json: [] }));
  await page.route('**/sync.runescape.wiki/**', (route) =>
    route.fulfill({ json: { username: 'x', levels: {}, quests: {} } }),
  );
}

test.beforeEach(async ({ page }) => {
  await mockExternal(page);
  await page.addInitScript((seed: string) => {
    // Init scripts run on every navigation — only seed a fresh profile so
    // reload-persistence tests keep user mutations.
    if (!window.localStorage.getItem('osrs-tl:tasks')) {
      window.localStorage.setItem('osrs-tl:tasks', seed);
    }
  }, SEED);
  await page.goto('/');
});

const card = (page: Page, title: string) => page.locator('.task-card', { hasText: title });

type Point = { x: number; y: number };

/** Press on a card and walk the pointer to `to` in small steps, without releasing. */
async function pickUp(page: Page, title: string, to: Point) {
  const box = (await card(page, title).boundingBox())!;
  const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  // Several small steps so the pointer sensor picks up the drag.
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / 10, from.y + ((to.y - from.y) * i) / 10);
  }
}

async function dragCardTo(page: Page, title: string, to: Point) {
  await pickUp(page, title, to);
  await page.mouse.up();
}

/** The reorder gap above a card, the drop zone that links it, and so on. */
async function pointsOf(page: Page, title: string) {
  const box = (await card(page, title).boundingBox())!;
  const x = box.x + box.width / 2;
  // The link zones are inset 8px so the gaps keep the card's edges.
  const inner = { top: box.y + 8, height: box.height - 16 };
  return {
    gapAbove: { x, y: box.y - 4 },
    gapBelow: { x, y: box.y + box.height + 4 },
    upperHalf: { x, y: inner.top + inner.height * 0.25 },
    lowerHalf: { x, y: inner.top + inner.height * 0.75 },
  };
}

/**
 * Switch to the graph after a drop. dnd-kit swallows the first click for 50ms
 * after a drag ends — that suppression is what keeps a drag from opening the
 * editor — and a click sent straight after mouse.up lands inside that window,
 * so wait it out and then check the view actually changed.
 */
async function openProgression(page: Page) {
  const tab = page.getByRole('tab', { name: 'Progression' });
  await page.waitForTimeout(100);
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}

/** Bottom of a column, below the last card: the "drop at the end" fallback. */
async function columnFoot(page: Page, name: RegExp): Promise<Point> {
  const box = (await page.locator('.board__column', { hasText: name }).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height - 20 };
}

test('board renders seeded tasks in their columns', async ({ page }) => {
  await expect(page.getByText('Herblore 50')).toBeVisible();
  await expect(page.getByText(/To do\s*\(1\)/)).toBeVisible();
  await expect(page.getByText(/In progress\s*\(1\)/)).toBeVisible();
  await expect(page.getByText(/Completed\s*\(1\)/)).toBeVisible();
  // Dragon Slayer I depends on unfinished Herblore 50 → padlock shows.
  await expect(page.getByTitle(/Blocked: dependencies/)).toBeVisible();
});

test('dragging a card to another column persists across reload', async ({ page }) => {
  await dragCardTo(page, 'Herblore 50', await columnFoot(page, /Completed/));

  await expect(page.getByText(/Completed\s*\(2\)/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/Completed\s*\(2\)/)).toBeVisible();
});

test('dropping between cards puts the card at that spot', async ({ page }) => {
  const todo = page.locator('.board__column', { hasText: /To do/ });
  const titles = todo.locator('.task-card__title');

  // Into the gap above Herblore 50 — a cross-column move to a chosen slot.
  await dragCardTo(page, 'Dragon Slayer I', (await pointsOf(page, 'Herblore 50')).gapAbove);
  await expect(page.getByText(/To do\s*\(2\)/)).toBeVisible();
  await expect(titles).toHaveText(['Dragon Slayer I', 'Herblore 50']);
  // Linking is a drop *on* a card, so a reorder must not have made one.
  await expect(page.getByTitle(/Blocked: dependencies/)).toHaveCount(1);
  // Cards open the editor on click — a drag must not count as one.
  await expect(page.getByRole('heading', { name: 'Edit task' })).toBeHidden();

  // Back down, into the gap below it: reordering within one column.
  await dragCardTo(page, 'Dragon Slayer I', (await pointsOf(page, 'Herblore 50')).gapBelow);
  await expect(titles).toHaveText(['Herblore 50', 'Dragon Slayer I']);

  await page.reload();
  await expect(titles).toHaveText(['Herblore 50', 'Dragon Slayer I']);
});

test("dropping on a card's upper half makes the dragged card a prerequisite", async ({ page }) => {
  // The label names the card under the pointer, so which card is which is
  // readable mid-drag: Herblore 30 unlocks Dragon Slayer I.
  await pickUp(page, 'Herblore 30', (await pointsOf(page, 'Dragon Slayer I')).upperHalf);
  await expect(page.locator('.board-dep-zone--over')).toHaveText('Unlocks Dragon Slayer I');
  await page.mouse.up();

  await expect(page.getByText('“Dragon Slayer I” now depends on “Herblore 30”.')).toBeVisible();
  // A link, not a move: both cards stayed in their columns.
  await expect(page.getByText(/Completed\s*\(1\)/)).toBeVisible();
  await expect(page.getByText(/In progress\s*\(1\)/)).toBeVisible();

  // The new edge joins the auto level chain and the seeded explicit one.
  await openProgression(page);
  await expect(page.locator('.graph-edge')).toHaveCount(3);
});

test("dropping on a card's lower half makes the dragged card depend on it", async ({ page }) => {
  await pickUp(page, 'Dragon Slayer I', (await pointsOf(page, 'Herblore 30')).lowerHalf);
  await expect(page.locator('.board-dep-zone--over')).toHaveText('Needs Herblore 30 first');
  await page.mouse.up();

  await expect(page.getByText('“Dragon Slayer I” now depends on “Herblore 30”.')).toBeVisible();
  await expect(page.getByText(/In progress\s*\(1\)/)).toBeVisible();
  await openProgression(page);
  await expect(page.locator('.graph-edge')).toHaveCount(3);
});

test('the stats button shows the WikiSync profile in a sidebar', async ({ page }) => {
  await page.route('**/sync.runescape.wiki/**', (route) =>
    route.fulfill({
      json: {
        username: 'Zezima',
        levels: { Attack: 70, Hitpoints: 62, Herblore: 52 },
        quests: { "Cook's Assistant": 2, 'Dragon Slayer I': 1, 'Lunar Diplomacy': 0 },
        achievement_diaries: {
          Varrock: {
            Easy: { complete: true, tasks: [true] },
            Medium: { complete: false, tasks: [] },
          },
        },
        combat_achievements: [1, 2, 3, 4],
      },
    }),
  );
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'osrs-tl:settings',
      JSON.stringify({ state: { username: 'Zezima' }, version: 1 }),
    );
  });
  await page.reload();

  const stats = page.getByRole('complementary', { name: 'Player stats' });
  await expect(stats).toBeHidden();
  await page.getByRole('button', { name: 'Player stats' }).click();

  await expect(stats.getByRole('heading', { name: 'Zezima' })).toBeVisible();
  // 70 + 62 + 52 reported, plus 20 skills left at their base level.
  await expect(stats.getByText('Total')).toBeVisible();
  await expect(stats.getByText('204', { exact: true })).toBeVisible();
  await expect(stats.getByText(/Combat level 38/)).toBeVisible();
  await expect(stats.getByText(/Quests\s*1\/3/)).toBeVisible();
  await expect(stats.getByText('Dragon Slayer I')).toBeVisible();
  await expect(stats.getByText(/Achievement diaries\s*1\/2/)).toBeVisible();
  await expect(stats.getByText('4 task(s) complete')).toBeVisible();

  await stats.getByRole('button', { name: 'Close player stats' }).click();
  await expect(stats).toBeHidden();
});

/** The real shipped bridge userscript, run the way a manager would run it. */
const BRIDGE_SOURCE = readFileSync(
  fileURLToPath(new URL('../public/osrs-wikisync-bridge.user.js', import.meta.url)),
  'utf8',
);

test('the bridge userscript fetches the profile the page cannot', async ({ page }) => {
  let wikiSyncUrl = '';
  await page.route('**/sync.runescape.wiki/**', (route) => {
    wikiSyncUrl = route.request().url();
    return route.fulfill({
      json: { username: 'Zezima', levels: { Attack: 70 }, quests: { 'Druidic Ritual': 2 } },
    });
  });
  // Stand in for the userscript manager: GM.xmlHttpRequest is the one thing it
  // provides that a page cannot do for itself.
  await page.addInitScript(() => {
    (window as unknown as { GM: unknown }).GM = {
      xmlHttpRequest(options: {
        url: string;
        onload: (r: { status: number; responseText: string }) => void;
        onerror: () => void;
      }) {
        void fetch(options.url)
          .then(async (response) => {
            options.onload({ status: response.status, responseText: await response.text() });
          })
          .catch(() => options.onerror());
      },
    };
    window.localStorage.setItem(
      'osrs-tl:settings',
      JSON.stringify({ state: { username: 'Zezima' }, version: 1 }),
    );
  });
  await page.addInitScript(BRIDGE_SOURCE);
  await page.reload();

  // The app must be able to see the bridge before it decides how to fetch.
  await expect(page.locator('html')).toHaveAttribute('data-osrs-tl-wikisync-bridge', /\d+\./);

  await page.getByRole('button', { name: 'Player stats' }).click();
  const stats = page.getByRole('complementary', { name: 'Player stats' });
  await expect(stats.getByRole('heading', { name: 'Zezima' })).toBeVisible();
  await expect(stats.getByText(/Quests\s*1\/1/)).toBeVisible();
  // The bridge built the URL itself, from the username the page sent it.
  expect(wikiSyncUrl).toBe('https://sync.runescape.wiki/runelite/player/Zezima/STANDARD');
});

test('without the bridge, a blocked request says what to do about it', async ({ page }) => {
  // A CORS rejection reaches the page as a failed fetch with no status.
  await page.route('**/sync.runescape.wiki/**', (route) => route.abort('failed'));
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'osrs-tl:settings',
      JSON.stringify({ state: { username: 'Zezima' }, version: 1 }),
    );
  });
  await page.reload();

  await page.getByRole('button', { name: 'Player stats' }).click();
  const stats = page.getByRole('complementary', { name: 'Player stats' });
  await expect(stats.getByText(/Install the WikiSync bridge userscript/)).toBeVisible();

  // …and the paste route still gets the profile in.
  await stats.getByText('Paste the profile instead').click();
  await stats
    .getByPlaceholder('{"username":')
    .fill(JSON.stringify({ username: 'Zezima', levels: { Attack: 70 }, quests: {} }));
  await stats.getByRole('button', { name: 'Use this JSON' }).click();
  await expect(stats.getByText(/Combat level/)).toBeVisible();
});

test('a drop zone that would loop says so and refuses the link', async ({ page }) => {
  // Dragon Slayer I already depends on Herblore 50, so the reverse cannot hold.
  await pickUp(page, 'Herblore 50', (await pointsOf(page, 'Dragon Slayer I')).lowerHalf);
  await expect(page.locator('.board-dep-zone--over')).toHaveText('Would loop');
  await page.mouse.up();

  await expect(page.getByText(/would create a cycle/)).toBeVisible();
  await openProgression(page);
  await expect(page.locator('.graph-edge')).toHaveCount(2);
});

test('graph view lays out tiles with edges; clicking a tile edits it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Progression' }).click();
  await expect(page.locator('.graph-node')).toHaveCount(3);
  // Two edges: auto level chain t1->t2 and explicit t2->t3.
  await expect(page.locator('.graph-edge')).toHaveCount(2);
  await expect(page.locator('.graph-edge--auto')).toHaveCount(1);

  await page.locator('.graph-node', { hasText: 'Dragon Slayer I' }).click();
  await expect(page.getByRole('heading', { name: 'Edit task' })).toBeVisible();
  const title = page.locator('.editor-form input.osrs-input').nth(1); // quest name, then title
  await expect(title).toHaveValue('Dragon Slayer I');
});

/*
 * Seeded chain: Herblore 30 -> Herblore 50 (auto level edge) -> Dragon Slayer I.
 * Pointing at the middle one lights it and what it needs, and mutes what needs
 * it — the same reading in both views.
 */
test('hovering a card lights the chain it needs first and mutes the rest', async ({ page }) => {
  await card(page, 'Herblore 50').hover();
  await expect(page.locator('.board-card--root')).toHaveText(/Herblore 50/);
  await expect(page.locator('.board-card--dep')).toHaveText(/Herblore 30/);
  await expect(page.locator('.board-card--muted')).toHaveText(/Dragon Slayer I/);

  // Pointer off the cards: the board goes back to rest.
  await page.mouse.move(4, 4);
  await expect(page.locator('.board-card--root, .board-card--dep, .board-card--muted')).toHaveCount(
    0,
  );
});

test('hovering a tile lights the chain it needs first and mutes the rest', async ({ page }) => {
  await page.getByRole('tab', { name: 'Progression' }).click();
  await page.locator('.graph-node', { hasText: 'Herblore 50' }).hover();
  await expect(page.locator('.graph-node--root')).toHaveText(/Herblore 50/);
  await expect(page.locator('.graph-node--dep')).toHaveText(/Herblore 30/);
  await expect(page.locator('.graph-node--muted')).toHaveText(/Dragon Slayer I/);
  // The edge into the hovered tile lights; the one leaving it mutes.
  await expect(page.locator('.graph-edge--lit')).toHaveCount(1);
  await expect(page.locator('.graph-edge--muted')).toHaveCount(1);

  await page.mouse.move(4, 4);
  await expect(page.locator('.graph-node--root, .graph-node--dep, .graph-node--muted')).toHaveCount(
    0,
  );
});

test('search filters the board', async ({ page }) => {
  await page.getByLabel('Search tasks').fill('herblore');
  await expect(page.getByText('Herblore 50')).toBeVisible();
  await expect(page.getByText('Dragon Slayer I')).toBeHidden();
  await expect(page.getByText('1 hidden by search')).toBeVisible();
});

test('capture deep link imports a task and clears the hash', async ({ page }) => {
  const capture = {
    v: 1,
    status: 'todo',
    description: 'From https://oldschool.runescape.wiki/w/Zulrah',
    payload: { kind: 'kill', monsterName: 'Zulrah', count: 50 },
  };
  const data = Buffer.from(JSON.stringify(capture), 'utf8').toString('base64url');
  await page.goto(`/#/capture?d=${data}`);
  await expect(page.getByText('Added "Kill 50× Zulrah" from the wiki.')).toBeVisible();
  await expect(page.locator('.task-card__title', { hasText: 'Kill 50× Zulrah' })).toBeVisible();
  await expect(page.getByText(/To do\s*\(2\)/)).toBeVisible();
  expect(new URL(page.url()).hash).toBe('');
  // Reloading must not import the task a second time.
  await page.reload();
  await expect(page.getByText(/To do\s*\(2\)/)).toBeVisible();
});

test('a capture arriving as a hash change imports without a reload', async ({ page }) => {
  // The userscript reuses one app tab, so the second capture only moves the hash.
  const data = Buffer.from(
    JSON.stringify({ v: 1, payload: { kind: 'clog', target: 'Vorkath' } }),
    'utf8',
  ).toString('base64url');
  await page.evaluate((hash: string) => {
    window.location.hash = hash;
  }, `#/capture?d=${data}`);
  await expect(page.locator('.task-card__title', { hasText: 'Log: Vorkath' })).toBeVisible();
  expect(new URL(page.url()).hash).toBe('');
});

test('settings hands out a userscript pointed at this deployment', async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByTitle('Settings').click();
  const capture = page.locator('.userscript-offer', { hasText: 'Wiki capture userscript' });

  // Not the canonical Pages deployment, so the panel must say the installable
  // file targets somewhere else.
  await expect(capture.getByText(/the installable file targets/)).toBeVisible();
  await expect(capture.getByRole('link', { name: 'Install…' })).toHaveAttribute(
    'href',
    /osrs-task-capture\.user\.js$/,
  );

  await capture.getByRole('button', { name: 'Copy source' }).click();
  await expect(page.getByText(/Userscript copied/)).toBeVisible();

  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain('// ==UserScript==');
  expect(copied).toContain('var DEFAULT_APP_URL = "http://localhost:4173/";');
  expect(copied).toContain('// @updateURL    http://localhost:4173/osrs-task-capture.user.js');
  expect(copied).not.toContain('ergenn.github.io/osrs-task-list');
});

test('settings hands out the bridge userscript, matched to this deployment', async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByTitle('Settings').click();
  const bridge = page.locator('.userscript-offer', { hasText: 'WikiSync bridge userscript' });

  // Nothing installed on this page, and the panel must say so.
  await expect(bridge.getByText(/Not detected on this page/)).toBeVisible();
  await expect(bridge.getByRole('link', { name: 'Install…' })).toHaveAttribute(
    'href',
    /osrs-wikisync-bridge\.user\.js$/,
  );

  await bridge.getByRole('button', { name: 'Copy source' }).click();
  await expect(page.getByText(/Userscript copied/)).toBeVisible();

  const copied = await page.evaluate(() => navigator.clipboard.readText());
  // The bridge only runs where the app is, so its @match must move with it.
  expect(copied).toContain('// @match        http://localhost:4173/*');
  expect(copied).toContain('// @updateURL    http://localhost:4173/osrs-wikisync-bridge.user.js');
  // The wiki host it fetches is not a deployment URL and must survive.
  expect(copied).toContain('// @connect      sync.runescape.wiki');
  expect(copied).not.toContain('ergenn.github.io/osrs-task-list');
});

test('editor creates a task with auto title', async ({ page }) => {
  await page.getByTitle('New task in To do').click();
  await page.getByRole('heading', { name: 'New task' }).waitFor();
  await page.locator('select.osrs-select').first().selectOption('level');
  const levelInput = page.locator('input[type="number"]');
  await levelInput.fill('70');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Attack 70')).toBeVisible();
  await expect(page.getByText(/To do\s*\(2\)/)).toBeVisible();
});

test('editor creates an activity task titled "Do …"', async ({ page }) => {
  await page.getByTitle('New task in To do').click();
  await page.getByRole('heading', { name: 'New task' }).waitFor();
  await page.locator('select.osrs-select').first().selectOption('activity');
  await page.getByPlaceholder('e.g. Wintertodt, Barbarian Assault').fill('Wintertodt');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(card(page, 'Do Wintertodt')).toBeVisible();
});

test('item quantity starts empty and stays out of the title', async ({ page }) => {
  await page.getByTitle('New task in To do').click();
  await page.getByRole('heading', { name: 'New task' }).waitFor();
  await expect(page.locator('input[type="number"]')).toHaveValue('');
  await page.getByPlaceholder(/Dragon scimitar/).fill('Dragon scimitar');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(card(page, 'Dragon scimitar')).toBeVisible();
});

test('transfer code carries tasks to a device with a different board', async ({ page }) => {
  await page.getByTitle('Settings').click();
  await page.getByRole('button', { name: 'Copy transfer code' }).click();
  const code = await page.locator('textarea[readonly]').inputValue();
  expect(code).toMatch(/^OSTL2[ZR]\./);

  // Second "device": an empty board plus one local task of its own. Write an
  // empty state rather than clearing, or the init script re-seeds on reload.
  await page.evaluate(() => {
    window.localStorage.setItem(
      'osrs-tl:tasks',
      JSON.stringify({
        state: { tasks: {}, columns: { todo: [], inprogress: [], done: [] }, deleted: {} },
        version: 2,
      }),
    );
  });
  await page.reload();
  await page.getByTitle('New task in To do').click();
  await page.getByRole('heading', { name: 'New task' }).waitFor();
  await page.locator('select.osrs-select').first().selectOption('level');
  await page.locator('input[type="number"]').fill('42');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Attack 42')).toBeVisible();

  await page.getByTitle('Settings').click();
  await page.getByPlaceholder('Paste a transfer code').fill(code);
  await page.getByRole('button', { name: 'Review & merge…' }).click();
  await expect(page.getByText(/add 3 new task\(s\)/)).toBeVisible();
  await page.getByRole('button', { name: 'Merge', exact: true }).click();

  // The local task survived the merge and the three transferred ones landed.
  await expect(page.getByText('Attack 42')).toBeVisible();
  await expect(page.getByText('Herblore 50')).toBeVisible();
  await expect(page.getByText('Dragon Slayer I')).toBeVisible();
  await page.reload();
  await expect(page.getByText(/To do\s*\(2\)/)).toBeVisible();
  await expect(page.getByText(/Completed\s*\(1\)/)).toBeVisible();
});

test('a transfer link offers the merge on open', async ({ page }) => {
  await page.getByTitle('Settings').click();
  await page.getByRole('button', { name: 'Copy link' }).click();
  const link = await page.locator('textarea[readonly]').inputValue();
  expect(link).toContain('#transfer=');

  await page.evaluate(() => {
    window.localStorage.setItem(
      'osrs-tl:tasks',
      JSON.stringify({
        state: { tasks: {}, columns: { todo: [], inprogress: [], done: [] }, deleted: {} },
        version: 2,
      }),
    );
  });
  await page.goto(link);

  await expect(page.getByRole('heading', { name: 'Tasks from another device' })).toBeVisible();
  await page.getByRole('button', { name: 'Merge', exact: true }).click();
  await expect(page.getByText('Herblore 50')).toBeVisible();
  // The fragment is cleared, so a reload does not ask again.
  expect(new URL(page.url()).hash).toBe('');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Tasks from another device' })).toBeHidden();
  await expect(page.getByText(/To do\s*\(1\)/)).toBeVisible();
});
