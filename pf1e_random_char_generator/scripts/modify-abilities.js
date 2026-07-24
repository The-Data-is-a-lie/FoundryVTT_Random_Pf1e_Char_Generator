export async function main() {
  try {
    // Retrieve the module dynamically using the module name
    const module = game.modules.get('pf1e_random_char_generator');
    if (!module) {
      console.error("Module 'pf1e_random_char_generator' not found.");
      return;
    }

    var savedData = JSON.parse(localStorage.getItem('deliverData.json')|| '{}');
    var modded = savedData.modded_char_sheet; // y or n
    console.log("Is it modded????????????", modded);
    // ----- Setting up filePaths ----- //

    // char_sheet_folder Base
    const charSheetBase = await FilePicker.browse('data', 'modules/pf1e_random_char_generator/templates/character_sheet_folder'); 
    // base_folder Base
    const base = await FilePicker.browse('data', 'modules/pf1e_random_char_generator/templates/base_folder'); 

    // char_sheet_folders
    const unmodifiedPreExportTemplatePath = charSheetBase.target + "/unmodified_pre_export_template.json";
    const preExportTemplatePath           = charSheetBase.target + "/pre_export_template.json";
    const everyArmorPath                  = charSheetBase.target + "/every_armor.json";
    // const everyClassPath                  = charSheetBase.target + "/every_class.json";
    // const everyFeatPath                   = charSheetBase.target + "/every_feat_MODS.json";
    const everyItemPath                   = charSheetBase.target + "/every_item.json";
    const everyRacePath                   = charSheetBase.target + "/every_race.json";
    // const everySpellPath                  = charSheetBase.target + "/every_spell_MODS.json";
    // const everyTraitPath                  = charSheetBase.target + "/every_trait.json";
    // const everyWeaponPath                 = charSheetBase.target + "/every_weapon_MODS.json";
    const archetypePath                   = charSheetBase.target + "/archetype.json";

    // space_background
    const spaceBackgroundPath             = charSheetBase.target + "/space_Background.json";
    const spaceFeatsPath                  = charSheetBase.target + "/space_Feats.json";
    const spaceClassBonusFeatsPath        = charSheetBase.target + "/space_ClassBonusFeats.json";
    const spacePathOfWarPath              = charSheetBase.target + "/space_Path_of_War.json";
    const spacePathOfWarBuffsPath         = charSheetBase.target + "/space_Path_of_War_buffs.json";
    const stanceChangesPath               = charSheetBase.target + "/stance_changes.json";
    const maneuverChangesPath             = charSheetBase.target + "/maneuver_changes.json";
    // Spheres of Power / Might per-roll conditionals (nested {Sphere:{Talent:{modifiers,rider}}}).
    const combatTalentConditionalsPath    = charSheetBase.target + "/combat_talent_conditionals.json";
    const magicTalentConditionalsPath     = charSheetBase.target + "/magic_talent_conditionals.json";
    // Affects-others sphere buffs (multi-buff distributor): temp buffs named "<Talent> (TAG)".
    const talentAuraBuffsPath             = charSheetBase.target + "/talent_aura_buffs.json";
    // Every buff spell as a distributable temp buff "<Spell> (TAG)" (multi-buff distributor).
    const spellBuffsPath                  = charSheetBase.target + "/spell_buffs.json";

    // inherents
    const inherentsPath                   = charSheetBase.target + "/inherents.json";
    const inherents2Path                   = charSheetBase.target + "/inherents2.json";

    // base_folder
    // const baseFeatPath = base.target + "/base_feat.json";
    const baseSkillPath = base.target + "/base_skill.json";
    const customBuffsPath = charSheetBase.target + "/custom_buffs.json";

    // size-based damage scaling: a feature that exposes @resources.sizefordamage + the script
    // call that reads it (attached to every generated attack's "Don't Touch" action reference).
    const sizeForDamageFeaturePath = charSheetBase.target + "/sizefordamage_feature.json";
    const scalingWeaponDamagePath  = charSheetBase.target + "/scaling_weapon_damage.json";
    // House tracker features (extracted from the hand-built template actor): Variable Modifiers /
    // Natural AC / Death HP group items, sorts baked in to match the template layout.
    const houseFeaturesPath        = charSheetBase.target + "/house_features.json";
    // Resource pool items ({poolKey: pf1 classFeat item with a uses/charges formula}): Hero Points
    // for everyone, Stamina for fighters / Combat Stamina takers, plus per-class pools.
    const resourcePoolsPath        = charSheetBase.target + "/resource_pools.json";


        // Let for these so we can reassign at WILL
    let everyClassPath, everyFeatPath, everySpellPath, everyWeaponPath, everyTraitPath, baseFeatPath;

    // Releases up to and including v2.0.1 shipped a zip with every *_MODS.json stripped out, so on
    // those installs the modded branch fetches six 404s. FilePicker.browse already gave us the
    // directory listings, so check them before committing to the modded paths and fall back rather
    // than dying on an HTML error page.
    if (modded === "y") {
      const present = new Set([...(charSheetBase.files || []), ...(base.files || [])]);
      const moddedFiles = [
        charSheetBase.target + "/every_class_MODS.json",
        charSheetBase.target + "/every_feat_MODS.json",
        charSheetBase.target + "/every_spell_MODS.json",
        charSheetBase.target + "/every_trait_MODS.json",
        charSheetBase.target + "/every_weapon_MODS.json",
        base.target + "/base_feat_MODS.json",
      ];
      const missing = moddedFiles.filter(f => !present.has(f));
      if (missing.length) {
        console.warn("Missing modded templates, falling back to base templates:", missing);
        ui.notifications?.warn(
          "Character Generator: the modded-sheet templates aren't installed " +
          `(${missing.length} file(s) missing). Using the base templates instead. ` +
          "Update the module to get them."
        );
        modded = "n";
      }
    }

    if (modded === "y") {
      everyClassPath  = charSheetBase.target + "/every_class_MODS.json";
      everyFeatPath   = charSheetBase.target + "/every_feat_MODS.json";
      everySpellPath  = charSheetBase.target + "/every_spell_MODS.json";
      everyTraitPath  = charSheetBase.target + "/every_trait_MODS.json";
      everyWeaponPath = charSheetBase.target + "/every_weapon_MODS.json";
      baseFeatPath    = base.target + "/base_feat_MODS.json";
    } else {
      everyClassPath  = charSheetBase.target + "/every_class.json";
      everyFeatPath   = charSheetBase.target + "/every_feat.json";
      everySpellPath  = charSheetBase.target + "/every_spell.json";
      everyTraitPath  = charSheetBase.target + "/every_trait.json";
      everyWeaponPath = charSheetBase.target + "/every_weapon.json";
      baseFeatPath    = base.target + "/base_feat.json";
    }

    // manual filePaths
    const filePaths = [
      unmodifiedPreExportTemplatePath,
      preExportTemplatePath,
      everyArmorPath,
      everyClassPath,
      everyFeatPath,
      everyItemPath,
      everyRacePath,
      everySpellPath,
      everyTraitPath,
      everyWeaponPath, 
      baseFeatPath,
      baseSkillPath,
      archetypePath,      
      spaceBackgroundPath,
      spaceClassBonusFeatsPath,
      spaceFeatsPath,
      spacePathOfWarPath,
      spacePathOfWarBuffsPath,
      stanceChangesPath,
      maneuverChangesPath,
      combatTalentConditionalsPath,
      magicTalentConditionalsPath,
      talentAuraBuffsPath,
      spellBuffsPath,
      inherentsPath,
      inherents2Path,
      customBuffsPath,
      sizeForDamageFeaturePath,
      scalingWeaponDamagePath,
      houseFeaturesPath,
      resourcePoolsPath,
    ]

    // Create a dictionary to hold all the file dictionaries
    const fileDataDictionary = {};

    // Reads the JSON file and turns it into a data object
    // Check the status before parsing: Foundry answers a missing template with an HTML error page,
    // and predata.json() on that reports a bare "unexpected character" with no clue which file broke.
    async function readFile(filePath) {
      const predata = await fetch(filePath);
      if (!predata.ok) throw new Error(`Template not found (${predata.status}): ${filePath}`);
      try {
        return await predata.json();
      } catch (e) {
        throw new Error(`Template is not valid JSON: ${filePath} (${e.message})`);
      }
    }

    async function loadFiles() {
      for (const file of filePaths) {
        const data = await readFile(file);
        const dataKey = file; // Use the file path as the key
        fileDataDictionary[dataKey] = data;
      }
    }

    await loadFiles();



// ----- End of setting up filePaths ----- //

const characterData = JSON.parse(localStorage.getItem('pulledCharacterData'));
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

   // ----- Start of exportTemplate setup ----- //

   // we want to use unmodifed template if it exists
   let exportTemplate;
   const storedTemplate = fileDataDictionary[unmodifiedPreExportTemplatePath]; 
   if (storedTemplate) {
     // If the template exists in fileDataDictionary, set exportTemplate to that
     exportTemplate = JSON.parse(JSON.stringify(storedTemplate)); // Deep copy to avoid references
   } else {
     // If not found, use the preExportTemplatePath as fallback  (We typically don't want to use this one)
     const template = fileDataDictionary[preExportTemplatePath];
     exportTemplate = JSON.parse(JSON.stringify(template)); // Deep copy
     localStorage.setItem('exportTemplate', JSON.stringify(exportTemplate)); // Save it to localStorage
   }

   // ----- End of exportTemplate setup ----- //

   // ----- Start of simple data update ----- //
   function updateAttribute(variable, attributePath, type) {
     attributePath[type] = variable;
     console.log(attributePath[type]);

     // Save updated exportTemplate to localStorage
     localStorage.setItem('exportTemplate', JSON.stringify(exportTemplate));
   }

   // Stamp the backend's generator version onto the actor as a hidden flag, so any exported sheet
   // reveals which backend build produced it (instant stale-vs-fresh diagnosis when feats look wrong).
   exportTemplate.flags = exportTemplate.flags || {};
   exportTemplate.flags['pf1e_random_char_generator'] = { version: characterData.generator_version || 'unknown' };
   localStorage.setItem('exportTemplate', JSON.stringify(exportTemplate));


   // Stats
   updateAttribute(characterData.str, exportTemplate.system.abilities.str, 'value');
   updateAttribute(characterData.dex, exportTemplate.system.abilities.dex, 'value');
   updateAttribute(characterData.con, exportTemplate.system.abilities.con, 'value');
   updateAttribute(characterData.int, exportTemplate.system.abilities.int, 'value');
   updateAttribute(characterData.wis, exportTemplate.system.abilities.wis, 'value');
   updateAttribute(characterData.cha, exportTemplate.system.abilities.cha, 'value');


   // Saving Throws
  //  updateAttribute(characterData.fort_saving_throw, exportTemplate.system.attributes.savingThrows.fort, 'base');
  //  updateAttribute(characterData.will_saving_throw, exportTemplate.system.attributes.savingThrows.will, 'base');
  //  updateAttribute(characterData.ref_saving_throw, exportTemplate.system.attributes.savingThrows.ref, 'base');

   // Health (HP)
   updateAttribute(characterData.total_rolled_hp, exportTemplate.system.attributes.hp, 'base');

  // Deity
   updateAttribute(characterData.mini_alignment, exportTemplate.system.details, 'alignment');
   // Older backends ship deity_name as a list of aliases; pf1's details.deity is a StringField
   // and an array in source data crashes actor data preparation -> take the primary name.
   const deityName = Array.isArray(characterData.deity_name)
     ? (characterData.deity_name[0] ?? '')
     : characterData.deity_name;
   updateAttribute(deityName, exportTemplate.system.details, 'deity');
   updateAttribute(characterData.age_number, exportTemplate.system.details, 'age');

   // Currency
   updateAttribute(characterData.platnium, exportTemplate.system.currency, 'pp');

   // Languages: pf1 renders traits.languages.value entries via its lowercase language ids
   // (pf1.config.languages); names it doesn't know (Druidic, homebrew) belong in .custom.
   function normalizeLanguages(languageList) {
     const pf1Languages = pf1?.config?.languages ?? CONFIG?.PF1?.languages ?? {};
     const idsByName = {};
     for (const [id, label] of Object.entries(pf1Languages)) {
       idsByName[String(label).toLowerCase()] = id;
       idsByName[id.toLowerCase()] = id;
     }
     const ids = [];
     const custom = [];
     for (const lang of languageList ?? []) {
       const id = idsByName[String(lang).toLowerCase()];
       if (id) {
         if (!ids.includes(id)) ids.push(id);
       } else if (!custom.includes(lang)) {
         custom.push(lang);
       }
     }
     return { ids, custom };
   }

   // Background info
   updateAttribute(characterData.character_full_name, exportTemplate, 'name');
   // pf1 v11 stores traits as FLAT ARRAYS in source data — prep splits known ids into .standard
   // and unknown strings into .custom. The old {value, custom} object shape is silently ignored
   // (Array.isArray fails on it), which left only race-granted languages showing on the sheet.
   const normalizedLanguages = normalizeLanguages(characterData.language_text);
   updateAttribute(
     [...normalizedLanguages.ids, ...normalizedLanguages.custom],
     exportTemplate.system.traits, 'languages');
   updateAttribute(characterData.gender, exportTemplate.system.details, 'gender');
   updateAttribute(characterData.height_number, exportTemplate.system.details, 'height');
   updateAttribute(characterData.weight_number, exportTemplate.system.details, 'weight');

  // Edit token name
   updateAttribute(characterData.character_full_name, exportTemplate.prototypeToken, 'name');

   // Fixing Casting level / stat / kind.
  // Define divine casters (also used by the per-class spellbook config in the Spell Section).
  const divine_casters = ["Cleric", "Druid", "Oracle", "Paladin", "Ranger", "Summoner", "Warpriest"];

// LEGACY single-book path: backends without a `spellbooks` payload configure the primary book
// from the flat primary-class fields. New backends ship per-caster-class `spellbooks` and the
// Spell Section assigns one pf1 book (primary/secondary/tertiary) per caster class instead.
if (!Array.isArray(characterData.spellbooks) || !characterData.spellbooks.length) {
  updateAttribute(characterData.casting_level_str_foundry, exportTemplate.system.attributes.spells.spellbooks.primary, 'casterType');
  updateAttribute(characterData.casting_level_str_foundry, exportTemplate.system.attributes.spells.spellbooks.secondary, 'casterType');

  // Fixing casting stat
  updateAttribute(characterData.main_stat, exportTemplate.system.attributes.spells.spellbooks.primary, 'ability');
  updateAttribute(characterData.main_stat, exportTemplate.system.attributes.spells.spellbooks.secondary, 'ability');

  console.log("this is the casting level", characterData.casting_level_str_foundry);
  //  Arcane spell failure
  // Check if the class (in lower case) is in the list
  if (divine_casters.some(cls => cls.toLowerCase() === characterData.c_class.toLowerCase())) {
    // spell failure
    updateAttribute(false, exportTemplate.system.attributes.spells.spellbooks.primary, 'arcaneSpellFailure');
    updateAttribute(false, exportTemplate.system.attributes.spells.spellbooks.secondary, 'arcaneSpellFailure');
    // spell type
    updateAttribute('divine', exportTemplate.system.attributes.spells.spellbooks.primary, 'kind');
    updateAttribute('divine', exportTemplate.system.attributes.spells.spellbooks.secondary, 'kind');

  } else {
    // spell failure
    updateAttribute(true, exportTemplate.system.attributes.spells.spellbooks.primary, 'arcaneSpellFailure');
    updateAttribute(true, exportTemplate.system.attributes.spells.spellbooks.secondary, 'arcaneSpellFailure');

    // spell type
    updateAttribute('arcane', exportTemplate.system.attributes.spells.spellbooks.primary, 'kind');
    updateAttribute('arcane', exportTemplate.system.attributes.spells.spellbooks.secondary, 'kind');
  }
}

// Fixing spell level

   function stackWithParagraphs(...items) {
    return items.map(item => `<p>${item.label} ${item.value}</p><p></p>`).join('');
  }

  // Convert the backend's plain-text backstory (paragraphs separated by blank lines) into safe
  // biography HTML.
  function backstoryToHtml(text) {
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return String(text).split(/\n\s*\n/)
      .map(p => p.trim()).filter(Boolean)
      .map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  }

   // LEGACY raw labeled dump -- only rendered for payloads that predate formatted_bio (see below).
   const combined_bio = stackWithParagraphs(
    { label: "", value: characterData.younger_brothers },
    { label: "", value: characterData.younger_sisters },
    { label: "", value: characterData.older_brothers },
    { label: "", value: characterData.older_sisters },
    { label: "this is your situation growing up with your parents: ", value: characterData.parents },
    { label: "these are your typical mannerisms:", value: characterData.mannerisms},
    { label: "these are your personality traits: ", value: characterData.personality_traits},
    { label: "these are your flaws:", value: characterData.flaw},
    { label: "this is your hair type:", value: characterData.hair_type },
    { label: "this is your hair color:", value: characterData.hair_color },
    { label: "this is your eye color: ", value: characterData.eye_color },
    { label: "this is your appearance:", value: characterData.appearance },
    { label: "these are your professions: ", value: characterData.professions },
    { label: "these are your background traits: ", value: characterData.background_traits },
    { label: "this is your region of origin: ", value: characterData.region },
    { label: "These are your specialty schools: ", value: characterData.specialty_schools },
    { label: "These are your counter schools:   ", value: characterData.counter_schools },
    { label: "These are your favored spell types, you prefer these:     ", value: characterData.chosen_spell_descriptor },
    { label: "These are your counter spell types, you don't want these: ", value: characterData.counter_spell_descriptor }
  );

   // Drop the prose's legacy closing labeled list (Personality:/Mannerisms:/Appearance:/Flaws:) --
   // the structured fact block above it shows those facts. New backends already strip it; this
   // covers payloads from a not-yet-redeployed backend (and cached localStorage payloads).
   function stripTrailingLabelList(text) {
     const paragraphs = String(text || '').trim().split(/\n\s*\n/);
     while (paragraphs.length
            && /^(personality|mannerisms|appearance|flaws|traits)\s*:/i.test(paragraphs[paragraphs.length - 1].trim())) {
       paragraphs.pop();
     }
     return paragraphs.join('\n\n').trim();
   }

   // Biography = the backend's structured fact block (formatted_bio), then a centered bold
   // "Backstory:" heading (with breathing room under the Appearance section), then the prose;
   // the Notes tab stays empty for session use (the old raw labeled dump is retired).
   // Old payloads without formatted_bio keep the previous behavior (prose in Biography + raw dump
   // in Notes, or raw dump alone), so nothing regresses on backend/module version skew.
   const backstoryText = stripTrailingLabelList(characterData.backstory);
   const formattedBio = (characterData.formatted_bio || '').trim();
   if (formattedBio) {
     let bioHtml = backstoryToHtml(formattedBio);
     if (backstoryText) {
       bioHtml += '<p></p><p></p>'
         + '<h2 style="text-align:center"><strong>Backstory:</strong></h2>'
         + backstoryToHtml(backstoryText);
     }
     updateAttribute(bioHtml, exportTemplate.system.details.biography, 'value');
   } else if (backstoryText) {
     updateAttribute(backstoryToHtml(backstoryText), exportTemplate.system.details.biography, 'value');
     updateAttribute(combined_bio, exportTemplate.system.details.notes, 'value');
   } else {
     updateAttribute(combined_bio, exportTemplate.system.details.biography, 'value');
   }
   // ----- End of simple data update ----- //



// ------ Start of Class Data Section ------ //

// Function to validate and extract items array
function extractItems(parsedData) {
  if (Array.isArray(parsedData)) return parsedData;
  if (parsedData && Array.isArray(parsedData.items)) return parsedData.items;
  console.error('Items is not an array:', parsedData);
  return null;
}

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

// Function to safely write data to localStorage
function writeToLocalStorage(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    console.log(`${key} has been updated in localStorage.`);
  } catch (err) {
    console.error(`Error writing to localStorage key ${key}:`, err);
  }
}

// Function to append collected items to the export template
function appendJsonToTemplate(collectedItems, exportTemplate, sectionKey) {
  if (!exportTemplate.items) {
    exportTemplate.items = {}; // Initialize if it doesn't exist
  }

  // Append new items to the existing array under the sectionKey
  exportTemplate.items = [...exportTemplate.items, ...collectedItems];

  console.log(`Appended ${collectedItems.length} items to ${sectionKey} in exportTemplate.`);
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
function processClass(targetClass, newLevel, classList) {
  const everyClassPathData = fileDataDictionary[everyClassPath];
  const items = extractItems(everyClassPathData);
  if (!items) return;

  // We only want class abilities from where level received <= characterData.level 
  const filteredItems = filterByLevel(items, newLevel);

  // Update level in the class data
  updateLevel(filteredItems, targetClass, newLevel);

  // Collect the items for the given class
  const newCollectedItems = collectItems(items, targetClass, classList);

  // Append the collected items to exportTemplate
  appendJsonToTemplate(newCollectedItems, exportTemplate, "Class");

  // Save the updated exportTemplate back to localStorage
  writeToLocalStorage('exportTemplate', exportTemplate);
}


// function to capitalize the first letter of each word in a string
function capitalizeWords(str) {
  // Ensure str is a string before attempting to split
  if (typeof str !== 'string') {
    console.error('Expected a string, but received:', str);
    return str; // Return the value unchanged if it's not a string
  }

  const ignoreWords = ['of', 'the', 'and', 'in', 'on', 'at', 'to', 'with', 'from'];

  // List of specific Roman numerals to capitalize
  const romanNumerals = ['ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii'];

  return str
    .split(' ') // Split the string into an array of words
    .map((word, index) => {
      // Lowercase the word for comparison
      const lowerWord = word.toLowerCase();

      // Capitalize Roman numerals
      if (romanNumerals.includes(lowerWord)) {
        return word.toUpperCase();
      }

      // Capitalize the first letter if it's the first word or not in ignoreWords
      if (index === 0 || !ignoreWords.includes(lowerWord)) {
        return word
          .split('-') // Handle hyphenated words
          .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
          .join('-');
      } else {
        // Keep the word in lowercase if it's in the ignore list and not the first word
        return word.toLowerCase();
      }
    })
    .join(' '); // Join all words together
}





// Example inputs

// NOTE: every class that appears in every_class.json MUST be listed here, because collectItems()
// only stops collecting a class's items when it reaches the next name in this list. A class that
// exists in the data but is missing here never acts as a boundary, so the PRECEDING class bleeds
// into it and absorbs its class item (at level 20) + abilities. Ninja/Samurai/Shifter/Vigilante
// were missing, which is why e.g. Monk (Unchained) was picking up a stray Ninja 20.
const class_list = [
  "Alchemist", "Antipaladin", "Arcanist", "Barbarian", "Barbarian (Unchained)", "Bard", "Bloodrager", "Brawler",
  "Cavalier", "Cleric", "Druid", "Fighter", "Gunslinger", "Hunter", "Investigator", "Inquisitor", "Kineticist",
  "Magus", "Medium", "Mesmerist", "Monk", "Monk (Unchained)", "Ninja", "Occultist", "Oracle", "Paladin", "Psychic",
  "Ranger", "Rogue", "Rogue (Unchained)", "Samurai", "Shaman", "Shifter", "Skald", "Slayer", "Sorcerer", "Spiritualist", "Swashbuckler",
  "Summoner", "Summoner (Unchained)", "Vigilante", "Warpriest", "Witch", "Wizard",
  // Path of War initiator classes (pf1-pow module) — must be present so each acts as a
  // collectItems boundary once added to every_class.json (see export_every_class macro).
  // "Medic" is a Metzofitz PoW homebrew class present on everyClassPerson; it isn't
  // backend-generatable yet but must be a boundary so it doesn't bleed into the prior class.
  "Stalker", "Warlord", "Warder", "Harbinger", "Mystic", "Zealot", "Medic"
];

// Build EVERY rolled class (multiclass-aware), highest level first, so the sheet lists
// "Class A (its archetype) / Class B (its archetype) / ...". Each class's archetype item is
// appended right after its chassis (processArchetype is a hoisted declaration below). Old
// backend payloads without `classes` fall back to the legacy single-class path.
const classEntries = (Array.isArray(characterData.classes) && characterData.classes.length)
  ? [...characterData.classes].sort((a, b) => (Number(b.level) || 0) - (Number(a.level) || 0))
  : [{ display: upper_case_class, level: characterData.level, archetype: characterData.archetype_info }];

// Per-class "Class Features (Class)" bands on the Class Features tab, in classEntries (level-desc)
// order. Wide bands: harvested every_class.json features rebase to base+125..., chooseable buckets
// continue after them (generalSort), ladder buckets (Rage Powers, ...) get sub-dividers at
// base+500000+. Keyed by lowercase class name for the class_feature_owners lookup.
const CF_CLASS_BAND_BASE = 2000000;
const CF_CLASS_BAND_STEP = 1000000;
const classFeatureBands = {};

let classIdx = 0;
for (const classEntry of classEntries) {
  const classDisplay = classEntry.display || capitalizeWords(classEntry.name || '');
  const itemCountBefore = (exportTemplate.items || []).length;
  processClass(classDisplay, Number(classEntry.level) || 1, class_list);
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
  await processArchetype(classEntry.archetype
    ?? (classDisplay === upper_case_class ? characterData.archetype_info : null),
    classItemSort + 1000);
  classIdx++;
}

// ------ End of Class Data Section ------ //

// ------ Start of Race Section ------ //
async function gatherRace(race) {
  const everyRacePathData = fileDataDictionary[everyRacePath];
  const items = extractItems(everyRacePathData);
  const matchedItems = items.filter(item => item.name === race);
  console.log("matchedItems", matchedItems);
  if (!matchedItems) return;

  writeToLocalStorage("Race", matchedItems);

  // Append the collected items to exportTemplate
  appendJsonToTemplate(matchedItems, exportTemplate, "Class");

  // Save the updated exportTemplate back to localStorage
  writeToLocalStorage('exportTemplate', exportTemplate);
}

await gatherRace(characterData.chosen_race);
// ------ End of Race Section ------ //

// ------ Start of Archetype Section ------ //
async function processArchetype(targetArchetype, sortValue = null) {
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
  let archetypeInfo = fileDataDictionary[archetypePath];

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
  // Clone: this runs once per class now, and mutating the shared fileDataDictionary template
  // would make every appended archetype item point at the same (last-written) object. The
  // template also ships a fixed _id — re-id each clone (like addResourcePools does) so multiple
  // archetype items can't collide.
  archetypeInfo = structuredClone(archetypeInfo);
  archetypeInfo._id = await generateUniqueID();

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

  // Save to localStorage and append to template
  writeToLocalStorage('archetypeInfo', archetypeInfo);
  appendJsonToTemplate([archetypeInfo], exportTemplate, "archetypeInfo");
  writeToLocalStorage('exportTemplate', exportTemplate);
}

// (called per class from the classEntries loop in the Class Data Section above)

// ------ End of Archetype Section ------ //


// ------ Generalized Features Page Functions ------ //

// Utility function to generate a unique 16-character alphanumeric ID
async function generateUniqueID() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return [...Array(16)]
    .map(() => characters.charAt(Math.floor(Math.random() * characters.length)))
    .join('');
}

// ------ End of Generalized Features Page Functions ------ //


// ----- Start of Class Features Section ----- //


function convertToStringSimple(key, featureData) {
  if (!featureData || typeof featureData !== "object") {
      return "<p>No feature data available.</p>";
  }

  let htmlString = `<p><strong>${key}</strong></p><ul>`;

  for (const [key, value] of Object.entries(featureData)) {
      htmlString += `<li><strong>${key}:</strong> ${typeof value === "object" ? stableStringify(value, null, 2) : value}</li>`;
  }

  htmlString += "</ul>";
  return htmlString;
}

// Custom stringify function that maintains order of keys
function stableStringify(obj) {
  if (Array.isArray(obj)) {
    return `[${obj.map(stableStringify).join(',')}]`;
  } else if (obj && typeof obj === 'object') {
    const keys = Object.keys(obj); // preserve original key order
    const keyValuePairs = keys.map(key => `"${key}":${stableStringify(obj[key])}`);
    return `{${keyValuePairs.join(',')}}`;
  } else {
    return JSON.stringify(obj);
  }
}


// Display metadata for the backend's class-feature selection buckets (class_features payload,
// {bucket: {choice: data}}). `ladder: true` = a multi-pick talent ladder that gets its OWN
// divider ("_____ Rage Powers _____") with items labeled "(Rage Power <level>) <name>" from
// class_feature_levels; everything else lands under the "_____ Class Features _____" divider
// with the same label scheme. Unknown buckets fall back to Title Case / trimmed-s / non-ladder.
const CLASS_FEATURE_BUCKETS = {
  rage_powers:          { title: 'Rage Powers',          singular: 'Rage Power',          ladder: true },
  rogue_talents:        { title: 'Rogue Talents',        singular: 'Rogue Talent',        ladder: true },
  ninja_talents:        { title: 'Ninja Talents',        singular: 'Ninja Talent',        ladder: true },
  slayer_talents:       { title: 'Slayer Talents',       singular: 'Slayer Talent',       ladder: true },
  investigator_talents: { title: 'Investigator Talents', singular: 'Investigator Talent', ladder: true },
  vigilante_talents:    { title: 'Vigilante Talents',    singular: 'Vigilante Talent',    ladder: true },
  social_talents:       { title: 'Social Talents',       singular: 'Social Talent',       ladder: true },
  discoveries:          { title: 'Discoveries',          singular: 'Discovery',           ladder: true },
  hexes:                { title: 'Hexes',                singular: 'Hex',                 ladder: true },
  arcana:               { title: 'Magus Arcana',         singular: 'Arcana',              ladder: true },
  exploits:             { title: 'Arcanist Exploits',    singular: 'Exploit',             ladder: true },
  armor_training:       { title: 'Armor Training',       singular: 'Armor Training',      ladder: true },
  weapon_training:      { title: 'Weapon Training',      singular: 'Weapon Training',     ladder: true },
  mercy:                { title: 'Mercies',              singular: 'Mercy',               ladder: true },
  cruelty:              { title: 'Cruelties',            singular: 'Cruelty',             ladder: true },
  ki_powers:            { title: 'Ki Powers',            singular: 'Ki Power',            ladder: true },
  mysteries:            { title: 'Mystery & Revelations', singular: 'Revelation',         ladder: true },
  curses:               { title: 'Oracle Curse',         singular: 'Curse',               ladder: false },
  spirits:              { title: 'Shaman Spirit',        singular: 'Spirit',              ladder: false },
};

// Class Features tab layout: fixed group dividers up front, then one "Class Features (Class)"
// band per rolled class (classFeatureBands, built in the Class Data Section — level-desc order,
// harvested features already rebased into each band). Ladder buckets get sub-dividers inside
// their owning class's band; buckets with no recorded owner fall back to a trailing generic
// "Class Features" band (old backends, non-class buckets like Skill Unlocks).
const CF_SORTS = {
  variableModifiers: 115625,
  naturalAc: 121875,
  deathHp: 396875,
  ladderStep: 25000,   // spacing between ladder sub-dividers inside a class band
};

async function updateClassFeatures(baseFeatTemplate, classFeatures) {
  console.log("****************** starting class features ******************");
  if (!baseFeatTemplate || typeof baseFeatTemplate !== 'object' || !classFeatures || typeof classFeatures !== 'object') {
      console.error("Invalid input data.");
      return;
  }

  // Fixed group dividers (trackers/sizefordamage populate them). Natural AC only appears for
  // characters that actually have natural armor (see characterHasNaturalArmor).
  await appendFeatDivider("__________________Variable Modifiers______________", CF_SORTS.variableModifiers, 'classFeat');
  if (characterHasNaturalArmor()) {
    await appendFeatDivider("__________________Natural AC_________________", CF_SORTS.naturalAc, 'classFeat');
  }
  await appendFeatDivider("_________________Death HP____________________", CF_SORTS.deathHp, 'classFeat');

  // One divider per rolled class, highest class level first (band order = classEntries order).
  const bandsInOrder = Object.values(classFeatureBands).sort((a, b) => a.base - b.base);
  for (const band of bandsInOrder) {
    await appendFeatDivider(`_______________Class Features (${band.display})_______________`, band.base, 'classFeat');
  }
  // Fallback band for buckets whose owning class is unknown; its divider is only added when used.
  const genericBase = CF_CLASS_BAND_BASE + bandsInOrder.length * CF_CLASS_BAND_STEP;
  const genericBand = { display: null, base: genericBase, generalSort: genericBase + 125, ladderSort: genericBase + 500000 };
  let genericDividerAdded = false;

  // bucket (lowercase) -> owning class name (lowercase), from the backend's chooser bookkeeping.
  const owners = {};
  for (const [k, v] of Object.entries(characterData.class_feature_owners || {})) {
    owners[String(k).toLowerCase()] = String(v).toLowerCase();
  }

  const levelsAll = characterData.class_feature_levels || {};

  const mkFeature = async (name, descriptionHtml, sort) => {
      const feature = JSON.parse(stableStringify(baseFeatTemplate));
      // The base feat template carries a hardcoded _id, so every clone would share it and
      // Foundry would collapse them into one embedded item on actor.update().
      feature._id = await generateUniqueID();
      feature.name = name;
      feature.system.description.value = descriptionHtml;
      feature.sort = sort;
      appendJsonToTemplate([feature], exportTemplate, "classFeature");
  };

  for (const [bucket, choices] of Object.entries(classFeatures)) {
      if (!choices || typeof choices !== 'object') {
          console.warn(`Skipping invalid feature bucket: ${bucket}`);
          continue;
      }
      const band = classFeatureBands[owners[String(bucket).toLowerCase()]] || genericBand;
      if (band === genericBand && !genericDividerAdded) {
        genericDividerAdded = true;
        await appendFeatDivider("_______________Class Features_______________", genericBand.base, 'classFeat');
      }
      // Only genuine selection buckets (known key, or gain-levels recorded by the backend) get
      // exploded into per-choice items. Everything else (wizard school, Skill Unlock, ...) is a
      // single feature whose dict is its ATTRIBUTES — keep it as one item in its class's band.
      const isSelection = !!CLASS_FEATURE_BUCKETS[bucket] || !!levelsAll[bucket];
      if (!isSelection) {
          await mkFeature(toTitleCase(String(bucket)), convertToStringSimple(bucket, choices), band.generalSort);
          band.generalSort += 125;
          continue;
      }

      const meta = CLASS_FEATURE_BUCKETS[bucket] || {
        title: toTitleCase(String(bucket).replace(/_/g, ' ')),
        singular: toTitleCase(String(bucket).replace(/_/g, ' ')).replace(/s$/, ''),
        ladder: false,
      };
      const levels = levelsAll[bucket] || {};
      let sort;
      if (meta.ladder) {
        await appendFeatDivider(`_______________${meta.title}__________________`, band.ladderSort, 'classFeat');
        sort = band.ladderSort + 125;
        band.ladderSort += CF_SORTS.ladderStep;
      } else {
        sort = band.generalSort;
      }

      // One item per choice, ordered by the level it was gained at (unknown levels last).
      const names = Object.keys(choices).sort((a, b) =>
        (Number.isFinite(levels[a]) ? levels[a] : 99) - (Number.isFinite(levels[b]) ? levels[b] : 99));
      for (const choice of names) {
          const lvl = levels[choice];
          const name = Number.isFinite(lvl) ? `(${meta.singular} ${lvl}) ${choice}` : `(${meta.singular}) ${choice}`;
          const choiceData = choices[choice];
          const html = (choiceData && typeof choiceData === 'object')
            ? convertToStringSimple(choice, choiceData)
            : `<p>${choiceData ?? ''}</p>`;
          await mkFeature(name, html, sort);
          sort += 125;
      }
      if (!meta.ladder) band.generalSort = sort;
  }
  writeToLocalStorage('exportTemplate', exportTemplate);
}




// Append new class feature data
await updateClassFeatures(fileDataDictionary[baseFeatPath], characterData.class_features);

// ----- Resource Pools group (top of Class Features, template sort -137000) ----- //
// Hero Points for EVERY character (current value = the generated hero_points count);
// Stamina only for fighters (free at level 1) or characters with the Combat Stamina feat;
// class pools (Rage, Ki Pool, Bardic Performance, ...) per CLASS_RESOURCE_POOLS. Pool items
// come from resource_pools.json with charge maxFormulas keyed to @classes.<tag>.level —
// current charges start at 0, so a Foundry rest fills them.
const CLASS_RESOURCE_POOLS = {
  'barbarian':             ['rage'],
  'barbarian (unchained)': ['rageUnchained'],
  'bloodrager':            ['bloodrage'],
  'skald':                 ['ragingSong'],
  'bard':                  ['bardicPerformance'],
  'cleric':                ['channelEnergy'],
  'paladin':               ['smiteEvil', 'layOnHands'],
  'antipaladin':           ['smiteGood', 'touchOfCorruption'],
  'alchemist':             ['bomb'],
  'monk':                  ['kiPoolMonk'],
  'monk (unchained)':      ['kiPoolUnchainedMonk'],
  'ninja':                 ['kiPoolNinja'],
  'magus':                 ['arcanePool'],
  'arcanist':              ['arcaneReservoir'],
  'gunslinger':            ['grit'],
  'swashbuckler':          ['panache'],
  'warpriest':             ['fervor'],
  'investigator':          ['inspiration'],
  'inquisitor':            ['judgment'],
};

async function addResourcePools() {
  try {
    const pools = fileDataDictionary[resourcePoolsPath];
    if (!pools || typeof pools !== 'object') {
      console.warn('Resource pools: resource_pools.json missing — skipping.');
      return;
    }
    const classes = (Array.isArray(characterData.classes) && characterData.classes.length
      ? characterData.classes.map(c => c.name)
      : [characterData.c_class, characterData.c_class_2])
      .filter(Boolean).map(c => String(c).toLowerCase());
    const featLists = ['feats', 'class_feats', 'story_feats', 'flaw_feats', 'flavor_feats',
                       'teamwork_feats', 'bloodline_feats', 'trainer_feats'];
    const hasStaminaFeat = featLists.some(k => (characterData[k] || [])
      .some(n => String(n).toLowerCase().includes('combat stamina')));

    const wanted = ['heroPoints'];
    if (classes.includes('fighter') || hasStaminaFeat) wanted.push('stamina');
    for (const cls of classes) wanted.push(...(CLASS_RESOURCE_POOLS[cls] || []));

    await appendFeatDivider("__________________Resource Pools______________", -137000, 'classFeat');
    const clones = [];
    for (const key of [...new Set(wanted)]) {
      const src = pools[key];
      if (!src) { console.warn(`Resource pools: no "${key}" entry in resource_pools.json.`); continue; }
      const clone = structuredClone(src);
      clone._id = await generateUniqueID();
      if (key === 'heroPoints' && clone.system?.uses) {
        clone.system.uses.value = Number(characterData.hero_points) || 1;
      }
      clones.push(clone);
    }

    // A pool ability must live ONLY here: the every_class.json harvest already ships the same
    // feature as a plain classFeat item (Rage, "Ki Pool (UC)", "Channel Energy (WAR)", ...).
    // Drop those duplicates — exact name match after stripping a trailing "(UC)"-style tag, so
    // "Greater Rage" / "Rage Powers" / "(Rage Power 4) X" all survive — and let the pool item
    // adopt the harvest copy's fuller rules text.
    const normName = s => String(s).toLowerCase().replace(/\s*\([^)]*\)\s*$/, '').trim();
    const poolByName = new Map(clones.map(c => [normName(c.name), c]));
    let removed = 0;
    exportTemplate.items = (exportTemplate.items || []).filter(i => {
      if (i.type !== 'feat' || i.system?.subType !== 'classFeat') return true;
      const pool = poolByName.get(normName(i.name));
      if (!pool) return true;
      const oldDesc = i.system?.description?.value || '';
      if (pool.system?.description && oldDesc.length > (pool.system.description.value || '').length) {
        pool.system.description.value = oldDesc;
      }
      removed++;
      return false;
    });

    appendJsonToTemplate(clones, exportTemplate, 'Feature');
    writeToLocalStorage('exportTemplate', exportTemplate);
    console.log(`Resource pools: added ${clones.length} pool(s) [${[...new Set(wanted)].join(', ')}], removed ${removed} duplicate class feature(s).`);
  } catch (error) {
    console.error('Error adding resource pools:', error);
  }
}
await addResourcePools();

// ----- End of Class Features Section ----- //

// ----- Start of Feat/Trait section ----- //

// Minimal pf1 feat item for names with no every_feat.json template (homebrew style chains,
// Martial Training, Path of War maneuvers). No _id -- Foundry assigns one on actor.update.
function synthesizeFeatItem(name, descriptionHtml, img = "icons/svg/book.svg") {
  return {
    name, type: "feat", img,
    system: {
      description: { value: descriptionHtml || "" },
      tags: [], actions: [], attackNotes: [], effectNotes: [],
      uses: { value: null, per: "", autoDeductChargesCost: "", maxFormula: "", rechargeFormula: "" },
      changes: [], contextNotes: [], links: { children: [], charges: [] },
      tag: "", scriptCalls: [], subType: "feat", abilityType: "na",
      associations: { classes: [] }, showInQuickbar: false, disabled: false,
    },
    effects: [], flags: {},
  };
}

// Overlay backend-authored numeric buffs onto a resolved/synthesized feat item: always-on `changes`
// (deduped by target against what the compendium item already automates, so a bonus never double-
// applies) plus situational `contextNotes`. Keyed by the placed feat's lowercased name. Fills the pf1
// ChangeModel defaults the backend omits (_id + value), exactly like processProfessionAbilities.
function applyFeatBuffOverlay(item, itemLc) {
  applyBuffData(item, featChangesMap[itemLc]);
}

// Generic form of the overlay: merge a backend {changes, contextNotes} entry onto ANY pf1 item
// (feats via applyFeatBuffOverlay, equipment via processItem). Changes dedupe by target,
// contextNotes by exact text (duplicate equipment names hit the same cached item twice).
function applyBuffData(item, buff) {
  if (!buff || !item) return;
  item.system = item.system || {};
  if (Array.isArray(buff.changes) && buff.changes.length) {
    const existing = Array.isArray(item.system.changes) ? item.system.changes : [];
    const existingTargets = new Set(existing.map(c => c && c.target));
    const additions = buff.changes
      .filter(ch => ch && !existingTargets.has(ch.target))
      .map(ch => Object.assign(
        { formula: "0", target: "", type: "untyped", operator: "add", priority: 0, value: 0 },
        ch, { _id: (ch && ch._id) || randomChangeId() }));
    if (additions.length) item.system.changes = existing.concat(additions);
  }
  if (Array.isArray(buff.contextNotes) && buff.contextNotes.length) {
    const existing = Array.isArray(item.system.contextNotes) ? item.system.contextNotes : [];
    const existingTexts = new Set(existing.map(n => n && n.text));
    const additions = buff.contextNotes.filter(n => n && !existingTexts.has(n.text));
    if (additions.length) item.system.contextNotes = existing.concat(additions);
  }
}

async function processFeatTrait(everyDataPath, dataListChooseFrom, dataType, startingSort = 100, label = "level", shouldIncrement = true, startingNumber = 1, step = 1, customLevels = null, labelArray = null, taxDict = null) {
  try {
    // Retrieve data from fileDataDictionary based on dataType (feats or traits)
    const data = fileDataDictionary[everyDataPath];

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
        if (dataType === 'feat') applyFeatBuffOverlay(_featItem, itemLc);
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
        applyFeatBuffOverlay(_synthFeat, itemLc);
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
         
      // Instead of writing to a file, we write to localStorage
      writeToLocalStorage(`collected${capitalizeFirstLetter(dataType)}s`, allMatchedItems);

      // Append matched items to the exportTemplate in localStorage
      appendJsonToTemplate(allMatchedItems, exportTemplate, capitalizeFirstLetter(dataType));

      // Save the updated exportTemplate back to localStorage
      writeToLocalStorage('exportTemplate', exportTemplate);
    } else {
      console.error(`No matching ${dataType}s were found in the list.`);
    }
  } catch (error) {
    console.error(`Error reading or processing the ${dataType} Section:`, error);
  }
}

function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

// --- adding Feat separators --- //
async function addFeatSeparator(filePath, dataType, startingSort = 0) {
  try {
    const data = fileDataDictionary[filePath];
    const wrappedData = Array.isArray(data) ? data : [data];

    // 🔥 Apply sort
    assignSequentialSort(wrappedData, startingSort);

    writeToLocalStorage(`collected${capitalizeFirstLetter(dataType)}s`, wrappedData);
    appendJsonToTemplate(wrappedData, exportTemplate, capitalizeFirstLetter(dataType));
    writeToLocalStorage('exportTemplate', exportTemplate);
    console.log(`${dataType} data successfully added from ${filePath}`);
  } catch (error) {
    console.error(`Error processing ${dataType} from ${filePath}:`, error);
  }
}

async function assignSequentialSort(items, startingSort = 0, step = 10) {
  let currentSort = startingSort;
  for (const item of items) {
    item.sort = currentSort;
    currentSort += step;
  }
}

async function assignToFeatSection(items) {
  for (const item of items) {
    if (item.system) {
      item.system.subType = "feat";
    } else {
      console.warn("Item missing 'system' property:", item);
    }
  }
}
async function Feats_n_Traits() {
  // Feats section
  await addFeatSeparator(spaceBackgroundPath, 'space_function', 1);
  await processFeatTrait(everyFeatPath, characterData.flavor_feats, 'feat', 200, "Flavor", true, 1, 1, null, null, characterData.flavor_feat_tax_dict);
  await processFeatTrait(everyFeatPath, characterData.flaw_feats, 'feat', 250, "Flaw", true, 1, 1, null, null, characterData.flaw_feat_tax_dict);
  await processFeatTrait(everyFeatPath, characterData.story_feats, 'feat', 500, "Story Feat", true, 1, 5, [1,5,10,15,20,25,30,35,40,45,50,55,60,65,70,75,80,85,90,95,100], null, characterData.story_feat_tax_dict);
  await addFeatSeparator(spaceFeatsPath, 'space_function', 1000);
  await processFeatTrait(everyFeatPath, characterData.feats, 'feat', 1500, "Feat", true, 1, 2, null, null, characterData.feats_feat_tax_dict);
  await addFeatSeparator(spaceClassBonusFeatsPath, 'space_function', 2000);
  await processFeatTrait(everyFeatPath, characterData.teamwork_feats, 'feat', 2500, "Class Bonus Feat", true, 3, 3, null, characterData.teamwork_feat_labels);
  await processFeatTrait(everyFeatPath, characterData.class_feats, 'feat', 3000, "Class Bonus Feat", true, 1, 2, null, characterData.class_feat_labels, characterData.class_feat_tax_dict);
  // Bloodline bonus feats (Sorcerer/Bloodrager), labeled by granting class + level
  // (e.g. "Sorcerer 7: Combat Casting"). Guarded so an un-redeployed backend that doesn't
  // send bloodline_feats simply skips this step instead of erroring.
  if (Array.isArray(characterData.bloodline_feats) && characterData.bloodline_feats.length) {
    await processFeatTrait(everyFeatPath, characterData.bloodline_feats, 'feat', 3500, "Bloodline Feat", true, 1, 1, null, characterData.bloodline_feat_labels);
  }
  // Homebrew Trainers -> bottom of the Feats section, rendered as normal feats: one item per taught
  // feat-tax chain, grouped by its "(Trainer N)" label, full compendium text, NO caliber line.
  if (Array.isArray(characterData.trainer_feats) && characterData.trainer_feats.length) {
    await appendFeatDivider("__________________________ Trainers _______________________", 3600);
    await processFeatTrait(everyFeatPath, characterData.trainer_feats, 'feat', 3610, "Trainer", true, 1, 1, null, characterData.trainer_feat_labels, characterData.trainer_feat_tax_dict);
  }
  // Homebrew Professions -> bottom of the Feats section: tiered Rank 5 / Rank 15 ability items (+
  // profession feats), each carrying pf1 changes/contextNotes/uses.
  if (Array.isArray(characterData.profession_ability_items) && characterData.profession_ability_items.length) {
    await appendFeatDivider("__________________________ Professions _____________________", 3900);
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
    await appendFeatDivider("____________________ Casting Traditions ____________________", -200000, 'trait');
    const camName = castingTrad.casting_ability_modifier;
    const tradItem = synthesizeFeatItem(
      camName ? `Casting Tradition (${camName})` : "Casting Tradition",
      buildTraditionHtml(castingTrad, characterData.sphere_mana_pool));
    tradItem.system.subType = 'trait';
    tradItem.sort = -199900;
    appendJsonToTemplate([tradItem], exportTemplate, "Trait");
    writeToLocalStorage('exportTemplate', exportTemplate);
  }
  // Traits section: divider, then the creation traits (sorts 100+ from processFeatTrait).
  await appendFeatDivider("____________________ Traits______________________", -100000, 'trait');
  await processFeatTrait(everyTraitPath, characterData.selected_traits, 'trait');
  // Flaws: mechanical drawbacks from flaw_effects_dict — one trait item per flaw, named with its
  // tier, full rules text as the description, pf1 changes/contextNotes via applyBuffData.
  const flawEffects = characterData.flaw_effects_dict || {};
  if (Object.keys(flawEffects).length) {
    await appendFeatDivider("____________________ Flaws______________________", 50000, 'trait');
    let flawSort = 50100;
    for (const [flawName, entry] of Object.entries(flawEffects)) {
      const tierLabel = String(entry.tier || 'minor') === 'major' ? 'Major' : 'Minor';
      const item = synthesizeFeatItem(`(Flaw, ${tierLabel}) ${flawName}`,
        entry.description ? `<p>${entry.description}</p>` : "");
      item.system.subType = 'trait';
      item.sort = flawSort;
      flawSort += 100;
      applyBuffData(item, entry);
      appendJsonToTemplate([item], exportTemplate, "Trait");
    }
    writeToLocalStorage('exportTemplate', exportTemplate);
    console.log(`Flaws: added ${Object.keys(flawEffects).length} mechanical flaw trait(s).`);
  }
}

function addingReceivedLocationToName(items, label = "Level", shouldIncrement = true, startingNumber = 1, step = 1, customLevels = null, labelArray = null) {
  let current = startingNumber;

  for (let i = 0; i < items.length; i++) {
    if (labelArray && labelArray[i] != null) {
      // Per-feat label from the backend, e.g. "Fighter 1: Weapon Focus"
      items[i].name = `${labelArray[i]}: ${items[i].name}`;
    } else {
      const level = customLevels?.[i] ?? current;
      items[i].name = `(${label} ${level}) ${items[i].name}`;
      if (!customLevels && shouldIncrement) current += step;
    }
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

function toTitleCase(str) {
  return str.replace(/\b\w/g, c => c.toUpperCase());
}

// Inline section divider (no template file needed): a feat item with an underscore name, sorted
// into place. subType picks the sheet section: "feat" (Feats), "classFeat" (Class Features),
// "trait" (Traits). Used to head the Trainers / Professions blocks and the Class Features /
// Traits / Flaws groups.
async function appendFeatDivider(title, sort, subType = 'feat') {
  const div = synthesizeFeatItem(title, "");
  div.sort = sort;
  div.system.subType = subType;
  appendJsonToTemplate([div], exportTemplate, "Feat");
  writeToLocalStorage('exportTemplate', exportTemplate);
}

// Short id for embedded change rows -- pf1's ChangeModel expects an _id on each change.
function randomChangeId() {
  const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return [...Array(8)].map(() => c.charAt(Math.floor(Math.random() * c.length))).join('');
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
        ch, { _id: (ch && ch._id) || randomChangeId() }
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
  writeToLocalStorage('collectedProfessionAbilities', built);
  appendJsonToTemplate(built, exportTemplate, "Feat");
  writeToLocalStorage('exportTemplate', exportTemplate);
}

// Normalize a sphere talent name for compendium matching: drop a trailing " (variant)" and any
// " [source]" tag (the backend sends e.g. "Ragdoll Swing (impale)" / "... [apoc]"; the pf1spheres
// compendium name is just "Ragdoll Swing"), then lowercase / strip apostrophes / collapse spaces.
function sphereNorm(s) {
  return String(s).split(' (')[0].replace(/\s*\[[^\]]*\]\s*/g, ' ')
    .toLowerCase().replace(/['’`]/g, '').replace(/\s+/g, ' ').trim();
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
        ch, { _id: (ch && ch._id) || randomChangeId() })));
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
  writeToLocalStorage('collectedSphereTalents', built);
  appendJsonToTemplate(built, exportTemplate, "Feat");
  writeToLocalStorage('exportTemplate', exportTemplate);
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

// Apostrophe-/case-/whitespace-insensitive key for matching backend scrape names (which often
// lose apostrophes, e.g. "Pit Fighters Stance") against pf1-pow compendium names.
function powNorm(s) {
  return String(s).toLowerCase().replace(/['’`]/g, '').replace(/\s+/g, ' ').trim();
}

function capitalizeManeuverType(t) {
  const s = String(t || '').toLowerCase();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

// Initiating ability ("int"/"wis"/"cha"): backend's initiation_stat export, else recompute the
// same way (FINAL score = base + inherents + level-up bumps; first max wins, so ties break
// int > wis > cha — mirrors skill_ranks.final_ability_score on the backend).
function resolveInitStat() {
  const exported = String(characterData.initiation_stat || '').toLowerCase();
  if (['int', 'wis', 'cha'].includes(exported)) return exported;
  const inh = characterData.inherents || {};
  const lvl = characterData.level_up_stats || {};
  const finalScore = s => (Number(characterData[s]) || 0) + (Number(inh[s]) || 0) + (Number(lvl[s]) || 0);
  let best = null;
  for (const s of ['int', 'wis', 'cha']) {
    if (best === null || finalScore(s) > finalScore(best)) best = s;
  }
  return best || 'wis';
}

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
  const initStat = resolveInitStat();
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
  const stanceChanges = fileDataDictionary[stanceChangesPath];
  const changesByNorm = {};
  if (stanceChanges && typeof stanceChanges === 'object') {
    for (const [k, v] of Object.entries(stanceChanges)) changesByNorm[powNorm(k)] = v;
  } else {
    console.warn('Path of War: stance_changes.json missing or invalid — stance buffs will be description-only.');
  }

  const divider = structuredClone(fileDataDictionary[spacePathOfWarBuffsPath]);
  const buffs = [];
  // Resolve @INITMOD in stance contextNotes, same as addManeuverConditionals does for maneuver riders.
  const stanceInit = maneuverInitAttr();
  const subInit = s => String(s == null ? '' : s).replaceAll('@INITMOD', `@abilities.${stanceInit}.mod`);
  for (const name of stances) {
    const doc = matchedDocs.get(name);
    const d = descs[name] || {};
    const curated = changesByNorm[powNorm(name)] || {};
    const changes = structuredClone(Array.isArray(curated.changes) ? curated.changes : []);
    for (const ch of changes) {
      if (!ch._id) ch._id = (await generateUniqueID()).slice(0, 8);
    }
    buffs.push({
      name: `(Stance) ${doc ? doc.name : name}`,
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
  writeToLocalStorage('collectedPathOfWarBuffs', all);
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

  await addFeatSeparator(spacePathOfWarPath, 'space_function', 4000);

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
  writeToLocalStorage('collectedPathOfWar', items);
  appendJsonToTemplate(items, exportTemplate, 'PathOfWar');
  writeToLocalStorage('exportTemplate', exportTemplate);
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
        const typeCap = item.system?.maneuverType || capitalizeManeuverType(d.type) || (isStance ? 'Stance' : 'Strike');
        item.name = `(${typeCap}) ${doc.name}`;
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
    writeToLocalStorage('collectedPathOfWar', items);
    appendJsonToTemplate(items, exportTemplate, 'PathOfWar');

    applyManeuverProgression();
    await addStanceBuffs(stances, descs, matchedDocs);

    writeToLocalStorage('exportTemplate', exportTemplate);
    console.log(`Path of War: injected ${items.length} native pf1-pow.maneuver items (${misses} synthesized).`);
  } catch (error) {
    console.error('Error processing the Path of War section:', error);
  }
}

await processPathOfWar();
// ------ End of Feat/Trait Section ------ //

// ----- Start of Inherents Section ----- //
async function addStatBuff(filePath, stats, label) {
  // Deep copy to avoid mutation of shared state
  const data = structuredClone(fileDataDictionary[filePath]);
  
  // Turns data -> array if it isn't already
  let wrappedData = Array.isArray(data) ? data : [data];

  // Manipulate inherent stats
  wrappedData = await changeStatBuff(wrappedData, stats, label);
  console.log("this is the wrapped data", wrappedData);

  writeToLocalStorage(label, wrappedData);
  appendJsonToTemplate(wrappedData, exportTemplate, label);
}

async function changeStatBuff(dataArray, stats, label) {
  // loops through each stat in the relevant stat array and assigns the value to the corresponding stat in the dataArray
  for (const item of dataArray) {
    item.name = label;
    item._id = await generateUniqueID(); // Generate a unique ID for each item

    if (!item.system?.changes) continue;
  
    for (const change of item.system.changes) {
      const target = change.target;
      if (stats.hasOwnProperty(target)) {
        change.formula = stats[target].toString();
      }
    }
  }
  return dataArray;
}

await addStatBuff(inherentsPath, characterData.level_up_stats, 'level_up_stats');
await addStatBuff(inherentsPath, characterData.inherents, 'Inherents');
// ----- End of Inherents Section ----- //

// ----- Start of Custom Buffs Section ----- //
async function addCustomBuffs() {
  if ((localStorage.getItem('addCustomBuffs') || 'n').toLowerCase() !== 'y') return;

  const buffs = structuredClone(fileDataDictionary[customBuffsPath]);
  if (!Array.isArray(buffs)) { console.warn('custom_buffs.json missing or not an array'); return; }

  // Buffs that start active (the "X" set). Combat buffs + the acrobatics reference stay inactive.
  const ACTIVE = new Set(['Professions', 'Skill Synergies', 'Acrobatics Speed']);

  // Highest mental ability decides which skill-ranks buff to keep (Int highest -> neither;
  // ties -> Int > Wis > Cha). Prefer the backend's initiation_stat export — the same FINAL-score
  // calculation (base + inherents + level-ups) that drives the pf1-pow initiating stat — and
  // fall back to comparing raw scores for an un-redeployed backend.
  let mentalBuff = null;
  const exportedMental = String(characterData.initiation_stat || '').toLowerCase();
  if (['int', 'wis', 'cha'].includes(exportedMental)) {
    if (exportedMental === 'wis') mentalBuff = 'Skill Ranks Based on Wisdom';
    else if (exportedMental === 'cha') mentalBuff = 'Skill Ranks Based on Charisma';
  } else {
    const wis = Number(characterData.wis) || 0;
    const cha = Number(characterData.cha) || 0;
    const intel = Number(characterData.int) || 0;
    if (wis >= cha && wis > intel) mentalBuff = 'Skill Ranks Based on Wisdom';
    else if (cha > wis && cha > intel) mentalBuff = 'Skill Ranks Based on Charisma';
  }

  // Flat acrobatics number for the active buff: floor(land_speed/10 - 3) * 4
  const landSpeed = Number(characterData.land_speed) || 30;
  const acroFlat = Math.floor(landSpeed / 10 - 3) * 4;

  // Professions buff: one chosen profession per line
  let professions = characterData.professions;
  if (typeof professions === 'string') { try { professions = JSON.parse(professions); } catch (e) { professions = [professions]; } }
  const professionsHtml = Array.isArray(professions) ? professions.map(p => `<p>${p}</p>`).join('') : '';

  const result = [];
  for (const buff of buffs) {
    // keep only the selected mental-ranks buff
    if (buff.name === 'Skill Ranks Based on Wisdom' || buff.name === 'Skill Ranks Based on Charisma') {
      if (buff.name !== mentalBuff) continue;
    }
    buff.system = buff.system || {};
    buff.system.active = ACTIVE.has(buff.name) || buff.name === mentalBuff;

    if (buff.name === 'Professions') {
      buff.system.description = buff.system.description || {};
      buff.system.description.value = professionsHtml;
    }
    if (buff.name === 'Acrobatics Speed' && Array.isArray(buff.system.changes) && buff.system.changes[0]) {
      buff.system.changes[0].formula = String(acroFlat);
    }
    result.push(buff);
  }

  writeToLocalStorage('CustomBuffs', result);
  appendJsonToTemplate(result, exportTemplate, 'CustomBuffs');
  console.log(`Added ${result.length} custom buffs (mental=${mentalBuff}, acroFlat=${acroFlat}).`);
}
await addCustomBuffs();
// ----- End of Custom Buffs Section ----- //



// ----- Start of Spell Section ----- //
async function determineSpellType(className = upper_case_class){
  let type = 'prepared';
  console.log("determineSpellType for class ", className);

  const classUpper = String(className).toUpperCase();
  // Convert the list to uppercase for a case-insensitive check
  const prepared_caster_list_upper = prepared_caster_list.map(c => c.toUpperCase());

  // Check if the class is in the list (case insensitive)
  if (prepared_caster_list_upper.includes(classUpper)) {
    console.log("Prepared Casters");
    type = "prepared";
  }
  // // Arcanist
  else if (classUpper === "ARCANIST") {
    console.log("Arcanist caster -> hybrid");
    // need to name it type hybrid (instead of Arcanist for some reason)
    type = "hybrid";
  }
  // Spontaneous casters
  else {
    console.log("Spontaneous Casters");
    type = "spontaneous";
  }

  return type;
}

// Configure one pf1 spellbook slot (primary/secondary/tertiary) from a backend per-class book
// ({name, display, level, casting_level_string, casting_stat, divine, ...}). The book's `class`
// must be the class ITEM's tag so pf1 auto-derives caster level from that class's own levels.
async function configureSpellbook(slot, book) {
  const pfBook = exportTemplate.system?.attributes?.spells?.spellbooks?.[slot];
  if (!pfBook) {
    console.error(`Spellbook slot "${slot}" missing from the export template.`);
    return;
  }
  const display = book.display || capitalizeWords(book.name || '');
  const classItem = (exportTemplate.items || []).find(i => i.type === 'class' && i.name === display);
  pfBook.inUse = true;
  pfBook.name = display;
  pfBook.class = classItem?.system?.tag || book.name;
  pfBook.casterType = book.casting_level_string === 'mid' ? 'med' : (book.casting_level_string || 'low');
  pfBook.ability = book.casting_stat || characterData.main_stat;
  const isDivine = (book.divine !== undefined)
    ? !!book.divine
    : divine_casters.some(c => c.toLowerCase() === String(book.name).toLowerCase());
  pfBook.kind = isDivine ? 'divine' : 'arcane';
  pfBook.arcaneSpellFailure = !isDivine;
  pfBook.spellPreparationMode = await determineSpellType(display);
  console.log(`Spellbook ${slot} <- ${display} (${pfBook.casterType}, ${pfBook.ability}, ${pfBook.kind}, ${pfBook.spellPreparationMode})`);
}


async function assignSpellTypes(type) {
  if (exportTemplate.system && exportTemplate.system.attributes && exportTemplate.system.attributes.spells) {
    const primarySpellbook = exportTemplate.system.attributes.spells.spellbooks.primary;
    
    if (primarySpellbook) {
      console.log('Before change:', primarySpellbook.spellPreparationMode);  // Log current value
      primarySpellbook.spellPreparationMode = type;
      // primarySpellbook.arcaneSpellFailure = false; // Set arcaneSpellFailure to false
      console.log('After change:', primarySpellbook.spellPreparationMode);  // Log updated value
    } else {
      console.error('Primary spellbook not found in the exportTemplate.');
    }
  } else {
    console.error('Spell section structure missing in exportTemplate.');
  }
}




async function processSpell(everySpellPath, spellListChooseFrom, slot = 'primary', book = null) {
  try {
    // Ensure only for characters with spells
    if (!Array.isArray(spellListChooseFrom) || spellListChooseFrom.length === 0) {
      console.error(`No spell list for ${book ? book.name : characterData.c_class} — nothing to cast.`);
      return;
    }


    // Retrieve spells data from fileDataDictionary
    const spells = fileDataDictionary[everySpellPath];

    // Check if spells is an array
    if (!Array.isArray(spells)) {
      console.error('Spells data is not an array or is undefined:', spells);
      return;
    }

    console.log("spell list structure", JSON.stringify(spellListChooseFrom, null, 2));

    // Determine the spellbook's casting type up front so we know whether to mark spells prepared.
    const type = await determineSpellType(book ? (book.display || capitalizeWords(book.name || '')) : upper_case_class);
    const markPrepared = (type === 'prepared' || type === 'hybrid');
    // Per-level prepared count from the backend (spells/day), aligned 1:1 to spellListChooseFrom.
    // Divine casters prepare their whole loadout (count == group size); spellbook casters (wizard,
    // witch, ...) prepare only a subset of the larger spellbook. Empty/0 for spontaneous casters.
    const preparedPerLevel = Array.isArray(book ? book.spells_prepared_per_level : characterData.spells_prepared_per_level)
      ? (book ? book.spells_prepared_per_level : characterData.spells_prepared_per_level) : [];

    // Consolidate all matched spells from the nested spell list, marking the prepared ones per level.
    const allMatchedSpells = [];

    // Case-insensitive name index. The backend sends names from data/spells.csv, whose article /
    // preposition casing ("Shield Of The Dawnflower") can differ from the compendium's canonical
    // casing ("Shield of the Dawnflower"). A strict === would silently drop ~250 such spells (while
    // their weapon conditional still attaches from spell_changes_dict, leaving an orphaned toggle).
    // Match leniently here, mirroring addSpellRiders and the feat lookups.
    const spellByLower = new Map();
    for (const r of spells) spellByLower.set((r.name || '').toLowerCase(), r);

    for (let level = 0; level < spellListChooseFrom.length; level++) {
      const spellArray = spellListChooseFrom[level] || [];
      let prepRemaining = markPrepared ? (Number(preparedPerLevel[level]) || 0) : 0;
      for (const spell of spellArray) {
        const matchedSpell = spellByLower.get((spell || '').toLowerCase());
        if (!matchedSpell) {
          console.warn(`Spell "${spell}" not found.`);
          continue;
        }
        // Clone so we don't mutate the shared every_spell.json cache.
        const item = JSON.parse(JSON.stringify(matchedSpell));
        // every_spell.json items ship with spellbook:"primary" baked in — point each spell at the
        // book that actually granted it (secondary/tertiary for the lower-leveled caster classes).
        if (item.system) item.system.spellbook = slot;
        if (item.system && item.system.level === 0) {
          // Cantrips/orisons: always prepared AND infinitely castable, for EVERY caster type
          // (prepared and spontaneous). Detected by the spell's own level so low casters with no
          // level-0 spells are unaffected.
          item.system.atWill = true;
          item.system.preparation = { ...(item.system.preparation || {}), value: 1, max: 1 };
        } else if (markPrepared && item.system) {
          const prepared = prepRemaining > 0 ? 1 : 0;
          if (prepared) prepRemaining--;
          // value = currently prepared; max = preparable (1 per spell, so spellbook spells stay
          // preparable even when not prepared today). Spontaneous books skip this entirely.
          item.system.preparation = { ...(item.system.preparation || {}), value: prepared, max: 1 };
        }
        allMatchedSpells.push(item);
      }
    }

    if (allMatchedSpells.length > 0) {
      // Write matched spells to localStorage (not file system)
      writeToLocalStorage('collectedSpells', allMatchedSpells);

      if (!book) {
        // Legacy single-book payload: mark the primary book in use for the primary class.
        exportTemplate.system.attributes.spells.spellbooks.primary.inUse = true;
        exportTemplate.system.attributes.spells.spellbooks.primary.class = characterData.c_class;

        // Assign the spellbook's preparation mode (type determined above).
        await assignSpellTypes(type);
      }
      // (per-class books were already configured by configureSpellbook)

      // Append matched spells to the exportTemplate
      appendJsonToTemplate(allMatchedSpells, exportTemplate, "Spells");

      // Save the updated exportTemplate back to localStorage
      writeToLocalStorage('exportTemplate', exportTemplate);
    } else {
      console.error('No matching spells were found in the spell list.');
    }
  } catch (error) {
    console.error('Error reading or processing the Spell Section:', error);
  }
}

// One pf1 spellbook per caster class: primary = highest class level (level ties broken by caster
// tier — the backend pre-sorts `spellbooks`; re-sort defensively for robustness), secondary the
// next, tertiary the third. Legacy payloads without `spellbooks` keep the old single-book path.
if (Array.isArray(characterData.spellbooks) && characterData.spellbooks.length) {
  const TIER_RANK = { high: 0, mid: 1, med: 1, low: 2 };
  const SPELLBOOK_SLOTS = ['primary', 'secondary', 'tertiary'];
  const casterBooks = characterData.spellbooks
    .filter(b => b && Array.isArray(b.spell_list_choose_from) && b.spell_list_choose_from.length)
    .sort((a, b) => ((Number(b.level) || 0) - (Number(a.level) || 0))
      || ((TIER_RANK[a.casting_level_string] ?? 3) - (TIER_RANK[b.casting_level_string] ?? 3)));
  if (casterBooks.length > SPELLBOOK_SLOTS.length) {
    console.warn(`Spellbooks: ${casterBooks.length} caster classes but only ${SPELLBOOK_SLOTS.length} pf1 books — dropping ${casterBooks.slice(SPELLBOOK_SLOTS.length).map(b => b.name).join(', ')}.`);
  }
  for (let s = 0; s < casterBooks.length && s < SPELLBOOK_SLOTS.length; s++) {
    await configureSpellbook(SPELLBOOK_SLOTS[s], casterBooks[s]);
    await processSpell(everySpellPath, casterBooks[s].spell_list_choose_from, SPELLBOOK_SLOTS[s], casterBooks[s]);
  }
} else {
  await processSpell(everySpellPath, characterData.spell_list_choose_from);
}

// ----- Spell riders: save + non-damage riders on Bucket-B attack spells ----- //
// Damaging touch-attack spells (Chill Touch, Frigid Touch, Acid Arrow) already carry their attack +
// damage from every_spell.json; the backend's spell_riders_dict adds the formal save (only if the
// compendium action has none) and the non-damage riders (ability damage, conditions, ongoing damage)
// as default-on text conditionals with the numbers in [[ ]]. Keyed by display-cased spell name.
// Enriched rider clauses (enrich_conditional_riders.py) restate the spell save DC as
// `[[ 10 + @slvl + @castMod ]]`. Those two tokens aren't real pf1 roll-data paths, so substitute them
// to concrete forms at attach time (mirrors the @INITMOD / @spheres.* substitution the maneuver and
// sphere paths already do): @slvl -> the spell's own level, @castMod -> @abilities.<book ability>.mod.
// Combined pf1-spell caster level for the homebrew rule: each casting class contributes its FULL class
// level (high/med), or level-3 for a 'low' caster (bard/ranger/paladin RAW), summed over the
// spellbooks and floored to 1 -- the pf1-spell analog of sphereCLExpr(). Uses @classes.<tag>.level,
// NOT @spells.<book>.cl.total (which pf1 leaves at full class level even for low casters, since
// casterType only drives slots/max spell level).
function spellCLExpr() {
  const books = exportTemplate.system?.attributes?.spells?.spellbooks || {};
  const terms = ['primary', 'secondary', 'tertiary']
    .map(s => books[s]).filter(b => b && b.inUse && b.class)
    .map(b => {
      const lvl = `@classes.${b.class}.level`;
      return b.casterType === 'low' ? `max(${lvl} - 3, 0)` : lvl;   // high/med -> full level
    });
  return `max(${terms.join(' + ') || '0'}, 1)`;
}
function subSpellTokens(text, spell) {
  const books = exportTemplate.system?.attributes?.spells?.spellbooks || {};
  const bk = spell?.system?.spellbook;
  const ability = (books[bk] && books[bk].ability) || (books.primary && books.primary.ability) || 'int';
  const level = spell?.system?.level ?? 0;
  return String(text == null ? '' : text)
    .replaceAll('@spells.primary.cl.total', spellCLExpr())
    .replaceAll('@slvl', String(level))
    .replaceAll('@castMod', `@abilities.${ability}.mod`);
}

async function addSpellRiders() {
  try {
    const spellRiders = characterData.spell_riders_dict || {};
    if (!Object.keys(spellRiders).length) return;
    const SAVE_ID = { fortitude: 'fort', reflex: 'ref', will: 'will' };
    const spells = (exportTemplate.items || []).filter(i => i.type === 'spell');
    let added = 0;
    for (const [spellName, entry] of Object.entries(spellRiders)) {
      if (!entry) continue;
      const lc = spellName.toLowerCase();
      const spell = spells.find(s => (s.name || '').toLowerCase() === lc);
      if (!spell) { console.warn(`Spell riders: "${spellName}" not built — skipping.`); continue; }
      for (const action of (spell.system?.actions || [])) {
        // Formal save — map the backend's full word to the pf1 id; don't clobber a compendium save.
        if (entry.save && !(action.save && action.save.type)) {
          action.save = {
            type: SAVE_ID[String(entry.save.type || '').toLowerCase()] || '',
            dc: entry.save.dc || '',
            description: entry.save.description || '',
            harmless: !!entry.save.harmless,
          };
        }
        // Riders → default-on text conditionals (no structured modifier; the spell's own damage stands).
        if (Array.isArray(entry.riders) && entry.riders.length) {
          if (!Array.isArray(action.conditionals)) action.conditionals = [];
          const seen = new Set(action.conditionals.map(c => c && c.name));
          for (const riderText of entry.riders) {
            const name = subSpellTokens(riderText, spell);
            if (!name || seen.has(name)) continue;
            seen.add(name);
            action.conditionals.push({ _id: (await generateUniqueID()).slice(0, 8), name, default: true, modifiers: [] });
            added++;
          }
        }
      }
    }
    writeToLocalStorage('exportTemplate', exportTemplate);
    console.log(`Spells: attached ${added} spell rider(s) across ${Object.keys(spellRiders).length} spell(s).`);
  } catch (error) {
    console.error('Error attaching spell riders:', error);
  }
}
await addSpellRiders();



// ----- End of Spell Section ----- //


// ----- Start of Weapon/Armor Section ----- //
// One-line special-abilities summary on the item description. Also reused to rebuild the rollable
// attack twin's stripped description (createScalingAttackItem): pf1 bakes an item's description
// into its attack chat card, so the twin carries ONLY this line while the inventory weapon keeps
// the full per-quality rules text from addEnhancementEffects().
async function appendEnhancementsToDescription(item, enhancements) {
  const names = (Array.isArray(enhancements) ? enhancements : []).filter(Boolean);
  if (!names.length || !item?.system?.description) return;
  const message = `<p><strong>Special abilities:</strong> ${names.join(', ')}</p>`;
  // Add enhancements only once
  if (!item.system.description.value.includes(message)) {
    item.system.description.value += message;
  }
}

// Per-quality rules text (enhancement_effects_dict entries ship a `description` pulled from the
// scraped qualities lists) rendered as a titled block under the item. Idempotent per quality.
// Weapon/armor/shield inventory items are never rolled (the attack twin is), so this text never
// reaches a chat card.
function appendQualityDescription(item, qualityName, descriptionText) {
  if (!item?.system?.description || !descriptionText) return;
  const marker = `<h3>${qualityName}</h3>`;
  if (item.system.description.value.includes(marker)) return;
  item.system.description.value += `${marker}<p>${descriptionText}</p>`;
}

// Backend slot names (items_best.json sections) -> pf1 equipmentSlots.wondrous ids
const WONDROUS_SLOT_IDS = {
  belts: 'belt', body: 'body', chest: 'chest', eyes: 'eyes', feet: 'feet',
  hands: 'hands', head: 'head', headband: 'headband', neck: 'neck',
  shoulders: 'shoulders', wrist: 'wrists', wrists: 'wrists', rings: 'ring', ring: 'ring',
};

// Minimal pf1 equipment item for slot gear with no every_item.json match (name variants the
// compendium disambiguates, homebrew, ...). No _id — Foundry assigns one on actor.update.
function synthesizeEquipmentItem(name, descriptionText, slot) {
  return {
    name, type: "equipment", img: "icons/svg/item-bag.svg",
    system: {
      description: { value: descriptionText ? `<p>${descriptionText}</p>` : "" },
      subType: "wondrous", slot: WONDROUS_SLOT_IDS[slot] || "slotless",
      quantity: 1, equipped: true, carried: true, identified: true, proficient: true,
      changes: [], contextNotes: [], actions: [], attackNotes: [], effectNotes: [],
      links: { children: [], charges: [] }, tags: [], flags: {}, scriptCalls: [],
    },
    effects: [], flags: {},
  };
}

async function processItem(itemType, everyItemPath, itemName, enhancementList, defaultItemName, defaultItemNameFlag = 0, opts = {}) {
  try {
    // If itemName is empty or undefined, use defaultItemName
    if (!itemName && defaultItemNameFlag === 0) {
      itemName = defaultItemName;
      defaultItemNameFlag = 1;  // Set the flag to 1 if defaultItemName is used
    }

    // If item can't be found and defaultItemNameFlag is set to 1, skip this time
    if (!itemName && defaultItemNameFlag === 1) {
      return defaultItemNameFlag;  // Ensure the flag is returned
    }

    itemName = capitalizeWords(itemName);

    // Ensure the item name is not empty or undefined
    if (!itemName) {
      console.error(`Character class ${characterData.c_class} does not have any selected ${itemType}.`);
      return defaultItemNameFlag;  // Ensure the flag is returned
    }

    // Backend buff overlay is keyed by the backend's item name, lowercased
    const buffKeyLc = String(itemName).toLowerCase();

    // Retrieve the items data from the fileDataDictionary
    const items = fileDataDictionary[everyItemPath];

    // Check if the items data is an array
    if (!Array.isArray(items)) {
      console.error(`${itemType} data is not an array or is undefined:`, items);
      return defaultItemNameFlag;  // Ensure the flag is returned
    }

    console.log(`${itemType} data structure`, JSON.stringify(itemName, null, 2));

    // Find the matching item from the items data: exact case-insensitive first, then ignoring a
    // parenthesised compendium suffix ("Belt of Physical Might +2 (Str & Dex)") the backend's
    // item data doesn't encode.
    const itemNameLc = itemName.toLowerCase();
    let matchedItem = items.find(r => r.name.toLowerCase() === itemNameLc);
    if (!matchedItem) {
      matchedItem = items.find(r => r.name.split(' (')[0].toLowerCase() === itemNameLc);
      if (matchedItem) console.log(`${itemType} "${itemName}" matched compendium variant "${matchedItem.name}".`);
    }

    if (!matchedItem) {
      // Slot equipment: build the item from backend data (name + description + parsed buffs)
      // instead of substituting an unrelated default — a synthesized row keeps the real item.
      if (opts.synthesizeOnMiss) {
        console.warn(`${itemType} "${itemName}" not in compendium — synthesizing from backend data.`);
        const details = opts.detailsByName?.[buffKeyLc] || {};
        const synthesized = synthesizeEquipmentItem(itemName, details.description, details.slot);
        applyBuffData(synthesized, itemChangesMap[buffKeyLc]);
        writeToLocalStorage(`collected${itemType}s`, [synthesized]);
        appendJsonToTemplate([synthesized], exportTemplate, itemType);
        writeToLocalStorage('exportTemplate', exportTemplate);
        return defaultItemNameFlag;
      }

      console.warn(`${itemType} "${itemName}" not found, using default item.`);
      // Try to use the default item if the selected one is not found
      const defaultMatchedItem = items.find(r => r.name === defaultItemName);
      if (defaultMatchedItem) {
        if (defaultItemNameFlag === 0) {
          // Set the proficient section to true
          defaultMatchedItem.system.proficient = true;
          // Weapons stay inventory-only (pf1 v11 filters the Combat tab on system.showInCombat):
          // the rollable entry is the attack-type twin from createScalingAttackItem(), whose
          // stripped description keeps the roll card clean while the weapon keeps the full rules
          // text. Explicit false — compendium extracts may bake true.
          if (itemType === "Weapon") defaultMatchedItem.system.showInCombat = false;

          appendEnhancementsToDescription(defaultMatchedItem, enhancementList);
          writeToLocalStorage(`collected${itemType}s`, [defaultMatchedItem]);
          appendJsonToTemplate([defaultMatchedItem], exportTemplate, itemType);
          writeToLocalStorage('exportTemplate', exportTemplate);
          console.log(`Successfully added default ${itemType} data to the export template.`);

          // Set the flag to 1 to avoid adding default again
          return 1; // Set flag here to indicate the default item has been added
        }
      } else {
        console.error(`Default ${itemType} "${defaultItemName}" also not found.`);
      }
      return defaultItemNameFlag;  // Ensure the flag is returned
    }

    // Set the proficient section to true
    matchedItem.system.proficient = true;
    // Weapons stay inventory-only (pf1 v11 filters the Combat tab on system.showInCombat): the
    // rollable entry is the attack-type twin from createScalingAttackItem(), whose stripped
    // description keeps the roll card clean while the weapon keeps the full rules text.
    // Explicit false — compendium extracts may bake true.
    if (itemType === "Weapon") matchedItem.system.showInCombat = false;

    // Append enhancements to the item (only once)
    console.log(matchedItem);
    appendEnhancementsToDescription(matchedItem, enhancementList);

    // Overlay backend-parsed changes/context notes (deduped against what the compendium item
    // already automates, so e.g. Circlet of Persuasion's official change never double-applies).
    applyBuffData(matchedItem, itemChangesMap[buffKeyLc]);

    // Write matched item to localStorage
    writeToLocalStorage(`collected${itemType}s`, [matchedItem]);

    // Append the matched item to the exportTemplate
    appendJsonToTemplate([matchedItem], exportTemplate, itemType);

    // Save the updated exportTemplate back to localStorage
    writeToLocalStorage('exportTemplate', exportTemplate);

    console.log(`Successfully added ${itemType} data to the export template.`);
    return defaultItemNameFlag;  // Ensure the flag is returned

  } catch (error) {
    console.error(`Error reading or processing the ${itemType} Section:`, error);
    return defaultItemNameFlag;  // Ensure the flag is returned
  }
}





//Weapon with default fallback to "Longsword"
await processItem("Weapon", everyWeaponPath, characterData.weapon_name, characterData.weapon_enhancement_chosen_list, "Longsword", 0);

//Armor with default fallback to "Leather Armor"
await processItem("Armor", everyArmorPath, characterData.armor_name, characterData.armor_enhancement_chosen_list, "Leather Armor", 0);

// Slot equipment. Every name in equipment_list becomes an actor item: compendium match when the
// name resolves (exact or parenthesised-variant), otherwise synthesized from the backend's own
// name/description/slot (equip_descrip) — never a substituted default, and a miss never aborts
// the rest of the list.
async function processEquipment(characterData) {
  // Check if equipment_list exists and is an array
  if (!Array.isArray(characterData.equipment_list)) {
    console.error('equipment_list is not an array or is missing');
    return;
  }

  // equip_descrip: {slot: {item_name, description}} -> lowercase name -> {slot, description}
  const detailsByName = {};
  for (const [slot, details] of Object.entries(characterData.equip_descrip || {})) {
    if (details && details.item_name) {
      detailsByName[String(details.item_name).toLowerCase()] = {
        slot,
        description: typeof details.description === 'string' ? details.description.trim() : '',
      };
    }
  }

  for (const item of characterData.equipment_list) {
    await processItem("WondrousItem", everyItemPath, item, '', "", 1,
                      { synthesizeOnMiss: true, detailsByName });
  }
}

// Call the function with the characterData object
await processEquipment(characterData);

// ----- Path of War: maneuver conditionals on the main weapon ----- //
// Each KNOWN strike/boost/counter that has a curated combat modifier (maneuver_changes.json)
// becomes a DEFAULT-OFF conditional modifier on the main weapon's attack action — a toggle the
// player ticks in the attack dialog when they use that maneuver (e.g. "(Strike) Sting of the
// Rattler" adds +1d4 damage). Runs AFTER the weapon item exists in exportTemplate. Stances are
// untouched (they're buffs; their dice damage stays description-only because buff changes can't
// roll per-hit dice).
//
// Resolve THIS character's initiating ability (int/wis/cha) for the save-DC riders: an INITIATOR
// class declares it on its class item (every_class.json `maneuverProgression.initiatorAttr`);
// MARTIAL TRAINING characters get it stamped by applyManeuverProgression() (= resolveInitStat,
// highest mental). pf1-pow reads the same field to roll real maneuver DCs, so our rider DCs match.
function maneuverInitAttr() {
  const cls = (exportTemplate.items || [])
    .filter(i => i.type === 'class')
    .find(c => ['int', 'wis', 'cha'].includes(c?.system?.maneuverProgression?.initiatorAttr));
  return cls ? cls.system.maneuverProgression.initiatorAttr : resolveInitStat();
}
async function addManeuverConditionals() {
  try {
    const known = (characterData.maneuvers_choose_from || []).flat();   // strikes/boosts/counters (no stances)
    const knownStances = characterData.stances_chosen || [];            // stances may carry a damage conditional
    if (!known.length && !knownStances.length) return;
    const table = fileDataDictionary[maneuverChangesPath];
    if (!table || typeof table !== 'object') {
      console.warn('maneuver_changes.json missing or invalid — no maneuver conditionals added.');
      return;
    }
    const byNorm = {};
    for (const [k, v] of Object.entries(table)) byNorm[powNorm(k)] = v;

    // One main weapon per character; prefer the one named by the backend, else the only weapon.
    const weapons = (exportTemplate.items || []).filter(i => i.type === 'weapon');
    const weapon = weapons.find(w => w.name === (characterData.weapon_name || '')) || weapons[0];
    if (!weapon) { console.warn('Path of War: no weapon item to attach maneuver conditionals to.'); return; }
    const action = (weapon.system?.actions || [])[0];
    if (!action) { console.warn(`Path of War: weapon "${weapon.name}" has no attack action — skipping conditionals.`); return; }
    if (!Array.isArray(action.conditionals)) action.conditionals = [];

    const descs = characterData.maneuvers_desc_dict || {};
    // Riders embed the initiation modifier as the token @INITMOD; substitute the character's REAL
    // initiating ability (see maneuverInitAttr) so the rider DC matches pf1-pow's computed DC.
    const init = maneuverInitAttr();
    const subInit = s => String(s == null ? '' : s).replaceAll('@INITMOD', `@abilities.${init}.mod`);
    const seen = new Set(action.conditionals.map(c => c && c.name));
    let added = 0;
    for (const name of known) {
      const entry = byNorm[powNorm(name)];
      if (!entry) continue;
      const rider = typeof entry.rider === 'string' ? entry.rider.trim() : '';
      const hasMods = Array.isArray(entry.modifiers) && entry.modifiers.length;
      if (!rider && !hasMods) continue;   // nothing to attach for this maneuver
      const typeCap = capitalizeManeuverType((descs[name] || {}).type) || 'Strike';
      // The descriptive rider (saves / ability damage / conditions, with [[ ]] inline rolls) rides
      // in the conditional NAME; numeric damage/attack stays in modifiers (which may be empty).
      const condName = rider ? `(${typeCap}) ${name}: ${subInit(rider)}` : `(${typeCap}) ${name}`;
      if (seen.has(condName)) continue;
      seen.add(condName);
      const modifiers = [];
      for (const m of (entry.modifiers || [])) {
        const isAttack = m.target === 'attack';
        let formula = subInit(m.formula);
        // Source-label EVERY modifier (attack AND damage) with the maneuver name so the rolled term
        // shows its source on the card (e.g. "8d6 (Maneuver Name)"). The label is also REQUIRED on
        // attack formulas: a conditional name carrying [[ ]] inline rolls would otherwise make pf1
        // embed the whole name as the term flavor, nest the brackets, and crash the d20 parser. The
        // !/\[.*\]/ guard leaves an already-bracketed formula untouched (no double-label).
        if (formula && !/\[.*\]/.test(formula)) {
          formula = `${formula}[${String(name).replace(/[\[\]]/g, '').trim()}]`;
        }
        modifiers.push({
          _id: (await generateUniqueID()).slice(0, 8),
          formula,
          target: m.target || 'damage',
          subTarget: m.subTarget || (isAttack ? 'allAttack' : 'allDamage'),
          type: m.type || 'untyped',
          damageType: Array.isArray(m.damageType) ? m.damageType : [],
          critical: m.critical || 'normal',
        });
      }
      action.conditionals.push({ _id: (await generateUniqueID()).slice(0, 8), name: condName, default: false, modifiers });
      added++;
    }
    // Stances with a damage/attack modifier (e.g. Savage Stance) become a default-ON weapon
    // conditional — the rolled dice scale off @attributes.hd.total and apply while the stance is
    // active. (Pure-buff stances carry no modifiers and stay buffs via addStanceBuffs.)
    for (const name of knownStances) {
      const entry = byNorm[powNorm(name)];
      if (!entry || !(Array.isArray(entry.modifiers) && entry.modifiers.length)) continue;
      const rider = typeof entry.rider === 'string' ? entry.rider.trim() : '';
      const condName = rider ? `(Stance) ${name}: ${subInit(rider)}` : `(Stance) ${name}`;
      if (seen.has(condName)) continue;
      seen.add(condName);
      const modifiers = [];
      for (const m of (entry.modifiers || [])) {
        const isAttack = m.target === 'attack';
        let formula = subInit(m.formula);
        // Same source-label as strikes: tag attack AND damage with the stance name (shows on the
        // roll; required on attack formulas to avoid bracket-nesting); guard skips already-labeled.
        if (formula && !/\[.*\]/.test(formula)) {
          formula = `${formula}[${String(name).replace(/[\[\]]/g, '').trim()}]`;
        }
        modifiers.push({
          _id: (await generateUniqueID()).slice(0, 8),
          formula,
          target: m.target || 'damage',
          subTarget: m.subTarget || (isAttack ? 'allAttack' : 'allDamage'),
          type: m.type || 'untyped',
          damageType: Array.isArray(m.damageType) ? m.damageType : [],
          critical: m.critical || 'normal',
        });
      }
      action.conditionals.push({ _id: (await generateUniqueID()).slice(0, 8), name: condName, default: true, modifiers });
      added++;
    }
    writeToLocalStorage('exportTemplate', exportTemplate);
    console.log(`Path of War: attached ${added} maneuver/stance conditional(s) to "${weapon.name}".`);
  } catch (error) {
    console.error('Error attaching Path of War maneuver conditionals:', error);
  }
}
await addManeuverConditionals();

// ----- Feat toggles: active-feat conditionals on the main weapon ----- //
// Active feats (Power Attack, Deadly Aim, Piranha Strike, ...) become DEFAULT-OFF conditional
// modifiers on the main weapon's attack action — a toggle the player ticks when they use the feat.
// Clean damage/attack bonuses are structured modifiers; the tradeoff / AC-side rule rides in the
// conditional NAME (with [[ ]] inline rolls). Mirrors addManeuverConditionals; runs after the weapon
// exists. Keyed by feat_conditionals_dict (lowercased feat name -> {name, default, modifiers}).
async function addFeatConditionals() {
  try {
    if (!featConditionalsMap || !Object.keys(featConditionalsMap).length) return;
    const weapons = (exportTemplate.items || []).filter(i => i.type === 'weapon');
    const weapon = weapons.find(w => w.name === (characterData.weapon_name || '')) || weapons[0];
    if (!weapon) { console.warn('Feat toggles: no weapon item to attach conditionals to.'); return; }
    const action = (weapon.system?.actions || [])[0];
    if (!action) { console.warn(`Feat toggles: weapon "${weapon.name}" has no attack action — skipping.`); return; }
    if (!Array.isArray(action.conditionals)) action.conditionals = [];
    const seen = new Set(action.conditionals.map(c => c && c.name));
    let added = 0;
    for (const entry of Object.values(featConditionalsMap)) {
      const condName = (entry && entry.name) || '';
      if (!condName || seen.has(condName)) continue;
      seen.add(condName);
      const modifiers = [];
      for (const m of (entry.modifiers || [])) {
        const isAttack = m.target === 'attack';
        let formula = String(m.formula);
        // Same as maneuvers: source-label attack AND damage with the clean feat name (before the
        // ':' rider text) so the roll shows its source; required on attack formulas to avoid
        // bracket-nesting under a [[ ]]-bearing name. Guard skips already-labeled formulas.
        if (formula && !/\[.*\]/.test(formula)) {
          formula = `${formula}[${condName.split(':')[0].replace(/[\[\]]/g, '').trim()}]`;
        }
        modifiers.push({
          _id: (await generateUniqueID()).slice(0, 8),
          formula,
          target: m.target || 'damage',
          subTarget: m.subTarget || (isAttack ? 'allAttack' : 'allDamage'),
          type: m.type || 'untyped',
          damageType: Array.isArray(m.damageType) ? m.damageType : [],
          critical: m.critical || 'normal',
        });
      }
      action.conditionals.push({ _id: (await generateUniqueID()).slice(0, 8), name: condName, default: false, modifiers });
      added++;
    }
    writeToLocalStorage('exportTemplate', exportTemplate);
    console.log(`Feats: attached ${added} feat toggle conditional(s) to "${weapon.name}".`);
  } catch (error) {
    console.error('Error attaching feat conditionals:', error);
  }
}
await addFeatConditionals();

// ----- Weapon/armor special abilities: mechanics from enhancement_effects_dict ----- //
// Curated quality_effects.json entries (via the backend, keyed by the chosen quality names).
// weapon.*: each quality's `conditionals` attach to the main weapon's attack action — same shape
// and source-labeling as maneuver/feat conditionals (clean dice as modifiers, riders with [[ ]]
// inline rolls in the name) — and its full rules text renders under the WEAPON item. That text
// never reaches the roll: the weapon is inventory-only (processItem sets showInCombat false), and
// the rollable attack twin cloned in createScalingAttackItem() gets a stripped description (pf1
// bakes an item's description into its attack chat card unconditionally, which used to drown
// every roll in text). armor.*/shield.*: `changes`/`contextNotes` overlay the armor/shield item
// via applyBuffData (same target-dedupe as everything else). Runs after the items exist.
async function addEnhancementEffects() {
  try {
    const eff = characterData.enhancement_effects_dict || {};
    const wEff = eff.weapon || {}, aEff = eff.armor || {}, sEff = eff.shield || {};
    if (!Object.keys(wEff).length && !Object.keys(aEff).length && !Object.keys(sEff).length) return;

    // Weapon qualities -> conditionals on the main weapon's attack action
    const weapons = (exportTemplate.items || []).filter(i => i.type === 'weapon');
    const weapon = weapons.find(w => w.name === (characterData.weapon_name || '')) || weapons[0];
    const action = weapon ? (weapon.system?.actions || [])[0] : null;
    // Rules text: every quality renders its full description under the WEAPON item. Safe now that
    // the weapon is never rolled — the rollable attack twin gets a stripped description instead.
    if (weapon) {
      for (const [qName, entry] of Object.entries(wEff)) appendQualityDescription(weapon, qName, entry.description);
    }
    if (Object.keys(wEff).length && weapon && action) {
      if (!Array.isArray(action.conditionals)) action.conditionals = [];
      const seen = new Set(action.conditionals.map(c => c && c.name));
      let added = 0;
      for (const [qName, entry] of Object.entries(wEff)) {
        // Quality not yet curated (description-only safety net): a name-only toggle keeps the
        // quality visible on the roll; its rules text is on the weapon description above.
        const conds = (entry.conditionals || []).length ? entry.conditionals
          : (entry.description ? [{ name: qName, default: true, modifiers: [] }] : []);
        for (const cond of conds) {
          const condName = cond.name || qName;
          if (seen.has(condName)) continue;
          seen.add(condName);
          const modifiers = [];
          for (const m of (cond.modifiers || [])) {
            const isAttack = m.target === 'attack';
            let formula = String(m.formula);
            // Source-label attack AND damage with the clean quality name (before any ':' rider) —
            // shows the source on the roll; required on attack formulas under a [[ ]]-bearing name.
            if (formula && !/\[.*\]/.test(formula)) {
              formula = `${formula}[${condName.split(':')[0].replace(/[\[\]]/g, '').trim()}]`;
            }
            modifiers.push({
              _id: (await generateUniqueID()).slice(0, 8),
              formula,
              target: m.target || 'damage',
              subTarget: m.subTarget || (isAttack ? 'allAttack' : 'allDamage'),
              type: m.type || 'untyped',
              damageType: Array.isArray(m.damageType) ? m.damageType : [],
              critical: m.critical || 'normal',
            });
          }
          action.conditionals.push({
            _id: (await generateUniqueID()).slice(0, 8),
            name: condName,
            default: cond.default !== false,
            modifiers,
          });
          added++;
        }
      }
      console.log(`Enhancements: attached ${added} weapon quality conditional(s) to "${weapon.name}".`);
    }

    // Armor/shield qualities -> changes + context notes + rules text on the armor/shield item
    const equipItems = (exportTemplate.items || []).filter(i => i.type === 'equipment');
    const armorItem = equipItems.find(i => i.system?.subType === 'armor');
    const shieldItem = equipItems.find(i => i.system?.subType === 'shield') || armorItem;
    for (const [qName, entry] of Object.entries(aEff)) {
      applyBuffData(armorItem, entry);
      appendQualityDescription(armorItem, qName, entry.description);
    }
    for (const [qName, entry] of Object.entries(sEff)) {
      applyBuffData(shieldItem, entry);
      appendQualityDescription(shieldItem, qName, entry.description);
    }

    writeToLocalStorage('exportTemplate', exportTemplate);
  } catch (error) {
    console.error('Error attaching enhancement effects:', error);
  }
}
await addEnhancementEffects();

// ----- Item activations: attack-note toggles on the main weapon ----- //
// Wondrous-item attack-target contextNotes (split out of item_changes_dict at itemChangesMap build)
// used to ride the equipment item, so pf1 printed their full activation text on every attack chat
// card. Each becomes a DEFAULT-OFF "(Item Name): <note text>" conditional on the main weapon's
// attack action instead — an opt-in toggle like the feat/maneuver ones. The note text arrives with
// its [[ ]] inline rolls already baked in by build_item_changes.py; modifiers stay empty (name-only
// rider, so no source-labeling is needed). Runs after the weapon exists, like addFeatConditionals.
async function addItemAttackConditionals() {
  try {
    if (!itemAttackToggles.length) return;
    const weapons = (exportTemplate.items || []).filter(i => i.type === 'weapon');
    const weapon = weapons.find(w => w.name === (characterData.weapon_name || '')) || weapons[0];
    if (!weapon) { console.warn('Item toggles: no weapon item to attach conditionals to.'); return; }
    const action = (weapon.system?.actions || [])[0];
    if (!action) { console.warn(`Item toggles: weapon "${weapon.name}" has no attack action — skipping.`); return; }
    if (!Array.isArray(action.conditionals)) action.conditionals = [];
    const seen = new Set(action.conditionals.map(c => c && c.name));
    let added = 0;
    for (const { itemName, text } of itemAttackToggles) {
      // Same display-casing processItem gives the inventory item, so the toggle label matches it.
      const condName = `(${capitalizeWords(itemName)}): ${text}`;
      if (seen.has(condName)) continue;
      seen.add(condName);
      action.conditionals.push({ _id: (await generateUniqueID()).slice(0, 8), name: condName, default: false, modifiers: [] });
      added++;
    }
    writeToLocalStorage('exportTemplate', exportTemplate);
    console.log(`Items: attached ${added} item activation toggle(s) to "${weapon.name}".`);
  } catch (error) {
    console.error('Error attaching item attack conditionals:', error);
  }
}
await addItemAttackConditionals();

// ----- Spell buffs: cast-buff conditionals on the main weapon ----- //
// Bucket-A buff spells (Bless, Divine Favor, Magic Weapon, True Strike, Flame Arrow) become
// DEFAULT-OFF conditional toggles on the main weapon's attack action — the same mechanism as feat
// toggles. spell_changes_dict entries arrive in two shapes: {name, default, modifiers} (one-shot/dice
// buffs — used verbatim) and {changes, contextNotes} (sustained typed bonuses — converted to attack/
// damage modifiers here, with the number wrapped in [[ ]] in the toggle name). Keyed by display-cased
// spell name; already filtered to the NPC's chosen spells by the backend.
async function addSpellConditionals() {
  try {
    const spellChanges = characterData.spell_changes_dict || {};
    if (!Object.keys(spellChanges).length) return;
    const weapons = (exportTemplate.items || []).filter(i => i.type === 'weapon');
    const weapon = weapons.find(w => w.name === (characterData.weapon_name || '')) || weapons[0];
    if (!weapon) { console.warn('Spell buffs: no weapon item to attach conditionals to.'); return; }
    const action = (weapon.system?.actions || [])[0];
    if (!action) { console.warn(`Spell buffs: weapon "${weapon.name}" has no attack action — skipping.`); return; }
    if (!Array.isArray(action.conditionals)) action.conditionals = [];
    const seen = new Set(action.conditionals.map(c => c && c.name));
    let added = 0;
    for (const [spellName, entry] of Object.entries(spellChanges)) {
      if (!entry) continue;
      // Resolve this spell's source modifier list + the toggle's display name.
      let mods, condName;
      if (Array.isArray(entry.modifiers)) {
        mods = entry.modifiers;
        condName = entry.name || spellName;
      } else if (Array.isArray(entry.changes)) {
        const parts = [];
        mods = entry.changes.map(ch => {
          const onAttack = ch.target === 'attack';
          const typeLabel = ch.type && ch.type !== 'untyped' ? ` ${ch.type}` : '';
          parts.push(`+[[${ch.formula}]]${typeLabel} ${onAttack ? 'attack' : 'damage'}`);
          return { formula: ch.formula, target: onAttack ? 'attack' : 'damage',
                   subTarget: onAttack ? 'allAttack' : 'allDamage', type: ch.type || 'untyped',
                   damageType: [], critical: 'normal' };
        });
        condName = `${spellName}: ${parts.join(' & ')}`;
      } else {
        continue;
      }
      // Optional rider text (saves / conditions / combat-maneuver CMB rolls) rides the conditional
      // NAME with its numbers in [[ ]] -- mirrors addManeuverConditionals so spells follow the same
      // house convention. The [label] guard below keeps the attack modifier safe even though the
      // name now carries inline rolls.
      if (entry.rider) {
        const spellItem = (exportTemplate.items || []).find(
          i => i.type === 'spell' && (i.name || '').toLowerCase() === spellName.toLowerCase());
        condName += `; ${subSpellTokens(entry.rider, spellItem)}`;
      }
      if (!condName || seen.has(condName)) continue;
      seen.add(condName);
      const modifiers = [];
      for (const m of (mods || [])) {
        const isAttack = m.target === 'attack';
        let formula = String(m.formula);
        // Same as feats/maneuvers: source-label attack AND damage with the spell name so the roll
        // shows its source; required on attack formulas to avoid bracket-nesting under a [[ ]]-bearing
        // name. Guard skips already-labeled formulas (no double-label).
        if (formula && !/\[.*\]/.test(formula)) {
          formula = `${formula}[${spellName.replace(/[\[\]]/g, '').trim()}]`;
        }
        modifiers.push({
          _id: (await generateUniqueID()).slice(0, 8),
          formula,
          target: m.target || 'damage',
          subTarget: m.subTarget || (isAttack ? 'allAttack' : 'allDamage'),
          type: m.type || 'untyped',
          damageType: Array.isArray(m.damageType) ? m.damageType : [],
          critical: m.critical || 'normal',
        });
      }
      action.conditionals.push({ _id: (await generateUniqueID()).slice(0, 8), name: condName, default: false, modifiers });
      added++;
    }
    writeToLocalStorage('exportTemplate', exportTemplate);
    console.log(`Spells: attached ${added} spell buff toggle(s) to "${weapon.name}".`);
  } catch (error) {
    console.error('Error attaching spell conditionals:', error);
  }
}
await addSpellConditionals();

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
  const cam = sphereWordToAbbrev(trad.casting_ability_modifier) || resolveInitStat();
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
        ch.push({ _id: randomChangeId(), formula: sphereCLExpr(), target: 'spherecl', type: 'untyped', operator: 'add', priority: 0, value: 0 });
        feat.system.changes = ch;
      }
    }
  }
  writeToLocalStorage('exportTemplate', exportTemplate);
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
    const weapons = (exportTemplate.items || []).filter(i => i.type === 'weapon');
    const weapon = weapons.find(w => w.name === (characterData.weapon_name || '')) || weapons[0];
    if (!weapon) { console.warn('Spheres: no weapon to base the Destructive Blast on.'); return; }
    const blast = structuredClone(weapon);
    blast.type = 'attack';
    blast._id = await generateUniqueID();
    blast.name = 'Destructive Blast';
    blast.flags = {};
    blast.system = blast.system || {};
    blast.system.description = { value: '<p><strong>Destructive Blast</strong> (Destruction sphere) &mdash; a ranged or melee touch attack within close range (25 ft + 5 ft / 2 caster levels), subject to spell resistance. Deals <strong>(ceil(CL/2))d6</strong> bludgeoning by default (1d6 for a caster-level-1 dabbler). Blast-type talents (Fire/Frost/Acid/&hellip;) change the damage type and add a save rider; blast-shape talents change the delivery; toggle "Empowered Blast" to spend a spell point for one die per caster level.</p>' };
    const action = (blast.system.actions || [])[0];
    if (!action) { console.warn('Spheres: cloned weapon has no action for the blast.'); return; }
    action._id = await generateUniqueID();
    action.name = 'Destructive Blast';
    action.actionType = 'rwak';
    action.ability = Object.assign({}, action.ability, { attack: 'dex', damage: '', damageMult: 0 });
    action.damage = action.damage || {};
    action.damage.parts = [{ formula: subSpheres('(ceil(@spheres.cl.total / 2))d6'), types: ['bludgeoning'] }];
    action.damage.critParts = [];
    action.damage.nonCritParts = [];
    action.conditionals = [{
      _id: (await generateUniqueID()).slice(0, 8),
      name: '(Destruction) Empowered Blast: spend [[1]] spell point — blast dice increase to one die per caster level',
      default: false,
      modifiers: [{
        _id: (await generateUniqueID()).slice(0, 8),
        formula: subSpheres('(floor(@spheres.cl.total / 2))d6') + '[Empowered Blast]',
        target: 'damage', subTarget: 'allDamage', type: 'untyped', damageType: ['bludgeoning'], critical: 'nonCrit',
      }],
    }];
    appendJsonToTemplate([blast], exportTemplate, 'Attack');
    writeToLocalStorage('exportTemplate', exportTemplate);
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
    const combatByNorm = buildByNorm(fileDataDictionary[combatTalentConditionalsPath]);
    const magicByNorm = buildByNorm(fileDataDictionary[magicTalentConditionalsPath]);

    const weapons = (exportTemplate.items || []).filter(i => i.type === 'weapon');
    const weapon = weapons.find(w => w.name === (characterData.weapon_name || '')) || weapons[0];
    const weaponAction = weapon && (weapon.system?.actions || [])[0];
    const blast = (exportTemplate.items || []).find(i => i.type === 'attack' && i.name === 'Destructive Blast');
    const blastAction = blast && (blast.system?.actions || [])[0];

    let added = 0;
    const attach = async (items, byNorm, isMagic) => {
      for (const t of items) {
        if (!t) continue;
        const sKey = sphereNorm(t.sphere || '');
        const entry = (byNorm[sKey] || {})[sphereNorm(t.name || '')];
        if (!entry) continue;
        // Destruction Power talents ride the Destructive Blast item; everything else the main weapon.
        const action = (isMagic && sKey === 'destruction') ? blastAction : weaponAction;
        if (!action) continue;
        if (!Array.isArray(action.conditionals)) action.conditionals = [];
        const rider = typeof entry.rider === 'string' ? entry.rider.trim() : '';
        const hasMods = Array.isArray(entry.modifiers) && entry.modifiers.length;
        if (!rider && !hasMods) continue;
        const condName = rider
          ? `(${t.sphere}) ${t.name}: ${subSpheres(rider)}`
          : `(${t.sphere}) ${t.name}`;
        if (action.conditionals.some(c => c && c.name === condName)) continue;
        const modifiers = [];
        for (const m of (entry.modifiers || [])) {
          const isAttack = m.target === 'attack';
          let formula = subSpheres(m.formula);
          // Source-label attack AND damage with the talent name (shows the source on the card; required
          // on attack formulas so a [[ ]]-bearing name can't crash the d20 parser). Guard skips labeled.
          if (formula && !/\[.*\]/.test(formula)) {
            formula = `${formula}[${String(t.name).replace(/[\[\]]/g, '').trim()}]`;
          }
          modifiers.push({
            _id: (await generateUniqueID()).slice(0, 8),
            formula,
            target: m.target || 'damage',
            subTarget: m.subTarget || (isAttack ? 'allAttack' : 'allDamage'),
            type: m.type || 'untyped',
            damageType: Array.isArray(m.damageType) ? m.damageType : [],
            critical: m.critical || 'normal',
          });
        }
        action.conditionals.push({
          _id: (await generateUniqueID()).slice(0, 8),
          name: condName,
          default: entry.default === true,
          modifiers,
        });
        added++;
      }
    };
    await attach(combat, combatByNorm, false);
    await attach(magic, magicByNorm, true);
    writeToLocalStorage('exportTemplate', exportTemplate);
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
    const table = fileDataDictionary[talentAuraBuffsPath];
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
        ch, { formula: subSpheres(String(ch.formula ?? '0')), _id: randomChangeId() }));
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
    writeToLocalStorage('exportTemplate', exportTemplate);
    console.log(`Spheres: injected ${buffs.length} affects-others buff(s) tagged (${tag}).`);
  } catch (error) {
    console.error('Error adding sphere aura buffs:', error);
  }
}
// Every buff spell the NPC KNOWS -> an inactive distributable temp buff "<Spell> (TAG)" (parsed from
// spell_buffs.json). Toggle + Multi-Buff Distributor shares it with allies (even Personal/Self spells).
async function addSpellBuffs() {
  try {
    const table = fileDataDictionary[spellBuffsPath];
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
    // medium/long conventions; character level is the CL proxy). Distributor reads this integer.
    const cl = Number(characterData.level) || 1;
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
          ch, { _id: randomChangeId() }));
        const title = `(${tag}) ${name}` + (e.level != null ? ` (level ${e.level})` : '');
        all.push(mkBuff(title, parts.join(''), changes, false, e.contextNotes));
        count++;
      }
    }
    if (!count) return;
    assignSequentialSort(all, 4400);
    appendJsonToTemplate(all, exportTemplate, 'SpellBuffs');
    writeToLocalStorage('exportTemplate', exportTemplate);
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

// ----- Size-based damage scaling ----- //
// Every sheet gets a `sizefordamage` feature whose charge value (default 0) drives the
// "Scaling Weapon Damage" script via @resources.sizefordamage. BOTH the main weapon and a separate
// generated ATTACK item (pf1 "Create Attack" equivalent) carry that script and two actions in order:
//   [0] "Attack"      -- the rollable copy (inherits the weapon's maneuver conditionals);
//   [1] "Don't Touch" -- a duplicate the script reads as the pristine base damage to scale from.

// The feature only PROVIDES the resource (@resources.sizefordamage); the operative script lives on
// the attack item below.
// The Natural AC divider + trackers (Natural Armor HP / hardness / DR items) only belong on
// sheets that actually HAVE natural armor. Sources checked: the Strength of a Warrior homebrew
// feat (Str/Con variants — any feat bucket, or bundled as a feat-tax child), racial natural
// armor (the race item ships a change targeting 'nac'), an Amulet of Natural Armor in the
// equipment, or any backend buff-dict change targeting 'nac'.
// (memoized on the function itself — updateClassFeatures calls this before this file position
// executes, so a `let` cache here would still be in its temporal dead zone)
function characterHasNaturalArmor() {
  if (characterHasNaturalArmor._cache !== undefined) return characterHasNaturalArmor._cache;
  const isSoaW = (n) => String(n).toLowerCase().startsWith('strength of a warrior');
  const featLists = [
    characterData.feats, characterData.class_feats, characterData.story_feats,
    characterData.flaw_feats, characterData.flavor_feats, characterData.teamwork_feats,
    characterData.bloodline_feats, characterData.trainer_feats, characterData.profession_feats,
    characterData.sphere_feats, characterData.mt_feats,
  ];
  let has = featLists.some((l) => Array.isArray(l) && l.some(isSoaW));
  if (!has) {
    const taxDicts = [
      characterData.story_feat_tax_dict, characterData.flaw_feat_tax_dict,
      characterData.flavor_feat_tax_dict, characterData.class_feat_tax_dict,
      characterData.feats_feat_tax_dict, characterData.trainer_feat_tax_dict,
    ];
    has = taxDicts.some((d) => d && typeof d === 'object' &&
      Object.values(d).some((children) => Array.isArray(children) && children.some(isSoaW)));
  }
  if (!has && Array.isArray(characterData.equipment_list)) {
    has = characterData.equipment_list.some((e) => /amulet of natural armor/i.test(String(e)));
  }
  if (!has) {
    const raceItems = extractItems(fileDataDictionary[everyRacePath]) || [];
    const raceItem = raceItems.find((item) => item.name === characterData.chosen_race);
    has = !!raceItem?.system?.changes?.some((c) => c && c.target === 'nac');
  }
  if (!has) {
    const changeDicts = [
      characterData.feat_changes_dict, characterData.class_feature_changes_dict,
      characterData.item_changes_dict,
    ];
    has = changeDicts.some((d) => d && typeof d === 'object' && Object.values(d).some(
      (v) => Array.isArray(v?.changes) && v.changes.some((c) => c && c.target === 'nac')));
  }
  characterHasNaturalArmor._cache = has;
  console.log(`Natural armor detected: ${has} — Natural AC section ${has ? 'kept' : 'omitted'}.`);
  return has;
}

// House tracker features (Damage Dice Progression, Natural Armor HP items, Death HP Pool, ...)
// cloned verbatim from house_features.json — sorts are baked in so each lands under its group
// divider (Variable Modifiers / Natural AC / Death HP) exactly like the template actor.
// Natural-armor tracker items are skipped for characters with no natural armor.
async function addHouseFeatures() {
  try {
    let features = fileDataDictionary[houseFeaturesPath];
    if (!Array.isArray(features) || !features.length) {
      console.warn('House features: house_features.json missing or empty — skipping.');
      return;
    }
    if (!characterHasNaturalArmor()) {
      features = features.filter((f) => !/natural\s*a(c|rmor)/i.test(String(f?.name)));
    }
    const clones = [];
    for (const f of features) {
      const clone = structuredClone(f);
      clone._id = await generateUniqueID();
      clones.push(clone);
    }
    appendJsonToTemplate(clones, exportTemplate, 'Feature');
    writeToLocalStorage('exportTemplate', exportTemplate);
    console.log(`Added ${clones.length} house tracker feature(s) (Variable Modifiers / Natural AC / Death HP groups).`);
  } catch (error) {
    console.error('Error adding house tracker features:', error);
  }
}
await addHouseFeatures();

async function addSizeForDamageFeature() {
  try {
    const feature = structuredClone(fileDataDictionary[sizeForDamageFeaturePath]);
    feature._id = await generateUniqueID();
    // Pin it into the "Variable Modifiers" group (template actor slot), just under its divider.
    feature.sort = 121680;
    appendJsonToTemplate([feature], exportTemplate, 'Feature');
    writeToLocalStorage('exportTemplate', exportTemplate);
    console.log(`Added sizefordamage feature (sort ${feature.sort}, Variable Modifiers group).`);
  } catch (error) {
    console.error('Error adding sizefordamage feature:', error);
  }
}
await addSizeForDamageFeature();

async function createScalingAttackItem() {
  try {
    const weapons = (exportTemplate.items || []).filter(i => i.type === 'weapon');
    const weapon = weapons.find(w => w.name === (characterData.weapon_name || '')) || weapons[0];
    if (!weapon) { console.warn('Scaling: no weapon item.'); return; }
    const srcActions = (weapon.system && weapon.system.actions) || [];
    if (!srcActions.length) { console.warn(`Scaling: weapon "${weapon.name}" has no action — skipping.`); return; }

    // "Don't Touch" = a copy of the rollable action that the Scaling Weapon Damage script reads as
    // the pristine base damage (actions[1]); a fresh script-call clone (reads @resources.sizefordamage).
    const dontTouchFrom = async (a0) => {
      const a1 = structuredClone(a0);
      a1._id = await generateUniqueID();
      a1.name = "Don't Touch";
      return a1;
    };
    const freshScript = async () => {
      const sc = structuredClone(fileDataDictionary[scalingWeaponDamagePath]);
      sc._id = (await generateUniqueID()).slice(0, 8);
      return sc;
    };

    // The WEAPON itself keeps the 2-action + script setup so it still scales if someone rolls it
    // manually from inventory (it is no longer in the Combat tab — showInCombat false).
    srcActions[0].name = 'Attack';
    weapon.system.actions = [srcActions[0], await dontTouchFrom(srcActions[0])];
    weapon.system.scriptCalls = [await freshScript()];

    // The attack-type twin is the ONLY Combat-tab entry and thus what actually gets rolled
    // (same setup, fresh ids so nothing collides).
    const attack = structuredClone(weapon);
    attack.type = 'attack';
    attack._id = await generateUniqueID();
    // pf1's Combat tab sections attack items by ATTACK subType (weapon/natural/ability/...); the
    // clone carries the WEAPON's subType ("simple"/"martial"), which matches no section, so the twin
    // existed on the actor but never rendered — players had to click "Create Attack" themselves.
    // Mirror what pf1's own Create Attack produces: subType "weapon", proficient.
    attack.system.subType = 'weapon';
    attack.system.proficient = true;
    // pf1 bakes an item's description into its attack chat card unconditionally, so the twin
    // carries only the one-line special-abilities summary — the full formatted rules text stays
    // on the inventory weapon item.
    if (attack.system?.description) {
      attack.system.description.value = "";
      appendEnhancementsToDescription(attack, characterData.weapon_enhancement_chosen_list);
    }
    const aAttack = structuredClone(weapon.system.actions[0]);
    aAttack._id = await generateUniqueID();
    aAttack.name = 'Attack';
    attack.system.actions = [aAttack, await dontTouchFrom(aAttack)];
    attack.system.scriptCalls = [await freshScript()];

    appendJsonToTemplate([attack], exportTemplate, 'Attack');
    writeToLocalStorage('exportTemplate', exportTemplate);
    console.log(`Scaling: weapon "${weapon.name}" + attack item set up (Attack + Don't Touch + Scaling Weapon Damage).`);
  } catch (error) {
    console.error('Error in scaling weapon/attack setup:', error);
  }
}
await createScalingAttackItem();

// ----- Numeric enhancement bonus (+N): stamp and rename ----- //
// weapon_/armor_/shield_enhancement_bonus (1-5; 0 = none) is the backend budget leftover after
// buying qualities. Weapons get system.enh, armor/shields get system.armor.enh, all get
// masterwork, and the item is renamed "+N <Qualities> <Base Name>" (e.g. "+1 Corrosive
// Longsword"). MUST run after every other weapon/armor step: earlier attach functions find the
// weapon by characterData.weapon_name, and the scaling attack item clones the weapon — both
// twins are renamed here together.
async function applyEnhancementBonuses() {
  try {
    const items = exportTemplate.items || [];
    let stamped = 0;
    const stamp = (item, bonus, qualities, isWeapon) => {
      if (!item || !item.system || !(bonus > 0)) return;
      if (isWeapon) item.system.enh = bonus;
      else if (item.system.armor) item.system.armor.enh = bonus;
      item.system.masterwork = true;
      item.name = ['+' + bonus, ...(Array.isArray(qualities) ? qualities : []), item.name].join(' ');
      stamped++;
    };

    const weaponItems = items.filter(i => i.type === 'weapon');
    const mainWeapon = weaponItems.find(w => w.name === (characterData.weapon_name || '')) || weaponItems[0];
    if (mainWeapon) {
      const twins = items.filter(i => (i.type === 'weapon' || i.type === 'attack') && i.name === mainWeapon.name);
      for (const t of twins) {
        stamp(t, Number(characterData.weapon_enhancement_bonus) || 0,
              characterData.weapon_enhancement_chosen_list, true);
      }
    }

    const equipItems = items.filter(i => i.type === 'equipment');
    stamp(equipItems.find(i => i.system?.subType === 'armor'),
          Number(characterData.armor_enhancement_bonus) || 0,
          characterData.armor_enhancement_chosen_list, false);
    stamp(equipItems.find(i => i.system?.subType === 'shield'),
          Number(characterData.shield_enhancement_bonus) || 0,
          characterData.shield_enhancement_chosen_list, false);

    writeToLocalStorage('exportTemplate', exportTemplate);
    console.log(`Enhancement bonuses: stamped +N on ${stamped} item(s).`);
  } catch (error) {
    console.error('Error applying enhancement bonuses:', error);
  }
}
await applyEnhancementBonuses();

// ----- End of Weapon/Armor Section ----- //
async function check_ammo() {
  const collectedWeapons = JSON.parse(localStorage.getItem('collectedWeapons')); // Parse the JSON string

    console.log("collectedWeapons:", collectedWeapons[0].system.ammo.type);
  // Check if collectedWeapons, its system property, and ammo exist
  if (!collectedWeapons[0] || !collectedWeapons[0].system || !collectedWeapons[0].system.ammo || !collectedWeapons[0].system.ammo.type) {
    console.log("No ammo found or ammo type is missing. Ending function.");
    return; // End the function
  }

  // Access the ammo type
  const ammo_type = collectedWeapons[0].system.ammo.type;
  console.log("Ammo type:", ammo_type);

  // Continue with the rest of the function
  select_random_ammo(ammo_type);
}


// ----- Start of Ammo Section ----- //
async function select_random_ammo(ammo_type) {
  // Retrieve the weapons data from the fileDataDictionary
  const weapons = fileDataDictionary[everyWeaponPath];

  // Check if weapons is an array
  if (!Array.isArray(weapons)) {
    console.error('Weapons data is not an array or is undefined:', weapons);
    return;
  }

  // Filter weapons where subType is "ammo" and extraType matches ammo_type
  const filteredAmmo = weapons.filter(
    weapon => weapon.system.subType === "ammo" && weapon.system.extraType === ammo_type
  );

  // Check if any matching ammo was found
  if (filteredAmmo.length === 0) {
    console.warn(`No ammo found with subType "ammo" and extraType "${ammo_type}".`);
    return;
  }

  // Select a random ammo from the filtered list
  const randomAmmo = filteredAmmo[Math.floor(Math.random() * filteredAmmo.length)];

  // Log the selected ammo
  console.log("Selected random ammo:", randomAmmo);

  // Perform any additional actions with the selected ammo
  writeToLocalStorage('selectedAmmo', randomAmmo);
  appendJsonToTemplate([randomAmmo], exportTemplate, "Ammo");
  writeToLocalStorage('exportTemplate', exportTemplate);
}

await check_ammo();

// ----- End of Ammo Section ----- //




// ----- Start of Skills Section ----- //

const skillsDict = {
  // "Pull_name": "Foundry_name"
  acrobatics: "acr",
  appraise: "apr",
  artistry: "art",
  bluff: "blf",
  climb: "clm",
  craft: "crf",
  diplomacy: "dip",
  "disable device": "dev",
  disguise: "dis",
  "escape artist": "esc",
  fly: "fly",
  "gather information": "gai",
  "handle animal": "han",
  heal: "hea",
  intimidate: "int",
  "knowledge arcana": "kar",
  "knowledge dungeoneering": "kdu",
  "knowledge engineering": "ken",
  "knowledge geography": "kge",
  "knowledge history": "khi",
  "knowledge local": "klo",
  "knowledge nature": "kna",
  "knowledge nobility": "kno",
  "knowledge planes": "kpl",
  "knowledge religion": "kre",
  linguistics: "lin",
  perception: "per",
  perform: "prf",
  profession: "pro",
  ride: "rid",
  "sense motive": "sen",
  "sleight of hand": "slt",
  spellcraft: "spl",
  stealth: "ste",
  survival: "sur",
  swim: "swm",
  "use magic device": "umd",
};

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

async function createUpdatedSkills(updatedCharacterData, baseSkillPathData, professions, craftType) {
  // Craft/Perform/Profession are pf1e "container" skills: their ranks must live under
  // .subSkills (e.g. crf.subSkills.crf1.rank), not on the container's own rank.
  const CONTAINERS = { crf: "Craft", prf: "Perform", pro: "Profession" };

  for (let skill in updatedCharacterData) {
    const rank = updatedCharacterData[skill];
    const parent = baseSkillPathData[skill];
    if (!parent) continue; // unmapped skill (e.g. "lore") -> skip

    if (CONTAINERS[skill]) {
      parent.rank = 0; // ranks live on the subskill, not the container

      if (skill === "pro" && Array.isArray(professions) && professions.length) {
        // One subskill per chosen profession ("Profession: <name>"), ranks split evenly
        // (the remainder lands on the first professions). Driven by the professions list so
        // every chosen profession shows up, even when Profession has 0 total ranks.
        parent.subSkills = parent.subSkills || {};
        const n = professions.length;
        const base = Math.floor(rank / n);
        const remainder = ((rank % n) + n) % n; // guard against a stray negative rank
        for (let i = 0; i < n; i++) {
          parent.subSkills["pro" + (i + 1)] = {
            name: "Profession: " + professions[i],
            ability: parent.ability,
            rt: parent.rt,
            acp: parent.acp,
            rank: base + (i < remainder ? 1 : 0)
          };
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

  // Instead of using fs, use localStorage to store the updated skill data
  writeToLocalStorage('collectedSkills', baseSkillPathData);
}

async function overwriteData(collectedData) {
  // Need to parse the data, otherwise it is not in the right format
  const parsedSkills = JSON.parse(collectedData);
  // Directly modifying Export Template stored in localStorage
  exportTemplate.system.skills = parsedSkills;
  // Save the updated exportTemplate back to localStorage
  writeToLocalStorage('exportTemplate', exportTemplate);
}

// Load the collected skills into an accessible object
try {
  const updatedCharacterData = await convertSkillNames(characterData.skill_ranks, skillsDict);
  // Chosen professions name the Profession subskill (otherwise this field is bio-only).
  let professions = characterData.professions;
  if (typeof professions === 'string') {
    try { professions = JSON.parse(professions); } catch (e) { professions = [professions]; }
  }
  const baseSkillTemplate = fileDataDictionary[baseSkillPath]; // Example, replace with your actual path
  // Now we have a JSON object with the proper names and ranks -> need to update the skills
  await createUpdatedSkills(updatedCharacterData, baseSkillTemplate, professions, characterData.craft_type);
  // Now that we have updated skills -> need to overwrite the export file (stored in localStorage)
  await overwriteData(localStorage.getItem('collectedSkills'));
} catch (error) {
  console.error("Error in skills processing:", error);
  console.log("characterData.skill_ranks:", characterData.skill_ranks);
  console.log("skillsDict:", skillsDict);
  console.log("baseSkillPath:", baseSkillPath);
}

// pf1 v11 stores item "trait" group fields (weaponGroups, weaponProf, armorProf, languages,
// descriptors, subschool, creatureTypes, creatureSubtypes) as BARE ARRAYS of keys; its item
// prepareData (item-pf.mjs) only builds the iterable { standard, custom } model when the stored
// value is an array. The harvested templates carry legacy pf1 v10 OBJECT shapes ({base:[...]} /
// {value,custom}), which the v11 model leaves untouched -> trait.standard is undefined and opening
// the item sheet throws "a.standard is not iterable". Normalize every injected item's trait fields
// back to bare arrays here (item-type-agnostic; matches Foundry-native items) before export.
const TRAIT_FIELDS = ['weaponGroups', 'weaponProf', 'armorProf', 'languages',
                      'descriptors', 'subschool', 'creatureTypes', 'creatureSubtypes'];
function toTraitArray(v) {
  if (v == null || Array.isArray(v)) return v;          // null / already a bare array -> leave
  if (typeof v === 'string') return [v];                // single value -> [value]
  if (typeof v === 'object') {                          // {base} | {value,custom} | {standard,custom}
    const out = [];
    for (const k of ['base', 'value', 'standard', 'custom']) {
      if (Array.isArray(v[k])) out.push(...v[k]);
    }
    return out;
  }
  return v;
}
function normalizeItemTraits(item) {
  const s = item?.system;
  if (!s) return;
  for (const k of TRAIT_FIELDS) if (k in s) s[k] = toTraitArray(s[k]);
}
if (exportTemplate && Array.isArray(exportTemplate.items)) {
  for (const it of exportTemplate.items) normalizeItemTraits(it);
}

// Rewriting the export file directly (with export template)
console.log("About to write exportFoundryPath to localStorage");
console.log("exportTemplate exists:", !!exportTemplate);
console.log("exportTemplate:", exportTemplate);

if (exportTemplate) {
  writeToLocalStorage('exportFoundryPath', exportTemplate);
  console.log("Successfully wrote exportFoundryPath to localStorage");
} else {
  console.error("exportTemplate is undefined! Cannot write to localStorage.");
  console.log("Available fileDataDictionary keys:", Object.keys(fileDataDictionary));
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