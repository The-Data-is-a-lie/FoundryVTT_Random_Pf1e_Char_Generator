/**
 * The golden-snapshot harness for the main character path (`scripts/modify-abilities.js`).
 *
 *   npm test                                            # the whole suite
 *   node --test tools/                                  # the same thing without npm
 *   node tools/generate_character.test.mjs              # just this file
 *   node tools/generate_character.test.mjs --update      # RE-RECORD the goldens
 *
 * WHAT THIS IS FOR. `modify-abilities.js` is 4,000 lines in one closure and is about to be taken
 * apart module by module. Nothing about that split is safe unless the sheet it produces can be
 * compared byte for byte before and after, so this harness comes first and everything else is
 * verified against it. That also means a harness that passes on a broken build is worse than none at
 * all — see the sabotage note at the bottom of this file.
 *
 * HOW A RUN IS MADE REPRODUCIBLE. Two different problems, solved separately (ticket 01):
 *   - `mintId` replaces the 16-random-character id generator with a content-derived hash, so the same
 *     item gets the same id every run AND keeps that id when the code around it moves.
 *   - `rng` replaces the one semantic `Math.random`, in `check_ammo`, which picks WHICH AMMO ITEM
 *     goes on the sheet. That one changes content, not identity, so no amount of normalising the
 *     snapshot could have hidden it — the randomness had to be injected.
 * Production passes neither and behaves exactly as it always has.
 *
 * WHAT THE SNAPSHOT IS. The whole `exportTemplate` — the object written to `exportFoundryPath`,
 * which is the entire output of this file and the only thing `button.js` consumes. Object keys are
 * sorted so a reordered build step is not a diff, and any string over 200 characters is replaced by
 * its hash: rules text is most of the bytes and none of the meaning, and leaving it in would make the
 * goldens enormous in a repo already carrying 248 MiB of loose objects.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  installFoundryStubs, loadPackFixtures, deterministicDeps, drainMutatedTemplates, MODULE_ROOT, FIXTURES,
} from './foundry-stubs.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN_DIR = path.join(FIXTURES, 'golden');
const PAYLOAD_DIR = path.join(FIXTURES, 'payloads');
const UPDATE = process.argv.includes('--update');

/**
 * The roster ticket 01 settled. Seven payloads recorded by the backend, copied into this repo rather
 * than read out of a sibling checkout so the suite stands on its own.
 *
 * `modded` is a FLAG, not another fixture: the modded sheet swaps six template files for their
 * `_MODS` twins and is otherwise the same code, so it costs one fixture to cover rather than seven.
 * The one gap 01 found is still open — every payload's Spheres content is `might` (combat) only, so
 * the magic-talent branch has no recording yet and `magic_talent_items` is empty everywhere.
 */
const FIXTURE_ROSTER = [
  { name: 'martial',    payload: 'martial.json',    modded: 'n', buffs: 'n', covers: 'fighter 16 — the plain path: no casting, no subsystem' },
  { name: 'rogue',      payload: 'rogue.json',      modded: 'n', buffs: 'y', covers: 'rogue 18 — skills-heavy, custom buffs on' },
  { name: 'caster',     payload: 'caster.json',     modded: 'n', buffs: 'n', covers: 'summoner/cleric 9 — prepared AND spontaneous spellbooks in one run' },
  { name: 'initiator',  payload: 'initiator.json',  modded: 'n', buffs: 'n', covers: 'warlord 10 — Path of War maneuvers, stances, disciplines' },
  { name: 'manifester', payload: 'manifester.json', modded: 'n', buffs: 'n', covers: 'psion 5 — psionic powers and manifester books' },
  { name: 'mentor',     payload: 'mentor.json',     modded: 'n', buffs: 'n', covers: 'fighter 15 — trainers/professions and Spheres of Might talents' },
  { name: 'companion',  payload: 'companion.json',  modded: 'y', buffs: 'y', covers: 'druid 4 — THE MODDED BRANCH (_MODS templates) + bonded creatures in the payload' },
];

/** The packs the build reads, and the module whose active-check gates each one. */
const WANTED_PACKS = [
  { module: 'pf1spheres',   packId: 'pf1spheres.magic-talents' },
  { module: 'pf1spheres',   packId: 'pf1spheres.combat-talents' },
  { module: 'pf1-pow',      packId: 'pf1-pow.disciplines' },
  { module: 'pf1-psionics', packId: 'pf1-psionics.powers' },
];

// ---- snapshot normalisation (ticket 01) ---------------------------------------------------------

const LONG_STRING = 200;
const shortHash = (text) => 'sha256:' + createHash('sha256').update(text).digest('hex').slice(0, 16);

/**
 * Sort keys; hash long strings. Nothing else is touched — in particular ids are LEFT IN, because
 * they are content-derived now and a changed id means changed content, which is exactly what a
 * golden is for.
 */
function normalise(value) {
  if (Array.isArray(value)) return value.map(normalise);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = normalise(value[key]);
    return out;
  }
  if (typeof value === 'string' && value.length > LONG_STRING) {
    return `<${value.length} chars ${shortHash(value)}>`;
  }
  return value;
}

/**
 * Duplicate `_id`s, checked PER COLLECTION rather than across the whole tree.
 *
 * The first version of this checked every `_id` anywhere and failed on all seven fixtures — wrongly.
 * pf1 scopes ids the way Foundry does: an id only has to be unique among its siblings. The attack
 * twin `createScalingAttackItem` clones out of the weapon legitimately carries the same conditional
 * ids as the weapon it was cloned from, because they live in different items' collections. A global
 * check calls that a bug; it is not one.
 *
 * What IS a bug, and what this catches, is two entries in the SAME collection sharing an id —
 * Foundry silently collapses them into one on `actor.update()`, which is exactly the failure the
 * "every clone would share it" comments in `modify-abilities.js` are guarding against.
 */
function findDuplicateIds(template) {
  const problems = [];
  const check = (scope, rows) => {
    if (!Array.isArray(rows)) return;
    const seen = new Set();
    for (const row of rows) {
      const id = row?._id;
      if (typeof id !== 'string' || !id) continue;
      if (seen.has(id)) problems.push(scope + ' -> ' + id);
      seen.add(id);
    }
  };

  check('items', template.items);
  for (const item of template.items ?? []) {
    const where = 'items["' + item?.name + '"]';
    check(where + '.system.changes', item?.system?.changes);
    check(where + '.system.scriptCalls', item?.system?.scriptCalls);
    check(where + '.system.actions', item?.system?.actions);
    for (const action of item?.system?.actions ?? []) {
      const actionWhere = where + '.actions["' + action?.name + '"]';
      check(actionWhere + '.conditionals', action?.conditionals);
      for (const conditional of action?.conditionals ?? []) {
        check(actionWhere + '.conditionals["' + conditional?.name + '"].modifiers', conditional?.modifiers);
      }
    }
  }
  return problems;
}

// ---- one run ------------------------------------------------------------------------------------

let mainFn;
let packFixtures;

before(async () => {
  // No temp-dir staging: package.json declares "type": "module", so node imports scripts/*.js
  // directly. That file is dev-only and excluded from the release zip.
  ({ main: mainFn } = await import(pathToFileURL(path.join(MODULE_ROOT, 'scripts', 'modify-abilities.js')).href));
  packFixtures = loadPackFixtures(WANTED_PACKS);
  if (!existsSync(GOLDEN_DIR)) mkdirSync(GOLDEN_DIR, { recursive: true });
});

async function runFixture(fixture) {
  const payload = JSON.parse(readFileSync(path.join(PAYLOAD_DIR, fixture.payload), 'utf-8'));
  const deps = deterministicDeps({ seed: 1 });
  const stubs = installFoundryStubs({
    storage: {
      'deliverData.json': { modded_char_sheet: fixture.modded },
      addCustomBuffs: fixture.buffs,
      pulledCharacterData: payload,
    },
    activeModules: packFixtures.present,
    packs: packFixtures.packs,
  });

  let returned;
  let thrown = null;
  try {
    returned = await mainFn(deps);
  } catch (error) {
    thrown = error;          // main() catches its own errors, so this means the catch itself broke
  } finally {
    stubs.restore();
  }

  return {
    returned,
    thrown,
    template: stubs.exportTemplate(),
    notifications: stubs.captured.notifications,
    errors: stubs.captured.error,
    // Every "X not in <pack> -- synthesizing" warning, verbatim. These are the direct measure of how
    // well the dumped packs match the backend's names, and the only thing that will notice when a
    // third-party module renames something. Recorded in full rather than counted: a count that
    // stayed at 3 while all three names changed would say nothing.
    synthesised: stubs.captured.warn
      .filter((line) => /synthesiz/i.test(line))
      .map((line) => line.trim())
      .sort(),
    mutatedTemplates: drainMutatedTemplates(),
    mintedIds: deps.minted,
    mintCalls: deps.calls,
  };
}

// ---- the tests ----------------------------------------------------------------------------------

// Said once, loudly. A missing pack dump is not a failure — the build genuinely supports a user
// without pf1spheres installed — but it does mean the ACTIVE branches of the Spheres / Path of War /
// psionics walks have no golden behind them, and ticket 06 edits code on those paths. Silence here
// would let someone read a green suite as coverage it does not have.
test('compendium fixtures are present', () => {
  if (packFixtures.missing.length) {
    console.log('\n  NOTE — no pack dump for: ' + packFixtures.missing.join(', '));
    console.log('  Those modules are reported INACTIVE, so only their fallback paths are covered.');
    console.log('  Run tools/dump_packs.macro.js in Foundry and drop the files into tools/fixtures/packs/.\n');
  }
  for (const warning of packFixtures.stale) console.log('  STALE PACK DUMP — ' + warning);
  assert.ok(true);   // informational by design; see ticket 11
});

for (const fixture of FIXTURE_ROSTER) {
  test(fixture.name + ' — ' + fixture.covers, async () => {
    const result = await runFixture(fixture);

    assert.equal(result.thrown, null, 'main() threw past its own try/catch: ' + result.thrown?.stack);
    assert.equal(result.returned, true,
      'main() returned ' + result.returned + ' — it reports failure and button.js would build no actor.\n'
      + 'errors: ' + JSON.stringify(result.errors.slice(0, 5), null, 2));
    assert.ok(result.template, 'nothing was written to exportFoundryPath');

    // Every id THIS RUN MINTED must be distinct. That is the property a sequence gave for free and
    // content-derived ids do not, so it is checked directly at the source rather than inferred from
    // the output — where template-supplied ids the build never chose would muddy the result.
    assert.equal(result.mintedIds.size, result.mintCalls,
      'the content-derived mint issued the same id twice');

    // Two findings this harness surfaced, kept as tracked lists rather than asserted away:
    //
    //   mutatedTemplates — the build used to mutate its own template data in place, nine files on
    //     the very first fixture. It was harmless only because every generation re-parsed all
    //     ~90 MB; the template cache turned it into cross-generation corruption and five of these
    //     fixtures went red. All six sites now clone on read and the list is EMPTY, so a new entry
    //     here is no longer a cosmetic regression — it is a live bug.
    //
    //     Read it knowing what it can and cannot see. The stub restores its own parsed copy after
    //     each fixture, but the loader holds the objects it was handed, so from the second run
    //     onward this list reports on data the build no longer reads. It is an honest detector for
    //     the FIRST generation in the process; the cross-payload test at the bottom of this file
    //     is what covers the rest.
    //
    //   duplicateItemIds — on the MODDED branch three spells are appended twice carrying the same
    //     `_id` from every_spell_MODS.json, and `actor.update()` collapses same-id siblings into
    //     one. That is `_MODS` twin drift, which the map puts out of scope on purpose.
    //
    // A new entry in either list is a regression; an entry leaving one is progress.
    const snapshot = {
      mutatedTemplates: result.mutatedTemplates,
      duplicateItemIds: findDuplicateIds(result.template),
      synthesised: result.synthesised,
      template: normalise(result.template),
      notifications: result.notifications,
      errors: result.errors.map((line) => (line.length > LONG_STRING ? shortHash(line) : line)),
    };
    const goldenPath = path.join(GOLDEN_DIR, fixture.name + '.json');
    const text = JSON.stringify(snapshot, null, 1) + '\n';

    if (UPDATE || !existsSync(goldenPath)) {
      writeFileSync(goldenPath, text);
      console.log('  ' + (UPDATE ? 're-recorded' : 'RECORDED (was missing)') + ' ' + fixture.name
        + ' — ' + result.template.items.length + ' items, ' + (text.length / 1024).toFixed(0) + ' KB');
      return;
    }

    const golden = JSON.parse(readFileSync(goldenPath, 'utf-8'));
    assert.deepEqual(snapshot, golden,
      'output changed for "' + fixture.name + '".\n'
      + 'If that is intended, re-record with:  node tools/generate_character.test.mjs --update');
  });
}

/**
 * The case the fixtures above cannot cover, and the one a template cache breaks.
 *
 * Every test above builds ONE character. Production does not: the loader parses ~90 MB of template
 * JSON once and hands the same objects to every generation for the rest of the Foundry session, so
 * a build that writes into its own template data produces a correct first character and a quietly
 * wrong second one. Six sites did exactly that.
 *
 * REBUILDING THE SAME PAYLOAD TWICE DOES NOT CATCH IT, which is worth stating because it is the
 * obvious test to write. Nearly every one of those six writes is a plain assignment — a sort, a
 * level, a rank — so replaying one payload re-writes the identical value and the two sheets agree
 * even while the template is being corrupted. The damage only becomes visible when a DIFFERENT
 * character runs against the leftovers: one that never touches the skill the last one ranked, or
 * whose class harvests a feat the last one levelled.
 *
 * So this builds A, then B, then A again, and asserts the two A's agree. It checks the PROPERTY
 * rather than a recorded value, so it cannot be satisfied by re-recording it.
 */
test('a character built after a different one is unaffected by it', async () => {
  const a = FIXTURE_ROSTER.find((f) => f.name === 'martial') ?? FIXTURE_ROSTER[0];
  const b = FIXTURE_ROSTER.find((f) => f.name === 'rogue' && f !== a)
    ?? FIXTURE_ROSTER.find((f) => f !== a);

  const clean = await runFixture(a);
  await runFixture(b);
  const after = await runFixture(a);

  assert.equal(after.thrown, null, 'the rebuild threw: ' + after.thrown?.stack);
  assert.deepEqual(
    normalise(after.template), normalise(clean.template),
    'building "' + a.name + '" gave a different sheet once "' + b.name + '" had run first.\n'
    + '"' + b.name + '" left state behind — almost certainly a loaded template mutated in place.\n'
    + 'Clone before writing; the loader hands every generation the same objects.',
  );
});

after(() => {
  if (UPDATE) console.log('\nGoldens re-recorded. Review the diff — that diff IS the review.\n');
});

/**
 * THE ACCEPTANCE TEST FOR THIS FILE, which is not one of the tests above and cannot be.
 *
 * A golden harness that passes on a sabotaged build is worse than no harness, because the whole rest
 * of the restructuring trusts it. So the check is performed by hand: break one line of
 * `modify-abilities.js` — drop a `+ 1`, skip an append, change a sort — and confirm this file goes
 * red and names the fixture. Ticket 02 records the result of that run.
 */
