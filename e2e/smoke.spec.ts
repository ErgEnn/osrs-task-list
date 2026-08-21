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

test('board renders seeded tasks in their columns', async ({ page }) => {
  await expect(page.getByText('Herblore 50')).toBeVisible();
  await expect(page.getByText(/To do\s*\(1\)/)).toBeVisible();
  await expect(page.getByText(/In progress\s*\(1\)/)).toBeVisible();
  await expect(page.getByText(/Completed\s*\(1\)/)).toBeVisible();
  // Dragon Slayer I depends on unfinished Herblore 50 → padlock shows.
  await expect(page.getByTitle(/Blocked: dependencies/)).toBeVisible();
});

test('dragging a card to another column persists across reload', async ({ page }) => {
  const card = page.getByText('Herblore 50');
  const doneHeader = page.getByText(/Completed\s*\(1\)/);
  const from = (await card.boundingBox())!;
  const to = (await doneHeader.boundingBox())!;

  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  // Several small steps so the pointer sensor picks up the drag.
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(
      from.x + ((to.x - from.x) * i) / 10 + from.width / 2,
      from.y + ((to.y + 90 - from.y) * i) / 10 + from.height / 2,
    );
  }
  await page.mouse.up();

  await expect(page.getByText(/Completed\s*\(2\)/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/Completed\s*\(2\)/)).toBeVisible();
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
