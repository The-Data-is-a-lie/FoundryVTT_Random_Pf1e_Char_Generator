/**
 * The benchmark for the main character path.
 *
 *   npm run bench                        # every fixture
 *   node tools/bench.mjs                 # the same thing without npm
 *   node tools/bench.mjs martial rogue   # just these fixtures
 *
 * WHY THIS EXISTS. Nothing in this repo timed anything. Every statement about which part of a
 * generation is slow — the feat scans, the template parse, the per-class clone — was an estimate
 * read off the source, and estimates are a bad thing to refactor against. This drives the same
 * fixtures the golden harness does, through the same stubs, and prints what each stage actually
 * costs. It asserts nothing: `npm test` owns correctness, this owns the numbers.
 *
 * HOW TO READ THE STAGE TABLE. The stub parses each template file once and shares it across the
 * whole process (foundry-stubs.mjs, property 2), and production caches the same way per Foundry
 * session (template-loader.js). So these stage timings are the STEADY STATE — the second and every
 * later character built in a session. The one-off parse cost the first generation pays is measured
 * separately, at the bottom, straight off disk.
 *
 * WHAT IT CANNOT SEE. Console cost. The stubs capture `console.log` into an array via `String(arg)`,
 * where a browser devtools console serialises the object lazily and then RETAINS it. So the log-line
 * count below is an honest measure of volume and a useless one of time; do not read it as ms.
 *
 * Document writes are also invisible here — `actor.update()` never happens under node. The
 * createCompanions / forceRederive churn has to be watched in a real Foundry.
 */
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  installFoundryStubs, loadPackFixtures, loadModulePacks, deterministicDeps, MODULE_ROOT, FIXTURES,
} from './foundry-stubs.mjs';
import { FIXTURE_ROSTER, WANTED_PACKS } from './fixture-roster.mjs';

const PAYLOAD_DIR = path.join(FIXTURES, 'payloads');

const wanted = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const roster = wanted.length
  ? FIXTURE_ROSTER.filter((f) => wanted.includes(f.name))
  : FIXTURE_ROSTER;

if (!roster.length) {
  console.error('No fixture matched. Known: ' + FIXTURE_ROSTER.map((f) => f.name).join(', '));
  process.exit(1);
}

// ---- formatting ---------------------------------------------------------------------------------

const ms = (value) => value.toFixed(1).padStart(8);
const head = (text) => String(text).padStart(8);
const pct = (part, whole) => (whole ? ((part / whole) * 100).toFixed(1) : '0.0').padStart(5) + '%';
const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1).padStart(6) + ' MB';
const pad = (text, width) => String(text).padEnd(width);
const rule = (width) => '  ' + '─'.repeat(width);

// ---- one fixture --------------------------------------------------------------------------------

async function benchFixture(main, packFixtures, fixture) {
  const payload = JSON.parse(readFileSync(path.join(PAYLOAD_DIR, fixture.payload), 'utf-8'));

  const stages = [];
  const deps = deterministicDeps({ seed: 1 });
  // Recorded as a list, not a map: two stages could share a name by mistake and summing them
  // silently would hide it. Nothing does today, and the aggregate below would show it if one did.
  deps.onStage = (name, elapsed) => stages.push({ name, ms: elapsed });

  const stubs = installFoundryStubs({
    storage: {
      'deliverData.json': { modded_char_sheet: fixture.modded },
      addCustomBuffs: fixture.buffs,
      pulledCharacterData: payload,
    },
    activeModules: packFixtures.present,
    packs: packFixtures.packs,
  });

  const started = performance.now();
  let returned;
  let thrown = null;
  try {
    returned = await main(deps);
  } catch (error) {
    thrown = error;
  } finally {
    stubs.restore();
  }
  const wall = performance.now() - started;

  const template = stubs.exportTemplate();
  return {
    fixture,
    stages,
    wall,
    ok: returned === true && !thrown,
    thrown,
    items: template?.items?.length ?? 0,
    served: [...stubs.served],
    logLines: stubs.captured.info.length + stubs.captured.warn.length + stubs.captured.error.length,
  };
}

// ---- the template bill --------------------------------------------------------------------------

/**
 * What the first generation of a session pays: bytes off disk and the JSON.parse to turn them into
 * the object graph that then stays resident. Measured here rather than inside a run because the stub
 * shares one parse across the whole process, so a run cannot see it.
 */
function templateBill(served) {
  const rows = [];
  let bytes = 0;
  let parseMs = 0;
  for (const absolute of served) {
    const size = statSync(absolute).size;
    const text = readFileSync(absolute, 'utf-8');
    const started = performance.now();
    JSON.parse(text);
    const elapsed = performance.now() - started;
    bytes += size;
    parseMs += elapsed;
    rows.push({ file: path.basename(absolute), size, ms: elapsed });
  }
  rows.sort((a, b) => b.size - a.size);
  return { rows, bytes, parseMs };
}

// ---- run ----------------------------------------------------------------------------------------

const { main } = await import(
  pathToFileURL(path.join(MODULE_ROOT, 'scripts', 'modify-abilities.js')).href
);
const packFixtures = loadPackFixtures(WANTED_PACKS);
// The module's own packs, same as the suite. Without these the bench would measure the JSON
// fallback path and report a saving that production does not get.
for (const [id, stub] of loadModulePacks()) packFixtures.packs.set(id, stub);

if (packFixtures.missing.length) {
  console.log('\n  NOTE — no pack dump for: ' + packFixtures.missing.join(', '));
  console.log('  Those modules report INACTIVE, so their stages do only fallback work here.');
}

/**
 * The roster runs TWICE, and only the second pass is the answer.
 *
 * The first pass is a session's first generation: the stub has not parsed anything yet, so whichever
 * fixture runs first wears the whole base-branch parse, and the first MODDED fixture wears the
 * `_MODS` parse on top. Reporting one merged pass put `load-templates` at 63% of all measured time
 * and buried every real stage under an artefact of fixture order.
 *
 * Production has exactly the same two regimes — the loader caches per session — so both are worth
 * printing. They just answer different questions: pass 1 is "why is the first character slow", pass 2
 * is "why is every character after it slow".
 */
const cold = [];
for (const fixture of roster) cold.push(await benchFixture(main, packFixtures, fixture));
const warm = [];
for (const fixture of roster) warm.push(await benchFixture(main, packFixtures, fixture));

const loadOf = (result) => result.stages.filter((s) => s.name === 'load-templates').reduce((sum, s) => sum + s.ms, 0);

// ---- per-fixture --------------------------------------------------------------------------------

console.log('\n  PER FIXTURE — cold is the first build of a session, warm is every one after\n');
console.log('  ' + pad('fixture', 12) + head('cold ms') + head('load') + head('warm ms')
  + '   ' + 'items'.padStart(6) + '   ' + 'logs'.padStart(6) + '   status');
console.log(rule(74));
for (let i = 0; i < warm.length; i++) {
  const result = warm[i];
  const status = result.ok ? 'ok' : (result.thrown ? 'THREW: ' + result.thrown.message : 'main() returned false');
  console.log('  ' + pad(result.fixture.name, 12) + ms(cold[i].wall) + ms(loadOf(cold[i])) + ms(result.wall)
    + '   ' + String(result.items).padStart(6) + '   ' + String(result.logLines).padStart(6) + '   ' + status);
}

// ---- stage ranking ------------------------------------------------------------------------------

// Warm only, and `load-templates` is dropped rather than ranked: warm it is a cache hit measuring
// nothing, and cold it is the session one-off the TEMPLATES section below prices properly.
const totals = new Map();
for (const result of warm) {
  for (const stage of result.stages) {
    if (stage.name === 'load-templates') continue;
    const row = totals.get(stage.name) ?? { name: stage.name, total: 0, worst: 0, worstIn: '' };
    row.total += stage.ms;
    if (stage.ms > row.worst) { row.worst = stage.ms; row.worstIn = result.fixture.name; }
    totals.set(stage.name, row);
  }
}
const ranked = [...totals.values()].sort((a, b) => b.total - a.total);
const stageTotal = ranked.reduce((sum, row) => sum + row.total, 0);
const wallTotal = warm.reduce((sum, r) => sum + r.wall, 0);

console.log('\n  BUILD STAGES — warm, all fixtures, load-templates excluded\n');
console.log('  ' + pad('stage', 20) + head('total') + '  ' + '  share' + head('worst') + '   in');
console.log(rule(64));
for (const row of ranked) {
  console.log('  ' + pad(row.name, 20) + ms(row.total) + '  ' + pct(row.total, stageTotal)
    + ms(row.worst) + '   ' + row.worstIn);
}
console.log(rule(64));
console.log('  ' + pad('stages', 20) + ms(stageTotal) + '  ' + pct(stageTotal, wallTotal) + '  of warm wall');
console.log('  ' + pad('warm wall', 20) + ms(wallTotal) + '         ' + ms(wallTotal / warm.length).trim() + ' per character');
console.log('  ' + pad('cold wall', 20) + ms(cold.reduce((s, r) => s + r.wall, 0)));

// ---- the data bill ------------------------------------------------------------------------------

// Every fixture fetches the same list today (loadTemplates() is all-or-nothing), so the union is
// also what any single generation pays. When lazy loading lands, this stops being true and the
// per-fixture difference is the number that will show it worked.
const servedUnion = [...new Set(warm.flatMap((r) => r.served))].sort();
const bill = templateBill(servedUnion);

console.log('\n  TEMPLATES — the one-off cost of the FIRST generation in a session\n');
console.log('  ' + pad('file', 34) + '   ' + 'size'.padStart(9) + head('parse ms'));
console.log(rule(62));
for (const row of bill.rows.slice(0, 12)) {
  console.log('  ' + pad(row.file, 34) + '   ' + mb(row.size).trim().padStart(9) + ms(row.ms));
}
if (bill.rows.length > 12) {
  const rest = bill.rows.slice(12);
  console.log('  ' + pad(`… ${rest.length} more`, 34) + '   '
    + mb(rest.reduce((s, r) => s + r.size, 0)).trim().padStart(9)
    + ms(rest.reduce((s, r) => s + r.ms, 0)));
}
console.log(rule(62));
console.log('  ' + pad(`${bill.rows.length} bundles fetched`, 34) + '   ' + mb(bill.bytes).trim().padStart(9) + ms(bill.parseMs));
console.log('\n  Fetched unconditionally: loadTemplates() has no per-stage branch, so a fixture with');
console.log('  no casting and no subsystem still pays for every bundle above.\n');
