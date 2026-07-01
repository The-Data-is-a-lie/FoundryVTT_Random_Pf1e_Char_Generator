/**
 * Export an "everyClassPerson"-style actor to the character-generator module's every_class
 * bundle — the automated replacement for hand-harvesting class items into every_class.json.
 *
 * HOW TO USE (FoundryVTT v13, as a GM):
 *   1. Create a Foundry "Script" macro and paste this whole file in.
 *   2. To include Path of War: open the "pf1-pow" module's Classes compendium and drag
 *      Stalker, Warlord, Warder, Harbinger, Mystic, Zealot onto your everyClassPerson actor,
 *      then set each of those class items to level 20 (so their feature items populate).
 *   3. Set ACTOR_NAME + OUT_FILE below and run the macro. It rewrites the bundle in place.
 *
 * Run it once per file:
 *   - vanilla everyClassPerson  -> OUT_FILE = "every_class.json"
 *   - modded  everyClassPerson  -> OUT_FILE = "every_class_MODS.json"
 * (Both bundles are full Actor documents with the same shape; the only difference is which
 *  actor / homebrew state you export. If every_class_MODS.json is hand-tuned homebrew you
 *  don't want to overwrite, instead copy just the 6 new PoW class blocks from the fresh
 *  every_class.json into it by hand.)
 *
 * After exporting, make sure all class names below appear in the `class_list` array in
 * scripts/modify-abilities.js (the PoW six are already added).
 */
const ACTOR_NAME = "everyClassPerson";
const OUT_FILE   = "every_class.json"; // <- change to "every_class_MODS.json" for the modded actor
const DEST_DIR   = "modules/pf1e_random_char_generator/templates/character_sheet_folder";

(async () => {
  if (!game.user.isGM) {
    ui.notifications.error("export_every_class: run this as a GM.");
    return;
  }
  const actor = game.actors.getName(ACTOR_NAME);
  if (!actor) {
    ui.notifications.error(`export_every_class: no actor named "${ACTOR_NAME}".`);
    return;
  }

  const doc = actor.toObject();
  const classNames = doc.items.filter(i => i.type === "class").map(i => i.name);
  console.log(`export_every_class: ${doc.items.length} items, ${classNames.length} classes`, classNames);

  const POW = ["Stalker", "Warlord", "Warder", "Harbinger", "Mystic", "Zealot"];
  const missingPoW = POW.filter(n => !classNames.includes(n));
  if (missingPoW.length) {
    ui.notifications.warn(`export_every_class: PoW classes NOT on the actor: ${missingPoW.join(", ")} — drag them from the pf1-pow Classes compendium first if you want them included.`);
  }

  const json = JSON.stringify(doc, null, 2);
  const file = new File([json], OUT_FILE, { type: "application/json" });

  // FilePicker moved namespaces in v13; fall back to the deprecated global.
  const FP = foundry?.applications?.apps?.FilePicker?.implementation ?? FilePicker;
  try {
    await FP.upload("data", DEST_DIR, file, {}, { notify: false });
    ui.notifications.info(`export_every_class: wrote ${DEST_DIR}/${OUT_FILE} (${classNames.length} classes). Reload the world for the module to pick it up.`);
  } catch (err) {
    console.warn("export_every_class: upload failed, downloading instead:", err);
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = OUT_FILE;
    a.click();
    URL.revokeObjectURL(url);
    ui.notifications.warn(`export_every_class: upload blocked — downloaded ${OUT_FILE}; move it into ${DEST_DIR}/ manually.`);
  }
})();
