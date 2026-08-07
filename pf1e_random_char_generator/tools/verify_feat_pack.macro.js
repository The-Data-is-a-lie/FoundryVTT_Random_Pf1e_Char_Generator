/**
 * FOUNDRY GM MACRO — not a Node script. Paste into a script macro and run it.
 *
 * Verifies the shipped feat compendium against the JSON bundle it was built from. Run it after
 * `build_feat_pack.macro.js` and after any rebuild.
 *
 * WHY THIS EXISTS. The obvious check — open the compendium and look — cannot actually answer the
 * question. Foundry's sidebar shows no entry count, and eyeballing a few entries out of 8,816 proves
 * nothing about the rest. The first build of this pack imported ZERO rows and still looked plausible
 * from the UI. So the check is: every name in the bundle resolves in the pack, and the documents
 * that carry automation still carry it.
 *
 * WHAT IT DOES NOT CHECK. Rules text and images are assumed intact if the document exists; only the
 * mechanical `system.changes` are compared, because those are what silently stop working.
 */
(async () => {
  const MODULE_ID = 'pf1e_random_char_generator';
  const PACK_ID = `${MODULE_ID}.feats`;
  const SOURCE = `modules/${MODULE_ID}/templates/character_sheet_folder/every_feat.json`;

  // Feats known to carry exactly one `system.changes` row in the bundle. If the pack has these,
  // automation survived the round trip. Deliberately NOT Power Attack: its mechanics live in the
  // attack's conditionals, not in feat changes, so it proves nothing here.
  const PROBES = ['Toughness', 'Iron Will', 'Improved Initiative', 'Dodge', 'Great Fortitude', 'Lightning Reflexes'];

  const out = [];
  const say = (line) => { out.push(line); console.log(line); };

  const pack = game.packs.get(PACK_ID);
  if (!pack) {
    ui.notifications.error(`No pack "${PACK_ID}". Is the module enabled and module.json's "packs" entry correct?`);
    return;
  }

  const response = await fetch(SOURCE);
  if (!response.ok) { ui.notifications.error(`Could not read ${SOURCE}.`); return; }
  const parsed = await response.json();
  const rows = Array.isArray(parsed) ? parsed : (parsed.items ?? []);

  const index = await pack.getIndex();
  const count = index.size ?? index.length ?? 0;

  say(`pack:   ${PACK_ID}`);
  say(`locked: ${pack.locked}`);
  say(`count:  ${count} in pack vs ${rows.length} in every_feat.json`);

  // ---- 1. does every bundle name resolve in the pack? ----
  const packNames = new Set([...index].map((row) => String(row.name)));
  const missing = rows.map((r) => String(r.name)).filter((n) => !packNames.has(n));
  say('');
  if (missing.length) {
    say(`MISSING ${missing.length} name(s) the bundle has and the pack does not. First 20:`);
    for (const name of missing.slice(0, 20)) say(`   - ${name}`);
  } else {
    say(`every one of the ${rows.length} bundle names resolves in the pack.`);
  }

  // ---- 2. did automation survive? ----
  say('');
  const byName = new Map(rows.map((r) => [String(r.name), r]));
  let intact = 0;
  for (const name of PROBES) {
    const source = byName.get(name);
    const entry = [...index].find((row) => String(row.name) === name);
    if (!source) { say(`   ${name.padEnd(22)} not in the bundle — skipped`); continue; }
    if (!entry)  { say(`   ${name.padEnd(22)} MISSING FROM PACK`); continue; }

    const doc = await pack.getDocument(entry._id);
    const want = source.system?.changes ?? [];
    const got = doc?.system?.changes ?? [];
    const gotLen = got.length ?? got.size ?? 0;
    const ok = gotLen === want.length;
    if (ok) intact++;
    say(`   ${name.padEnd(22)} changes in pack: ${gotLen}  expected: ${want.length}  ${ok ? 'OK' : '*** MISMATCH ***'}`);
  }

  const verdict = (!missing.length && count === rows.length && intact === PROBES.length)
    ? 'PASS — the pack is complete and automation survived.'
    : 'FAIL — do not rely on this pack yet.';
  say('');
  say(verdict);

  ChatMessage.create({ content: `<pre style="white-space:pre-wrap">${out.join('\n')}</pre>`, whisper: [game.user.id] });
  ui.notifications[verdict.startsWith('PASS') ? 'info' : 'error'](verdict);
})();
