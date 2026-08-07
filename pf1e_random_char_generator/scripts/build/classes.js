/**
 * Classes and archetypes — the class chassis items, their levels, their feature bands.
 *
 * For every rolled class (multiclass-aware, highest level first) this harvests that class's slice of
 * `every_class.json`, stamps the sheet-summary sort onto the class item, rebases the harvested
 * feature items into a per-class band, and appends the class's archetype item directly after its
 * chassis. Archetypes fold in here rather than getting their own module because `processArchetype`
 * has exactly one caller — the loop below.
 *
 * **What this stage produces for later ones.** `ctx.classFeatureBands`, consumed by the class-features
 * stage, and `ctx.classList`. The bands are deliberately NOT frozen or cloned: `updateClassFeatures`
 * mutates their sort counters while iterating, and that mutation is load-bearing for item ordering on
 * the sheet. It reads like a bug; it is hazard 4 on the strangler-split map, and the harness will go
 * red if it is "fixed" here.
 *
 * `CF_CLASS_BAND_BASE`/`CF_CLASS_BAND_STEP` are exported because the class-features stage derives its
 * generic fallback band from the same arithmetic. They are the band geometry, not this stage's
 * private constants.
 *
 * What stayed with the caller: `upper_case_class` itself, which several later subsystems still read
 * out of the closure — this stage takes it off `ctx` like any other input.
 */
import { CLASS_ITEM_ORDER } from '../shared/class-roster.js';
import { extractItems, appendJsonToTemplate } from './items.js';
import { capitalizeWords, convertToStringSimple } from '../shared/text.js';

/**
 * Per-class "Class Features (Class)" bands on the Class Features tab, in classEntries (level-desc)
 * order. Wide bands: harvested every_class.json features rebase to base+125..., chooseable buckets
 * continue after them (generalSort), ladder buckets (Rage Powers, ...) get sub-dividers at
 * base+500000+. Keyed by lowercase class name for the class_feature_owners lookup.
 */
export const CF_CLASS_BAND_BASE = 2000000;
export const CF_CLASS_BAND_STEP = 1000000;

// Function to validate and extract items array
// Function to update the "level" property of the first matching class
function updateLevel(items, targetClass, newLevel) {
  if (!Array.isArray(items)) {
    console.error('Items is not an array:', items);
    return;
  }

  if (typeof targetClass !== 'string' || targetClass.trim() === '') {
    console.error('Invalid targetClass:', targetClass);
    return;
  }

  if (typeof newLevel !== 'number') {
    console.error('Invalid newLevel:', newLevel);
    return;
  }

  let found = false;

  for (const item of items) {
    // console.log('Processing item:', item);

    if (item.name === targetClass) {
      console.log('Found target class:', targetClass);
      if (item.system && typeof item.system.level === 'number') {
        console.log(`Current level: ${item.system.level}, Updating to: ${newLevel}`);
        item.system.level = newLevel;
        console.log(`Updated "level" for class: ${targetClass} to ${newLevel}`);
        found = true;
        break;
      } else {
        console.error(`"system" or "level" is invalid for item:`, item);
      }
    }
  }

  if (!found) {
    console.error(`Class ${targetClass} not found or "level" field missing.`);
  }
}

// Function to collect all items for the selected class
function collectItems(items, targetClass, classList) {
  const results = [];
  let collecting = false;

  for (const item of items) {
    if (!item.name) continue;

    // Only CLASS-type items act as boundaries, so a feat/ability that happens to share a class
    // name (e.g. the Slayer "Stalker" talent vs. the Path of War "Stalker" class) can no longer
    // falsely start or stop collection.
    const isClass = item.type === 'class';

    if (isClass && item.name === targetClass) {
      collecting = true;  // Start collecting at the target class's class item
    } else if (isClass && classList.includes(item.name)) {
      collecting = false;  // Stop once the next class boundary is reached
    }

    if (collecting) {
      results.push(item);  // Add to results only when collecting
    }
  }

  console.log(`Collected ${results.length} items for ${targetClass}`);
  return results;  // Ensure we're returning the updated results array
}


// Function to filter items by level
function filterByLevel(items, level) {
  if (!Array.isArray(items)) {
    console.error('Items is not an array:', items);
    return [];
  }

  return items.filter(item => item.system && typeof item.system.level === 'number' && item.system.level === level);
}

// Main function to process class data and update class level
function processClass(ctx, targetClass, newLevel, classList) {
  // CLONE THE SLICE, NOT THE BUNDLE. updateLevel() writes levels onto these very objects and
  // collectItems() hands them to exportTemplate.items uncloned, so something has to be copied or the
  // loaded bundle carries one character's levels into the next generation in the same session.
  //
  // That used to be `structuredClone(ctx.templates.everyClass)` -- 3.4 MB and 949 rows deep-copied
  // once per ROLLED CLASS, so a multiclass build paid it three or four times. It was 40% of the whole
  // build (`npm run bench`) to protect two writes that only ever land inside this class's own slice.
  // `equipment.js` already had the rule written down -- "clone the ONE matched row rather than the
  // bundle" -- and this is the same rule applied one level up.
  //
  // Collect first, off the SHARED array, which is safe because collectItems only reads. Then clone
  // what was collected, and mutate that. Nothing outside the slice was ever appended, so a write the
  // old order made to some earlier same-named row was discarded with the throwaway clone anyway.
  const items = extractItems(ctx.templates.everyClass);
  if (!items) return;

  // Collect the items for the given class
  const newCollectedItems = structuredClone(collectItems(items, targetClass, classList));

  // We only want class abilities from where level received <= characterData.level
  const filteredItems = filterByLevel(newCollectedItems, newLevel);

  // Update level in the class data
  updateLevel(filteredItems, targetClass, newLevel);

  // Append the collected items to exportTemplate
  appendJsonToTemplate(newCollectedItems, ctx.exportTemplate, "Class");

}

// ------ Archetypes ------ //
async function processArchetype(ctx, targetArchetype, sortValue = null) {
  console.log(typeof targetArchetype);
    // If the targetArchetype is a string, try parsing it
    if (typeof targetArchetype === 'string') {
      try {
          targetArchetype = JSON.parse(targetArchetype);
          console.log("Parsed archetype_info:", targetArchetype);
      } catch (error) {
          console.error("Error parsing archetype_info:", error);
          return;
      }
  }

  // No archetype for this class (backend sends {} when a class has none) — nothing to append.
  if (!targetArchetype || typeof targetArchetype !== 'object' || !Object.keys(targetArchetype).length) {
      console.log("processArchetype: no archetype to add:", targetArchetype);
      return;
  }

  // Get archetypeInfo and ensure it's an object
  let archetypeInfo = ctx.templates.archetype;

  if (typeof archetypeInfo !== 'object' || archetypeInfo === null) {
      console.warn("archetypeInfo is not an object. Attempting to fix...");

      // Attempt to parse JSON if needed
      try {
          archetypeInfo = JSON.parse(archetypeInfo);
      } catch (error) {
          console.error("archetypeInfo could not be parsed as JSON. Resetting to an empty object.");
          archetypeInfo = {};
      }
  }
  // Clone: this runs once per class now, and mutating the shared loaded template
  // would make every appended archetype item point at the same (last-written) object. The
  // template also ships a fixed _id — re-id each clone (like addResourcePools does) so multiple
  // archetype items can't collide.
  archetypeInfo = structuredClone(archetypeInfo);
  archetypeInfo._id = ctx.newId('archetype', archetypeInfo);

  console.log("archetype pre trial", archetypeInfo);
  console.log("targetArchetype", targetArchetype);

  // Extract the first key from targetArchetype (e.g., "Cold Iron Warden")
  const archetypeKey = Object.keys(targetArchetype)[0];

  if (!archetypeKey) {
      console.error("No valid key found in targetArchetype:", targetArchetype);
      return;
  }

  // Set the name of the archetype
  archetypeInfo.name = archetypeKey;

  // Slot the archetype item directly after its class in the sheet summary (the template ships a
  // fixed sort:100000 that collides across classes and with real class items).
  if (Number.isFinite(sortValue)) {
    archetypeInfo.sort = sortValue;
  }

  // Ensure system and description exist before modifying
  archetypeInfo.system = archetypeInfo.system || {};
  archetypeInfo.system.description = archetypeInfo.system.description || {};

  // Convert the description and assign it
  // We pass targetArchetype[archetypeKey] which is the data associated with that archetype
  archetypeInfo.system.description.value = convertToStringSimple(archetypeKey, targetArchetype[archetypeKey]);

  appendJsonToTemplate([archetypeInfo], ctx.exportTemplate, "archetypeInfo");
}

export async function addClasses(ctx) {
  const characterData = ctx.characterData;
  const exportTemplate = ctx.exportTemplate;
  const upper_case_class = ctx.upperCaseClass;

  // NOTE: every class that appears in every_class.json MUST be listed here, because collectItems()
  // only stops collecting a class's items when it reaches the next name in this list. A class that
  // exists in the data but is missing here never acts as a boundary, so the PRECEDING class bleeds
  // into it and absorbs its class item (at level 20) + abilities. Ninja/Samurai/Shifter/Vigilante
  // were missing, which is why e.g. Monk (Unchained) was picking up a stray Ninja 20.
  //
  // The list itself now lives in class-roster.js as CLASS_ITEM_ORDER -- one roster for the module,
  // checked against every_class.json by Backend/scripts/validate_class_roster.py, because keeping
  // three hand-maintained copies in sync is what let the occult classes go missing from the dropdown.
  const class_list = CLASS_ITEM_ORDER;
  ctx.classList = class_list;

  // Build EVERY rolled class (multiclass-aware), highest level first, so the sheet lists
  // "Class A (its archetype) / Class B (its archetype) / ...". Each class's archetype item is
  // appended right after its chassis. Old backend payloads without `classes` fall back to the
  // legacy single-class path.
  const classEntries = (Array.isArray(characterData.classes) && characterData.classes.length)
    ? [...characterData.classes].sort((a, b) => (Number(b.level) || 0) - (Number(a.level) || 0))
    : [{ display: upper_case_class, level: characterData.level, archetype: characterData.archetype_info }];

  const classFeatureBands = {};
  ctx.classFeatureBands = classFeatureBands;

  let classIdx = 0;
  for (const classEntry of classEntries) {
    const classDisplay = classEntry.display || capitalizeWords(classEntry.name || '');
    const itemCountBefore = (exportTemplate.items || []).length;
    processClass(ctx, classDisplay, Number(classEntry.level) || 1, class_list);
    const harvested = (exportTemplate.items || []).slice(itemCountBefore);
    // Harvest class items carry the template actor's small system.hp; only the primary's ever
    // shipped before, so zero the extras — actor HP stays attributes.hp.base (backend total).
    if (classDisplay !== upper_case_class) {
      const extraClassItem = (exportTemplate.items || []).find(i => i.type === 'class' && i.name === classDisplay);
      if (extraClassItem?.system) extraClassItem.system.hp = 0;
    }
    // Sheet summary order: pf1 lists class items by their `sort`, and every_class.json bakes a fixed
    // alphabetical-ish sort per class — reassign so the summary reads highest level -> lowest, with
    // each class's archetype item (band + 1000) directly after its chassis.
    const classItemSort = (classIdx + 1) * 100000;
    const classItem = harvested.find(i => i.type === 'class' && i.name === classDisplay);
    if (classItem) classItem.sort = classItemSort;
    // Rebase this class's harvested feature items into its Class Features band, preserving the
    // template actor's hand-built relative order.
    const bandBase = CF_CLASS_BAND_BASE + classIdx * CF_CLASS_BAND_STEP;
    const harvestedFeats = harvested.filter(i => i.type === 'feat')
      .sort((a, b) => (Number(a.sort) || 0) - (Number(b.sort) || 0));
    harvestedFeats.forEach((f, j) => { f.sort = bandBase + 125 * (j + 1); });
    classFeatureBands[String(classEntry.name || classDisplay).toLowerCase()] = {
      display: classDisplay,
      base: bandBase,
      generalSort: bandBase + 125 * (harvestedFeats.length + 1),
      ladderSort: bandBase + 500000,
    };
    // Older backends export `classes` without per-class archetypes — keep the primary's legacy pick.
    await processArchetype(ctx, classEntry.archetype
      ?? (classDisplay === upper_case_class ? characterData.archetype_info : null),
      classItemSort + 1000);
    classIdx++;
  }
}
