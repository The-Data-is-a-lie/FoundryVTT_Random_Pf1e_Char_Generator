import { createBuildContext } from './build/build-context.js';
import { loadTemplates } from './build/template-loader.js';
import { createCatalog } from './build/catalog.js';
import { applyCoreAttributes } from './build/core-attributes.js';
import { addClasses } from './build/classes.js';
import { addRace } from './build/race.js';
import { addClassFeatures, addResourcePools } from './build/class-features.js';
import { addFeats, addTraits } from './build/feats.js';
import { addSphereTalents, addCastingTradition, addSphereConditionals, addSpellBuffs } from './build/spheres.js';
import { addPathOfWar } from './build/path-of-war.js';
import { addPsionics } from './build/psionics.js';
import { addStatBuffs, addCustomBuffs } from './build/buffs.js';
import { addSpells, addSpellRiders } from './build/spells.js';
import { addEquipment, addAmmo } from './build/equipment.js';
import { addAttackToggles } from './build/attack-toggles.js';
import { addWeaponFinishing } from './build/weapon-finishing.js';
import { addSkills } from './build/skills.js';
import { normalizeTraitShapes } from './build/pf1-compat.js';
import { capitalizeWords } from './shared/text.js';
import {
  readDeliverData,
  readCharacterPayload,
  writeExportPath,
} from './shared/storage.js';
import { log } from './shared/log.js';

/**
 * Build the pf1 actor payload from the generated character data.
 *
 * This function is the ORDER. It builds the context, hands it to each stage under `build/` in turn,
 * and writes the result; everything about how a stage does its job lives in that stage's own module.
 * Read it top to bottom and you have the shape of a character sheet.
 *
 * **The ordering hazards are written down beside the calls they constrain.** There are four, they are
 * behaviour rather than style, and each one fails QUIETLY if the order is disturbed — a plausible
 * sheet with something missing, not an exception. This is the only place any of them is recorded, so
 * moving a call means reading the comment above it first.
 *
 * `deps` exists for one reason: a run of this function is otherwise unreproducible, so nothing it
 * produces can be diffed. Two things make it vary, and they are DIFFERENT KINDS of variation:
 *
 *   rng()    - SEMANTIC choice. Exactly one caller: the ammo pick chooses a random ammo item, so two
 *              runs of the same payload can put different content on the sheet. No amount of
 *              id-normalisation after the fact can hide that, which is why the randomness is
 *              injected rather than diffed around.
 *   mintId() - IDENTITY only. `kind` says what is being stamped, `key` is the content it is being
 *              stamped onto. The harness derives the id FROM that content rather than from a
 *              counter, so extracting or merging code cannot shift every subsequent id and turn the
 *              golden diff into noise on the very changes that need to read it. Content-derived ids
 *              can collide where a sequence could not, so the harness asserts uniqueness to recover
 *              what the counter gave for free.
 *   onStage() - MEASUREMENT only, and the one dep that cannot change output at all. Called with
 *              (name, ms) after each stage below returns. Nothing in this repo timed anything, so
 *              every claim about which stage is slow was an estimate; tools/bench.mjs supplies this
 *              and prints the ranked table that replaces the guessing.
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
    onStage = null,
  } = deps;

  /**
   * Run a stage, timing it only if somebody asked.
   *
   * Unmeasured -- which is every production run -- this is `fn()` and nothing else: one extra call
   * frame per stage, no clock reads, no allocation.
   *
   * THE SYNC STAGES STAY SYNC. Five of the calls below are not awaited today, and wrapping them in
   * an `async` helper would insert a microtask boundary where the code has none, changing ordering
   * for the sake of a measurement. The thenable check hands a plain return value straight back, so
   * only the stages that were already promises stay promises.
   */
  const step = onStage
    ? (name, fn) => {
        const started = performance.now();
        const finish = () => onStage(name, performance.now() - started);
        const out = fn();
        if (out && typeof out.then === 'function') return out.then((value) => { finish(); return value; });
        finish();
        return out;
      }
    : (_name, fn) => fn();

  // Everything the stages share travels on this. See build/build-context.js.
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
    log.debug("Is it modded????????????", modded);

    // Templates, by stable name. The loader owns the paths, the modded/base swap and its
    // missing-file fallback, and the session cache -- see build/template-loader.js. `modded` is
    // reassigned from what it RETURNS, not from what it was asked for: the fallback downgrades a
    // modded run to the base bundles when the _MODS templates aren't installed.
    const loaded = await step('load-templates', () => loadTemplates({ modded }));
    const templates = loaded.templates;
    modded = loaded.modded;
    ctx.templates = templates;
    ctx.modded = modded;
    // Name -> row lookup over those same bundles. Built here rather than inside a stage because the
    // indexes hang off the cached arrays and are worth sharing across every stage that asks.
    ctx.catalog = createCatalog(templates);

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
    ctx.characterData = characterData;

    // ----- Backend lookup tables, all keyed lowercase, all read by more than one stage ----- //

    // Descriptions for feats absent from every_feat.json (Metzofitz style chains, Martial Training
    // I-VI). Keyed lowercase so the feat stage can resolve them case-insensitively and synthesize
    // items instead of silently dropping the rows.
    ctx.homebrewFeatDescs = {};
    for (const [hbName, hbDesc] of Object.entries(characterData.homebrew_feat_desc_dict || {})) {
      ctx.homebrewFeatDescs[hbName.toLowerCase()] = { name: hbName, desc: String(hbDesc) };
    }
    // Backend-authored feat buffs. feat_changes_dict: always-on pf1 `changes` (+ situational
    // contextNotes) overlaid onto the resolved feat item (only for feats the compendium does NOT
    // already automate, so nothing double-applies). feat_conditionals_dict: active-feat default-off
    // toggles (Power Attack, Deadly Aim, ...) attached to the main weapon's attack action.
    ctx.featChangesMap = {};
    for (const [fn, fv] of Object.entries(characterData.feat_changes_dict || {})) {
      ctx.featChangesMap[fn.toLowerCase()] = fv;
    }
    ctx.featConditionalsMap = {};
    for (const [fn, fv] of Object.entries(characterData.feat_conditionals_dict || {})) {
      ctx.featConditionalsMap[fn.toLowerCase()] = fv;
    }
    // Backend-authored equipment buffs. item_changes_dict: pf1 `changes` + `contextNotes` parsed from
    // items_best.json descriptions (generated by scripts/build_item_changes.py), overlaid onto the
    // matched/synthesized equipment item — deduped by change target, so items every_item.json already
    // automates don't double-apply. Attack-target contextNotes are SPLIT OUT here instead of riding the
    // item: pf1 prints an item's attack notes in full on every attack chat card, and these are mostly
    // multi-sentence activation text (Swordmaster's Shirt, Battle Strider's Boots, Doomsday Key). Each
    // becomes a default-off "(Item Name): <text>" toggle on the main weapon's attack action in the
    // attack-toggle stage; non-attack notes still overlay the item as before.
    // enhancement_effects_dict is SECTIONED ({weapon, armor, shield}) and is read straight off the
    // payload by that same stage, once the weapon and armor items exist.
    ctx.itemChangesMap = {};
    ctx.itemAttackToggles = [];   // {itemName, text}
    for (const [inName, inVal] of Object.entries(characterData.item_changes_dict || {})) {
      const inNotes = Array.isArray(inVal?.contextNotes) ? inVal.contextNotes : [];
      const attackNotes = inNotes.filter(n => n && n.target === 'attack' && n.text);
      if (attackNotes.length) {
        for (const n of attackNotes) ctx.itemAttackToggles.push({ itemName: inName, text: String(n.text).trim() });
        ctx.itemChangesMap[inName.toLowerCase()] = { ...inVal, contextNotes: inNotes.filter(n => !attackNotes.includes(n)) };
      } else {
        ctx.itemChangesMap[inName.toLowerCase()] = inVal;
      }
    }
    // Prepared casters (prepare a daily spell loadout). Bard, Summoner, Summoner (Unchained), and
    // Skald are SPONTANEOUS in PF1 (cast from spells known, no preparation) and are intentionally
    // excluded so they fall through to the spontaneous branch in the spells stage.
    ctx.preparedCasterList = ["Alchemist", "Cleric", "Druid", "Inquisitor", "Investigator", "Magus", "Paladin", "Ranger", "Warpriest", "Wizard", "Witch"];
    // Prefer the backend's display name (e.g. "Barbarian (Unchained)"), which is already in the exact
    // every_class.json format. Do NOT run it through capitalizeWords (that lowercases the "(unchained)"
    // part). Fall back to capitalizeWords(c_class) for an un-redeployed backend.
    ctx.upperCaseClass = characterData.c_class_display || capitalizeWords(characterData.c_class);

    // ----- The thing being built ----- //

    // Prefer the unmodified template; the plain preExportTemplate is the fallback we don't want.
    // Deep-copied either way: the loader's templates are cached for the session, and every stage
    // below writes into this object.
    let exportTemplate;
    const storedTemplate = templates.unmodifiedPreExportTemplate;
    if (storedTemplate) {
      exportTemplate = JSON.parse(JSON.stringify(storedTemplate));
    } else {
      exportTemplate = JSON.parse(JSON.stringify(templates.preExportTemplate));
    }
    ctx.exportTemplate = exportTemplate;

    // ----- The stages, in order ----- //

    step('core-attributes', () => applyCoreAttributes(ctx));

    // The classes stage produces ctx.classFeatureBands and the class-features stage consumes it.
    // HAZARD 4: the bands carry live sort counters that addClassFeatures MUTATES WHILE ITERATING,
    // and that mutation is what orders items inside each class's band on the sheet. The bands are
    // not read-only; freezing or cloning them silently reshuffles the Class Features tab.
    await step('classes', () => addClasses(ctx));
    step('race', () => addRace(ctx));
    // Order within class features: addResourcePools removes the harvested duplicate of any ability
    // that became a pool, so it cannot run before the features it deduplicates against exist.
    await step('class-features', () => addClassFeatures(ctx));
    await step('resource-pools', () => addResourcePools(ctx));

    // HAZARD 3, now dissolved: the Spheres talents used to be built from inside the feats function,
    // as a side effect of placing feats. The function was split at exactly this boundary instead of
    // the call being moved, so the sequence is unchanged and the dependency is visible.
    await step('feats', () => addFeats(ctx));
    await step('sphere-talents', () => addSphereTalents(ctx));
    await step('casting-tradition', () => addCastingTradition(ctx));
    await step('traits', () => addTraits(ctx));

    await step('path-of-war', () => addPathOfWar(ctx));
    await step('psionics', () => addPsionics(ctx));

    step('stat-buffs', () => addStatBuffs(ctx));
    step('custom-buffs', () => addCustomBuffs(ctx));

    // Riders attach to the spell items the first call appends.
    await step('spells', () => addSpells(ctx));
    await step('spell-riders', () => addSpellRiders(ctx));

    // HAZARD 2: everything below finds the weapon through findMainWeapon(ctx) and WARNS AND RETURNS
    // when there is none. Move equipment later and no conditional attaches to anything — the sheet
    // still builds, still looks complete, and simply has no toggles on it.
    await step('equipment', () => addEquipment(ctx));

    // The two conditional attachers share one window: after the weapon exists, and before weapon
    // finishing clones the rollable attack twin, because the clone inherits what they attach.
    await step('attack-toggles', () => addAttackToggles(ctx));
    await step('sphere-conditionals', () => addSphereConditionals(ctx));
    await step('spell-buffs', () => addSpellBuffs(ctx));

    // HAZARD 1: inside this stage the +N stamp renames the weapon AND its already-cloned attack twin
    // together, by matching their shared name. It is ordered last within the stage for that reason,
    // and the stage itself has to come after everything that attaches to the weapon.
    await step('weapon-finishing', () => addWeaponFinishing(ctx));
    // Reads the weapon the equipment stage recorded, so it cannot move above it.
    await step('ammo', () => addAmmo(ctx));

    await step('skills', () => addSkills(ctx));

    // Last, because it sweeps every item the stages built.
    step('pf1-compat', () => normalizeTraitShapes(ctx));

    // ----- The output ----- //

    log.debug("About to write exportFoundryPath to localStorage");
    log.debug("exportTemplate exists:", !!exportTemplate);
    log.debug("exportTemplate:", exportTemplate);

    if (exportTemplate) {
      writeExportPath(exportTemplate);
      log.debug("Successfully wrote exportFoundryPath to localStorage");
    } else {
      console.error("exportTemplate is undefined! Cannot write to localStorage.");
      log.debug("Available template names:", Object.keys(templates));
    }

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
