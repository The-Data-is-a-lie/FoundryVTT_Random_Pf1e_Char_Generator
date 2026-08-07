/**
 * FOUNDRY GM MACRO — not a Node script. Paste into a script macro and run it.
 *
 * Builds every JSON bundle that can become a compendium, in one pass. Supersedes
 * `build_feat_pack.macro.js`, which did one bundle; that file stays because it is the smaller thing
 * to reach for when only the feats need rebuilding.
 *
 * RESUMABLE AND IDEMPOTENT. A pack that already exists with the right document count is skipped, so
 * a run interrupted halfway can simply be run again. A pack that exists with the WRONG count is
 * reported and skipped rather than topped up, because a half-imported pack that gets more rows
 * appended is worse than one that is obviously wrong.
 *
 * WHAT IS NOT HERE, AND WHY
 *
 *   every_class.json  — `collectItems` in build/classes.js finds a class's features by ARRAY
 *                       ADJACENCY: everything between that class's item and the next class item.
 *                       Compendiums have no source order, and `sort` cannot rebuild it (876 distinct
 *                       values across 949 rows). Packing this needs the classes stage rewritten to
 *                       key features to their class explicitly. Refactor, not a macro.
 *   every_weapon.json — the ammo pick filters on system.subType/extraType, which a pack index does
 *                       not carry by default. Fixable with getIndex({fields:[...]}) but it is 1.1 MB.
 *   every_armor.json  — 66 rows, 0.2 MB. Nothing to win.
 *   spell_buffs.json  — a keyed dictionary, not an array of documents. Cannot be a pack at all.
 *
 * THESE PACKS ARE NOT READ YET. The build still loads the JSON. Running this changes no behaviour;
 * it produces folders to copy and a module.json block to paste. Keep the JSON bundles in the repo
 * afterwards — they are the source these are rebuilt from AND the fixtures the golden harness serves
 * packs out of. Only the release zip should stop shipping them.
 *
 * VERIFIED AGAINST: Foundry v13.351, pf1 11.11.
 */
(async () => {
  const MODULE_ID = 'pf1e_random_char_generator';
  const DIR = `modules/${MODULE_ID}/templates/character_sheet_folder`;
  const BATCH = 250;

  // Trim this list to build a subset. `feats` is listed first because it is the one already proven.
  const TARGETS = [
    { file: 'every_feat.json',       name: 'feats',       label: 'RCG — Feats' },
    { file: 'every_feat_MODS.json',  name: 'feats-mods',  label: 'RCG — Feats (modded)' },
    { file: 'every_item.json',       name: 'items',       label: 'RCG — Items' },
    { file: 'every_spell.json',      name: 'spells',      label: 'RCG — Spells' },
    { file: 'every_spell_MODS.json', name: 'spells-mods', label: 'RCG — Spells (modded)' },
    { file: 'every_trait.json',      name: 'traits',      label: 'RCG — Traits' },
    { file: 'every_trait_MODS.json', name: 'traits-mods', label: 'RCG — Traits (modded)' },
  ];

  const out = [];
  const say = (line) => { out.push(line); console.log(line); };
  const Collection = foundry.documents?.collections?.CompendiumCollection ?? globalThis.CompendiumCollection;

  if (!game.user.isGM) { ui.notifications.error('Run this as a GM.'); return; }
  if (!Collection?.createCompendium) { ui.notifications.error('createCompendium unavailable on this core version.'); return; }

  const built = [];
  const failed = [];
  const wholeRun = performance.now();

  for (const target of TARGETS) {
    say(`\n── ${target.label} (${target.file})`);

    // ---- read the bundle ----
    let rows;
    try {
      const response = await fetch(`${DIR}/${target.file}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const parsed = await response.json();
      rows = Array.isArray(parsed) ? parsed : (parsed.items ?? []);
    } catch (error) {
      say(`   SKIPPED — could not read: ${error.message}`);
      failed.push(`${target.name}: unreadable (${error.message})`);
      continue;
    }
    if (!rows.length) { say('   SKIPPED — no rows'); failed.push(`${target.name}: no rows`); continue; }

    // ---- resume: already done? ----
    const packId = `world.${target.name}`;
    let pack = game.packs.get(packId);
    if (pack) {
      const existing = await pack.getIndex();
      const have = existing.size ?? existing.length ?? 0;
      if (have === rows.length) { say(`   already built — ${have} documents, skipping`); built.push(target); continue; }
      if (have > 0) {
        say(`   SKIPPED — exists with ${have} of ${rows.length}. Delete it and re-run.`);
        failed.push(`${target.name}: partial (${have}/${rows.length})`);
        continue;
      }
    }

    // ---- create ----
    if (!pack) {
      pack = await Collection.createCompendium({
        name: target.name, label: target.label, type: 'Item',
        packageType: 'world', system: game.system.id,
      });
    }
    if (!pack) { say('   FAILED — createCompendium returned nothing'); failed.push(`${target.name}: no pack`); continue; }
    if (pack.locked) await pack.configure({ locked: false });

    // `_id`/`_stats` dropped so Foundry mints its own; `ownership` is the pack's to manage. Nothing
    // else is touched: the build clones a matched row straight onto the sheet, so any alteration
    // here would show up as a difference from a JSON run.
    //
    // EXCEPT `flags.<module>.idx`, WHICH IS LOAD-BEARING. Lookups resolve a name to the FIRST
    // matching row in array order -- and 445 feat keys have more than one candidate ("skill focus"
    // has 39, "signature skill" 27). A compendium is keyed by _id, so LevelDB hands rows back in an
    // order unrelated to the bundle's, and without this stamp a character asking for Skill Focus
    // would silently get a different variant than the JSON path gives it. The catalog reads this
    // back via getIndex({fields:['flags.pf1e_random_char_generator.idx']}) and keeps the lowest.
    const clean = rows.map((row, i) => {
      const copy = foundry.utils.deepClone(row);
      delete copy._id; delete copy._stats; delete copy.ownership;
      if (!copy.name) copy.name = 'Unnamed';
      copy.flags = { ...(copy.flags ?? {}), [MODULE_ID]: { idx: i } };
      return copy;
    });

    const id = pack.metadata?.id ?? pack.collection;
    const started = performance.now();
    let made = 0;
    let broke = false;

    for (let i = 0; i < clean.length; i += BATCH) {
      try {
        const created = await Item.createDocuments(clean.slice(i, i + BATCH), { pack: id, keepId: false, render: false });
        made += created.length;
      } catch (error) {
        console.error(`${target.name}: batch at ${i} failed:`, error);
        say(`   FAILED at row ${i}: ${error.message}`);
        failed.push(`${target.name}: batch ${i} — ${error.message}`);
        broke = true;
        break;
      }
    }
    if (broke) continue;

    const index = await pack.getIndex();
    const indexed = index.size ?? index.length ?? 0;
    if (indexed !== clean.length) {
      say(`   FAILED — index reports ${indexed} of ${clean.length}`);
      failed.push(`${target.name}: index ${indexed}/${clean.length}`);
      continue;
    }

    say(`   ${made} documents in ${((performance.now() - started) / 1000).toFixed(1)}s, index confirms ${indexed}`);
    built.push(target);
  }

  // ---- the hand-off ----
  const worldId = game.world.id;
  const manifest = built.map((t) => ({
    name: t.name, label: t.label, path: `packs/${t.name}`,
    type: 'Item', system: game.system.id,
    ownership: { PLAYER: 'OBSERVER', ASSISTANT: 'OWNER' },
  }));

  say(`\n════ ${built.length}/${TARGETS.length} built in ${((performance.now() - wholeRun) / 1000 / 60).toFixed(1)} min`);
  if (failed.length) { say('\nFAILURES:'); for (const f of failed) say(`   - ${f}`); }

  if (built.length) {
    say('\nNEXT — QUIT FOUNDRY FULLY before copying, or the LevelDB files are copied mid-write.');
    say('\n  Copy each of these folders:');
    for (const t of built) {
      say(`    Data/worlds/${worldId}/packs/${t.name}  ->  Data/modules/${MODULE_ID}/packs/${t.name}`);
    }
    say('\n  Then set "packs" in module.json to:\n');
    say(JSON.stringify(manifest, null, 2));
    say('\n  Restart, run the verify macro, then delete the WORLD copies.');
    say('\n  The build still reads the JSON — nothing changes until the catalog is wired.');
  }

  ChatMessage.create({ content: `<pre style="white-space:pre-wrap">${out.join('\n')}</pre>`, whisper: [game.user.id] });
  ui.notifications[failed.length ? 'warn' : 'info'](`Packs: ${built.length} built, ${failed.length} failed. See chat.`);
})();
