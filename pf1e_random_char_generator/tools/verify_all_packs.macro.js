/**
 * FOUNDRY GM MACRO — not a Node script. Paste into a script macro and run it.
 *
 * Verifies every shipped compendium against the JSON bundle it was built from, in one pass.
 * Supersedes running `verify_feat_pack.macro.js` seven times.
 *
 * Three checks per pack, and the third is the one worth having:
 *
 *   count       — the pack index size against the bundle's row count.
 *   names       — every name in the bundle resolves in the pack. Catches a partial import that
 *                 happens to have the right total, which a count alone cannot.
 *   automation  — for up to five rows the bundle says carry `system.changes`, the pack's copy is
 *                 fetched and its change count compared. Probes are DERIVED FROM THE BUNDLE rather
 *                 than hardcoded, so each pack is checked against its own content instead of against
 *                 feat names that only exist in one of them.
 *
 * A pack with no `system.changes` anywhere reports "none to check" and does not fail: that is a
 * true statement about that bundle, not a problem with the pack.
 *
 * Prints one line per pack and a final verdict. Safe to run with Foundry open — reads only.
 */
(async () => {
  const MODULE_ID = 'pf1e_random_char_generator';
  const DIR = `modules/${MODULE_ID}/templates/character_sheet_folder`;
  const PROBE_COUNT = 5;

  const TARGETS = [
    { pack: 'feats',       file: 'every_feat.json' },
    { pack: 'feats-mods',  file: 'every_feat_MODS.json' },
    { pack: 'items',       file: 'every_item.json' },
    { pack: 'spells',      file: 'every_spell.json' },
    { pack: 'spells-mods', file: 'every_spell_MODS.json' },
    { pack: 'traits',      file: 'every_trait.json' },
    { pack: 'traits-mods', file: 'every_trait_MODS.json' },
  ];

  const out = [];
  const say = (line) => { out.push(line); console.log(line); };

  say(`pack           index   bundle   names        automation     verdict`);
  say(`──────────────────────────────────────────────────────────────────────`);

  let allPass = true;
  const detail = [];

  for (const target of TARGETS) {
    const packId = `${MODULE_ID}.${target.pack}`;
    const pack = game.packs.get(packId);
    if (!pack) {
      say(`${target.pack.padEnd(13)}  —       —        —            —              NO PACK`);
      allPass = false;
      continue;
    }

    let rows;
    try {
      const response = await fetch(`${DIR}/${target.file}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const parsed = await response.json();
      rows = Array.isArray(parsed) ? parsed : (parsed.items ?? []);
    } catch (error) {
      say(`${target.pack.padEnd(13)}  —       —        —            —              BUNDLE UNREADABLE`);
      allPass = false;
      continue;
    }

    const index = await pack.getIndex();
    const count = index.size ?? index.length ?? 0;

    // names
    const packNames = new Set([...index].map((r) => String(r.name)));
    const missing = rows.map((r) => String(r.name)).filter((n) => !packNames.has(n));

    // automation, probed from this bundle's own content
    const candidates = rows.filter((r) => Array.isArray(r.system?.changes) && r.system.changes.length).slice(0, PROBE_COUNT);
    let intact = 0;
    const badProbes = [];
    for (const source of candidates) {
      const entry = [...index].find((r) => String(r.name) === String(source.name));
      if (!entry) { badProbes.push(`${source.name} (absent)`); continue; }
      const doc = await pack.getDocument(entry._id);
      const got = doc?.system?.changes ?? [];
      const gotLen = got.length ?? got.size ?? 0;
      if (gotLen === source.system.changes.length) intact++;
      else badProbes.push(`${source.name} (${gotLen} vs ${source.system.changes.length})`);
    }

    const countOk = count === rows.length;
    const namesOk = missing.length === 0;
    const autoOk = candidates.length === 0 || intact === candidates.length;
    const pass = countOk && namesOk && autoOk;
    if (!pass) allPass = false;

    const autoText = candidates.length ? `${intact}/${candidates.length} intact` : 'none to check';
    say(`${target.pack.padEnd(13)} ${String(count).padStart(6)}  ${String(rows.length).padStart(6)}   `
      + `${(namesOk ? 'all resolve' : `${missing.length} MISSING`).padEnd(12)} ${autoText.padEnd(14)} ${pass ? 'PASS' : 'FAIL'}`);

    if (missing.length) detail.push(`${target.pack}: missing ${missing.length} — e.g. ${missing.slice(0, 5).join(', ')}`);
    if (badProbes.length) detail.push(`${target.pack}: automation — ${badProbes.join('; ')}`);
  }

  say(`──────────────────────────────────────────────────────────────────────`);
  if (detail.length) { say(''); for (const d of detail) say(`  ${d}`); }
  say('');
  say(allPass ? 'ALL PASS — every pack is complete and automation survived.'
              : 'FAILURES ABOVE — do not wire the catalog to these yet.');

  ChatMessage.create({ content: `<pre style="white-space:pre-wrap">${out.join('\n')}</pre>`, whisper: [game.user.id] });
  ui.notifications[allPass ? 'info' : 'error'](allPass ? 'All packs verified.' : 'Pack verification FAILED — see chat.');
})();
