/**
 * FOUNDRY GM MACRO — not a Node script. Paste into a script macro in your world and run it.
 *
 * Builds a compendium pack from `every_feat.json` so the module can stop parsing a multi-megabyte
 * JSON bundle on every session. Foundry loads a pack's INDEX (names and ids) and fetches documents
 * only when asked, which is why pf1's own feats pack is 320 KB where our JSON is megabytes.
 *
 * THIS MACRO ONLY BUILDS THE ARTEFACT. Nothing in the build reads the pack yet — wiring the catalog
 * to it is a separate change. Running this changes no behaviour; it produces a folder to copy and a
 * module.json entry to paste, and the module keeps working off the JSON until the code moves.
 *
 * WHY A MACRO AND NOT A SCRIPT. Foundry stores packs as LevelDB directories. Bare node cannot write
 * one, and a native dependency was rejected for a repo whose premise is no build step. Same reason
 * `dump_packs.macro.js` exists. The cost is that this is manual — which is acceptable because the
 * feat data changes rarely, and re-running it is the only maintenance.
 *
 * VERIFIED AGAINST: Foundry v13.351, pf1 11.11.
 */
(async () => {
  const MODULE_ID = 'pf1e_random_char_generator';
  const SOURCE = `modules/${MODULE_ID}/templates/character_sheet_folder/every_feat.json`;
  const PACK_NAME = 'feats';                      // -> packs/feats on disk
  const PACK_LABEL = 'RCG — All Feats';
  const BATCH = 250;                              // documents per createDocuments call

  const fail = (message) => { ui.notifications.error(message); console.error(message); };

  if (!game.user.isGM) return fail('Run this as a GM.');

  // ---- 1. don't clobber an existing pack ------------------------------------------------------
  const existingId = `world.${PACK_NAME}`;
  const existing = game.packs.get(existingId);
  if (existing) {
    const count = (await existing.getIndex()).size ?? (await existing.getIndex()).length ?? 0;
    if (count > 0) {
      return fail(`A world pack "${existingId}" already exists with ${count} documents. `
        + `Delete it in the Compendium tab (right-click -> Delete Compendium) and run this again.`);
    }
  }

  // ---- 2. read the bundle ----------------------------------------------------------------------
  const response = await fetch(SOURCE);
  if (!response.ok) return fail(`Could not read ${SOURCE} (${response.status}).`);
  const parsed = await response.json();
  const rows = Array.isArray(parsed) ? parsed : (parsed.items ?? []);
  if (!rows.length) return fail(`${SOURCE} parsed to no rows.`);

  console.log(`Building ${PACK_LABEL} from ${rows.length} rows…`);

  // ---- 3. create the world pack ----------------------------------------------------------------
  // Resolved defensively: v13 moved CompendiumCollection under foundry.documents.collections and
  // keeps a deprecated global shim, and this macro should not care which one answers.
  const Collection = foundry.documents?.collections?.CompendiumCollection ?? globalThis.CompendiumCollection;
  if (!Collection?.createCompendium) return fail('CompendiumCollection.createCompendium is unavailable on this core version.');

  const pack = existing ?? await Collection.createCompendium({
    name: PACK_NAME,
    label: PACK_LABEL,
    type: 'Item',
    packageType: 'world',
    system: game.system.id,
  });
  if (!pack) return fail('createCompendium returned nothing.');
  if (pack.locked) await pack.configure({ locked: false });

  // ---- 4. import, in batches --------------------------------------------------------------------
  // `_id` and `_stats` are dropped so Foundry mints its own; `ownership` is the pack's to manage.
  // Everything else is passed through UNCHANGED, because the build clones a matched row straight
  // onto the sheet and anything altered here would show up as a difference from a JSON run.
  const clean = rows.map((row) => {
    const copy = foundry.utils.deepClone(row);
    delete copy._id;
    delete copy._stats;
    delete copy.ownership;
    if (!copy.name) copy.name = 'Unnamed';
    if (!copy.type) copy.type = 'feat';
    return copy;
  });

  let made = 0;
  const started = performance.now();
  for (let i = 0; i < clean.length; i += BATCH) {
    const slice = clean.slice(i, i + BATCH);
    try {
      const created = await Item.createDocuments(slice, { pack: pack.collection, keepId: false, render: false });
      made += created.length;
    } catch (error) {
      console.error(`Batch at ${i} failed:`, error);
    }
    if (i % (BATCH * 8) === 0) console.log(`  ${made}/${clean.length}…`);
  }
  const elapsed = ((performance.now() - started) / 1000).toFixed(1);

  await pack.getIndex();

  // ---- 5. tell the operator exactly what to do next ---------------------------------------------
  const worldId = game.world.id;
  const manifest = {
    name: PACK_NAME,
    label: PACK_LABEL,
    path: `packs/${PACK_NAME}`,
    type: 'Item',
    system: game.system.id,
    ownership: { PLAYER: 'OBSERVER', ASSISTANT: 'OWNER' },
  };

  const steps = [
    `Built ${made}/${clean.length} documents in ${elapsed}s.`,
    ``,
    `NEXT — Foundry must be SHUT DOWN before copying, or the LevelDB files will be mid-write.`,
    ``,
    `  1. Return to setup, then quit Foundry entirely.`,
    `  2. Copy the folder:`,
    `       FROM  Data/worlds/${worldId}/packs/${PACK_NAME}`,
    `       TO    Data/modules/${MODULE_ID}/packs/${PACK_NAME}`,
    `  3. Add this to "packs" in Data/modules/${MODULE_ID}/module.json:`,
    ``,
    JSON.stringify(manifest, null, 2),
    ``,
    `  4. Start Foundry, load the world, and confirm "${PACK_LABEL}" appears in the Compendium tab`,
    `     with ${made} entries.`,
    `  5. Delete the WORLD copy (Compendium tab -> right-click -> Delete Compendium) so there are`,
    `     not two of them shadowing each other.`,
    ``,
    `The build does not read this pack yet. Nothing changes until the catalog is wired to it.`,
  ].join('\n');

  console.log(steps);
  ChatMessage.create({ content: `<pre style="white-space:pre-wrap">${steps}</pre>`, whisper: [game.user.id] });
  ui.notifications.info(`Pack built: ${made} documents. See chat for the copy steps.`);
})();
