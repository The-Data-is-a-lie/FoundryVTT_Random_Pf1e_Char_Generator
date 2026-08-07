/**
 * FOUNDRY GM MACRO — not a Node script. Paste into a script macro in your world and run it once.
 *
 * ANSWERS ONE QUESTION: could this module stop shipping its own copies of the compendium and read
 * pf1's packs instead?
 *
 * The module carries ~125 MB of `every_*.json` in `templates/character_sheet_folder/`, of which
 * `every_feat.json` (26.3 MB, 8,816 rows) and `every_item.json` (25.0 MB, 6,035 rows) are the bulk.
 * That is the whole remaining cost of a generation: after the catalog and the per-class clone fix,
 * building a character is ~12 ms and LOADING those files is ~550 ms plus the resident memory.
 *
 * Foundry's compendiums are already indexed and lazily loaded, and this module ALREADY reads them in
 * five places — `path-of-war.js`, `psionics.js`, `spheres.js`, and `createCompanions.js`, the last of
 * which resolves feats straight out of `pf1.feats`. The pattern is proven on the companion path and
 * absent from the main-character path. What is not known is whether the packs actually CONTAIN the
 * rows the build asks for; the synthesize-on-miss branches in `feats.js` and `equipment.js` exist
 * because coverage was already known to be imperfect somewhere.
 *
 * WHY A MACRO. pf1 stores its packs as LevelDB directories. Bare node cannot read them and a native
 * LevelDB dependency was rejected (ticket 11), so this has to run inside Foundry — same reason
 * `dump_packs.macro.js` exists. Unlike that one it downloads no fixtures: it reads pack INDEXES
 * (names only, cheap) and reports.
 *
 * TWO NUMBERS, AND THE SECOND IS THE DECISION.
 *
 *   1. Bundle coverage — of every row in the shipped file, how many exist in a pf1 pack by name.
 *      This says whether the file could be DELETED.
 *   2. Used-name coverage — of the names the eight golden payloads actually ask for, how many
 *      resolve. This says whether real characters would still build. A file can be 70% covered and
 *      still perfectly safe to drop if the 30% is content nobody rolls; it can be 95% covered and
 *      unsafe if the missing 5% is Power Attack.
 *
 * Read (2) first. (1) only bounds how much disk the change could ever recover.
 */
(async () => {
  const MODULE_ID = 'pf1e_random_char_generator';
  const SHEET = `modules/${MODULE_ID}/templates/character_sheet_folder`;
  const PAYLOADS = `modules/${MODULE_ID}/tools/fixtures/payloads`;

  // The real lookup rule, imported rather than re-implemented — see catalog.js.
  const { baseKey } = await import(`/modules/${MODULE_ID}/scripts/build/catalog.js`);

  /** Bundle -> the pf1 packs a row could plausibly come from. */
  const TARGETS = [
    { bundle: 'every_feat.json',   packs: ['pf1.feats'] },
    { bundle: 'every_item.json',   packs: ['pf1.items', 'pf1.ultimate-equipment', 'pf1.armors-and-shields', 'pf1.technology'] },
    { bundle: 'every_weapon.json', packs: ['pf1.items', 'pf1.ultimate-equipment'] },
    { bundle: 'every_armor.json',  packs: ['pf1.armors-and-shields', 'pf1.ultimate-equipment'] },
    { bundle: 'every_spell.json',  packs: ['pf1.spells'] },
    { bundle: 'every_class.json',  packs: ['pf1.classes', 'pf1.class-abilities'] },
  ];

  /** Payload fields the build turns into a feat lookup. Mirrors the nine addFeats/addTraits calls. */
  const FEAT_FIELDS = ['flavor_feats', 'flaw_feats', 'story_feats', 'feats', 'teamwork_feats',
                       'class_feats', 'bloodline_feats', 'trainer_feats'];
  const FIXTURES = ['martial', 'rogue', 'caster', 'initiator', 'manifester', 'mentor', 'companion', 'sop'];

  const readJson = async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${response.status} ${url}`);
    return response.json();
  };
  const rowsOf = (parsed) => (Array.isArray(parsed) ? parsed : parsed?.items ?? []);

  // ---- pack indexes, keyed the way the build looks things up ------------------------------------
  const packKeys = new Map();          // packId -> Set of baseKey(name)
  for (const packId of [...new Set(TARGETS.flatMap((t) => t.packs))]) {
    const pack = game.packs.get(packId);
    if (!pack) { packKeys.set(packId, null); continue; }
    const index = await pack.getIndex();
    packKeys.set(packId, new Set([...index].map((row) => baseKey(String(row.name ?? '')))));
  }

  const report = [];
  const say = (line) => { report.push(line); console.log(line); };

  say(`\n=== compendium census — ${MODULE_ID} ===\n`);
  for (const [packId, keys] of packKeys) {
    say(keys ? `  pack ${packId.padEnd(28)} ${String(keys.size).padStart(6)} names`
             : `  pack ${packId.padEnd(28)}   NOT INSTALLED`);
  }

  // ---- 1. bundle coverage ------------------------------------------------------------------------
  say('\n--- 1. bundle coverage: could the file be deleted? ---\n');
  const detail = {};
  for (const target of TARGETS) {
    let rows;
    try { rows = rowsOf(await readJson(`${SHEET}/${target.bundle}`)); }
    catch (error) { say(`  ${target.bundle.padEnd(22)} UNREADABLE (${error.message})`); continue; }

    const covered = new Set(target.packs.flatMap((id) => [...(packKeys.get(id) ?? [])]));
    const misses = [];
    let hit = 0;
    for (const row of rows) {
      if (typeof row?.name !== 'string') continue;
      if (covered.has(baseKey(row.name))) hit++;
      else misses.push(row.name);
    }
    const pctHit = rows.length ? ((hit / rows.length) * 100).toFixed(1) : '0.0';
    say(`  ${target.bundle.padEnd(22)} ${String(hit).padStart(6)}/${String(rows.length).padEnd(6)} ${pctHit.padStart(5)}%  missing ${misses.length}`);
    detail[target.bundle] = { rows: rows.length, hit, missing: misses.length, sampleMisses: misses.slice(0, 40) };
  }

  // ---- 2. used-name coverage ---------------------------------------------------------------------
  say('\n--- 2. used-name coverage: would real characters still build? ---\n');
  const featPack = packKeys.get('pf1.feats');
  const usedByFixture = {};
  const allMissing = new Map();          // name -> fixtures that wanted it

  for (const name of FIXTURES) {
    let payload;
    try { payload = await readJson(`${PAYLOADS}/${name}.json`); }
    catch { say(`  ${name.padEnd(12)} payload unreadable — skipped`); continue; }

    const wanted = FEAT_FIELDS.flatMap((field) => {
      const value = payload[field];
      return Array.isArray(value) ? value.flat(Infinity) : [];
    }).filter((entry) => typeof entry === 'string');

    const missing = wanted.filter((entry) => !featPack?.has(String(entry).toLowerCase()));
    for (const entry of missing) {
      if (!allMissing.has(entry)) allMissing.set(entry, []);
      allMissing.get(entry).push(name);
    }
    const pctOk = wanted.length ? (((wanted.length - missing.length) / wanted.length) * 100).toFixed(1) : '100.0';
    say(`  ${name.padEnd(12)} ${String(wanted.length - missing.length).padStart(4)}/${String(wanted.length).padEnd(4)} feats resolve from pf1.feats  ${pctOk.padStart(6)}%`);
    usedByFixture[name] = { wanted: wanted.length, missing: missing.length, names: missing };
  }

  if (allMissing.size) {
    say(`\n  ${allMissing.size} distinct feat name(s) no pf1.feats entry covers:`);
    for (const [name, fixtures] of [...allMissing].slice(0, 60)) {
      say(`    - ${name}   (${fixtures.join(', ')})`);
    }
    say('\n  These are what a slim supplement bundle would have to keep, on top of whatever the');
    say('  _MODS branch needs. Compare that list against the synthesize-on-miss warnings the golden');
    say('  harness already records: a name in BOTH is one the build never resolved anyway.');
  } else {
    say('\n  Every feat the eight fixtures ask for resolves from pf1.feats.');
  }

  const payload = { _source: { system: game.system.id, version: String(game.system.version) },
                    bundleCoverage: detail, usedCoverage: usedByFixture };
  saveDataToFile(JSON.stringify(payload, null, 1), 'application/json', 'compendium-census.json');

  ui.notifications.info('Compendium census complete — see the console, and compendium-census.json was downloaded.');
  ChatMessage.create({ content: `<pre>${report.join('\n')}</pre>`, whisper: [game.user.id] });
})();
