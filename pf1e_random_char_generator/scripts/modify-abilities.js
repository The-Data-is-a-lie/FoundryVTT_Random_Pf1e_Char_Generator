import { createBuildContext } from './build/build-context.js';
import { loadTemplates } from './build/template-loader.js';
import { addFeats, addTraits } from './build/feats.js';
import { addRace } from './build/race.js';
import { addSphereTalents, addCastingTradition, addSphereConditionals, addSpellBuffs } from './build/spheres.js';
import { addPsionics } from './build/psionics.js';
import { addSpells, addSpellRiders } from './build/spells.js';
import { capitalizeWords } from './shared/text.js';
import { addPathOfWar } from './build/path-of-war.js';
import { addSkills } from './build/skills.js';
import { addWeaponFinishing } from './build/weapon-finishing.js';
import { addAttackToggles } from './build/attack-toggles.js';
import { addEquipment, addAmmo } from './build/equipment.js';
import { addClassFeatures, addResourcePools } from './build/class-features.js';
import { addClasses } from './build/classes.js';
import { normalizeTraitShapes } from './build/pf1-compat.js';
import { addStatBuffs, addCustomBuffs } from './build/buffs.js';
import { applyCoreAttributes } from './build/core-attributes.js';
import {
  readDeliverData,
  readCharacterPayload,
  writeExportPath,
} from './shared/storage.js';

/**
 * Build the pf1 actor payload from the generated character data.
 *
 * `deps` is the first sliver of the build context (ticket 05) and exists for one reason: a run of
 * this function is otherwise unreproducible, so nothing it produces can be diffed. Two things make
 * it vary, and they are DIFFERENT KINDS of variation:
 *
 *   rng()    - SEMANTIC choice. Exactly one caller: check_ammo() picks a random ammo item, so two
 *              runs of the same payload can put different content on the sheet. No amount of
 *              id-normalisation after the fact can hide that, which is why the randomness is
 *              injected rather than diffed around.
 *   mintId() - IDENTITY only. `kind` says what is being stamped, `key` is the content it is being
 *              stamped onto. The harness derives the id FROM that content rather than from a
 *              counter, so extracting or merging code (tickets 06, 07) cannot shift every
 *              subsequent id and turn the golden diff into noise on the very tickets that need to
 *              read it. Content-derived ids can collide where a sequence could not, so the harness
 *              asserts uniqueness to recover what the counter gave for free.
 *
 * PRODUCTION PASSES NOTHING. The defaults below are exactly what this file did before the seam
 * existed -- Math.random and 16 random characters -- so live output is unchanged and `kind`/`key`
 * are simply ignored. Only the harness supplies replacements.
 */
export async function main(deps = {}) {
  const {
    rng = Math.random,
    mintId = (_kind, _key) => {
      const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      return [...Array(16)].map(() => characters.charAt(Math.floor(Math.random() * characters.length))).join('');
    },
  } = deps;

  // The build context (see build/build-context.js). During the strangler split its fields are
  // ALIASES of the locals below: `main()` still declares them, and assigns them here as they come
  // into existence, so an extracted stage reading `ctx.x` and closure code still reading `x` see
  // the same object. Each assignment sits at the point the local is finished being reassigned.
  const ctx = createBuildContext({ rng, mintId });

  try {
    // Retrieve the module dynamically using the module name
    const module = game.modules.get('pf1e_random_char_generator');
    if (!module) {
      console.error("Module 'pf1e_random_char_generator' not found.");
      return;
    }

    var savedData = readDeliverData();
    var modded = savedData.modded_char_sheet; // y or n
    console.log("Is it modded????????????", modded);

    // Templates, by stable name. The loader owns the paths, the modded/base swap and its
    // missing-file fallback, and the session cache -- see build/template-loader.js. `modded` is
    // reassigned from what it RETURNS, not from what it was asked for: the fallback downgrades a
    // modded run to the base bundles when the _MODS templates aren't installed.
    const loaded = await loadTemplates({ modded });
    const templates = loaded.templates;
    modded = loaded.modded;
    ctx.templates = templates;
    ctx.modded = modded;


const characterData = readCharacterPayload();
// The backend wraps any generation exception as {"error": "..."} (app.py process_input_values), so
// a payload without c_class is a failed generation, not a character — surface the real error and
// abort (main() returning false makes button.js skip actor creation) instead of crashing on the
// first field access with a cryptic "cannot read toLowerCase of undefined".
if (!characterData || characterData.error || !characterData.c_class) {
  const reason = characterData?.error || 'the backend returned no character data';
  console.error('Character Generator: backend generation failed:', reason, characterData);
  ui.notifications?.error(`Character Generator: the backend failed to generate a character (${reason}).`);
  return false;
}
// Backend-supplied descriptions for feats absent from every_feat.json (Metzofitz style chains,
// Martial Training I-VI). Keyed lowercase so processFeatTrait/applyFeatTax can resolve them
// case-insensitively and synthesize items instead of silently dropping the rows.
const homebrewFeatDescs = {};
for (const [hbName, hbDesc] of Object.entries(characterData.homebrew_feat_desc_dict || {})) {
  homebrewFeatDescs[hbName.toLowerCase()] = { name: hbName, desc: String(hbDesc) };
}
// Backend-authored feat buffs. feat_changes_dict: always-on pf1 `changes` (+ situational
// contextNotes) overlaid onto the resolved feat item (only for feats the compendium does NOT already
// automate, so nothing double-applies). feat_conditionals_dict: active-feat default-off toggles
// (Power Attack, Deadly Aim, ...) attached to the main weapon's attack action. Keyed lowercase.
const featChangesMap = {};
for (const [fn, fv] of Object.entries(characterData.feat_changes_dict || {})) {
  featChangesMap[fn.toLowerCase()] = fv;
}
const featConditionalsMap = {};
for (const [fn, fv] of Object.entries(characterData.feat_conditionals_dict || {})) {
  featConditionalsMap[fn.toLowerCase()] = fv;
}
// Backend-authored equipment buffs. item_changes_dict: pf1 `changes` + `contextNotes` parsed from
// items_best.json descriptions (generated by scripts/build_item_changes.py), overlaid onto the
// matched/synthesized equipment item — deduped by change target, so items every_item.json already
// automates don't double-apply. Attack-target contextNotes are SPLIT OUT here instead of riding the
// item: pf1 prints an item's attack notes in full on every attack chat card, and these are mostly
// multi-sentence activation text (Swordmaster's Shirt, Battle Strider's Boots, Doomsday Key). Each
// becomes a default-off "(Item Name): <text>" toggle on the main weapon's attack action via
// addItemAttackConditionals(); non-attack notes still overlay the item as before.
// enhancement_effects_dict: curated weapon/armor special-ability effects (quality_effects.json) —
// `conditionals` go on the main weapon's attack action, `changes`/`contextNotes` on the
// armor/shield/weapon item itself. Both keyed lowercase.
const itemChangesMap = {};
const itemAttackToggles = [];   // {itemName, text} — consumed by addItemAttackConditionals()
for (const [inName, inVal] of Object.entries(characterData.item_changes_dict || {})) {
  const inNotes = Array.isArray(inVal?.contextNotes) ? inVal.contextNotes : [];
  const attackNotes = inNotes.filter(n => n && n.target === 'attack' && n.text);
  if (attackNotes.length) {
    for (const n of attackNotes) itemAttackToggles.push({ itemName: inName, text: String(n.text).trim() });
    itemChangesMap[inName.toLowerCase()] = { ...inVal, contextNotes: inNotes.filter(n => !attackNotes.includes(n)) };
  } else {
    itemChangesMap[inName.toLowerCase()] = inVal;
  }
}
// enhancement_effects_dict is SECTIONED ({weapon: {...}, armor: {...}, shield: {...}}) — consumed
// directly by addEnhancementEffects() after the weapon/armor items exist.
// Prepared casters (prepare a daily spell loadout). Bard, Summoner, Summoner (Unchained), and Skald
// are SPONTANEOUS in PF1 (cast from spells known, no preparation) and are intentionally excluded so
// they fall through to the spontaneous branch in determineSpellType().
const prepared_caster_list = ["Alchemist", "Cleric", "Druid", "Inquisitor", "Investigator", "Magus", "Paladin", "Ranger", "Warpriest", "Wizard", "Witch"]
// Prefer the backend's display name (e.g. "Barbarian (Unchained)"), which is already in the exact
// every_class.json format. Do NOT run it through capitalizeWords (that lowercases the "(unchained)"
// part). Fall back to capitalizeWords(c_class) for an un-redeployed backend.
const upper_case_class = characterData.c_class_display || capitalizeWords(characterData.c_class);

ctx.characterData = characterData;
ctx.homebrewFeatDescs = homebrewFeatDescs;
ctx.featChangesMap = featChangesMap;
ctx.featConditionalsMap = featConditionalsMap;
ctx.itemChangesMap = itemChangesMap;
ctx.itemAttackToggles = itemAttackToggles;
ctx.preparedCasterList = prepared_caster_list;
ctx.upperCaseClass = upper_case_class;

   // ----- Start of exportTemplate setup ----- //

   // we want to use unmodifed template if it exists
   let exportTemplate;
   const storedTemplate = templates.unmodifiedPreExportTemplate; 
   if (storedTemplate) {
     // If the template was loaded, set exportTemplate to that
     exportTemplate = JSON.parse(JSON.stringify(storedTemplate)); // Deep copy to avoid references
   } else {
     // If not found, use the 'preExportTemplate' as fallback  (We typically don't want to use this one)
     const template = templates.preExportTemplate;
     exportTemplate = JSON.parse(JSON.stringify(template)); // Deep copy
   }

   // ----- End of exportTemplate setup ----- //

   // Assigned here and not earlier: `exportTemplate` is the one local the build REASSIGNS rather
   // than mutates, and both reassignments are in the block above.
   ctx.exportTemplate = exportTemplate;

   applyCoreAttributes(ctx);



   await addClasses(ctx);

addRace(ctx);



// ------ Generalized Features Page Functions ------ //


// ------ End of Generalized Features Page Functions ------ //


   // ----- Class Features ----- //
   // Order matters: addResourcePools removes the harvested duplicate of any ability that became a
   // pool, so it runs after the features are laid down, not before.
   await addClassFeatures(ctx);
   await addResourcePools(ctx);




// ----- Feats, then Spheres talents, then Traits ----- //
// The Spheres block below used to sit INSIDE Feats_n_Traits, which built the talent items as a
// side effect of placing feats (hazard 3). Splitting that function at this exact boundary pulls
// them apart without moving anything: the append order is what it always was.
await addFeats(ctx);
await addSphereTalents(ctx);
await addCastingTradition(ctx);
await addTraits(ctx);

// ----- Path of War ----- //


await addPathOfWar(ctx);

// ----- Psionics ----- //

await addPsionics(ctx);

// ------ End of Feat/Trait Section ------ //

addStatBuffs(ctx);
addCustomBuffs(ctx);



   // ----- Spells ----- //
   // Riders attach to spell items, so they run after the books are filled.
   await addSpells(ctx);
   await addSpellRiders(ctx);


// ----- Equipment ----- //
// HAZARD: everything below that touches the weapon finds it with findMainWeapon(ctx) and
// warn-and-returns when there is none. Nothing that attaches to the weapon may run before this.
await addEquipment(ctx);

// ----- Attack toggles ----- //
// HAZARD: after equipment (they warn-and-return without a weapon), and before the attack twin is
// cloned below -- the clone has to inherit what these attach.
await addAttackToggles(ctx);

// ----- Spheres: talent conditionals, the Destructive Blast, and the distributable buffs ----- //
// HAZARD: same window as the attack toggles -- after the weapon exists, before the scaling twin is
// cloned, so the clone inherits these conditionals.
await addSphereConditionals(ctx);
await addSpellBuffs(ctx);

// ----- Weapon finishing ----- //
// HAZARD: the +N stamp inside renames the weapon and its attack twin together, so this whole block
// runs after everything that attaches to the weapon and after the twin exists.
await addWeaponFinishing(ctx);
// ----- Ammo ----- //
// Reads the weapon the equipment stage recorded, so it cannot move above it.
await addAmmo(ctx);


// ----- Skills ----- //
await addSkills(ctx);


normalizeTraitShapes(ctx);

// Rewriting the export file directly (with export template)
console.log("About to write exportFoundryPath to localStorage");
console.log("exportTemplate exists:", !!exportTemplate);
console.log("exportTemplate:", exportTemplate);

if (exportTemplate) {
  writeExportPath(exportTemplate);
  console.log("Successfully wrote exportFoundryPath to localStorage");
} else {
  console.error("exportTemplate is undefined! Cannot write to localStorage.");
  console.log("Available template names:", Object.keys(templates));
}

// ----- End of Skills Section ----- //

if (!exportTemplate) return false;
return true;


} catch (error) {
   console.error("Error in main function:", error);
   // Report failure: the caller must NOT build an actor, or it would inject whatever
   // exportFoundryPath the previous run left in localStorage (a stale character sheet).
   ui.notifications?.error(`Character Generator: character build failed (${error.message}). No character was created.`);
   return false;
 }
}