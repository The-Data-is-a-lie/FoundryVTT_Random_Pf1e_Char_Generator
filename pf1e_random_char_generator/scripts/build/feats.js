/**
 * Feats and traits — the Feats tab and the Traits tab, and the homebrew that hangs off them.
 *
 * The largest stage on the map: every feat bucket the backend sends (flavor, flaw, story, general,
 * class bonus, teamwork, bloodline), the homebrew Trainers and Professions, then the creation traits
 * and the mechanical flaws. Feats that the compendium has no row for are SYNTHESIZED rather than
 * dropped — dropping one shifts the positional "(Feat N)" labels of everything after it, so a missing
 * feat would silently mislabel the rest of the list instead of just being absent.
 *
 * **Two stages, not one, and the gap between them is deliberate.** `Feats_n_Traits` used to build the
 * Spheres talents in its own middle: the talent items existed only as a side effect of placing feats
 * (hazard 3 on the strangler-split map). Rather than move that call — which would change the order
 * items are appended in, and the fixtures record that order — the function is split at exactly that
 * boundary. `addFeats` is everything before it, `addTraits` everything after, and the Spheres work
 * happens between the two calls where it always did. Nothing about the sequence changed; it is just
 * no longer hidden inside something that claims to be about feats.
 *
 * `addFeatSeparator` is exported because the Path of War stage lays its own section divider with it.
 *
 * IN THE FOG, DO NOT FIX HERE: `processFeatTrait` hand-aligns three parallel arrays by index — the
 * matched items, their labels, and their feat-tax chains. Any of the three arriving short silently
 * mislabels feats rather than failing.
 */
import {
  appendJsonToTemplate,
  appendFeatDivider,
  synthesizeFeatItem,
  assignSequentialSort,
  assignToFeatSection,
  addingReceivedLocationToName,
  applyBuffData,
  applyFeatBuffOverlay,
} from './items.js';
import { capitalizeFirstLetter, toTitleCase } from '../shared/text.js';
import { log } from '../shared/log.js';

async function processFeatTrait(ctx, templateName, dataListChooseFrom, dataType, startingSort = 100, label = "level", shouldIncrement = true, startingNumber = 1, step = 1, customLevels = null, labelArray = null, taxDict = null) {
  try {
    // Retrieve data by template name based on dataType (feats or traits)
    const data = ctx.templates[templateName];

    // Check if data is an array
    if (!Array.isArray(data)) {
      console.error(`${dataType} data is not an array or is undefined:`, data);
      return;
    }

    // The object, not JSON.stringify(..., null, 2): arguments are evaluated before the call, so a
    // stringify here would still build the string with logging off. See shared/log.js.
    log.debug(`${dataType} list structure`, dataListChooseFrom);

    // Consolidate all data from the nested list
    const allMatchedItems = [];
    const matchedLabels = []; // per-feat labels (e.g. "Fighter 1"), aligned with allMatchedItems
    const matchedTax = []; // per-feat tax chains (granted feats), aligned with allMatchedItems

    for (let idx = 0; idx < dataListChooseFrom.length; idx++) {
      const item = dataListChooseFrom[idx];
      // Logs all data being processed
      log.debug(`Processing ${dataType}:`, item);

      const itemLc = String(item).toLowerCase();
      // Match on the name before the first parenthesis, case-insensitively, skipping mythic entries.
      // That rule and its index now live in build/catalog.js: this used to be a `.find()` over all
      // 8,816 rows of every_feat.json PER FEAT, re-lowercasing every candidate to compare it against
      // one query, nine buckets deep.
      const matchedItem = ctx.catalog.lookup(templateName, item);

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
        // when present (ctx.homebrewFeatDescs, now populated for every placed feat), else a bare row.
        const hb = ctx.homebrewFeatDescs[itemLc];
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
      applyFeatTax(ctx, allMatchedItems, templateName, matchedTax);
      }         
      // Assign a unique ID to each item
         

      // Append matched items to the ctx.exportTemplate
      appendJsonToTemplate(allMatchedItems, ctx.exportTemplate, capitalizeFirstLetter(dataType));

    } else {
      console.error(`No matching ${dataType}s were found in the list.`);
    }
  } catch (error) {
    console.error(`Error reading or processing the ${dataType} Section:`, error);
  }
}

// --- adding Feat separators --- //
export async function addFeatSeparator(ctx, templateName, dataType, startingSort = 0) {
  try {
    // Clone: assignSequentialSort() stamps .sort onto these objects and they are then appended to
    // the sheet by reference, so the separator templates would accumulate the last run's sorts.
    const data = structuredClone(ctx.templates[templateName]);
    const wrappedData = Array.isArray(data) ? data : [data];

    // 🔥 Apply sort
    assignSequentialSort(wrappedData, startingSort);

    appendJsonToTemplate(wrappedData, ctx.exportTemplate, capitalizeFirstLetter(dataType));
    log.debug(`${dataType} data successfully added from ${templateName}`);
  } catch (error) {
    console.error(`Error processing ${dataType} from ${templateName}:`, error);
  }
}

// Feat tax: fold each granted chain feat into its primary entry -- append " > <Feat>" to the name
// (using the compendium's real casing) and merge the granted feat's description into the primary's
// details under a labeled separator. `bundleName` names the template bundle each chain feat is
// resolved from, and the catalog owns the resolving.
function applyFeatTax(ctx, items, bundleName, taxArray) {
  for (let i = 0; i < items.length; i++) {
    const tax = taxArray?.[i];
    if (!Array.isArray(tax) || !tax.length) continue;

    const names = [];
    let desc = items[i].system?.description?.value || "";
    for (const childRaw of tax) {
      const child = String(childRaw);
      // The second full scan of the same array, once per granted chain feat. Same rule, same index.
      const childItem = ctx.catalog.lookup(bundleName, child);
      // Homebrew chain children (style-chain followers, Martial Training partners) aren't in
      // every_feat.json -- resolve display name + description from the backend export instead
      // of falling through to toTitleCase (which would mangle apostrophes, e.g. "Fool'S").
      const hb = !childItem ? ctx.homebrewFeatDescs[child.toLowerCase()] : null;
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
async function processProfessionAbilities(ctx, items, startingSort = 3900) {
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
  appendJsonToTemplate(built, ctx.exportTemplate, "Feat");
}

/**
 * Every feat or trait name this stage will ask the catalog for, flattened out of the payload.
 *
 * The catalog resolves a pack-backed family in ONE batch — see `prime` in build/catalog.js — and
 * that only works because nothing here is computed mid-build: every name is already a field on
 * `characterData` before the stage starts.
 *
 * THE TAX CHAINS ARE THE EASY HALF TO MISS. `applyFeatTax` resolves a second wave of names taken
 * from the VALUES of the `*_tax_dict` maps, not from the `*_feats` arrays. Leave them out and the
 * chain feats quietly stop resolving, which shows up as granted feats losing their real names and
 * descriptions rather than as an error.
 */
function namesToResolve(characterData, { arrays, taxDicts = [] }) {
  const names = [];
  for (const field of arrays) {
    const value = characterData?.[field];
    if (Array.isArray(value)) names.push(...value.flat(Infinity));
  }
  for (const field of taxDicts) {
    const dict = characterData?.[field];
    if (!dict || typeof dict !== 'object') continue;
    for (const chain of Object.values(dict)) {
      if (Array.isArray(chain)) names.push(...chain.flat(Infinity));
    }
  }
  return names.filter((n) => typeof n === 'string' && n);
}

const FEAT_ARRAYS = ['flavor_feats', 'flaw_feats', 'story_feats', 'feats', 'teamwork_feats',
                     'class_feats', 'bloodline_feats', 'trainer_feats'];
const FEAT_TAX_DICTS = ['flavor_feat_tax_dict', 'flaw_feat_tax_dict', 'story_feat_tax_dict',
                        'feats_feat_tax_dict', 'class_feat_tax_dict', 'trainer_feat_tax_dict'];

export async function addFeats(ctx) {
  // One batch for the whole stage, before any of it runs. A no-op when everyFeat is JSON-backed.
  await ctx.catalog.prime('everyFeat',
    namesToResolve(ctx.characterData, { arrays: FEAT_ARRAYS, taxDicts: FEAT_TAX_DICTS }));

  // Feats section
  await addFeatSeparator(ctx, 'spaceBackground', 'space_function', 1);
  await processFeatTrait(ctx, 'everyFeat', ctx.characterData.flavor_feats, 'feat', 200, "Flavor", true, 1, 1, null, null, ctx.characterData.flavor_feat_tax_dict);
  await processFeatTrait(ctx, 'everyFeat', ctx.characterData.flaw_feats, 'feat', 250, "Flaw", true, 1, 1, null, null, ctx.characterData.flaw_feat_tax_dict);
  await processFeatTrait(ctx, 'everyFeat', ctx.characterData.story_feats, 'feat', 500, "Story Feat", true, 1, 5, [1,5,10,15,20,25,30,35,40,45,50,55,60,65,70,75,80,85,90,95,100], null, ctx.characterData.story_feat_tax_dict);
  await addFeatSeparator(ctx, 'spaceFeats', 'space_function', 1000);
  await processFeatTrait(ctx, 'everyFeat', ctx.characterData.feats, 'feat', 1500, "Feat", true, 1, 2, null, null, ctx.characterData.feats_feat_tax_dict);
  await addFeatSeparator(ctx, 'spaceClassBonusFeats', 'space_function', 2000);
  await processFeatTrait(ctx, 'everyFeat', ctx.characterData.teamwork_feats, 'feat', 2500, "Class Bonus Feat", true, 3, 3, null, ctx.characterData.teamwork_feat_labels);
  await processFeatTrait(ctx, 'everyFeat', ctx.characterData.class_feats, 'feat', 3000, "Class Bonus Feat", true, 1, 2, null, ctx.characterData.class_feat_labels, ctx.characterData.class_feat_tax_dict);
  // Bloodline bonus feats (Sorcerer/Bloodrager), labeled by granting class + level
  // (e.g. "Sorcerer 7: Combat Casting"). Guarded so an un-redeployed backend that doesn't
  // send bloodline_feats simply skips this step instead of erroring.
  if (Array.isArray(ctx.characterData.bloodline_feats) && ctx.characterData.bloodline_feats.length) {
    await processFeatTrait(ctx, 'everyFeat', ctx.characterData.bloodline_feats, 'feat', 3500, "Bloodline Feat", true, 1, 1, null, ctx.characterData.bloodline_feat_labels);
  }
  // Homebrew Trainers -> bottom of the Feats section, rendered as normal feats: one item per taught
  // feat-tax chain, grouped by its "(Trainer N)" label, full compendium text, NO caliber line.
  if (Array.isArray(ctx.characterData.trainer_feats) && ctx.characterData.trainer_feats.length) {
    await appendFeatDivider(ctx, "__________________________ Trainers _______________________", 3600);
    await processFeatTrait(ctx, 'everyFeat', ctx.characterData.trainer_feats, 'feat', 3610, "Trainer", true, 1, 1, null, ctx.characterData.trainer_feat_labels, ctx.characterData.trainer_feat_tax_dict);
  }
  // Homebrew Professions -> bottom of the Feats section: tiered Rank 5 / Rank 15 ability items (+
  // profession feats), each carrying pf1 changes/contextNotes/uses.
  if (Array.isArray(ctx.characterData.profession_ability_items) && ctx.characterData.profession_ability_items.length) {
    await appendFeatDivider(ctx, "__________________________ Professions _____________________", 3900);
    await processProfessionAbilities(ctx, ctx.characterData.profession_ability_items, 3910);
  }
}

export async function addTraits(ctx) {
  // Traits carry no tax chains -- only the one array.
  await ctx.catalog.prime('everyTrait',
    namesToResolve(ctx.characterData, { arrays: ['selected_traits'] }));

  // Traits section: divider, then the creation traits (sorts 100+ from processFeatTrait).
  await appendFeatDivider(ctx, "____________________ Traits______________________", -100000, 'trait');
  await processFeatTrait(ctx, 'everyTrait', ctx.characterData.selected_traits, 'trait');
  // Flaws: mechanical drawbacks from flaw_effects_dict — one trait item per flaw, named with its
  // tier, full rules text as the description, pf1 changes/contextNotes via applyBuffData.
  const flawEffects = ctx.characterData.flaw_effects_dict || {};
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
      appendJsonToTemplate([item], ctx.exportTemplate, "Trait");
    }
    log.debug(`Flaws: added ${Object.keys(flawEffects).length} mechanical flaw trait(s).`);
  }
}
