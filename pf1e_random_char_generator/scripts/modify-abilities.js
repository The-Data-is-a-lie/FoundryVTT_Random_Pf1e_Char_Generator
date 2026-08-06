import { createBuildContext } from './build/build-context.js';
import { loadTemplates } from './build/template-loader.js';
import { attachConditionals } from './build/conditional-engine.js';
import { findMainWeapon } from './build/weapon.js';
import { addRace } from './build/race.js';
import { addWeaponFinishing } from './build/weapon-finishing.js';
// Path of War vocabulary shared by three stages: the toggles' rider DCs, the PoW items still in the
// closure, and the Spheres casting-ability fallback all have to agree on the initiating ability.
import { capitalizeManeuverType, resolveInitStat, maneuverInitAttr } from './build/initiation.js';
import { addAttackToggles } from './build/attack-toggles.js';
import { addEquipment, addAmmo } from './build/equipment.js';
// subSpellTokens/spellCasterLevelNum are the spells stage's two exported readers: the spell-buff
// conditionals substitute @slvl/@castMod, and the house auras want the combined caster level.
import { addSpells, addSpellRiders, subSpellTokens, spellCasterLevelNum } from './build/spells.js';
import { addClassFeatures, addResourcePools } from './build/class-features.js';
import { addClasses } from './build/classes.js';
import { normalizeTraitShapes } from './build/pf1-compat.js';
import { addStatBuffs, addCustomBuffs } from './build/buffs.js';
import { applyCoreAttributes } from './build/core-attributes.js';
import {
  appendJsonToTemplate,
  synthesizeFeatItem,
  assignSequentialSort,
  assignToFeatSection,
  addingReceivedLocationToName,
  applyBuffData,
  applyFeatBuffOverlay,
  appendFeatDivider,
} from './build/items.js';
import {
  readDeliverData,
  readCharacterPayload,
  writeExportPath,
} from './shared/storage.js';
import { skillsDict } from './shared/skills-dict.js';
import {
  capitalizeWords,
  capitalizeFirstLetter,
  toTitleCase,
  convertToStringSimple,
  sphereNorm,
  powNorm,
} from './shared/text.js';

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

// ----- Start of Feat/Trait section ----- //


async function processFeatTrait(templateName, dataListChooseFrom, dataType, startingSort = 100, label = "level", shouldIncrement = true, startingNumber = 1, step = 1, customLevels = null, labelArray = null, taxDict = null) {
  try {
    // Retrieve data by template name based on dataType (feats or traits)
    const data = templates[templateName];

    // Check if data is an array
    if (!Array.isArray(data)) {
      console.error(`${dataType} data is not an array or is undefined:`, data);
      return;
    }

    console.log(`${dataType} list structure`, JSON.stringify(dataListChooseFrom, null, 2));

    // Consolidate all data from the nested list
    const allMatchedItems = [];
    const matchedLabels = []; // per-feat labels (e.g. "Fighter 1"), aligned with allMatchedItems
    const matchedTax = []; // per-feat tax chains (granted feats), aligned with allMatchedItems

    for (let idx = 0; idx < dataListChooseFrom.length; idx++) {
      const item = dataListChooseFrom[idx];
      // Logs all data being processed
      console.log(`Processing ${dataType}:`, item);

      const itemLc = String(item).toLowerCase();
      const matchedItem = data.find(r => {
        // Extract the part of the name before the first parenthesis. Compare case-insensitively so a
        // feat that differs only by casing/punctuation still resolves to its real compendium item.
        const namePart = r.name.split(' (')[0];
        // Ensuring that characters can't select mythic entries
        return namePart.toLowerCase() === itemLc && !r.name.includes('(Mythic)');
      });

      if (matchedItem) {
        // Clone so later name/description edits don't mutate the shared template object.
        const _featItem = structuredClone(matchedItem);
        if (dataType === 'feat') applyFeatBuffOverlay(ctx, _featItem, itemLc);
        allMatchedItems.push(_featItem);
        if (labelArray) matchedLabels.push(labelArray[idx]);
        matchedTax.push(taxDict && taxDict[item] ? taxDict[item] : null);
      } else if (dataType === 'feat') {
        // Feat absent from every_feat.json (incomplete compendium export, homebrew style chains,
        // Martial Training, etc.): SYNTHESIZE the row instead of dropping it. Dropping a feat shifts
        // the positional "(Feat N)" labels and makes the sheet look short -- the backend already
        // guarantees the right COUNT, so every feat must render. Use the backend-supplied description
        // when present (homebrewFeatDescs, now populated for every placed feat), else a bare row.
        const hb = homebrewFeatDescs[itemLc];
        const _synthFeat = synthesizeFeatItem(hb ? hb.name : String(item), hb ? `<p>${hb.desc}</p>` : '');
        applyFeatBuffOverlay(ctx, _synthFeat, itemLc);
         allMatchedItems.push(_synthFeat);
        if (labelArray) matchedLabels.push(labelArray[idx]);
        matchedTax.push(taxDict && taxDict[item] ? taxDict[item] : null);
      } else {
        console.warn(`${dataType} "${item}" not found.`);
      }
    }

    if (allMatchedItems.length > 0) {
      // 🔥 Apply sort order
      assignSequentialSort(allMatchedItems, startingSort);
      if (dataType === 'feat') {
      // Add Received location
      addingReceivedLocationToName(allMatchedItems, label, shouldIncrement, startingNumber, step, customLevels, labelArray ? matchedLabels : null);
      // Assign Feat subType
      assignToFeatSection(allMatchedItems);
      // Feat tax: bundle granted chain feats onto the primary entry (name + merged description)
      applyFeatTax(allMatchedItems, data, matchedTax);      
      }         
      // Assign a unique ID to each item
         

      // Append matched items to the exportTemplate
      appendJsonToTemplate(allMatchedItems, exportTemplate, capitalizeFirstLetter(dataType));

    } else {
      console.error(`No matching ${dataType}s were found in the list.`);
    }
  } catch (error) {
    console.error(`Error reading or processing the ${dataType} Section:`, error);
  }
}

// --- adding Feat separators --- //
async function addFeatSeparator(templateName, dataType, startingSort = 0) {
  try {
    // Clone: assignSequentialSort() stamps .sort onto these objects and they are then appended to
    // the sheet by reference, so the separator templates would accumulate the last run's sorts.
    const data = structuredClone(templates[templateName]);
    const wrappedData = Array.isArray(data) ? data : [data];

    // 🔥 Apply sort
    assignSequentialSort(wrappedData, startingSort);

    appendJsonToTemplate(wrappedData, exportTemplate, capitalizeFirstLetter(dataType));
    console.log(`${dataType} data successfully added from ${templateName}`);
  } catch (error) {
    console.error(`Error processing ${dataType} from ${templateName}:`, error);
  }
}

async function Feats_n_Traits() {
  // Feats section
  await addFeatSeparator('spaceBackground', 'space_function', 1);
  await processFeatTrait('everyFeat', characterData.flavor_feats, 'feat', 200, "Flavor", true, 1, 1, null, null, characterData.flavor_feat_tax_dict);
  await processFeatTrait('everyFeat', characterData.flaw_feats, 'feat', 250, "Flaw", true, 1, 1, null, null, characterData.flaw_feat_tax_dict);
  await processFeatTrait('everyFeat', characterData.story_feats, 'feat', 500, "Story Feat", true, 1, 5, [1,5,10,15,20,25,30,35,40,45,50,55,60,65,70,75,80,85,90,95,100], null, characterData.story_feat_tax_dict);
  await addFeatSeparator('spaceFeats', 'space_function', 1000);
  await processFeatTrait('everyFeat', characterData.feats, 'feat', 1500, "Feat", true, 1, 2, null, null, characterData.feats_feat_tax_dict);
  await addFeatSeparator('spaceClassBonusFeats', 'space_function', 2000);
  await processFeatTrait('everyFeat', characterData.teamwork_feats, 'feat', 2500, "Class Bonus Feat", true, 3, 3, null, characterData.teamwork_feat_labels);
  await processFeatTrait('everyFeat', characterData.class_feats, 'feat', 3000, "Class Bonus Feat", true, 1, 2, null, characterData.class_feat_labels, characterData.class_feat_tax_dict);
  // Bloodline bonus feats (Sorcerer/Bloodrager), labeled by granting class + level
  // (e.g. "Sorcerer 7: Combat Casting"). Guarded so an un-redeployed backend that doesn't
  // send bloodline_feats simply skips this step instead of erroring.
  if (Array.isArray(characterData.bloodline_feats) && characterData.bloodline_feats.length) {
    await processFeatTrait('everyFeat', characterData.bloodline_feats, 'feat', 3500, "Bloodline Feat", true, 1, 1, null, characterData.bloodline_feat_labels);
  }
  // Homebrew Trainers -> bottom of the Feats section, rendered as normal feats: one item per taught
  // feat-tax chain, grouped by its "(Trainer N)" label, full compendium text, NO caliber line.
  if (Array.isArray(characterData.trainer_feats) && characterData.trainer_feats.length) {
    await appendFeatDivider(ctx, "__________________________ Trainers _______________________", 3600);
    await processFeatTrait('everyFeat', characterData.trainer_feats, 'feat', 3610, "Trainer", true, 1, 1, null, characterData.trainer_feat_labels, characterData.trainer_feat_tax_dict);
  }
  // Homebrew Professions -> bottom of the Feats section: tiered Rank 5 / Rank 15 ability items (+
  // profession feats), each carrying pf1 changes/contextNotes/uses.
  if (Array.isArray(characterData.profession_ability_items) && characterData.profession_ability_items.length) {
    await appendFeatDivider(ctx, "__________________________ Professions _____________________", 3900);
    await processProfessionAbilities(characterData.profession_ability_items, 3910);
  }
  // Spheres -> NATIVE pf1spheres talent items (Combat/Magic Talents section, not the Features list).
  // processSpheres clones each talent from the pf1spheres compendium (or synthesizes a subType-tagged
  // fallback) + adds a casting-tradition / mana-pool summary feat for magic dabblers. No feat divider:
  // the talents live in the module's talents section, grouped by sphere.
  if ((Array.isArray(characterData.magic_talent_items) && characterData.magic_talent_items.length)
      || (Array.isArray(characterData.combat_talent_items) && characterData.combat_talent_items.length)) {
    await processSpheres(characterData.magic_talent_items, characterData.combat_talent_items,
      characterData.casting_tradition, characterData.sphere_mana_pool, 4210);
  }
  // Casting tradition -> its own section at the very TOP of the Traits tab. Every NPC carries one
  // now (for non-casters it's latent flavor -- how their magic would work if they ever pick any up);
  // old payloads without casting_tradition simply skip the section. The divider's underscore runs are
  // deliberately SYMMETRIC (equal on both sides), unlike the legacy dividers around it.
  const castingTrad = characterData.casting_tradition || {};
  if (Object.keys(castingTrad).length) {
    await appendFeatDivider(ctx, "____________________ Casting Traditions ____________________", -200000, 'trait');
    const camName = castingTrad.casting_ability_modifier;
    const tradItem = synthesizeFeatItem(
      camName ? `Casting Tradition (${camName})` : "Casting Tradition",
      buildTraditionHtml(castingTrad, characterData.sphere_mana_pool));
    tradItem.system.subType = 'trait';
    tradItem.sort = -199900;
    appendJsonToTemplate([tradItem], exportTemplate, "Trait");
  }
  // Traits section: divider, then the creation traits (sorts 100+ from processFeatTrait).
  await appendFeatDivider(ctx, "____________________ Traits______________________", -100000, 'trait');
  await processFeatTrait('everyTrait', characterData.selected_traits, 'trait');
  // Flaws: mechanical drawbacks from flaw_effects_dict — one trait item per flaw, named with its
  // tier, full rules text as the description, pf1 changes/contextNotes via applyBuffData.
  const flawEffects = characterData.flaw_effects_dict || {};
  if (Object.keys(flawEffects).length) {
    await appendFeatDivider(ctx, "____________________ Flaws______________________", 50000, 'trait');
    let flawSort = 50100;
    for (const [flawName, entry] of Object.entries(flawEffects)) {
      const tierLabel = String(entry.tier || 'minor') === 'major' ? 'Major' : 'Minor';
      const item = synthesizeFeatItem(`(Flaw, ${tierLabel}) ${flawName}`,
        entry.description ? `<p>${entry.description}</p>` : "");
      item.system.subType = 'trait';
      item.sort = flawSort;
      flawSort += 100;
      applyBuffData(ctx, item, entry);
      appendJsonToTemplate([item], exportTemplate, "Trait");
    }
    console.log(`Flaws: added ${Object.keys(flawEffects).length} mechanical flaw trait(s).`);
  }
}


// Feat tax: fold each granted chain feat into its primary entry -- append " > <Feat>" to the name
// (using the compendium's real casing) and merge the granted feat's description into the primary's
// details under a labeled separator. `data` is the template feat array used to resolve each feat.
function applyFeatTax(items, data, taxArray) {
  for (let i = 0; i < items.length; i++) {
    const tax = taxArray?.[i];
    if (!Array.isArray(tax) || !tax.length) continue;

    const names = [];
    let desc = items[i].system?.description?.value || "";
    for (const childRaw of tax) {
      const child = String(childRaw);
      const childItem = data.find(r => {
        const namePart = r.name.split(' (')[0];
        return namePart.toLowerCase() === child.toLowerCase() && !r.name.includes('(Mythic)');
      });
      // Homebrew chain children (style-chain followers, Martial Training partners) aren't in
      // every_feat.json -- resolve display name + description from the backend export instead
      // of falling through to toTitleCase (which would mangle apostrophes, e.g. "Fool'S").
      const hb = !childItem ? homebrewFeatDescs[child.toLowerCase()] : null;
      const displayName = childItem ? childItem.name.split(' (')[0] : (hb ? hb.name : toTitleCase(child));
      names.push(displayName);
      const childDesc = childItem?.system?.description?.value ?? (hb ? `<p>${hb.desc}</p>` : null);
      if (childDesc) desc += `<hr><p><strong>${displayName}</strong></p>${childDesc}`;
    }

    items[i].name = `${items[i].name} > ${names.join(" > ")}`;
    if (items[i].system?.description) items[i].system.description.value = desc;
  }
}


// Homebrew profession abilities -> feat-section items (subType:"feat", bottom of the Feats tab).
// Each backend item is {name, description, changes[], contextNotes[], uses{}}; passive `changes` are
// mechanically applied, `uses` becomes a charge pool, and the rich HTML body is preserved verbatim
// (Rank 5 / Rank 15 entries bundle several abilities, <hr>-separated, like the reference sheets).
async function processProfessionAbilities(items, startingSort = 3900) {
  if (!Array.isArray(items) || items.length === 0) return;
  const built = [];
  for (const it of items) {
    const item = synthesizeFeatItem(it.name || "Profession", it.description || "");
    const changes = Array.isArray(it.changes) ? it.changes : [];
    if (changes.length) {
      // Fill the pf1 ChangeModel defaults the backend omits (_id + value), keeping its formula/target.
      item.system.changes = changes.map(ch => Object.assign(
        { formula: "0", target: "", type: "untyped", operator: "add", priority: 0, value: 0 },
        ch, { _id: (ch && ch._id) || ctx.newChangeId(ch) }
      ));
    }
    if (Array.isArray(it.contextNotes) && it.contextNotes.length) item.system.contextNotes = it.contextNotes;
    if (it.uses && typeof it.uses === "object") {
      item.system.uses = Object.assign(
        { value: null, per: "", autoDeductChargesCost: "", maxFormula: "", rechargeFormula: "" }, it.uses);
    }
    built.push(item);
  }
  assignSequentialSort(built, startingSort);
  appendJsonToTemplate(built, exportTemplate, "Feat");
}

// camelCase a display sphere name for the flags.pf1spheres.sphere fallback when a talent isn't in the
// compendium (e.g. "Dual Wielding" -> "dualWielding", "Fallen Fey" -> "fallenFey", "Lancer" -> "lancer").
function sphereKeyFromName(s) {
  const words = String(s).replace(/\s*\[[^\]]*\]\s*/g, ' ').trim().split(/\s+/).filter(Boolean);
  return words.map((w, i) => i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('');
}

// Human-readable casting-tradition writeup: what the casting ability means, the mana pool breakdown
// (only when a pool exists -- pure martials carry a latent tradition with no pool), each drawback
// (with its 1-/2-point weight) and boon spelled out, and the drawback->boon->bonus-SP math. Shared by
// the "Spheres Casting" summary feat (magic dabblers) and the Casting Traditions trait every NPC gets.
function buildTraditionHtml(tradition, manaPool) {
  const parts = [];
  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const plural = (n, word) => `${n} ${word}${Number(n) === 1 ? '' : 's'}`;
  // Each drawback/boon is now {name, description, counts_as?}; tolerate bare-name strings from
  // payloads generated before descriptions were carried through (still cached in localStorage).
  const traitName = t => (t && typeof t === 'object') ? (t.name || '') : String(t);
  const traitDesc = t => (t && typeof t === 'object') ? (t.description || '') : '';
  const traitWeight = t => (t && typeof t === 'object') ? (Number(t.counts_as) || 1) : 1;
  const renderDrawback = t => {
    const wt = ` <em>(${plural(traitWeight(t), 'drawback point')})</em>`;
    const d = traitDesc(t);
    return `<li><strong>${esc(traitName(t))}</strong>${wt}${d ? ` &mdash; ${esc(d)}` : ''}</li>`;
  };
  const renderBoon = t => {
    const d = traitDesc(t);
    return `<li><strong>${esc(traitName(t))}</strong>${d ? ` &mdash; ${esc(d)}` : ''}</li>`;
  };

  const cam = (tradition && tradition.casting_ability_modifier) || '';
  // Prefer the rich {name, description, counts_as} dicts; fall back to the plain name-string arrays
  // (which the backend always keeps .join()-safe) so an older payload still renders clean names.
  const dbs = (tradition && (tradition.drawbacks_detail || tradition.drawbacks)) || [];
  const boons = (tradition && (tradition.boons_detail || tradition.boons)) || [];
  const bonusSp = Number(tradition && tradition.bonus_spell_points) || 0;
  const pool = Number(manaPool) || 0;
  const base = Math.max(0, pool - bonusSp);

  if (dbs.length || boons.length) {
    parts.push(`<p><em>This character's casting tradition &mdash; the limitations (drawbacks) and perks (boons) that shape how their magic works${pool > 0 ? '' : ' (latent: it applies to any sphere magic they ever pick up)'}.</em></p>`);
  }
  if (cam) {
    parts.push(`<p><strong>Casting ability:</strong> ${esc(cam)} &mdash; the mental ability score that powers their sphere magic. It sets the save DC of their sphere effects (DC 10 + 1/2 caster level + ${esc(cam)} modifier) and their base pool of spell points.</p>`);
  }
  if (pool > 0) {
    const breakdown = bonusSp
      ? ` (base ${base} from the ${esc(cam || 'casting')} modifier + ${plural(bonusSp, 'bonus spell point')} from unspent drawbacks)`
      : ` (from the ${esc(cam || 'casting')} modifier)`;
    parts.push(`<p><strong>Spell points (mana pool):</strong> ${pool} &mdash; the daily pool spent to fuel the more powerful sphere abilities; it refreshes after a night's rest.${breakdown}</p>`);
  }
  if (dbs.length) {
    parts.push(`<p><strong>Drawbacks</strong> &mdash; limits accepted on their magic; each is worth 1 or 2 drawback points:</p><ul>${dbs.map(renderDrawback).join('')}</ul>`);
  }
  if (boons.length) {
    parts.push(`<p><strong>Boons</strong> &mdash; perks purchased with drawback points (2 drawback points buy 1 boon):</p><ul>${boons.map(renderBoon).join('')}</ul>`);
  }
  if (dbs.length) {
    const totalPts = dbs.reduce((n, t) => n + traitWeight(t), 0);
    const leftover = Math.max(0, totalPts - boons.length * 2);
    const spInto = pool > 0 ? ' (rising triangular chart, folded into the mana pool above)' : ' (rising triangular chart; banked until they have a mana pool)';
    parts.push(`<p><strong>Tradition math:</strong> ${plural(totalPts, 'drawback point')} total &rarr; ${plural(boons.length, 'boon')} bought (2 points each) &rarr; ${plural(leftover, 'point')} left over &rarr; +${plural(bonusSp, 'bonus spell point')}${spInto}.</p>`);
  }
  return parts.join('');
}

// Spheres (of Power / Might) -> NATIVE pf1spheres talent items so they land in the module's Combat /
// Magic Talents section (not the Features list), exactly like a talent dragged in from the compendium.
// Each backend talent is matched (by normalized name) to the pf1spheres.combat-talents /
// .magic-talents pack and cloned (the clone carries subType "combatTalent"/"magicTalent",
// flags.pf1spheres.sphere, the sphere icon, and the compendium source). Talents absent from the
// compendium (or with the module disabled) are synthesized as feat items tagged with the same subType
// + sphere flag so they still appear in the talents section. Magic dabblers also get one informational
// casting-tradition / mana-pool summary feat. The sphere FEATS ride the normal feat pipeline elsewhere.
async function processSpheres(magicItems, combatItems, tradition, manaPool, startingSort = 4210) {
  magicItems = Array.isArray(magicItems) ? magicItems : [];
  combatItems = Array.isArray(combatItems) ? combatItems : [];
  if (!magicItems.length && !combatItems.length) return;

  const active = !!game.modules.get('pf1spheres')?.active;
  if (!active) console.warn('Spheres: pf1spheres module inactive — synthesizing talent items (still tagged for the talents section).');

  async function loadPack(packId) {
    const map = new Map();
    if (!active) return map;
    try {
      const pack = game.packs.get(packId);
      if (pack) {
        const docs = await pack.getDocuments();
        for (const d of docs) map.set(sphereNorm(d.name), d);
      } else {
        console.warn(`Spheres: pack ${packId} not found — synthesizing those talents.`);
      }
    } catch (e) {
      console.warn(`Spheres: could not read ${packId} — synthesizing.`, e);
    }
    return map;
  }
  const magicPack = await loadPack('pf1spheres.magic-talents');
  const combatPack = await loadPack('pf1spheres.combat-talents');

  const talentEntries = [];   // {item, sphere, advanced, name} -> sorted below
  let misses = 0;
  function buildTalent(t, pack, subType) {
    let item;
    const doc = pack.get(sphereNorm(t.name || ''));
    if (doc) {
      item = doc.toObject();
      delete item._id;            // fresh embedded id on actor creation
    } else {
      misses++;
      const cleanName = String(t.name || 'Talent').split(' (')[0].replace(/\s*\[[^\]]*\]\s*/g, ' ').trim();
      item = synthesizeFeatItem(cleanName, t.description ? `<p>${t.description}</p>` : '');
      item.system.subType = subType;   // combatTalent / magicTalent -> shows in the pf1spheres section
      item.flags = item.flags || {};
      item.flags.pf1spheres = { sphere: sphereKeyFromName(t.sphere || '') };
    }
    // Backend-authored numeric buffs for COMBAT (Might) talents -> the Foundry Changes tab (Power
    // talents carry none). Fill the pf1 ChangeModel defaults like processProfessionAbilities.
    if (Array.isArray(t.changes) && t.changes.length) {
      item.system = item.system || {};
      const ex = Array.isArray(item.system.changes) ? item.system.changes : [];
      item.system.changes = ex.concat(t.changes.map(ch => Object.assign(
        { formula: "0", target: "", type: "untyped", operator: "add", priority: 0, value: 0 },
        ch, { _id: (ch && ch._id) || ctx.newChangeId(ch) })));
    }
    if (Array.isArray(t.contextNotes) && t.contextNotes.length) {
      item.system = item.system || {};
      const ex = Array.isArray(item.system.contextNotes) ? item.system.contextNotes : [];
      item.system.contextNotes = ex.concat(t.contextNotes);
    }
    if (t.advanced) item.name = `(Advanced) ${item.name}`;   // label advanced talents (compendium clone has no flag)
    const sphere = (item.flags && item.flags.pf1spheres && item.flags.pf1spheres.sphere) || sphereKeyFromName(t.sphere || '');
    talentEntries.push({ item, sphere, advanced: !!t.advanced, name: item.name });
  }
  for (const t of combatItems) buildTalent(t, combatPack, 'combatTalent');
  for (const t of magicItems) buildTalent(t, magicPack, 'magicTalent');

  // Order each sphere: normal talents alphabetical, then advanced talents (alphabetical) at the bottom.
  // pf1spheres' Spheres tab lists a sphere's talents by their `sort` field, so we assign `sort` in this
  // order. (Cross-sphere order is irrelevant -- each sphere renders as its own group.)
  talentEntries.sort((a, b) =>
    a.sphere.localeCompare(b.sphere)
    || (a.advanced === b.advanced ? 0 : (a.advanced ? 1 : -1))
    || a.name.localeCompare(b.name));
  const built = talentEntries.map(e => e.item);

  // Magic dabblers: one informational casting-tradition / mana-pool summary feat (not a talent).
  if (Number(manaPool) > 0 || (tradition && Object.keys(tradition).length)) {
    const html = buildTraditionHtml(tradition, manaPool);
    if (html) built.push(synthesizeFeatItem(`Spheres Casting (mana pool ${Number(manaPool) || 0})`, html));
  }

  assignSequentialSort(built, startingSort);
  appendJsonToTemplate(built, exportTemplate, "Feat");
  console.log(`Spheres: injected ${built.length} item(s) (${misses} synthesized).`);
}


await Feats_n_Traits();

// ----- Path of War maneuvers/stances section ----- //
// Native pf1-pow integration. Every known maneuver/stance becomes a pf1-pow.maneuver item —
// cloned from the pf1-pow.disciplines compendium when the name matches (clean text, real
// icons, save data), synthesized from the backend's maneuvers_desc_dict otherwise. Names are
// prefixed "(Strike)/(Boost)/(Counter)/(Stance)"; system.class points at the class item so
// pf1-pow's Path of War tab groups them under the class; readied maneuvers start ready with a
// charge. Martial Training (non-initiator) characters additionally get
// system.maneuverProgression = archetype on their class item plus the pf1-pow maneuverAttr
// actor flag (initiation stat = highest FINAL mental stat, computed by the backend; client
// fallback below for old payloads). Initiator classes are untouched — their every_class.json
// items already carry maneuverProgression, which pf1-pow prefers over the actor flag. Each
// stance also becomes an inactive TEMPORARY buff under a "____ Path of War ____" buff divider
// (addStanceBuffs). With pf1-pow disabled we fall back to the legacy feat items.

// The display half of the same defect (see powNorm in shared/text.js). Matching a corrupted compendium name is only half a fix: the
// clone carries `doc.name` onto the sheet verbatim, so without this a warder's stance reads
// "Turtle Knightâ€™s Stance" in the item list. Repaired rather than stripped -- the apostrophe is
// part of the name, and the sheet should show the name the book prints.
const powDisplayName = (s) => String(s).replace(/â€™/g, '’');

// Full pf1-pow.maneuver item from the backend's maneuvers_desc_dict entry (field set mirrors a
// pf1-pow.disciplines compendium export). Used only when the compendium has no name match.
function synthesizeManeuverItem(name, d, isStance, isReadied) {
  const typeCap = capitalizeManeuverType(d.type) || (isStance ? 'Stance' : 'Strike');
  const header = `<p><strong>${d.discipline || ''} ${d.type || 'maneuver'}${d.level ? ` ${d.level}` : ''}</strong></p>`;
  const meta = ['action', 'range', 'duration']
    .filter(k => d[k]).map(k => `<p><em>${k[0].toUpperCase() + k.slice(1)}:</em> ${d[k]}</p>`).join('');
  const body = d.description ? `<hr><p>${d.description}</p>` : '';
  const initMatch = String(d.action || '').toLowerCase().match(/\b(swift|immediate|standard|full)\b/);
  return {
    name: `(${typeCap}) ${name}`,
    type: "pf1-pow.maneuver",
    img: isStance ? "icons/svg/shield.svg" : "icons/svg/sword.svg",
    system: {
      description: { value: header + meta + body },
      discipline: d.discipline || "",
      initTime: { value: 1, units: initMatch ? initMatch[1] : "standard" },
      level: Number(d.level) || 1,
      saveEffect: "See text",
      saveType: "None",
      uses: { per: "", value: isStance || isReadied ? 1 : 0, maxFormula: "1", autoDeductChargesCost: "", rechargeFormula: "" },
      actions: [], changes: [], contextNotes: [], sources: [],
      maneuverType: typeCap,
      ready: !isStance && isReadied,
      granted: false,
      stanceActive: false,
      class: upper_case_class,
    },
    effects: [], flags: {},
  };
}

// Martial Training characters (mt_feats non-empty <=> non-initiator with maneuvers): mark the
// class as an archetype initiator and set the global initiating-stat flag. pf1-pow then shows
// the Path of War tab (initLevel > 0) and rolls maneuver DCs off initiatorAttr.
function applyManeuverProgression() {
  if (!(characterData.mt_feats || []).length) return;
  const initStat = resolveInitStat(ctx);
  const classItem = (exportTemplate.items || []).find(i => i.type === 'class' && i.name === upper_case_class);
  if (classItem) {
    classItem.system = classItem.system || {};
    classItem.system.maneuverProgression = { classType: 'archetype', type: 'regular', initiatorAttr: initStat };
  } else {
    console.warn(`Path of War: class item "${upper_case_class}" not found — maneuverProgression not set.`);
  }
  exportTemplate.flags = exportTemplate.flags || {};
  exportTemplate.flags['pf1-pow'] = { ...(exportTemplate.flags['pf1-pow'] || {}), maneuverAttr: initStat };
  console.log(`Path of War: archetype maneuverProgression + maneuverAttr "${initStat}" set (Martial Training).`);
}

// Each chosen stance becomes an inactive temporary buff under a "____ Path of War ____" buff
// divider so it can be toggled during play. Mechanical changes/contextNotes come from
// stance_changes.json where curated (IL scaling uses @pow.initLevel with ifelse()/gte();
// pf1 v11 formulas have no JS ternaries); uncurated stances are description-only toggles.
async function addStanceBuffs(stances, descs, matchedDocs) {
  if (!stances.length) return;
  const stanceChanges = templates.stanceChanges;
  const changesByNorm = {};
  if (stanceChanges && typeof stanceChanges === 'object') {
    for (const [k, v] of Object.entries(stanceChanges)) changesByNorm[powNorm(k)] = v;
  } else {
    console.warn('Path of War: stance_changes.json missing or invalid — stance buffs will be description-only.');
  }

  const divider = structuredClone(templates.spacePathOfWarBuffs);
  const buffs = [];
  // Resolve @INITMOD in stance contextNotes, same as addManeuverConditionals does for maneuver riders.
  const stanceInit = maneuverInitAttr(ctx);
  const subInit = s => String(s == null ? '' : s).replaceAll('@INITMOD', `@abilities.${stanceInit}.mod`);
  for (const name of stances) {
    const doc = matchedDocs.get(name);
    const d = descs[name] || {};
    const curated = changesByNorm[powNorm(name)] || {};
    const changes = structuredClone(Array.isArray(curated.changes) ? curated.changes : []);
    for (const ch of changes) {
      if (!ch._id) ch._id = (ctx.newId('change', [name, ch])).slice(0, 8);
    }
    buffs.push({
      name: `(Stance) ${doc ? powDisplayName(doc.name) : name}`,
      type: "buff",
      img: doc?.img || "icons/svg/shield.svg",
      system: {
        description: { value: doc?.system?.description?.value || d.description || "", instructions: "", unidentified: "" },
        tags: [],
        changes,
        changeFlags: {},
        contextNotes: (Array.isArray(curated.contextNotes) ? curated.contextNotes : [])
          .map(n => ({ ...structuredClone(n), text: subInit(n.text) })),
        actions: [], attackNotes: [], effectNotes: [],
        uses: { value: null, per: "", autoDeductChargesCost: "", maxFormula: "", rechargeFormula: "" },
        links: { children: [] },
        tag: "",
        flags: { boolean: {}, dictionary: {} },
        scriptCalls: [],
        subType: "temp",
        active: false,
        level: 0,
        duration: { value: "", units: "" },
        conditions: [],
        hideFromToken: false,
        showInQuickbar: false,
      },
      effects: [], flags: {},
    });
  }
  const all = [divider, ...buffs];
  assignSequentialSort(all, 4000);   // divider 4000, stance buffs 4010+ (Buffs tab "temp" section)
  appendJsonToTemplate(all, exportTemplate, 'PathOfWarBuffs');
  console.log(`Path of War: injected ${buffs.length} stance buff(s) under the buff divider.`);
}

// Pre-pf1-pow fallback: maneuvers/stances as plain feat items under a feats-section divider
// (subType "combatTalent" on the modded sheet, "martialDiscipline" otherwise).
async function legacyProcessPathOfWarFeats() {
  const known = (characterData.maneuvers_choose_from || []).flat();
  const stances = characterData.stances_chosen || [];
  const readied = new Set((characterData.maneuvers_readied_names || []).flat());
  const descs = characterData.maneuvers_desc_dict || {};
  const powSubType = (modded === "y") ? "combatTalent" : "martialDiscipline";

  await addFeatSeparator('spacePathOfWar', 'space_function', 4000);

  const items = [];
  for (const name of [...known, ...stances]) {
    const d = descs[name] || {};
    const isStance = String(d.type || '').toLowerCase() === 'stance' || stances.includes(name);
    const header = `<p><strong>${d.discipline || ''} ${d.type || 'maneuver'}${d.level ? ` ${d.level}` : ''}</strong></p>`;
    const meta = ['action', 'range', 'duration']
      .filter(k => d[k]).map(k => `<p><em>${k[0].toUpperCase() + k.slice(1)}:</em> ${d[k]}</p>`).join('');
    const body = d.description ? `<hr><p>${d.description}</p>` : '';
    const item = synthesizeFeatItem(isStance ? `${name} (Stance)` : name, header + meta + body,
                                    isStance ? "icons/svg/shield.svg" : "icons/svg/sword.svg");
    item.system.subType = powSubType;
    if (!isStance) {     // every known maneuver carries 1 max charge; readied ones start charged
      item.system.uses = { value: readied.has(name) ? 1 : 0, per: "charges",
                           maxFormula: "1", autoDeductChargesCost: "", rechargeFormula: "" };
    }
    items.push(item);
  }
  assignSequentialSort(items, 4010);
  appendJsonToTemplate(items, exportTemplate, 'PathOfWar');
  console.log(`Path of War (legacy): injected ${items.length} maneuver/stance feat items (${powSubType}).`);
}

async function processPathOfWar() {
  try {
    const known = (characterData.maneuvers_choose_from || []).flat();
    const stances = characterData.stances_chosen || [];
    if (!known.length && !stances.length) return;   // zero-PoW characters / old payloads: no section

    if (!game.modules.get('pf1-pow')?.active) {
      console.warn('Path of War: pf1-pow module inactive — falling back to legacy feat items.');
      return legacyProcessPathOfWarFeats();
    }

    const readied = new Set((characterData.maneuvers_readied_names || []).flat());
    const descs = characterData.maneuvers_desc_dict || {};
    const stanceSet = new Set(stances);

    // One-shot compendium load (~1000 small docs per generation) keyed by normalized name.
    let packDocs = new Map();
    try {
      const pack = game.packs.get('pf1-pow.disciplines');
      if (pack) {
        const docs = await pack.getDocuments();
        packDocs = new Map(docs.map(doc => [powNorm(doc.name), doc]));
      } else {
        console.warn('Path of War: pf1-pow.disciplines pack not found — synthesizing all items.');
      }
    } catch (e) {
      console.warn('Path of War: could not read pf1-pow.disciplines — synthesizing all items.', e);
    }

    const items = [];
    const matchedDocs = new Map();   // backend name -> compendium doc (reused for stance buffs)
    let misses = 0;
    for (const name of [...known, ...stances]) {
      const d = descs[name] || {};
      const isStance = String(d.type || '').toLowerCase() === 'stance' || stanceSet.has(name);
      const isReadied = readied.has(name);
      const doc = packDocs.get(powNorm(name));
      if (doc) {
        matchedDocs.set(name, doc);
        const item = doc.toObject();
        delete item._id;   // fresh embedded id on actor creation
        // WE outrank the pack on stance-ness. pf1-pow types 17 of its 69 "...Stance" documents as
        // Boost (16) or Strike (1) -- Poisoner's Stance, Battle Dragon's Stance, Skirmisher's Stance
        // and so on -- so deferring to `maneuverType` labelled them "(Boost) Poisoner's Stance" while
        // addStanceBuffs simultaneously built them a "(Stance)" buff. `isStance` is the better
        // source: it comes from the backend's own `stances_chosen` / desc `type`, which is what put
        // the maneuver in the stance list in the first place.
        const typeCap = isStance
          ? 'Stance'
          : (item.system?.maneuverType || capitalizeManeuverType(d.type) || 'Strike');
        item.name = `(${typeCap}) ${powDisplayName(doc.name)}`;
        item.system.class = upper_case_class;
        item.system.granted = false;
        item.system.stanceActive = false;
        item.system.ready = !isStance && isReadied;
        if (!isStance) {
          item.system.uses = { ...(item.system.uses || {}), value: isReadied ? 1 : 0, maxFormula: "1" };
        }
        items.push(item);
      } else {
        misses++;
        console.warn(`Path of War: "${name}" not in pf1-pow.disciplines — synthesizing from backend data.`);
        items.push(synthesizeManeuverItem(name, d, isStance, isReadied));
      }
    }
    assignSequentialSort(items, 4010);   // PoW tab ignores sort; keeps the Items directory tidy
    appendJsonToTemplate(items, exportTemplate, 'PathOfWar');

    applyManeuverProgression();
    await addStanceBuffs(stances, descs, matchedDocs);

    console.log(`Path of War: injected ${items.length} native pf1-pow.maneuver items (${misses} synthesized).`);
  } catch (error) {
    console.error('Error processing the Path of War section:', error);
  }
}

await processPathOfWar();

// ----- Start of Psionics Section ----- //
// Psionics is the Path of War shape one more time: the backend picks the powers and computes the
// numbers, a third-party module (pf1-psionics) renders them.
//
// The load-bearing difference is that pf1-psionics shows its ENTIRE Psionics tab off a single
// condition — actor-sheet.mjs checks whether any manifester book flag has inUse:true. It reads no
// class item, no class tag, no power item. So a generated manifester without these flags arrives
// with its powers in the Items directory and nothing on the sheet, and the GM has to add a class
// by hand in the settings panel to reveal it. configureManifesters is that fix.
//
// Powers become pf1-psionics.power items: cloned from the module's own pack when the name matches
// (real icons, actions, prepared descriptions), synthesized from the backend's powers_desc_dict
// otherwise. Misses are EXPECTED — a measured 67 of the backend's powers are Metzofitz-only
// content that exists in no compendium anywhere.
//
// Power POINTS stay the module's to compute (autoLevelPowerPoints), because its tables and ours
// are the same twenty numbers — validate_psionics_data.py asserts exactly that, every run. That
// only works if book.class is the class ITEM's tag, so a tag miss is warned about rather than
// left to surface as a plausible-looking zero. The backend's pp_per_day seeds the CURRENT pool
// instead, so a generated NPC arrives rested; .maximum is derived during actor prep, which has
// not run yet. With pf1-psionics disabled we fall back to feat items plus a charge pool, the same
// way the Path of War block above falls back.

const MANIFESTER_SLOTS = ['primary', 'secondary', 'tertiary'];
// The seven discipline keys pf1-psionics recognises (data/disciplines.mjs). Anything else makes
// system.school undefined and drops the power out of Psionics-Magic Transparency.
const PSIONIC_DISCIPLINES = ['athanatism', 'clairsentience', 'metacreativity', 'psychokinesis',
                             'psychometabolism', 'psychoportation', 'telepathy'];

// Scraped discipline prose -> the module's key. The wiki writes "Telepathy (Compulsion)
// [Mind-Affecting]"; the key is the first word, lowercased.
function disciplineKey(raw) {
  const first = String(raw || '').trim().split(/[\s([]/)[0].toLowerCase();
  return PSIONIC_DISCIPLINES.includes(first) ? first : 'athanatism';
}

// "Auditory and visual" / "Material, Mental" -> the module's five display booleans.
function displayFlags(raw) {
  const s = String(raw || '').toLowerCase();
  const has = k => s.includes(k);
  return { auditory: has('auditory'), material: has('material'), mental: has('mental'),
           olfactory: has('olfactory'), visual: has('visual') };
}

// The manifester entries that get a pf1-psionics book, in payload order. Two kinds are filtered
// out and both are legitimate: the soulknife carries an entry with no key ability (it manifests
// nothing — its mind blade is a weapon, not a subsystem), and a manifester whose key ability
// failed the score gate reads all zeroes. The aegis DOES get one: power points, no powers.
function manifestingBooks() {
  return (characterData.manifesters || []).filter(m => m && m.manifesting_stat && m.caster_type);
}

// Write the pf1-psionics manifester book flags. Returns backend class name -> book slot, so the
// power items below can point at the book that granted them.
function configureManifesters(books) {
  const flags = exportTemplate.flags || (exportTemplate.flags = {});
  const psionics = flags['pf1-psionics'] || (flags['pf1-psionics'] = {});
  const manifesters = psionics.manifesters || (psionics.manifesters = {});

  if (books.length > MANIFESTER_SLOTS.length) {
    console.warn(`Psionics: ${books.length} manifesting classes but only ${MANIFESTER_SLOTS.length} pf1-psionics books — dropping ${books.slice(MANIFESTER_SLOTS.length).map(b => b.name).join(', ')}.`);
  }

  const slotFor = new Map();
  for (let s = 0; s < books.length && s < MANIFESTER_SLOTS.length; s++) {
    const book = books[s];
    const slot = MANIFESTER_SLOTS[s];
    const display = book.display || capitalizeWords(book.name || '');
    const classItem = (exportTemplate.items || []).find(i => i.type === 'class' && i.name === display);
    const tag = classItem?.system?.tag;
    if (!tag) {
      // pf1-psionics derives power points from book.cl.classLevelTotal, which needs this tag. A
      // miss reads as zero points with no error anywhere, so it gets said out loud here.
      console.warn(`Psionics: no class item tag for "${display}" — its power points will read 0.`);
    }
    manifesters[slot] = Object.assign({}, manifesters[slot], {
      inUse: true,               // <- the whole condition pf1-psionics gates its tab on
      name: display,
      class: tag || book.name,
      casterType: book.caster_type,
      ability: book.manifesting_stat,
      autoLevelPowerPoints: true,
      autoAttributePowerPoints: true,
      autoMaxPowerLevel: true,
    });
    slotFor.set(book.name, slot);
    console.log(`Manifester ${slot} <- ${display} (${book.caster_type}, ${book.manifesting_stat}, ML ${book.manifester_level}, ${book.pp_per_day} pp)`);
  }

  const pp = books.slice(0, MANIFESTER_SLOTS.length)
    .reduce((sum, b) => sum + (Number(b.pp_per_day) || 0), 0);
  psionics.powerPoints = Object.assign({}, psionics.powerPoints, { current: pp, temporary: 0 });
  return slotFor;
}

// Full pf1-psionics.power item from a powers_desc_dict entry (field set mirrors the module's
// PowerModel). Used only when the powers pack has no name match.
function synthesizePowerItem(name, d, slot, level) {
  const header = `<p><strong>${d.discipline || ''}${level ? ` ${level}` : ''}</strong></p>`;
  const meta = [['manifesting time', 'Manifesting Time'], ['range', 'Range'],
                ['duration', 'Duration'], ['saving throw', 'Saving Throw'],
                ['power resistance', 'Power Resistance'], ['power points', 'Power Points']]
    .filter(([k]) => d[k]).map(([k, label]) => `<p><em>${label}:</em> ${d[k]}</p>`).join('');
  const body = d.text ? `<hr>${String(d.text).split(/\n{2,}/).map(p => `<p>${p}</p>`).join('')}` : '';
  const augment = d.augment ? `<hr><p><em>Augment:</em> ${d.augment}</p>` : '';
  const timeMatch = String(d['manifesting time'] || '').toLowerCase()
    .match(/\b(swift|immediate|standard|move|full)\b/);
  return {
    name,
    type: "pf1-psionics.power",
    img: "icons/svg/daze.svg",
    system: {
      description: { value: header + meta + body + augment },
      discipline: disciplineKey(d.discipline),
      subdiscipline: [], descriptors: [],
      level: Number(level) || 0,
      manifester: slot,
      manifestTime: { value: 1, units: timeMatch ? timeMatch[1] : "standard" },
      display: displayFlags(d.display),
      modifiers: { cl: 0, sl: 0 },
      known: true,
      prepared: false,
      // "No" / "None" mean the power ignores power resistance; the module's default is true.
      sr: !/^\s*(no|none)\b/i.test(String(d['power resistance'] || '')),
      showInCombat: true,
      actions: [], changes: [], contextNotes: [], sources: [],
      // The rest of pf1-psionics' PowerModel, filled with the defaults all 593 pack documents
      // share. A synthesized power used to be missing these, which made it structurally different
      // from a native one -- and one of them is not cosmetic: `uses.autoDeductChargesCost` is the
      // formula that spends power points when the power is manifested, so a gap-filled power was
      // free to cast. The pack is missing "Suppress Veil" and "Malefic Metamorphosis" outright, so
      // this path is the only thing standing between those powers and a broken sheet.
      attackNotes: [], effectNotes: [], scriptCalls: [], tags: [],
      links: { children: [] },
      // pf1's own boolean/dictionary flag bags, which live INSIDE system. The item-level `flags`
      // below is Foundry's module bag and a different thing -- every pack document carries
      // `{"pf1-psionics": {sourceUrl: ...}}` there, which a synthesized power has no URL for.
      flags: { boolean: {}, dictionary: {} },
      // Deliberately empty: `learnedAt` drives the "which class can learn this at what level" UI,
      // and the power is already granted and known here.
      learnedAt: { class: {} },
      uses: { autoDeductChargesCost: "max(0, @sl * 2 - 1)" },
    },
    effects: [], flags: {},
  };
}

// Pre-pf1-psionics fallback: powers as plain feat items under a divider, plus one per-class power
// point pool so the number the backend computed is still on the sheet somewhere.
async function legacyProcessPsionicsFeats(books) {
  const descs = characterData.powers_desc_dict || {};
  await appendFeatDivider(ctx, "__________________Psionics______________", 4200, 'feat');

  const items = [];
  for (const book of books) {
    const display = book.display || capitalizeWords(book.name || '');
    // The power point pool: a flat maxFormula, not a @classes.<tag>.level expression, because
    // power points are a published table plus an ability formula, not a per-level slope.
    const pool = synthesizeFeatItem(`Power Points (${display})`,
      `<p>Power points per day for ${display} at manifester level ${book.manifester_level}.</p>`,
      "systems/pf1/icons/skills/blue_36.jpg");
    pool.system.uses = { value: Number(book.pp_per_day) || 0, per: "day",
                         maxFormula: String(Number(book.pp_per_day) || 0),
                         autoDeductChargesCost: "", rechargeFormula: "" };
    items.push(pool);

    (book.powers_by_level || []).forEach((bucket, level) => {
      for (const name of bucket) {
        const d = descs[name] || {};
        const header = `<p><strong>${d.discipline || ''} power ${level}</strong></p>`;
        const meta = ['manifesting time', 'range', 'duration', 'saving throw', 'power points']
          .filter(k => d[k]).map(k => `<p><em>${capitalizeWords(k)}:</em> ${d[k]}</p>`).join('');
        const body = d.text ? `<hr><p>${d.text}</p>` : '';
        items.push(synthesizeFeatItem(`${name} (Power ${level})`, header + meta + body,
                                      "icons/svg/daze.svg"));
      }
    });
  }
  assignSequentialSort(items, 4210);
  appendJsonToTemplate(items, exportTemplate, 'Psionics');
  console.log(`Psionics (legacy): injected ${items.length} power/pool feat items.`);
}

async function processPsionics() {
  try {
    const books = manifestingBooks();
    if (!books.length) return;   // non-manifesters and old payloads: no psionics at all

    if (!game.modules.get('pf1-psionics')?.active) {
      console.warn('Psionics: pf1-psionics module inactive — falling back to legacy feat items.');
      return legacyProcessPsionicsFeats(books);
    }

    const slotFor = configureManifesters(books);
    const descs = characterData.powers_desc_dict || {};

    // One-shot compendium load keyed by normalized name. powNorm also folds the curly apostrophe,
    // which this pack genuinely mixes: "Artificer's Surge" (U+2019) sits beside "Reaper's Blade".
    let packDocs = new Map();
    try {
      const pack = game.packs.get('pf1-psionics.powers');
      if (pack) {
        const docs = await pack.getDocuments();
        packDocs = new Map(docs.map(doc => [powNorm(doc.name), doc]));
      } else {
        console.warn('Psionics: pf1-psionics.powers pack not found — synthesizing all items.');
      }
    } catch (e) {
      console.warn('Psionics: could not read pf1-psionics.powers — synthesizing all items.', e);
    }

    const items = [];
    let misses = 0;
    for (const book of books) {
      const slot = slotFor.get(book.name);
      if (!slot) continue;   // dropped for want of a book slot; already warned about
      // powers_by_level is the only record of which power sits at which level: the description
      // entry keys its levels by power LIST ("psion/wilder"), not by class.
      (book.powers_by_level || []).forEach((bucket, level) => {
        for (const name of bucket) {
          const d = descs[name] || {};
          const doc = packDocs.get(powNorm(name));
          if (doc) {
            const item = doc.toObject();
            delete item._id;            // fresh embedded id on actor creation
            item.system = item.system || {};
            item.system.manifester = slot;
            item.system.known = true;
            item.system.level = level;  // the level THIS class learns it at
            items.push(item);
          } else {
            misses++;
            console.warn(`Psionics: "${name}" not in pf1-psionics.powers — synthesizing from backend data.`);
            items.push(synthesizePowerItem(name, d, slot, level));
          }
        }
      });
    }

    assignSequentialSort(items, 4210);
    appendJsonToTemplate(items, exportTemplate, 'Psionics');
    console.log(`Psionics: ${books.length} manifester book(s), ${items.length} native pf1-psionics.power items (${misses} synthesized).`);
  } catch (error) {
    console.error('Error processing the Psionics section:', error);
  }
}

await processPsionics();
// ----- End of Psionics Section ----- //

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

// ----- Spheres of Power / Might: talent conditionals + a Destructive Blast ----- //
// Each attack-relevant sphere talent (curated in combat_talent_conditionals.json /
// magic_talent_conditionals.json, nested {Sphere:{Talent:{modifiers,rider,default?}}}) becomes a
// conditional toggle: Might talents + non-Destruction Power talents on the main weapon's attack
// action, Destruction blast-type/shape talents on a synthesized "Destructive Blast" attack item.
// Mirrors addManeuverConditionals — clean numbers are structured modifiers (auto source-labeled),
// saves/conditions/durations ride the conditional NAME with [[ ]] inline rolls. Runs after the weapon
// exists (processEquipment) and BEFORE createScalingAttackItem (so the scaling clone inherits them).
//
// These are DABBLING NPCs (Spheres via feats, not a spherecasting class), so the sphere roll-data
// tokens are substituted to CONCRETE forms here: @spheres.cam/@spheres.pam -> @abilities.<mod>.mod, and
// @spheres.cl.total -> a LIVE, tier-accurate sphere caster level built from the character's real caster
// classes (see sphereCLExpr). (The importable palette actor keeps the native @spheres.* tokens instead,
// so a conditional copied off it scales on a real spherecasting PC via pf1spheres.)
function sphereWordToAbbrev(w) {
  const m = { intelligence: 'int', wisdom: 'wis', charisma: 'cha', int: 'int', wis: 'wis', cha: 'cha' };
  return m[String(w || '').toLowerCase()] || '';
}
function resolveSphereAbilities() {
  const trad = characterData.casting_tradition || {};
  const cam = sphereWordToAbbrev(trad.casting_ability_modifier) || resolveInitStat(ctx);
  const pam = 'wis';   // Spheres: a non-practitioner's practitioner modifier defaults to Wis
  return { cam, pam };
}
// Build the live sphere-CL expression for a dabbler: caster levels from multiple casting classes STACK
// (Spheres RAW), each contributing its tier fraction of that class's level -- high = level, mid (pf1
// 'med') = 3/4, low = 1/2 (Pathfinder rounds down). Uses @classes.<tag>.level (class level, not the
// spellbook CL) so a low caster contributes before it gains spells (e.g. paladin 3 -> floor(3/2)=1).
// Floored to 1 so a magic dabbler with no populated spellbook (e.g. kineticist) still reads CL 1.
function sphereCLExpr() {
  const books = exportTemplate.system?.attributes?.spells?.spellbooks || {};
  const terms = ['primary', 'secondary', 'tertiary']
    .map(s => books[s]).filter(b => b && b.inUse && b.class)
    .map(b => {
      const lvl = `@classes.${b.class}.level`;
      if (b.casterType === 'high') return lvl;
      if (b.casterType === 'med') return `floor(3 * ${lvl} / 4)`;
      return `floor(${lvl} / 2)`;   // 'low' (and any unrecognized tier -> conservative half)
    });
  return `max(${terms.join(' + ') || '0'}, 1)`;
}
function makeSubSpheres(cam, pam) {
  const clExpr = sphereCLExpr();
  return s => String(s == null ? '' : s)
    .replaceAll('@spheres.cl.total', clExpr)
    .replaceAll('@spheres.cam', `@abilities.${cam}.mod`)
    .replaceAll('@spheres.pam', `@abilities.${pam}.mod`);
}
// Mark the generated actor as a spheres caster/practitioner (castingAbility/practitionerAbility drive
// @spheres.cam/@spheres.pam on the pf1spheres tab + talent-sheet DCs) and stamp the dabbler's live,
// tier-accurate caster level (sphereCLExpr) onto the "Spheres Casting" summary feat so the pf1spheres
// tab CL matches the talent/blast DCs. Harmless when the pf1spheres module is disabled.
function applySpheresFlags(cam, pam) {
  const hasMagic = Array.isArray(characterData.magic_talent_items) && characterData.magic_talent_items.length;
  const hasCombat = Array.isArray(characterData.combat_talent_items) && characterData.combat_talent_items.length;
  if (!hasMagic && !hasCombat) return;
  exportTemplate.flags = exportTemplate.flags || {};
  const f = Object.assign({}, exportTemplate.flags.pf1spheres);
  if (hasMagic) f.castingAbility = cam;
  f.practitionerAbility = pam;
  exportTemplate.flags.pf1spheres = f;
  if (hasMagic) {
    const feat = (exportTemplate.items || []).find(i =>
      i.type === 'feat' && typeof i.name === 'string' && i.name.startsWith('Spheres Casting'));
    if (feat) {
      feat.system = feat.system || {};
      const ch = Array.isArray(feat.system.changes) ? feat.system.changes : [];
      if (!ch.some(c => c && c.target === 'spherecl')) {
        ch.push({ _id: ctx.newChangeId('spherecl'), formula: sphereCLExpr(), target: 'spherecl', type: 'untyped', operator: 'add', priority: 0, value: 0 });
        feat.system.changes = ch;
      }
    }
  }
}

// Synthesize a "Destructive Blast" attack item (Destruction sphere base ability): a touch attack whose
// base damage scales (ceil(@spheres.cl.total/2))d6 -> 1d6 for a CL-1 dabbler. Blast-type/shape talents
// attach as conditionals via addSphereTalentConditionals; the spell-point boost rides here as a
// built-in toggle. Cloned from the main weapon so the pf1 v11 action schema is guaranteed valid.
async function addDestructiveBlastAttack(subSpheres) {
  try {
    const chosen = characterData.spheres_chosen || [];
    const magic = characterData.magic_talent_items || [];
    const hasDestruction =
      chosen.some(s => s && String(s.sphere).toLowerCase() === 'destruction'
        && String(s.system || '').toLowerCase().startsWith('p'))
      || magic.some(t => t && String(t.sphere).toLowerCase() === 'destruction');
    if (!hasDestruction) return;
    const weapon = findMainWeapon(ctx);
    if (!weapon) { console.warn('Spheres: no weapon to base the Destructive Blast on.'); return; }
    const blast = structuredClone(weapon);
    blast.type = 'attack';
    blast._id = ctx.newId('attack', 'Destructive Blast');
    blast.name = 'Destructive Blast';
    blast.flags = {};
    blast.system = blast.system || {};
    blast.system.description = { value: '<p><strong>Destructive Blast</strong> (Destruction sphere) &mdash; a ranged or melee touch attack within close range (25 ft + 5 ft / 2 caster levels), subject to spell resistance. Deals <strong>(ceil(CL/2))d6</strong> bludgeoning by default (1d6 for a caster-level-1 dabbler). Blast-type talents (Fire/Frost/Acid/&hellip;) change the damage type and add a save rider; blast-shape talents change the delivery; toggle "Empowered Blast" to spend a spell point for one die per caster level.</p>' };
    const action = (blast.system.actions || [])[0];
    if (!action) { console.warn('Spheres: cloned weapon has no action for the blast.'); return; }
    action._id = ctx.newId('action', 'Destructive Blast');
    action.name = 'Destructive Blast';
    action.actionType = 'rwak';
    action.ability = Object.assign({}, action.ability, { attack: 'dex', damage: '', damageMult: 0 });
    action.damage = action.damage || {};
    action.damage.parts = [{ formula: subSpheres('(ceil(@spheres.cl.total / 2))d6'), types: ['bludgeoning'] }];
    action.damage.critParts = [];
    action.damage.nonCritParts = [];
    action.conditionals = [{
      _id: (ctx.newId('conditional', 'Empowered Blast')).slice(0, 8),
      name: '(Destruction) Empowered Blast: spend [[1]] spell point — blast dice increase to one die per caster level',
      default: false,
      modifiers: [{
        _id: (ctx.newId('modifier', 'Empowered Blast')).slice(0, 8),
        formula: subSpheres('(floor(@spheres.cl.total / 2))d6') + '[Empowered Blast]',
        target: 'damage', subTarget: 'allDamage', type: 'untyped', damageType: ['bludgeoning'], critical: 'nonCrit',
      }],
    }];
    appendJsonToTemplate([blast], exportTemplate, 'Attack');
    console.log('Spheres: added Destructive Blast attack item.');
  } catch (error) {
    console.error('Error adding Destructive Blast:', error);
  }
}

async function addSphereTalentConditionals(subSpheres) {
  try {
    const combat = characterData.combat_talent_items || [];
    const magic = characterData.magic_talent_items || [];
    if (!combat.length && !magic.length) return;
    // Nested {Sphere:{Talent:{...}}} -> byNorm[sphereNorm(sphere)][sphereNorm(talent)].
    const buildByNorm = table => {
      const out = {};
      for (const [sph, talents] of Object.entries(table || {})) {
        if (!talents || typeof talents !== 'object') continue;
        const key = sphereNorm(sph);
        out[key] = out[key] || {};
        for (const [tname, entry] of Object.entries(talents)) out[key][sphereNorm(tname)] = entry;
      }
      return out;
    };
    const combatByNorm = buildByNorm(templates.combatTalentConditionals);
    const magicByNorm = buildByNorm(templates.magicTalentConditionals);

    const weapon = findMainWeapon(ctx);
    const weaponAction = weapon && (weapon.system?.actions || [])[0];
    const blast = (exportTemplate.items || []).find(i => i.type === 'attack' && i.name === 'Destructive Blast');
    const blastAction = blast && (blast.system?.actions || [])[0];

    // This is the caller that decides its target action PER TALENT rather than per batch, which is
    // why the engine takes the action on the entry. Collect combat then magic in payload order and
    // hand the interleaved list over as one batch: grouping the Destruction talents together first
    // would produce the same two arrays but mint their ids in a different order, and the ids are
    // content-derived so that this merge could be read as a diff.
    const entries = [];
    const collect = (items, byNorm, isMagic) => {
      for (const t of items) {
        if (!t) continue;
        const sKey = sphereNorm(t.sphere || '');
        const entry = (byNorm[sKey] || {})[sphereNorm(t.name || '')];
        if (!entry) continue;
        const rider = typeof entry.rider === 'string' ? entry.rider.trim() : '';
        const hasMods = Array.isArray(entry.modifiers) && entry.modifiers.length;
        if (!rider && !hasMods) continue;
        entries.push({
          // Destruction Power talents ride the Destructive Blast item; everything else the main
          // weapon. A talent whose target does not exist (no blast built, no weapon) is skipped.
          action: (isMagic && sKey === 'destruction') ? blastAction : weaponAction,
          name: rider ? `(${t.sphere}) ${t.name}: ${subSpheres(rider)}` : `(${t.sphere}) ${t.name}`,
          default: entry.default === true,
          modifiers: entry.modifiers,
          label: t.name,
        });
      }
    };
    collect(combat, combatByNorm, false);
    collect(magic, magicByNorm, true);
    const added = attachConditionals(ctx, entries, { sub: subSpheres });
    console.log(`Spheres: attached ${added} talent conditional(s).`);
  } catch (error) {
    console.error('Error attaching sphere talent conditionals:', error);
  }
}
// Affects-others sphere talents (ally/companion/aura recipients) -> inactive temp buffs the player
// distributes with the Multi-Buff Distributor macro. Named "<Talent> (TAG)" where TAG is the first 5
// letters of the NPC's name (uppercased, stopping at the first non-letter; UNAMED fallback). Markers
// "Aura Range: N" / "onlyOthers;" ride the description. See the multi-buff-distributor skill.
function deriveBuffTag(name) {
  const m = String(name || '').match(/[A-Za-z]{1,5}/);
  return m ? m[0].toUpperCase() : 'UNAMED';
}
async function addSphereAuraBuffs(subSpheres) {
  try {
    const table = templates.talentAuraBuffs;
    if (!table || typeof table !== 'object') return;
    const combat = characterData.combat_talent_items || [];
    const magic = characterData.magic_talent_items || [];
    if (!combat.length && !magic.length) return;
    const byNorm = {};
    for (const [sph, tals] of Object.entries(table)) {
      if (!tals || typeof tals !== 'object') continue;
      const k = sphereNorm(sph); byNorm[k] = byNorm[k] || {};
      for (const [tn, e] of Object.entries(tals)) byNorm[k][sphereNorm(tn)] = e;
    }
    const tag = deriveBuffTag(characterData.character_full_name);
    const buffs = [];
    const seen = new Set();
    for (const t of [...combat, ...magic]) {
      if (!t) continue;
      const e = (byNorm[sphereNorm(t.sphere || '')] || {})[sphereNorm(t.name || '')];
      if (!e) continue;
      const key = sphereNorm(t.name || '');
      if (seen.has(key)) continue;
      seen.add(key);
      const parts = [];
      if (e.aura_range != null && e.aura_range !== '' && e.aura_range !== 0) parts.push(`<p>Aura Range: ${e.aura_range}</p>`);
      if (e.only_others) parts.push('<p>onlyOthers;</p>');
      if (e.description) parts.push(`<p>${subSpheres(e.description)}</p>`);
      const changes = (Array.isArray(e.changes) ? e.changes : []).map(ch => Object.assign(
        { formula: '0', target: '', type: 'untyped', operator: 'add', priority: 0, value: 0 },
        ch, { formula: subSpheres(String(ch.formula ?? '0')), _id: ctx.newChangeId(ch) }));
      buffs.push({
        name: `(${tag}) ${t.name}`, type: 'buff', img: 'icons/svg/aura.svg',
        system: {
          description: { value: parts.join(''), instructions: '', unidentified: '' },
          tags: [], changes, changeFlags: {}, contextNotes: Array.isArray(e.contextNotes) ? e.contextNotes : [],
          actions: [], attackNotes: [], effectNotes: [],
          uses: { value: null, per: '', autoDeductChargesCost: '', maxFormula: '', rechargeFormula: '' },
          links: { children: [] }, tag: '', flags: { boolean: {}, dictionary: {} }, scriptCalls: [],
          subType: 'temp', active: false, level: 0, duration: { value: '', units: '' },
          conditions: [], hideFromToken: false, showInQuickbar: false,
        }, effects: [], flags: {},
      });
    }
    if (!buffs.length) return;
    const divider = {
      name: '____________________ Spheres — shared / aura buffs ____________________',
      type: 'buff', img: 'icons/svg/book.svg',
      system: {
        description: { value: '<p>Toggle and run the Multi-Buff Distributor to share these with allies / apply auras.</p>' },
        tags: [], changes: [], changeFlags: {}, contextNotes: [], actions: [], attackNotes: [], effectNotes: [],
        uses: { value: null, per: '', autoDeductChargesCost: '', maxFormula: '', rechargeFormula: '' },
        links: { children: [] }, tag: '', flags: { boolean: {}, dictionary: {} }, scriptCalls: [],
        subType: 'temp', active: false, level: 0, duration: { value: '', units: '' },
        conditions: [], hideFromToken: true, showInQuickbar: false,
      }, effects: [], flags: {},
    };
    const all = [divider, ...buffs];
    assignSequentialSort(all, 4300);
    appendJsonToTemplate(all, exportTemplate, 'SphereAuraBuffs');
    console.log(`Spheres: injected ${buffs.length} affects-others buff(s) tagged (${tag}).`);
  } catch (error) {
    console.error('Error adding sphere aura buffs:', error);
  }
}
// Every buff spell the NPC KNOWS -> an inactive distributable temp buff "<Spell> (TAG)" (parsed from
// spell_buffs.json). Toggle + Multi-Buff Distributor shares it with allies (even Personal/Self spells).
async function addSpellBuffs() {
  try {
    const table = templates.spellBuffs;
    if (!table || typeof table !== 'object') return;
    const known = [];
    for (const lvl of (characterData.spell_list_choose_from || [])) {
      for (const s of (lvl || [])) if (s) known.push(String(s));
    }
    if (!known.length) return;
    const byLower = {};
    for (const [k, v] of Object.entries(table)) byLower[k.toLowerCase()] = { name: k, entry: v };
    const tag = deriveBuffTag(characterData.character_full_name);
    // Aura Range = the spell's range as a concrete number of feet at the NPC's caster level (close/
    // medium/long conventions). Distributor reads this integer. One CL for the whole table: these
    // spells come from the flat spell_list_choose_from with no per-book attribution, so a single
    // combined CL is the (deliberate) approximation -- but it is now the REAL homebrew combined CL
    // (spellCasterLevelNum) rather than characterData.level, which is only the PRIMARY class's level
    // and sized a Monk 8 / Summoner 7 / Wizard 5's auras at CL 8 instead of 12.
    const cl = spellCasterLevelNum(ctx);
    const spellAuraRange = (units, value) => {
      switch (units) {
        case 'personal': return 0;
        case 'touch': return 5;
        case 'close': return 25 + 5 * Math.floor(cl / 2);
        case 'medium': return 100 + 10 * cl;
        case 'long': return 400 + 40 * cl;
        case 'ft': return Number(value) || 0;
        case 'mi': return (Number(value) || 1) * 5280;
        default: return 0;
      }
    };
    const mkBuff = (name, descHtml, changes, hide, notes) => ({
      name, type: 'buff', img: hide ? 'icons/svg/book.svg' : 'icons/svg/aura.svg',
      system: {
        description: { value: descHtml, instructions: '', unidentified: '' },
        tags: [], changes: changes || [], changeFlags: {}, contextNotes: Array.isArray(notes) ? notes : [],
        actions: [], attackNotes: [], effectNotes: [],
        uses: { value: null, per: '', autoDeductChargesCost: '', maxFormula: '', rechargeFormula: '' },
        links: { children: [] }, tag: '', flags: { boolean: {}, dictionary: {} }, scriptCalls: [],
        subType: 'spell', active: false, level: 0, duration: { value: '', units: '' },
        conditions: [], hideFromToken: !!hide, showInQuickbar: false,
      }, effects: [], flags: {},
    });
    // Bucket the known buff spells by duration (rounds/minutes/hours/other).
    const buckets = { rounds: [], minutes: [], hours: [], other: [] };
    const seen = new Set();
    for (const nm of known) {
      const hit = byLower[nm.toLowerCase()];
      if (!hit || seen.has(hit.name)) continue;
      seen.add(hit.name);
      const e = hit.entry || {};
      // Unplaced-only spells (no changes, no contextNotes — just unanchored effect text) stay in
      // spell_buffs.json as reference data but get NO buff item: they only bulk up the Buffs tab.
      const hasMechanics = (Array.isArray(e.changes) && e.changes.length)
        || (Array.isArray(e.contextNotes) && e.contextNotes.length);
      if (!hasMechanics) continue;
      (buckets[e.duration_bucket] || buckets.other).push({ name: hit.name, e });
    }
    const BUCKET_LABELS = [['rounds', 'rounds'], ['minutes', 'minutes'], ['hours', 'hours'], ['other', 'other durations']];
    const all = [];
    let count = 0;
    for (const [key, label] of BUCKET_LABELS) {
      const rows = buckets[key];
      if (!rows.length) continue;
      all.push(mkBuff(`____________________ ${label} ____________________`,
        `<p>Buff spells you know with a <strong>${label}</strong> duration &mdash; toggle + Multi-Buff Distributor (even Personal/Self spells).</p>`, [], true));
      rows.sort((a, b) => ((a.e.level ?? 99) - (b.e.level ?? 99)) || a.name.localeCompare(b.name));
      for (const { name, e } of rows) {
        const parts = [`<p>Aura Range: ${spellAuraRange(e.range_units, e.range_value)}</p>`];  // always first line
        if (e.only_others) parts.push('<p>onlyOthers;</p>');
        if (e.description) parts.push(String(e.description));   // pre-formatted spell stat-block HTML, raw
        const changes = (Array.isArray(e.changes) ? e.changes : []).map(ch => Object.assign(
          { formula: '0', target: '', type: 'untyped', operator: 'add', priority: 0, value: 0 },
          ch, { _id: ctx.newChangeId(ch) }));
        const title = `(${tag}) ${name}` + (e.level != null ? ` (level ${e.level})` : '');
        all.push(mkBuff(title, parts.join(''), changes, false, e.contextNotes));
        count++;
      }
    }
    if (!count) return;
    assignSequentialSort(all, 4400);
    appendJsonToTemplate(all, exportTemplate, 'SpellBuffs');
    console.log(`Spells: injected ${count} distributable spell buff(s) tagged (${tag}), grouped by duration.`);
  } catch (error) {
    console.error('Error adding spell buffs:', error);
  }
}
{
  const { cam, pam } = resolveSphereAbilities();
  const subSpheres = makeSubSpheres(cam, pam);
  applySpheresFlags(cam, pam);
  await addDestructiveBlastAttack(subSpheres);
  await addSphereTalentConditionals(subSpheres);
  await addSphereAuraBuffs(subSpheres);
}
await addSpellBuffs();

// ----- Weapon finishing ----- //
// HAZARD: the +N stamp inside renames the weapon and its attack twin together, so this whole block
// runs after everything that attaches to the weapon and after the twin exists.
await addWeaponFinishing(ctx);
// ----- Ammo ----- //
// Reads the weapon the equipment stage recorded, so it cannot move above it.
await addAmmo(ctx);


// ----- Start of Skills Section ----- //

// `skillsDict` (backend skill name -> pf1 skill id) is imported from shared/skills-dict.js. It was
// declared inline here as well until this extraction landed; see that file's header for why the
// table is load-bearing.

async function convertSkillNames(characterData, skillsDict) {
  // The backend sends skill_ranks as a JSON string; parse it if it hasn't been already.
  const characterDataParsed = typeof characterData === 'string' ? JSON.parse(characterData) : characterData;

  // Change skill_rank names -> foundry names
  const newCharacterData = {};

  for (const skill in characterDataParsed) {
    // Check if the skill name exists in the skillsDict
    if (skillsDict[skill]) {
      // Map the original skill name to the new name from the dictionary
      newCharacterData[skillsDict[skill]] = characterDataParsed[skill];
    } else {
      // If the skill isn't in the dictionary, keep the original name
      newCharacterData[skill] = characterDataParsed[skill];
    }
  }

  return newCharacterData;
}

async function createUpdatedSkills(updatedCharacterData, baseSkillPathData, professions, craftType, professionRanks) {
  // Craft/Perform/Profession are pf1e "container" skills: their ranks must live under
  // .subSkills (e.g. crf.subSkills.crf1.rank), not on the container's own rank.
  const CONTAINERS = { crf: "Craft", prf: "Perform", pro: "Profession" };

  for (let skill in updatedCharacterData) {
    const rank = updatedCharacterData[skill];
    const parent = baseSkillPathData[skill];
    if (!parent) {
      // Unmapped skill -> its ranks would vanish off the sheet. Shout, don't swallow.
      if (rank > 0) console.warn(`pf1e_random_char_generator: dropping ${rank} rank(s) in unmapped skill "${skill}"`);
      continue;
    }

    if (CONTAINERS[skill]) {
      parent.rank = 0; // ranks live on the subskill, not the container

      if (skill === "pro" && Array.isArray(professions) && professions.length) {
        // One subskill per chosen profession ("Profession: <name>"). Ranks come from the backend's
        // profession_ranks payload -- professions run on their own homebrew rank pool
        // (5 + level + 10 per Multi Talented feat, capped 10 each / 15 for True Calling), which the
        // backend has already distributed and reconciled with any Always Improving ranks.
        // This used to split the ORDINARY Profession skill rank evenly across the professions, which
        // rendered a 45-rank pool as 1/0/0/0.
        parent.subSkills = parent.subSkills || {};
        const n = professions.length;
        for (let i = 0; i < n; i++) {
          const entry = Array.isArray(professionRanks) ? professionRanks[i] : null;
          parent.subSkills["pro" + (i + 1)] = {
            name: "Profession: " + professions[i],
            ability: parent.ability,
            rt: parent.rt,
            acp: parent.acp,
            rank: entry ? (Number(entry.ranks) || 0) : 0
          };
        }
        if (!Array.isArray(professionRanks) || !professionRanks.length) {
          console.warn("pf1e_random_char_generator: no profession_ranks in payload; Profession subskills set to 0 rank (backend needs redeploying)");
        }
      } else if (rank > 0) {
        parent.subSkills = parent.subSkills || {};
        // Craft shows its specialization ("Craft: Pottery"); fall back to "Craft" when the
        // backend hasn't been redeployed with craft_type. Perform stays "Perform".
        let name = CONTAINERS[skill];
        if (skill === "crf") name = craftType ? ("Craft: " + craftType) : "Craft";
        parent.subSkills[skill + "1"] = {
          name,
          ability: parent.ability,
          rt: parent.rt,
          acp: parent.acp,
          rank
        };
      }
    } else {
      parent.rank = rank; // normal flat skills: unchanged behavior
    }
  }

  return baseSkillPathData;
}

// This used to receive `localStorage.getItem('collectedSkills')` -- createUpdatedSkills wrote the
// object out as JSON and this read it straight back in. That was one of only TWO load-bearing
// localStorage writes in the whole build (the other fed `check_ammo`; all 51 of the rest were
// breadcrumbs nothing ever read). The round trip was only ever a deep copy: `baseSkillPathData` is
// already a structuredClone of the template that nothing reads afterwards, and every entry in
// base_skill.json carries all four of its fields, so nothing could be dropped by the stringify.
function overwriteData(collectedSkills) {
  exportTemplate.system.skills = collectedSkills;
}

// Load the collected skills into an accessible object
try {
  const updatedCharacterData = await convertSkillNames(characterData.skill_ranks, skillsDict);
  // Chosen professions name the Profession subskill (otherwise this field is bio-only).
  let professions = characterData.professions;
  if (typeof professions === 'string') {
    try { professions = JSON.parse(professions); } catch (e) { professions = [professions]; }
  }
  // Per-profession rank data ([{name, skill_label, ranks, cap, ...}]), parallel to `professions`.
  let professionRanks = characterData.profession_ranks;
  if (typeof professionRanks === 'string') {
    try { professionRanks = JSON.parse(professionRanks); } catch (e) { professionRanks = []; }
  }
  // Clone: createUpdatedSkills() writes this character's ranks and subSkills straight into the
  // template's skill entries, so the next character would start from these ranks instead of 0.
  const baseSkillTemplate = structuredClone(templates.baseSkill);
  // Now we have a JSON object with the proper names and ranks -> need to update the skills
  const collectedSkills = await createUpdatedSkills(
    updatedCharacterData, baseSkillTemplate, professions, characterData.craft_type, professionRanks);
  overwriteData(collectedSkills);
} catch (error) {
  console.error("Error in skills processing:", error);
  console.log("characterData.skill_ranks:", characterData.skill_ranks);
  console.log("skillsDict:", skillsDict);
  console.log("baseSkill template:", templates.baseSkill);
}

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