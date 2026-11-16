/**
 * Build concepts (`scripts/selection-concepts.js`): selection mode's Foundry side.
 *
 *   node --test tools/selection_concepts.test.mjs
 *
 * WHAT THIS PINS. The backend decides what a pin means; the module's job is to carry the player's
 * concept there intact, per player, and never to break a generation over it. So:
 *
 *   - SHAPE: whatever a form or a stored flag holds is reduced to exactly the request the backend
 *     documents, and to `null` -- no key at all -- when nothing is pinned.
 *   - STORAGE: concepts are per User, a removed pin does not survive a re-save (Foundry merges
 *     object flags), and deleting the active concept clears the active choice.
 *   - THE REQUEST: `selection` is added only when the backend has answered /selection_options.
 *     This is the one that matters in production: a backend from before selection mode fails the
 *     whole request on the unknown key, so "unsupported" must leave the request untouched.
 *   - THE FORM: what the editor renders is what it reads back.
 *
 * WHAT IT DOES NOT PIN. The dialogs themselves are Foundry `Dialog` + real DOM, and there is no DOM
 * in node (this repo carries no dev dependencies on purpose). The form is tested through the same
 * two pure functions the dialog calls -- HTML out, selection in -- against a minimal fake root.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  MODULE_ID, CONCEPTS_FLAG, ACTIVE_FLAG, SELECTION_KEYS,
  cleanSelection, conceptPinsClasses, conceptSummary,
  readConcepts, saveConcept, deleteConcept, readActiveConceptName, setActiveConcept, activeConcept,
  selectionOptionsUrl, fetchSelectionOptions, clearSelectionOptionsCache, applySelectionToRequest,
  unmetPins, unmetPinsHtml, conceptDropdownOptions, conceptFormHtml, readConceptForm,
} from '../scripts/selection-concepts.js';

/** The plan's own example request (backend docs: selection.py). */
const SAMPLE = {
  classes: [{ name: 'warder', level: 8 }, { name: 'wizard', level: 3 }],
  stat_priority: ['str', 'con', 'int', 'dex', 'wis', 'cha'],
  schools: { specialty: 'evocation', preferred: ['abjuration'], opposition: ['necromancy', 'enchantment'] },
  spheres: ['Destruction', 'Shield'],
  path_of_war: { disciplines: ['Primal Fury'], paths: 1 },
};

/** What GET /selection_options answers, cut down to a few rows of each list. */
const OPTIONS = {
  keys: SELECTION_KEYS,
  limits: { max_classes: 4, max_caster_classes: 3, max_level: 40 },
  classes: [
    { name: 'fighter', label: 'Fighter', group: 'base', group_label: 'Paizo base classes', bab: 'H', casting: 'none' },
    { name: 'wizard', label: 'Wizard', group: 'base', group_label: 'Paizo base classes', bab: 'L', casting: 'high' },
    { name: 'warder', label: 'Warder', group: 'pow', group_label: 'Path of War', bab: 'H', casting: 'none' },
  ],
  abilities: ['str', 'dex', 'con', 'int', 'wis', 'cha'],
  schools: {
    specialty: { elemental_schools: ['fire'], elemental_subschools: ['ice'], schools: ['evocation', 'universalist'], subschools: ['admixture'] },
    spell_schools: ['abjuration', 'enchantment', 'evocation', 'necromancy'],
  },
  spheres: { power: ['Destruction', 'Life'], might: ['Guardian', 'Shield'] },
  disciplines: ['Broken Blade', 'Primal Fury'],
};

/** A User document, as far as flags go -- including Foundry's MERGE on setFlag of an object. */
function fakeUser() {
  const flags = {};
  const merge = (into, from) => {
    for (const [k, v] of Object.entries(from)) {
      if (v && typeof v === 'object' && !Array.isArray(v) && into[k] && typeof into[k] === 'object' && !Array.isArray(into[k])) {
        merge(into[k], v);
      } else {
        into[k] = structuredClone(v);
      }
    }
  };
  return {
    flags,
    getFlag: (scope, key) => flags[scope]?.[key],
    async setFlag(scope, key, value) {
      flags[scope] ??= {};
      if (value && typeof value === 'object' && !Array.isArray(value)
          && flags[scope][key] && typeof flags[scope][key] === 'object') {
        merge(flags[scope][key], value);
      } else {
        flags[scope][key] = structuredClone(value);
      }
    },
    async unsetFlag(scope, key) { delete flags[scope]?.[key]; },
  };
}

const okFetch = (calls) => async (url) => {
  calls.push(url);
  return { ok: true, json: async () => OPTIONS };
};

beforeEach(() => clearSelectionOptionsCache());

// ---------------------------------------------------------------------------------------------

test('a full concept passes through cleanSelection unchanged', () => {
  assert.deepEqual(cleanSelection(SAMPLE), SAMPLE);
  assert.deepEqual(Object.keys(cleanSelection(SAMPLE)), SELECTION_KEYS);
});

test('nothing pinned is null, not an empty object', () => {
  for (const empty of [null, undefined, '', [], {}, 'fighter',
    { classes: [], stat_priority: [], schools: {}, spheres: [], path_of_war: {} },
    { classes: [{ name: '' }], schools: { specialty: '  ', preferred: [''] }, path_of_war: { paths: '' } }]) {
    assert.equal(cleanSelection(empty), null, JSON.stringify(empty));
  }
});

test('cleanSelection keeps only what is pinned', () => {
  assert.deepEqual(
    cleanSelection({ classes: ['fighter', { name: 'wizard', level: '3' }, { name: 'rogue', level: '' }, 'fighter'] }),
    { classes: [{ name: 'fighter' }, { name: 'wizard', level: 3 }, { name: 'rogue' }] });
  assert.deepEqual(cleanSelection({ classes: [{ name: 'fighter', level: 0 }] }), { classes: [{ name: 'fighter' }] });
  assert.deepEqual(cleanSelection({ stat_priority: ['STR', 'str', ' Con '] }), { stat_priority: ['str', 'con'] });
  assert.deepEqual(cleanSelection({ schools: { opposition: ['necromancy', 'necromancy'] } }),
    { schools: { opposition: ['necromancy'] } });
  // A path count of 0 is a pin ("no martial paths"); a blank one is not.
  assert.deepEqual(cleanSelection({ path_of_war: { paths: '0' } }), { path_of_war: { paths: 0 } });
  assert.equal(cleanSelection({ path_of_war: { paths: '' } }), null);
});

test('conceptPinsClasses and conceptSummary describe the concept', () => {
  assert.equal(conceptPinsClasses(SAMPLE), true);
  assert.equal(conceptPinsClasses({ spheres: ['Shield'] }), false);
  assert.equal(conceptPinsClasses(null), false);
  const summary = conceptSummary(SAMPLE);
  for (const fragment of ['warder 8 / wizard 3', 'str > con', 'evocation', 'no necromancy, enchantment',
    'Destruction, Shield', 'Primal Fury', '1 path']) {
    assert.ok(summary.includes(fragment), `${fragment} missing from: ${summary}`);
  }
  assert.equal(conceptSummary({}), 'nothing pinned');
});

// ---------------------------------------------------------------------------------------------

test('concepts are saved per user and read back clean', async () => {
  const alice = fakeUser();
  const bob = fakeUser();
  await saveConcept(alice, 'Shield warder', SAMPLE);
  await saveConcept(bob, 'Blaster', { classes: ['wizard'], schools: { specialty: 'evocation' } });
  assert.deepEqual(Object.keys(readConcepts(alice)), ['Shield warder']);
  assert.deepEqual(Object.keys(readConcepts(bob)), ['Blaster']);
  assert.deepEqual(readConcepts(alice)['Shield warder'], SAMPLE);
  assert.deepEqual(alice.flags[MODULE_ID][CONCEPTS_FLAG]['Shield warder'], SAMPLE);
});

test('re-saving a concept drops a pin that was removed (setFlag merges)', async () => {
  const user = fakeUser();
  await saveConcept(user, 'A', SAMPLE);
  await saveConcept(user, 'A', { classes: ['fighter'] });
  assert.deepEqual(readConcepts(user).A, { classes: [{ name: 'fighter' }] });
});

test('a concept needs a name and at least one pin', async () => {
  const user = fakeUser();
  await assert.rejects(saveConcept(user, '  ', SAMPLE), /needs a name/);
  await assert.rejects(saveConcept(user, 'Empty', {}), /at least one pin/);
  assert.deepEqual(readConcepts(user), {});
});

test('a name with a dot is one concept, not a nested path', async () => {
  const user = fakeUser();
  await saveConcept(user, 'v2.1 tank', { classes: ['fighter'] });
  assert.deepEqual(Object.keys(readConcepts(user)), ['v2.1 tank']);
});

test('the active concept follows the user and dies with its concept', async () => {
  const user = fakeUser();
  assert.equal(activeConcept(user), null);
  await saveConcept(user, 'A', SAMPLE);
  await setActiveConcept(user, 'A');
  assert.equal(user.flags[MODULE_ID][ACTIVE_FLAG], 'A');
  assert.deepEqual(activeConcept(user), { name: 'A', selection: SAMPLE });
  await setActiveConcept(user, 'Ghost');           // names a concept that does not exist
  assert.equal(readActiveConceptName(user), '');
  await setActiveConcept(user, 'A');
  assert.equal(await deleteConcept(user, 'A'), true);
  assert.equal(readActiveConceptName(user), '');
  assert.equal(activeConcept(user), null);
  assert.equal(await deleteConcept(user, 'A'), false);
});

test('a user with no flags at all reads as no concepts', () => {
  assert.deepEqual(readConcepts(null), {});
  assert.deepEqual(readConcepts({ getFlag() { throw new Error('scope not registered'); } }), {});
  assert.equal(readActiveConceptName(undefined), '');
});

// ---------------------------------------------------------------------------------------------

test('the options endpoint sits beside the generation endpoint', () => {
  assert.equal(selectionOptionsUrl('https://example.onrender.com/update_character_data'),
    'https://example.onrender.com/selection_options');
  assert.equal(selectionOptionsUrl('http://127.0.0.1:5001/update_character_data'),
    'http://127.0.0.1:5001/selection_options');
  assert.equal(selectionOptionsUrl('not a url'), null);
});

test('a good options answer is cached; a failure is asked again', async () => {
  const calls = [];
  let up = false;
  const flaky = async (url) => {
    calls.push(url);
    if (!up) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, json: async () => OPTIONS };
  };
  const url = 'http://127.0.0.1:5001/update_character_data';
  assert.equal(await fetchSelectionOptions(url, flaky), null);
  up = true;
  assert.deepEqual(await fetchSelectionOptions(url, flaky), OPTIONS);
  assert.deepEqual(await fetchSelectionOptions(url, flaky), OPTIONS);
  assert.equal(calls.length, 2, 'the failure must be retried, the success must be cached');
  // A network error and a body that is not the options are both "unsupported", never a throw.
  assert.equal(await fetchSelectionOptions('http://other/update_character_data',
    async () => { throw new Error('offline'); }), null);
  assert.equal(await fetchSelectionOptions('http://third/update_character_data',
    async () => ({ ok: true, json: async () => ({ error: 'nope' }) })), null);
});

test('the active concept is added to the request when the backend knows the key', async () => {
  const user = fakeUser();
  await saveConcept(user, 'A', SAMPLE);
  await setActiveConcept(user, 'A');
  const request = { input: 'Y', class: 'random' };
  const calls = [];
  const result = await applySelectionToRequest(request, {
    user, deliverUrl: 'http://127.0.0.1:5001/update_character_data', fetchImpl: okFetch(calls) });
  assert.equal(result.status, 'sent');
  assert.equal(result.name, 'A');
  assert.deepEqual(request.selection, SAMPLE);
  assert.deepEqual(calls, ['http://127.0.0.1:5001/selection_options']);
});

test('an older backend leaves the request untouched', async () => {
  const user = fakeUser();
  await saveConcept(user, 'A', SAMPLE);
  await setActiveConcept(user, 'A');
  const request = { input: 'Y', class: 'random' };
  const result = await applySelectionToRequest(request, {
    user, deliverUrl: 'https://old.example/update_character_data',
    fetchImpl: async () => ({ ok: false, status: 404, json: async () => ({}) }) });
  assert.deepEqual(result, { status: 'unsupported', name: 'A' });
  assert.equal('selection' in request, false, 'an unknown key fails the whole request on an old backend');
});

test('no active concept means no key and no network call', async () => {
  const request = { input: 'Y' };
  const calls = [];
  const result = await applySelectionToRequest(request, {
    user: fakeUser(), deliverUrl: 'http://127.0.0.1:5001/update_character_data', fetchImpl: okFetch(calls) });
  assert.deepEqual(result, { status: 'none' });
  assert.deepEqual(request, { input: 'Y' });
  assert.equal(calls.length, 0);
});

// ---------------------------------------------------------------------------------------------

test('the unmet-pin report is tidied and escaped', () => {
  assert.deepEqual(unmetPins({}), []);
  assert.deepEqual(unmetPins({ selection_report: 'nope' }), []);
  const rows = unmetPins({ selection_report: [
    { pin: 'classes[0]: wizzard', reason: 'no class by that name' }, null, { reason: 'orphan' },
    { pin: 'spheres: <b>x</b>', reason: '' }] });
  assert.deepEqual(rows, [
    { pin: 'classes[0]: wizzard', reason: 'no class by that name' },
    { pin: 'spheres: <b>x</b>', reason: '' }]);
  const html = unmetPinsHtml('My "tank"', rows);
  assert.ok(html.includes('2 pins'));
  assert.ok(html.includes('My &quot;tank&quot;'));
  assert.ok(html.includes('&lt;b&gt;x&lt;/b&gt;') && !html.includes('<b>x</b>'));
  assert.equal(unmetPinsHtml('A', []), '');
});

test('the dropdown lists concepts by name with the active one selected', () => {
  const html = conceptDropdownOptions({ Zed: SAMPLE, Alpha: SAMPLE }, 'Zed');
  assert.ok(html.indexOf('Alpha') < html.indexOf('Zed'), 'sorted by name');
  assert.match(html, /<option value="Zed" selected>Zed<\/option>/);
  assert.match(html, /<option value="">None \(fully random\)<\/option>/);
  assert.match(conceptDropdownOptions({}, ''), /<option value="" selected>/);
});

// ---------------------------------------------------------------------------------------------
// The form: render it, parse the HTML back into fake nodes, read it.

/** The smallest "DOM" readConceptForm needs: nodes found by their data-rcg key. */
function fakeRoot(html) {
  const nodes = [];
  const attr = (tag, name) => (new RegExp(`${name}="([^"]*)"`).exec(tag)?.[1]);
  const decode = (s) => (s ?? '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  for (const m of html.matchAll(/<input\b[^>]*data-rcg="[^"]+"[^>]*>/g)) {
    nodes.push({ key: attr(m[0], 'data-rcg'), dataset: { index: attr(m[0], 'data-index') },
      value: decode(attr(m[0], 'value')), checked: /\bchecked\b/.test(m[0]) });
  }
  for (const m of html.matchAll(/<select\b([^>]*data-rcg="[^"]+"[^>]*)>([\s\S]*?)<\/select>/g)) {
    const options = [...m[2].matchAll(/<option value="([^"]*)"( selected)?>/g)]
      .map((o) => ({ value: decode(o[1]), selected: !!o[2] }));
    const multiple = /\bmultiple\b/.test(m[1]);
    nodes.push({ key: attr(m[1], 'data-rcg'), dataset: { index: attr(m[1], 'data-index') }, options,
      value: multiple ? undefined : (options.find((o) => o.selected)?.value ?? options[0]?.value ?? '') });
  }
  return { querySelectorAll: (selector) => nodes.filter((n) => selector === `[data-rcg="${n.key}"]`) };
}

test('the form reads back exactly the concept it rendered', () => {
  const html = conceptFormHtml(OPTIONS, 'Shield warder', SAMPLE);
  // Checkbox lists read back in the order they are DRAWN (the backend's, alphabetical), not the
  // order they were stored in. Nothing else in the concept moves.
  const expected = structuredClone(SAMPLE);
  expected.schools.opposition = ['enchantment', 'necromancy'];
  assert.deepEqual(readConceptForm(fakeRoot(html)), { name: 'Shield warder', selection: expected });
});

test('a blank form is a nameless concept with nothing pinned', () => {
  const html = conceptFormHtml(OPTIONS, '', null);
  assert.deepEqual(readConceptForm(fakeRoot(html)), { name: '', selection: null });
});

test('the form offers every option the backend sent, and no others', () => {
  const html = conceptFormHtml(OPTIONS, '', null);
  for (const row of OPTIONS.classes) assert.ok(html.includes(`value="${row.name}"`), row.name);
  for (const names of Object.values(OPTIONS.schools.specialty)) {
    for (const name of names) assert.ok(html.includes(`value="${name}"`), name);
  }
  for (const name of [...OPTIONS.spheres.power, ...OPTIONS.spheres.might, ...OPTIONS.disciplines]) {
    assert.ok(html.includes(`value="${name}"`), name);
  }
  assert.equal((html.match(/data-rcg="class"/g) ?? []).length, OPTIONS.limits.max_classes);
  assert.equal((html.match(/data-rcg="stat"/g) ?? []).length, OPTIONS.abilities.length);
  assert.ok(!html.includes('value="barbarian"'), 'a class the backend did not send must not appear');
});

test('a partial concept round-trips without inventing pins', () => {
  const partial = { classes: [{ name: 'fighter' }], spheres: ['Shield'], path_of_war: { paths: 0 } };
  const html = conceptFormHtml(OPTIONS, 'P', partial);
  assert.deepEqual(readConceptForm(fakeRoot(html)), { name: 'P', selection: partial });
});
