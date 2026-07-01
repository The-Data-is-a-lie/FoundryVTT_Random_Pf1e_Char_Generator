/**
 * Backfill the Path of War initiator class blocks from every_class.json into the hand-tuned
 * every_class_MODS.json, instead of re-exporting the whole modded bundle (which export_every_class
 * .macro.js warns against when the MODS file is hand-tuned homebrew).
 *
 * Why this is needed: when the generator runs on the MODDED sheet (modded_char_sheet === "y"),
 * scripts/modify-abilities.js reads every_class_MODS.json. That file ships with NONE of the PoW
 * initiator classes, so collectItems() finds no class boundary for a PoW initiator, the actor is
 * built with no class item, and its maneuvers end up orphaned (initiator level 0, no PoW tab).
 *
 * What it copies: for each PoW class present in every_class.json but missing from
 * every_class_MODS.json, the class item PLUS its contiguous following ability items (everything up
 * to the next type:"class" item) — exactly the slice collectItems() would gather. PoW classes have
 * no "modded" ability variant, so the stock blocks are correct on the modded sheet too.
 *
 * Idempotent: classes already present in the MODS file are skipped, so re-running is a no-op.
 * A one-time .bak backup of every_class_MODS.json is written if none exists.
 *
 * Run from the module root:  node tools/backfill_pow_classes_into_mods.js
 */
const fs = require('fs');
const path = require('path');

const DIR = path.resolve(__dirname, '..', 'templates', 'character_sheet_folder');
const SRC = path.join(DIR, 'every_class.json');
const DST = path.join(DIR, 'every_class_MODS.json');

// PoW initiator class names (mirror the class_list boundary set in modify-abilities.js). Stalker &
// Zealot are intentionally absent from every_class.json today (backend-shelved); they're simply not
// found here and stay pending until the pf1-pow compendium / everyClassPerson ships them.
const POW = ['Stalker', 'Warlord', 'Warder', 'Harbinger', 'Mystic', 'Zealot', 'Medic'];

function load(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function main() {
  const src = load(SRC);
  const dst = load(DST);
  if (!Array.isArray(src.items) || !Array.isArray(dst.items)) {
    console.error('Unexpected shape: both files must be Actor documents with an items[] array.');
    process.exit(1);
  }

  const dstClassNames = new Set(dst.items.filter(i => i.type === 'class').map(i => i.name));
  const dstIds = new Set(dst.items.map(i => i._id).filter(Boolean));

  const appended = [];
  const addedClasses = [];
  for (let i = 0; i < src.items.length; i++) {
    const it = src.items[i];
    if (it.type !== 'class' || !POW.includes(it.name) || dstClassNames.has(it.name)) continue;

    // Collect the class item + every following non-class item (its abilities), the same
    // contiguous slice collectItems() would gather, until the next class boundary.
    const block = [it];
    for (let j = i + 1; j < src.items.length && src.items[j].type !== 'class'; j++) {
      block.push(src.items[j]);
    }
    // Guard against _id collisions with the existing modded bundle (none expected — these items
    // were never in the MODS export — but a dup _id would break actor.update).
    for (const b of block) {
      if (b._id && dstIds.has(b._id)) {
        console.error(`_id collision for "${b.name}" (${b._id}) — aborting without writing.`);
        process.exit(1);
      }
    }
    appended.push(...block);
    addedClasses.push(`${it.name} (+${block.length - 1} abilities)`);
  }

  if (!appended.length) {
    console.log('0 classes appended — every PoW class already present in every_class_MODS.json.');
    return;
  }

  // One-time backup (don't clobber a good .bak on a re-run).
  const bak = DST + '.bak';
  if (!fs.existsSync(bak)) {
    fs.copyFileSync(DST, bak);
    console.log(`Backed up -> ${path.basename(bak)}`);
  }

  const before = dst.items.length;
  dst.items.push(...appended);
  // Match export_every_class.macro.js formatting (JSON.stringify(doc, null, 2)) for a clean diff.
  fs.writeFileSync(DST, JSON.stringify(dst, null, 2) + '\n', 'utf8');

  console.log(`Appended ${addedClasses.length} PoW class block(s): ${addedClasses.join(', ')}`);
  console.log(`every_class_MODS.json items: ${before} -> ${dst.items.length} (+${appended.length})`);
}

main();
