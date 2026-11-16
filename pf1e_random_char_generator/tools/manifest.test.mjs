/**
 * module.json's two URLs, held to the shapes an installed copy depends on.
 *
 * `manifest` is what an INSTALLED module re-reads to ask "is there anything newer?". It must be the
 * stable URL on main, never a tag: a tag-pinned manifest answers "the version you already have"
 * forever, and Foundry then only finds the update through the registry, which stops Update All on a
 * "Manifest Update" confirmation every release (see the header of release.ps1, which writes both).
 *
 * `download` is the opposite: pinned to the tag of the version beside it, so a given version always
 * fetches the code that shipped with it -- and so a hand-bumped version on main, with no tag behind
 * it, fails here instead of sending every installed copy to a 404.
 *
 * Run: node --test tools/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(new URL('../module.json', import.meta.url), 'utf8'));
const RAW = 'https://gitlab.com/pathfinder_1e_randomized_character_generator/FoundryVTT_Random_Pf1e_Char_Generator/-/raw';

test('module.json: the update-check manifest is the stable URL on main', () => {
  assert.equal(manifest.manifest, `${RAW}/main/${manifest.id}/module.json`);
});

test('module.json: the download is pinned to the tag of its own version', () => {
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(manifest.download, `${RAW}/v${manifest.version}/downloads/${manifest.id}.zip`);
});
