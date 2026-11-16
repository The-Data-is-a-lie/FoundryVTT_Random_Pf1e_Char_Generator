/**
 * The Blank Character Generator: the request it sends, and the placeholders it draws.
 *
 *     node --test tools/blank_character.test.mjs
 *
 * Two halves, matching the two files:
 *
 *   - scripts/blank-character.js is checked as pure functions -- the form, reading it back, and the
 *     request. The request matters most: the backend reads it positionally, so a blank request has
 *     to be the generator's saved request with exactly the right things changed.
 *   - scripts/build/slots.js is checked by BUILDING SHEETS. Three blank payloads recorded from the
 *     backend (tools/fixtures/payloads/blank_*.json) go through the real `main()`, and the test
 *     asks the questions a player would: is there one placeholder for every slot the backend said
 *     the character is owed, are they under the headings a real pick would be under, and does an
 *     ordinary generated character get none at all.
 *
 * Nothing here counts feats. The number of slots is the backend's answer and its own tests hold it;
 * this suite only checks that every row it sent arrives on the sheet, once.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  MODULE_ROOT, FIXTURES, installFoundryStubs, loadPackFixtures, loadModulePacks, deterministicDeps,
} from './foundry-stubs.mjs';
import { WANTED_PACKS } from './fixture-roster.mjs';
import {
  DEFAULT_BLANK_LEVEL, DEFAULT_BLANK_RACE, blankFormHtml, blankRequest, raceSlug, readBlankForm, slotCount,
} from '../scripts/blank-character.js';
import {
  MODULE_ID, SLOT_FLAG, SLOT_SECTIONS, seedClassFeatureSlots, slotItem, slotNames, slotRows,
} from '../scripts/build/slots.js';

const PAYLOAD_DIR = path.join(FIXTURES, 'payloads');
const payloadOf = (name) => JSON.parse(readFileSync(path.join(PAYLOAD_DIR, name + '.json'), 'utf-8'));

const OPTIONS = {
  blank: true,
  limits: { max_classes: 4, max_caster_classes: 3, max_level: 40 },
  classes: [
    { name: 'fighter', label: 'Fighter', group: 'base', group_label: 'Paizo base classes' },
    { name: 'rogue', label: 'Rogue', group: 'base', group_label: 'Paizo base classes' },
    { name: 'warder', label: 'Warder', group: 'pow', group_label: 'Path of War' },
  ],
};
const RACES = ['Dwarf', 'Half-Elf', 'Human'];

// ---------------------------------------------------------------------------------------------
// The form and the request
// ---------------------------------------------------------------------------------------------

/** The smallest "DOM" readBlankForm needs: selects and inputs found by their data-rcg key. */
function fakeRoot(html, choose = {}) {
  const nodes = [];
  const attr = (tag, name) => (new RegExp(`${name}="([^"]*)"`).exec(tag)?.[1]);
  for (const m of html.matchAll(/<input\b[^>]*data-rcg="[^"]+"[^>]*>/g)) {
    const key = attr(m[0], 'data-rcg');
    const index = attr(m[0], 'data-index');
    nodes.push({ key, dataset: { index }, value: choose[`${key}:${index}`] ?? attr(m[0], 'value') ?? '' });
  }
  for (const m of html.matchAll(/<select\b([^>]*data-rcg="[^"]+"[^>]*)>([\s\S]*?)<\/select>/g)) {
    const key = attr(m[1], 'data-rcg');
    const index = attr(m[1], 'data-index');
    const selected = /<option value="([^"]*)" selected>/.exec(m[2])?.[1] ?? '';
    nodes.push({ key, dataset: { index }, value: choose[`${key}:${index}`] ?? choose[key] ?? selected });
  }
  return { querySelectorAll: (selector) => nodes.filter((n) => selector === `[data-rcg="${n.key}"]`) };
}

test('the form offers the backend classes, one row per allowed class, and the races', () => {
  const html = blankFormHtml(OPTIONS, RACES);
  assert.equal((html.match(/data-rcg="blank-class"/g) ?? []).length, OPTIONS.limits.max_classes);
  for (const row of OPTIONS.classes) assert.ok(html.includes(`<option value="${row.name}">${row.label}</option>`), row.name);
  assert.ok(html.includes('<optgroup label="Path of War">'));
  for (const race of RACES) assert.ok(html.includes(`value="${raceSlug(race)}"`), race);
  assert.ok(!html.includes('Random'), 'a blank sheet has to be a race, so Random is not offered');
});

test('a freshly opened form reads back as no class, the default race', () => {
  const form = readBlankForm(fakeRoot(blankFormHtml(OPTIONS, RACES)));
  assert.deepEqual(form, { classes: [], race: raceSlug(DEFAULT_BLANK_RACE) });
});

test('the form reads back the classes in row order, each once, with a level', () => {
  const root = fakeRoot(blankFormHtml(OPTIONS, RACES), {
    'blank-class:0': 'fighter', 'blank-level:0': '6',
    'blank-class:1': 'rogue', 'blank-level:1': '',          // no level: the default
    'blank-class:2': 'fighter', 'blank-level:2': '3',       // a repeat: dropped
    'blank-race': 'half-elf',
  });
  assert.deepEqual(readBlankForm(root), {
    classes: [{ name: 'fighter', level: 6 }, { name: 'rogue', level: DEFAULT_BLANK_LEVEL }],
    race: 'half-elf',
  });
});

test('the request is the saved request with the blank changes, in the same order', () => {
  const saved = {
    input: 'Y', region: 'Tal-falko', race: 'random', class: 'wizard', bab: 'random', caster_level: 'random',
    multiclass: 'Y', alignment: 'random', homebrew_feat_amount: 'Y', highestLevel: 9, lowestLevel: 3, goldAmount: '',
  };
  const form = { classes: [{ name: 'fighter', level: 10 }], race: 'human' };
  const request = blankRequest(saved, form);

  // Positional fields first and in their saved order; the two named keys ride at the end.
  assert.deepEqual(Object.keys(request), [...Object.keys(saved), 'selection', 'blank']);
  assert.equal(request.race, 'human');
  assert.equal(request.class, 'random', 'the pins decide the class, not the class input');
  assert.equal(request.multiclass, 'N', 'one pinned class must not roll partners');
  assert.deepEqual(request.selection, { classes: [{ name: 'fighter', level: 10 }] });
  assert.equal(request.blank, 'Y');
  // Everything else is untouched, the house-rule choice included.
  for (const key of ['input', 'region', 'bab', 'caster_level', 'alignment', 'homebrew_feat_amount', 'highestLevel']) {
    assert.equal(request[key], saved[key], key);
  }
  assert.equal(saved.class, 'wizard', 'the saved request itself is not modified');
});

test('a blank request never carries a build concept or a dev toggle, and needs a class', () => {
  const saved = { input: 'Y', race: 'elf', class: 'random', multiclass: 'N',
    selection: { spheres: ['Destruction'] }, optimize: true, mythic: 7, luck_direction: 'buy' };
  const request = blankRequest(saved, { classes: [{ name: 'rogue', level: 4 }], race: '' });
  assert.deepEqual(request.selection, { classes: [{ name: 'rogue', level: 4 }] });
  for (const key of ['optimize', 'mythic', 'luck_direction']) assert.ok(!(key in request), key);
  assert.equal(request.race, 'elf', 'no race chosen leaves the saved one');
  assert.equal(blankRequest(saved, { classes: [], race: 'elf' }), null);
  assert.equal(blankRequest(saved, null), null);
});

// ---------------------------------------------------------------------------------------------
// Slot rows -> placeholders (pure)
// ---------------------------------------------------------------------------------------------

test('slot rows are read tolerantly', () => {
  assert.deepEqual(slotRows(null), []);
  assert.deepEqual(slotRows({}), []);
  assert.deepEqual(slotRows({ slots: 'nope' }), []);
  assert.deepEqual(slotRows({ slots: [null, { section: 'feats' }, { section: 'feats', label: 'Feat (Level 1)' }] }),
    [{ section: 'feats', label: 'Feat (Level 1)' }]);
  assert.equal(slotCount({ slots: [1, 2, 3] }), 3);
  assert.equal(slotCount({}), 0);
});

test('a placeholder is a flagged feat item with a name and NO text', () => {
  const row = { section: 'traits', kind: 'trait', label: 'Trait 1', class: '', level: null, bucket: '' };
  const item = slotItem(row, '(Trait 1)', 100, 'trait');
  assert.equal(item.name, '(Trait 1)');
  assert.equal(item.type, 'feat');
  assert.equal(item.system.subType, 'trait');
  assert.equal(item.sort, 100);
  assert.deepEqual(item.flags[MODULE_ID][SLOT_FLAG], { section: 'traits', kind: 'trait', class: '', level: null });
  assert.equal(item.system.description.value, '', 'a placeholder carries no description');
});

test('placeholders are named with the tags a generated sheet uses', () => {
  const row = (section, label, extra = {}) => ({ section, kind: 'feat', label, class: '', level: null, bucket: '', ...extra });
  const rows = [
    row('feats', 'Feat'), row('feats', 'Feat'), row('feats', 'Feat'), row('feats', 'Feat'),
    row('story_feats', 'Story Feat'), row('story_feats', 'Story Feat'), row('story_feats', 'Story Feat'),
    row('flavor_feats', 'Flavor'),
    row('flaw_feats', 'Flaw'), row('flaw_feats', 'Flaw'),
    row('class_feats', 'Fighter 1', { class: 'Fighter', level: 1 }),
    row('class_feats', 'Fighter 4', { class: 'Fighter', level: 4 }),
    row('teamwork_feats', 'Inquisitor 3'), row('bloodline_feats', 'Sorcerer 7'),
    row('monk_feats', 'Monk (Unchained) 2'),
    row('trainer_feats', 'Trainer 1'), row('trainer_feats', 'Trainer 2'),
    row('flaws', 'Flaw, Minor'), row('flaws', 'Flaw, Major'),
    row('traits', 'Trait 1'), row('traits', 'Trait 8'),
  ];
  assert.deepEqual(slotNames(rows), [
    // General feats count by position in twos, exactly as a generated character's do.
    '(Feat 1)', '(Feat 3)', '(Feat 5)', '(Feat 7)',
    // Story feats walk their own ladder.
    '(Story Feat 1)', '(Story Feat 5)', '(Story Feat 10)',
    '(Flavor 1)',
    '(Flaw 1)', '(Flaw 2)',
    // Everything else is the backend's tag in parentheses.
    '(Fighter 1)', '(Fighter 4)', '(Inquisitor 3)', '(Sorcerer 7)', '(Monk (Unchained) 2)',
    '(Trainer 1)', '(Trainer 2)',
    '(Flaw, Minor)', '(Flaw, Major)',
    '(Trait 1)', '(Trait 8)',
  ]);
  // The order rows arrive in is the order names come back in, whatever the sections are.
  assert.deepEqual(slotNames([row('traits', 'Trait 1'), row('feats', 'Feat'), row('traits', 'Trait 2'), row('feats', 'Feat')]),
    ['(Trait 1)', '(Feat 1)', '(Trait 2)', '(Feat 3)']);
  assert.deepEqual(slotNames([]), []);
});

test('class-choice slots are written into the fields the class-features stage lays out', () => {
  const ctx = { characterData: { class_features: {}, slots: [
    { section: 'class_features', kind: 'class_feature', label: 'Rogue Talents (Rogue 2)', class: 'Rogue', level: 2, bucket: 'rogue_talents' },
    { section: 'class_features', kind: 'class_feature', label: 'Rogue Talents (Rogue 4)', class: 'Rogue', level: 4, bucket: 'rogue_talents' },
    { section: 'class_features', kind: 'class_feature', label: 'Rage Powers (Barbarian (Unchained) 2)', class: 'Barbarian (Unchained)', level: 2, bucket: 'rage_powers' },
    { section: 'feats', kind: 'feat', label: 'Feat (Level 1)', class: '', level: 1, bucket: '' },
  ] } };
  assert.equal(seedClassFeatureSlots(ctx), 3);
  const data = ctx.characterData;
  assert.deepEqual(Object.keys(data.class_features.rogue_talents), ['Empty slot 1', 'Empty slot 2']);
  assert.deepEqual(data.class_feature_levels.rogue_talents, { 'Empty slot 1': 2, 'Empty slot 2': 4 });
  assert.deepEqual(data.class_feature_owners, { rogue_talents: 'rogue', rage_powers: 'barbarian (unchained)' });
  // No slots: nothing is touched, not even to create the three fields.
  const plain = { characterData: { feats: ['Toughness'] } };
  assert.equal(seedClassFeatureSlots(plain), 0);
  assert.deepEqual(plain.characterData, { feats: ['Toughness'] });
});

// ---------------------------------------------------------------------------------------------
// Whole sheets, through main()
// ---------------------------------------------------------------------------------------------

let mainFn;
let packFixtures;

before(async () => {
  ({ main: mainFn } = await import(pathToFileURL(path.join(MODULE_ROOT, 'scripts', 'modify-abilities.js')).href));
  packFixtures = loadPackFixtures(WANTED_PACKS);
  for (const [id, stub] of loadModulePacks()) packFixtures.packs.set(id, stub);
});

async function build(payload) {
  const stubs = installFoundryStubs({
    storage: { 'deliverData.json': { modded_char_sheet: 'n' }, addCustomBuffs: 'n', pulledCharacterData: payload },
    activeModules: packFixtures.present,
    packs: packFixtures.packs,
  });
  let returned;
  let thrown = null;
  try {
    returned = await mainFn(deterministicDeps({ seed: 1 }));
  } catch (error) {
    thrown = error;
  } finally {
    stubs.restore();
  }
  return { returned, thrown, template: stubs.exportTemplate(), errors: stubs.captured.error };
}

const flagged = (template) => (template.items ?? []).filter((item) => item.flags?.[MODULE_ID]?.[SLOT_FLAG]);
const named = (template, pattern) => (template.items ?? []).filter((item) => pattern.test(item.name));

for (const name of ['blank_fighter', 'blank_wizard_rogue', 'blank_sorcerer_pf1']) {
  test(`${name}: every slot the backend sent is one placeholder on the sheet`, async () => {
    const payload = payloadOf(name);
    const result = await build(payload);
    assert.equal(result.thrown, null, 'main() threw: ' + result.thrown?.stack);
    assert.equal(result.returned, true, 'main() reported failure: ' + JSON.stringify(result.errors.slice(0, 4)));

    const rows = payload.slots;
    const classChoices = rows.filter((row) => row.section === 'class_features');
    const others = rows.filter((row) => row.section !== 'class_features');
    const sectionOf = (item) => item.flags[MODULE_ID][SLOT_FLAG].section;

    // Every non-class-choice row: exactly one flagged item, named with its tag, in its section.
    const placeholders = flagged(result.template).filter((item) => sectionOf(item) !== 'class_features');
    const expected = slotNames(others);
    assert.deepEqual(placeholders.map((item) => item.name).sort(), [...expected].sort());
    others.forEach((row, index) => {
      const item = placeholders.find((p) => p.name === expected[index] && sectionOf(p) === row.section);
      assert.ok(item, `no placeholder for ${expected[index]}`);
      assert.equal(item.system.subType, SLOT_SECTIONS[row.section].subType, expected[index]);
    });
    // Sorts never collide inside a sheet section, so the order on the sheet is the order sent.
    const sorts = placeholders.map((item) => `${item.system.subType}:${item.sort}`);
    assert.equal(new Set(sorts).size, sorts.length, 'two placeholders share a sort');

    // Every class-choice row: one class feature that is the bare tag -- "(Rogue Talent 2)" --
    // drawn by the class-features stage, with the seed name gone.
    const choices = flagged(result.template).filter((item) => sectionOf(item) === 'class_features');
    assert.equal(choices.length, classChoices.length);
    for (const item of choices) assert.match(item.name, /^\(.+ \d+\)$/, item.name);
    assert.equal(named(result.template, /Empty slot/).length, 0, 'a seed name reached the sheet');

    // No placeholder says anything: a name and an empty description.
    for (const item of flagged(result.template)) {
      assert.equal(item.system.description.value, '', `${item.name} has text in it`);
      assert.match(item.name, /^\(.+\)$/, `${item.name} is more than a tag`);
    }

    // The headings a real pick would sit under are there; Flaws and Trainers only when owed.
    const owes = (section) => others.some((row) => row.section === section);
    assert.equal(named(result.template, /^_+ Feats _+$/).length, 1, 'the Feats divider');
    assert.equal(named(result.template, /^_+ Traits_+$/).length, 1, 'the Traits divider');
    assert.equal(named(result.template, /^_+ Flaws_+$/).length, owes('flaws') ? 1 : 0);
    assert.equal(named(result.template, /^_+ Trainers _+$/).length, owes('trainer_feats') ? 1 : 0);
    assert.equal(named(result.template, /Still To Choose|Ability Score|Skill Ranks|Spells Known/).length, 0,
      'ability increases, skill ranks and spells known are not slots');
    assert.equal(placeholders.filter((item) => sectionOf(item) === 'traits').length, 8, 'eight blank traits');

    // The item a generated sheet records ability increases on is there, and blank.
    const increases = (result.template.items ?? []).filter((item) => item.name === 'level_up_stats');
    assert.equal(increases.length, 1, 'the level_up_stats buff');
    for (const change of increases[0].system?.changes ?? []) assert.equal(String(change.formula), '0', change.target);

    // Nothing rolled reached the sheet: the class items are there, and no gear.
    const classes = (result.template.items ?? []).filter((item) => item.type === 'class').map((item) => item.name);
    assert.deepEqual(classes.sort(), payload.classes.map((entry) => entry.display).sort());
    assert.equal((result.template.items ?? []).filter((item) => ['weapon', 'equipment', 'spell'].includes(item.type)).length, 0,
      'a blank sheet carries no weapon, armor or spell');
  });
}

test('the house-rule sheet has flaw and story slots, the PF1 sheet has neither', () => {
  const sections = (name) => new Set(payloadOf(name).slots.map((row) => row.section));
  for (const section of ['flaws', 'story_feats', 'flavor_feats', 'flaw_feats']) {
    assert.ok(sections('blank_fighter').has(section), section);
    assert.ok(!sections('blank_sorcerer_pf1').has(section), section);
  }
  // Trainers are a house rule of their own and both fixtures were recorded with them on.
  assert.ok(sections('blank_fighter').has('trainer_feats'));
});

test('a blank fighter 10 reads like a generated one with the names rubbed out', async () => {
  const result = await build(payloadOf('blank_fighter'));
  const names = flagged(result.template).map((item) => item.name);
  for (const name of [
    '(Feat 1)', '(Feat 3)', '(Feat 5)', '(Story Feat 1)', '(Story Feat 5)', '(Story Feat 10)',
    '(Flavor 1)', '(Flaw 1)', '(Flaw 2)',
    '(Fighter 1)', '(Fighter 2)', '(Fighter 4)', '(Fighter 6)', '(Fighter 8)', '(Fighter 10)',
    '(Trainer 1)', '(Trainer 2)', '(Armor Training 7)', '(Weapon Training 9)',
    '(Flaw, Minor)', '(Flaw, Major)', '(Trait 1)', '(Trait 8)',
  ]) assert.ok(names.includes(name), `${name} is missing from: ${names.join(', ')}`);
  assert.ok(!names.some((name) => /Bonus Feat|Level/.test(name)), 'an old-style label survived');
});

test('an ordinary generated character gets no placeholder at all', async () => {
  const payload = payloadOf('martial');
  assert.ok(!payload.slots?.length, 'the martial fixture is a generated character');
  const result = await build(payload);
  assert.equal(result.returned, true);
  assert.equal(flagged(result.template).length, 0);
  assert.equal(named(result.template, /Empty slot|Still To Choose/).length, 0);
});
