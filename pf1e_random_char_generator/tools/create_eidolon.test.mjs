/**
 * The eidolon half of the companion harness, in CI.
 *
 *   node tools/create_eidolon.test.mjs
 *
 * `create_companions.test.mjs` replays ONE payload -- its whole body runs at import time against a
 * single fixture, and under `node --test` there is no argv to hand it a second one. So rather than
 * fork that harness or duplicate its ~250 lines of Foundry stubs, this file runs it again as a child
 * process against `summoner.json` and asserts it came back clean.
 *
 * It exists because the eidolon is shaped unlike every other bonded creature -- an Evolutions band,
 * a `pf_content` name that is not its species, and a stat block pf1 has no progression to agree with
 * -- and `companion.json` (a druid's bird) exercises none of that.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

test('createCompanions — the chained summoner\'s eidolon (summoner.json)', () => {
  let output = '';
  try {
    output = execFileSync(process.execPath, [
      path.join(HERE, 'create_companions.test.mjs'),
      path.join(HERE, 'fixtures', 'payloads', 'summoner.json'),
    ], { encoding: 'utf-8' });
  } catch (error) {
    assert.fail(`the eidolon fixture failed:\n${error.stdout ?? ''}${error.stderr ?? ''}`);
  }
  // A green run still prints the actor summary, so a silent no-op run is caught too.
  assert.match(output, /1 actor\(s\) built from/, `harness produced no actor:\n${output}`);
});
