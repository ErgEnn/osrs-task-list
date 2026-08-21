#!/usr/bin/env node
/**
 * Downloads the vendored art assets:
 *  - RuneScape UI fonts from RuneStar/fonts (CC0-1.0, exact in-game glyphs)
 *  - 23 skill icons from the RuneLite client resources (BSD-2-Clause)
 *
 * Re-run with `npm run fetch-assets` to refresh. Committed output:
 *   src/assets/fonts/*.otf   src/assets/skills/*.png
 *
 * Attribution (also noted in the README):
 *   Fonts: https://github.com/RuneStar/fonts (CC0-1.0)
 *   Skill icons: https://github.com/runelite/runelite (BSD-2-Clause)
 */
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FONTS_ZIP =
  'https://github.com/RuneStar/fonts/releases/download/1.103-0/RuneScape-Fonts.zip';
const FONTS = [
  'RuneScape-Plain-11',
  'RuneScape-Plain-12',
  'RuneScape-Bold-12',
  'RuneScape-Quill-8',
  'RuneScape-Quill',
];
const RUNELITE_ICONS =
  'https://raw.githubusercontent.com/runelite/runelite/master/runelite-client/src/main/resources/skill_icons';
const SKILLS = [
  'attack', 'strength', 'defence', 'ranged', 'prayer', 'magic', 'runecraft',
  'construction', 'hitpoints', 'agility', 'herblore', 'thieving', 'crafting',
  'fletching', 'slayer', 'hunter', 'mining', 'smithing', 'fishing', 'cooking',
  'firemaking', 'woodcutting', 'farming',
];

async function fetchBytes(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

function assertPng(buffer, name) {
  const magic = [0x89, 0x50, 0x4e, 0x47];
  if (!magic.every((byte, i) => buffer[i] === byte)) {
    throw new Error(`${name} is not a PNG (got ${buffer.subarray(0, 8).toString('hex')})`);
  }
}

async function fetchFonts() {
  const dest = join(root, 'src/assets/fonts');
  await mkdir(dest, { recursive: true });
  const work = join(tmpdir(), `rs-fonts-${Date.now()}`);
  await mkdir(work, { recursive: true });
  const zipPath = join(work, 'fonts.zip');
  await writeFile(zipPath, await fetchBytes(FONTS_ZIP));
  execFileSync('unzip', ['-o', '-q', zipPath, '-d', work]);
  for (const font of FONTS) {
    const file = `${font}.otf`;
    await writeFile(join(dest, file), await readFile(join(work, 'otf', file)));
    console.log(`font  ${file}`);
  }
  await rm(work, { recursive: true, force: true });
}

async function fetchSkillIcons() {
  const dest = join(root, 'src/assets/skills');
  await mkdir(dest, { recursive: true });
  for (const skill of SKILLS) {
    const bytes = await fetchBytes(`${RUNELITE_ICONS}/${skill}.png`);
    assertPng(bytes, `${skill}.png`);
    await writeFile(join(dest, `${skill}.png`), bytes);
    console.log(`skill ${skill}.png (${bytes.length}b)`);
  }
}

await fetchFonts();
await fetchSkillIcons();
console.log('\nDone. Licenses: RuneStar/fonts CC0-1.0; RuneLite icons BSD-2-Clause (attribution required).');
