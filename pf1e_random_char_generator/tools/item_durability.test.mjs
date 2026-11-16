/**
 * Special materials and the durability breakdown (`scripts/build/item-durability.js`).
 *
 *   node --test tools/item_durability.test.mjs
 *
 * WHAT THIS PINS. The backend owns every number; the module's whole job is to put them in the right
 * place without recomputing or losing any. So this checks placement, in two layers:
 *
 *   - the pure writers, against the two item shapes that are both live (compendium weapons carry
 *     `hardness: {base, total}` and `hp: {base, max, offset, value}`; equipment carries a bare
 *     `hardness` number), using the Spombagorn greatsword the house formula was read from;
 *   - one real build, end to end: the `martial` payload with a material and a breakdown added, run
 *     through `modify-abilities.js::main` on the same stubs the golden harness uses. That is the only
 *     thing that proves the ORDER — the material has to land inside the +N rename, on both the
 *     weapon and its attack twin, or the two end up with different names.
 *
 * WHAT IT DOES NOT PIN. The existing goldens are the proof of the other half: none of their payloads
 * carry these keys, and they did not move. A payload from an older backend builds exactly the sheet
 * it always did.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  installFoundryStubs, loadPackFixtures, loadModulePacks, deterministicDeps, drainMutatedTemplates,
  MODULE_ROOT, FIXTURES,
} from './foundry-stubs.mjs';
import { WANTED_PACKS } from './fixture-roster.mjs';

/** The Spombagorn greatsword as the backend emits it (its `x2 Mythic` line is not modelled). */
const GREATSWORD = {
  material: 'steel',
  material_label: 'Iron',
  hardness: 40,
  hp: 280,
  hardness_lines: [['Two-Handed Blade', 10], ['Iron', 10], ['Enhancement', 10], ['Impervious', 10]],
  hp_lines: [['Two-Handed Blade', 10], ['Iron', 30], ['Enhancement', 50], ['Impervious', 50]],
  size_lines: [['Large', 'x2']],
  size_sources: ['Impact'],
};

const weaponItem = () => ({
  name: 'Greatsword', type: 'weapon',
  system: {
    description: { value: '<p>An immense two-handed sword.</p>' },
    size: 'med',
    hardness: { base: 10, total: 10 },
    hp: { base: 10, max: 10, offset: 0, value: 10 },
    material: { base: { custom: false, value: 'steel' }, normal: { custom: false, value: '' } },
  },
});
const armorItem = () => ({
  name: 'Breastplate', type: 'equipment',
  system: { description: { value: '' }, subType: 'armor', size: 'med', hardness: 10, hp: { max: 30, value: 30 } },
});

let durability;
let mainFn;
let packFixtures;

before(async () => {
  durability = await import(pathToFileURL(path.join(MODULE_ROOT, 'scripts', 'build', 'item-durability.js')).href);
  ({ main: mainFn } = await import(pathToFileURL(path.join(MODULE_ROOT, 'scripts', 'modify-abilities.js')).href));
  packFixtures = loadPackFixtures(WANTED_PACKS);
  for (const [id, stub] of loadModulePacks()) packFixtures.packs.set(id, stub);
});

test('the breakdown renders the totals and every line, in order', () => {
  const html = durability.durabilityHtml(GREATSWORD);
  assert.equal(html,
    '<h3>Material</h3><p>Iron</p>'
    + '<h3>Hardness: 40</h3><p>+10 Two-Handed Blade<br>+10 Iron<br>+10 Enhancement<br>+10 Impervious</p>'
    + '<h3>Hit Points: 280</h3><p>+10 Two-Handed Blade<br>+30 Iron<br>+50 Enhancement<br>+50 Impervious'
    + '<br>x2 for Large</p>'
    + '<h3>Size: Large</h3><p>Impact</p>');
});

test('a Medium item gets no size block, and a sized one with no source says why', () => {
  const medium = durability.durabilityHtml({ ...GREATSWORD, size_lines: [], size_sources: [] });
  assert.ok(!medium.includes('<h3>Size'));
  assert.ok(!medium.includes(' for '));
  const small = durability.durabilityHtml({ ...GREATSWORD, size_lines: [['Small', '/2']], size_sources: [] });
  assert.ok(small.includes('/2 for Small'));
  assert.ok(small.includes('<h3>Size: Small</h3><p>Sized for its wielder</p>'));
});

test('totals land in the weapon shape and the equipment shape, each kept as it arrived', () => {
  const weapon = weaponItem();
  durability.applyDurabilityTotals(weapon, GREATSWORD);
  assert.deepEqual(weapon.system.hardness, { base: 40, total: 40 });
  assert.deepEqual(weapon.system.hp, { base: 280, max: 280, offset: 0, value: 280 });

  const armor = armorItem();
  durability.applyDurabilityTotals(armor, { hardness: 22, hp: 85 });
  assert.equal(armor.system.hardness, 22);
  assert.deepEqual(armor.system.hp, { max: 85, value: 85 });

  // An item that arrived with neither field gets pf1's own current shape.
  const bare = { system: {} };
  durability.applyDurabilityTotals(bare, { hardness: 12, hp: 20 });
  assert.equal(bare.system.hardness, 12);
  assert.deepEqual(bare.system.hp, { base: 20, offset: 0 });
});

test('size is never written: the breakdown is on a Medium basis', () => {
  const weapon = weaponItem();
  durability.applyItemDurability(weapon, 'adamantine', GREATSWORD);
  assert.equal(weapon.system.size, 'med');
});

test('a normal material replaces the special-material slot; an add-on joins the add-on list', () => {
  const weapon = weaponItem();
  assert.equal(durability.applyMaterial(weapon, 'adamantine'), true);
  assert.equal(weapon.system.material.normal.value, 'adamantine');
  assert.equal(weapon.system.material.base.value, 'steel', 'the base material is left alone');
  assert.equal(weapon.system.masterwork, true);

  const silvered = weaponItem();
  durability.applyMaterial(silvered, 'alchemicalSilver');
  durability.applyMaterial(silvered, 'alchemicalSilver');
  assert.deepEqual(silvered.system.material.addon, ['alchemicalSilver'], 'added once');
  assert.equal(silvered.system.material.normal.value, '');
  assert.notEqual(silvered.system.masterwork, true, 'silver is a coating, not masterwork');
});

test('material ids are pf1 ids, so the label is derived, not looked up', () => {
  assert.equal(durability.materialLabel('coldIron'), 'Cold Iron');
  assert.equal(durability.materialLabel('alchemicalSilver'), 'Alchemical Silver');
  assert.equal(durability.materialLabel('mithral'), 'Mithral');
  assert.equal(durability.materialLabel(''), '');
  assert.equal(durability.materialLabel(undefined), '');
});

test('the description block is appended once', () => {
  const weapon = weaponItem();
  assert.equal(durability.appendDurabilityDescription(weapon, GREATSWORD), true);
  assert.equal(durability.appendDurabilityDescription(weapon, GREATSWORD), false);
  assert.equal(weapon.system.description.value.split('<h3>Hardness: 40</h3>').length, 2);
  assert.ok(weapon.system.description.value.startsWith('<p>An immense two-handed sword.</p>'));
});

test('a payload without the keys changes nothing', () => {
  const weapon = weaponItem();
  const before = JSON.stringify(weapon);
  durability.applyItemDurability(weapon, '', undefined);
  durability.applyItemDurability(weapon, undefined, {});
  durability.applyItemDurability(undefined, 'adamantine', GREATSWORD);
  assert.equal(JSON.stringify(weapon), before);
});

test('labels are escaped: a source name cannot inject markup into the sheet', () => {
  const html = durability.durabilityHtml({ ...GREATSWORD, size_sources: ['<img src=x onerror=1>'] });
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img'));
});

test('a real build: the material rides the +N rename on the weapon AND its attack twin', async () => {
  const payload = JSON.parse(readFileSync(path.join(FIXTURES, 'payloads', 'martial.json'), 'utf-8'));
  // martial is a +5 Kerambit in +3 Stoneplate. Give the weapon a material and both a breakdown.
  payload.weapon_material = 'adamantine';
  payload.armor_material = '';
  payload.shield_material = '';
  payload.item_durability = {
    weapon: { ...GREATSWORD, material: 'adamantine', material_label: 'Adamantine' },
    armor: { material: 'stone', material_label: 'Stone', hardness: 24, hp: 90,
             hardness_lines: [['Armor', 10], ['Stone', 8], ['Enhancement', 6]],
             hp_lines: [['Armor', 45], ['Stone', 15], ['Enhancement', 30]],
             size_lines: [], size_sources: [] },
  };

  const deps = deterministicDeps({ seed: 1 });
  const stubs = installFoundryStubs({
    storage: {
      'deliverData.json': { modded_char_sheet: 'n' },
      addCustomBuffs: 'n',
      pulledCharacterData: payload,
    },
    activeModules: packFixtures.present,
    packs: packFixtures.packs,
  });
  let template;
  try {
    await mainFn(deps);
    template = stubs.exportTemplate();
  } finally {
    stubs.restore();
    drainMutatedTemplates();
  }

  const named = template.items.filter((item) => /Adamantine Kerambit$/.test(item.name));
  assert.deepEqual(named.map((item) => item.type).sort(), ['attack', 'weapon'],
    'exactly the inventory weapon and its attack twin carry the material in their name');
  const [weapon] = named.filter((item) => item.type === 'weapon');
  const [attack] = named.filter((item) => item.type === 'attack');
  assert.equal(weapon.name, attack.name, 'the twins are renamed together');
  assert.match(weapon.name, /^\+5 /, 'the material sits after the +N and the qualities');

  assert.equal(weapon.system.material.normal.value, 'adamantine');
  assert.equal(attack.system.material.normal.value, 'adamantine', 'the twin is what gets rolled against DR');
  assert.equal(weapon.system.size, 'med');
  assert.equal(typeof weapon.system.hardness === 'object' ? weapon.system.hardness.total : weapon.system.hardness, 40);
  assert.equal(weapon.system.hp.base ?? weapon.system.hp.max, 280);
  assert.ok(weapon.system.description.value.includes('<h3>Hit Points: 280</h3>'));
  assert.ok(!attack.system.description.value.includes('<h3>Hardness'),
    'the attack twin keeps its stripped description: pf1 bakes it into every roll card');

  const armor = template.items.find((item) => item.type === 'equipment' && item.system?.subType === 'armor');
  assert.match(armor.name, /^\+3 /);
  assert.ok(!/Stone Stoneplate/.test(armor.name), 'an ordinary material is not prefixed onto the name');
  assert.equal(typeof armor.system.hardness === 'object' ? armor.system.hardness.total : armor.system.hardness, 24);
  assert.ok(armor.system.description.value.includes('<h3>Hardness: 24</h3>'));
});
