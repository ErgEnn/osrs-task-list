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
  await dragCardTo(page, 'Herblore 30', (await pointsOf(page, 'Dragon Slayer I')).upperHalf);

  await expect(page.getByText('“Dragon Slayer I” now depends on “Herblore 30”.')).toBeVisible();
  // A link, not a move: both cards stayed in their columns.
  await expect(page.getByText(/Completed\s*\(1\)/)).toBeVisible();
  await expect(page.getByText(/In progress\s*\(1\)/)).toBeVisible();

  // The new edge joins the auto level chain and the seeded explicit one.
  await page.getByRole('tab', { name: 'Progression' }).click();
  await expect(page.locator('.graph-edge')).toHaveCount(3);
});

test("dropping on a card's lower half makes the dragged card depend on it", async ({ page }) => {
  await dragCardTo(page, 'Dragon Slayer I', (await pointsOf(page, 'Herblore 30')).lowerHalf);

  await expect(page.getByText('“Dragon Slayer I” now depends on “Herblore 30”.')).toBeVisible();
  await expect(page.getByText(/In progress\s*\(1\)/)).toBeVisible();
  await page.getByRole('tab', { name: 'Progression' }).click();
  await expect(page.locator('.graph-edge')).toHaveCount(3);
});

test('a drop zone that would loop says so and refuses the link', async ({ page }) => {
  // Dragon Slayer I already depends on Herblore 50, so the reverse cannot hold.
  await pickUp(page, 'Herblore 50', (await pointsOf(page, 'Dragon Slayer I')).lowerHalf);
  await expect(page.locator('.board-dep-zone--over')).toHaveText('Would loop');
  await page.mouse.up();

  await expect(page.getByText(/would create a cycle/)).toBeVisible();
  await page.getByRole('tab', { name: 'Progression' }).click();
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

  // Not the canonical Pages deployment, so the panel must say the installable
  // file targets somewhere else.
  await expect(page.getByText(/the installable file targets/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Install…' })).toHaveAttribute(
    'href',
    /osrs-task-capture\.user\.js$/,
  );

  await page.getByRole('button', { name: 'Copy source' }).click();
  await expect(page.getByText(/Userscript copied/)).toBeVisible();

  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain('// ==UserScript==');
  expect(copied).toContain('var DEFAULT_APP_URL = "http://localhost:4173/";');
  expect(copied).toContain('// @updateURL    http://localhost:4173/osrs-task-capture.user.js');
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
