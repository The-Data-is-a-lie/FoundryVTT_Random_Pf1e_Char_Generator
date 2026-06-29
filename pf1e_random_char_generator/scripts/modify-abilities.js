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


        // Let for these so we can reassign at WILL
    let everyClassPath, everyFeatPath, everySpellPath, everyWeaponPath, everyTraitPath, baseFeatPath;

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
      inherentsPath,
      inherents2Path,
      customBuffsPath,
      sizeForDamageFeaturePath,
      scalingWeaponDamagePath,
    ]

    // Create a dictionary to hold all the file dictionaries
    const fileDataDictionary = {};

    // Reads the JSON file and turns it into a data object
    async function readFile(filePath) {
      const predata = await fetch(filePath);
      return await predata.json();
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
const prepared_caster_list = ["Alchemist", "Bard", "Cleric", "Druid", "Inquisitor", "Investigator", "Magus", "Paladin", "Ranger", "Summoner", "Summoner (Unchained)", "Skald", "Warpriest", "Wizard", "Witch"]
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
   updateAttribute(characterData.deity_name, exportTemplate.system.details, 'deity');
   updateAttribute(characterData.age_number, exportTemplate.system.details, 'age');

   // Currency
   updateAttribute(characterData.platnium, exportTemplate.system.currency, 'pp');

   // Background info
   updateAttribute(characterData.character_full_name, exportTemplate, 'name');
   updateAttribute(characterData.language_text, exportTemplate.system.traits.languages, 'value');
   updateAttribute(characterData.gender, exportTemplate.system.details, 'gender');
   updateAttribute(characterData.height_number, exportTemplate.system.details, 'height');
   updateAttribute(characterData.weight_number, exportTemplate.system.details, 'weight');

  // Edit token name
   updateAttribute(characterData.character_full_name, exportTemplate.prototypeToken, 'name');

   // Fixing Casting level
  updateAttribute(characterData.casting_level_str_foundry, exportTemplate.system.attributes.spells.spellbooks.primary, 'casterType');
  updateAttribute(characterData.casting_level_str_foundry, exportTemplate.system.attributes.spells.spellbooks.secondary, 'casterType');

  // Fixing casting stat
  updateAttribute(characterData.main_stat, exportTemplate.system.attributes.spells.spellbooks.primary, 'ability');
  updateAttribute(characterData.main_stat, exportTemplate.system.attributes.spells.spellbooks.secondary, 'ability');
    
  console.log("this is the casting level", characterData.casting_level_str_foundry);
  //  Arcane spell failure
  // Define divine casters
  const divine_casters = ["Cleric", "Druid", "Oracle", "Paladin", "Ranger", "Summoner", "Warpriest"];

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

   // Biography = the coherent prose backstory (when the backend supplied one); the raw labeled
   // field-by-field details move to the Notes tab. Fall back to the raw dump in Biography if no
   // backstory was generated (e.g. an un-redeployed backend), so nothing regresses.
   const backstoryText = (characterData.backstory || '').trim();
   if (backstoryText) {
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

processClass(upper_case_class, characterData.level, class_list);

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
async function processArchetype(targetArchetype) {
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

  console.log("characterData.archetype_info", targetArchetype);
  // Validate targetArchetype is an object
  if (!targetArchetype || typeof targetArchetype !== 'object') {
      console.error("Invalid targetArchetype:", targetArchetype);
      return;
  }

  console.log("characterData.archetype_info", characterData.archetype_info);

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

await processArchetype(characterData.archetype_info);



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


async function updateClassFeatures(fileDataDictionary, classFeatures) {
  console.log("****************** starting class features ******************");
  console.log("characterData", characterData);
  console.log("classFeatures:", classFeatures);
  console.log("characterData.class_features", characterData.class_features);
  if (!fileDataDictionary || typeof fileDataDictionary !== 'object' || !classFeatures || typeof classFeatures !== 'object') {
      console.error("Invalid input data.");
      return;
  }

  // Iterate through each feature entry
  for (const [key, featureData] of Object.entries(classFeatures)) {
      if (!featureData || typeof featureData !== 'object') {
          console.warn(`Skipping invalid feature at key: ${key}`);
          continue;
      }

      console.log(`Processing feature key: ${key}, Data:`, featureData);

      // Deep clone the fileDataDictionary before modification to avoid unintended changes
      const feature = JSON.parse(stableStringify(fileDataDictionary));
      // The base feat template carries a hardcoded _id, so every clone would share it and Foundry
      // would collapse all these class-feature items into a single embedded item on actor.update().
      // Give each its own unique id so they all render (Trainers/Professions/Skill Unlock, etc.).
      feature._id = await generateUniqueID();
      feature.name = key;
      // this text is usually stored as an object, we need to convert it to a string

      console.log("feature valuue:", feature.system.description.value)

      feature.system.description.value = convertToStringSimple(key, featureData);

      console.log("feature value after:", feature.system.description.value)

      // methods for each set of class features (to make them look nicer)



      writeToLocalStorage('updatedFeature', feature); 
      // Append the feature to the exportTemplate
      appendJsonToTemplate([feature], exportTemplate, "classFeature");
      // Save the updated exportTemplate back to localStorage
      writeToLocalStorage('exportTemplate', exportTemplate);


      // Really good way to log all the data to see if discrepancy between printed and exported data
      // console.log("exportTemplate After saving:", JSON.stringify(exportTemplate, null, 2));
  }
}




// Append new class feature data
await updateClassFeatures(fileDataDictionary[baseFeatPath], characterData.class_features);

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
  const buff = featChangesMap[itemLc];
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
    item.system.contextNotes = existing.concat(buff.contextNotes);
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
  // Traits section
  await processFeatTrait(everyTraitPath, characterData.selected_traits, 'trait');
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

// Inline feat-section divider (no template file needed): a subType:"feat" item with an underscore
// name, sorted into place. Used to head the Trainers / Professions blocks at the bottom of Feats.
async function appendFeatDivider(title, sort) {
  const div = synthesizeFeatItem(title, "");
  div.sort = sort;
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
    const parts = [];
    if (tradition && tradition.casting_ability_modifier) parts.push(`<p><strong>Casting ability:</strong> ${tradition.casting_ability_modifier}</p>`);
    if (Number(manaPool) > 0) parts.push(`<p><strong>Spell points (mana pool):</strong> ${manaPool}</p>`);
    const dbs = (tradition && tradition.drawbacks) || [];
    const boons = (tradition && tradition.boons) || [];
    if (dbs.length) parts.push(`<p><strong>Drawbacks:</strong> ${dbs.join(', ')}</p>`);
    if (boons.length) parts.push(`<p><strong>Boons:</strong> ${boons.join(', ')}</p>`);
    if (parts.length) built.push(synthesizeFeatItem(`Spheres Casting (mana pool ${Number(manaPool) || 0})`, parts.join('')));
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
async function determineSpellType(){
  let type = 'prepared';
  console.log("this is upper_case_class ", upper_case_class);
  
  // Convert upper_case_class to uppercase for a case-insensitive check
  const prepared_caster_list_upper = prepared_caster_list.map(c => c.toUpperCase());
  
  // Check if upper_case_class is in the list (case insensitive)
  if (prepared_caster_list_upper.includes(upper_case_class.toUpperCase())) {
    console.log("Prepared Casters");
    type = "prepared";
  }
  // // Arcanist
  else if (["Arcanist".toUpperCase()].includes(upper_case_class.toUpperCase())) {
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




async function processSpell(everySpellPath, spellListChooseFrom) {
  try {
    // Ensure only for characters with spells
    if (!characterData.spell_list_choose_from || characterData.spell_list_choose_from.length === 0) {
      console.error(`Character class ${characterData.c_class} cannot cast spells.`);
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

    // Consolidate all matched spells from the nested spell list
    const allMatchedSpells = [];

    for (const spellArray of spellListChooseFrom) {
      for (const spell of spellArray) {
        const matchedSpell = spells.find(r => r.name === spell);
        if (matchedSpell) {
          // Ensure consistent structure (array format)
          allMatchedSpells.push(matchedSpell);
        } else {
          console.warn(`Spell "${spell}" not found.`);
        }
      }
    }

    if (allMatchedSpells.length > 0) {
      // Write matched spells to localStorage (not file system)
      writeToLocalStorage('collectedSpells', allMatchedSpells);

      // Mark the spellbook as in use and specify the caster class
      exportTemplate.system.attributes.spells.spellbooks.primary.inUse = true;
      exportTemplate.system.attributes.spells.spellbooks.primary.class = characterData.c_class;

      // Determine SpellType and Assign spellType
      const type = await determineSpellType();
      await assignSpellTypes(type);

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

// Example usage
await processSpell(everySpellPath, characterData.spell_list_choose_from);

// ----- Spell riders: save + non-damage riders on Bucket-B attack spells ----- //
// Damaging touch-attack spells (Chill Touch, Frigid Touch, Acid Arrow) already carry their attack +
// damage from every_spell.json; the backend's spell_riders_dict adds the formal save (only if the
// compendium action has none) and the non-damage riders (ability damage, conditions, ongoing damage)
// as default-on text conditionals with the numbers in [[ ]]. Keyed by display-cased spell name.
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
            const name = String(riderText);
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
// Function to append enhancements to description
async function appendEnhancementsToDescription(item, enhancements) {
  if (item.system && item.system.description) {
    const enhancementText = (Array.isArray(enhancements) ? enhancements : [])
      .map(enhancement => `<li>${enhancement}</li>`)
      .join('');
    const message = enhancementText ? 
                    `<p>These are the enhancements: </p><ul>${enhancementText}</ul>` : 
                    '';
    
    // Add enhancements only once
    if (!item.system.description.value.includes(message)) {
      item.system.description.value += message;
    }
  }
}

async function processItem(itemType, everyItemPath, itemName, enhancementList, defaultItemName, defaultItemNameFlag = 0) {
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

    // Retrieve the items data from the fileDataDictionary
    const items = fileDataDictionary[everyItemPath];

    // Check if the items data is an array
    if (!Array.isArray(items)) {
      console.error(`${itemType} data is not an array or is undefined:`, items);
      return defaultItemNameFlag;  // Ensure the flag is returned
    }

    console.log(`${itemType} data structure`, JSON.stringify(itemName, null, 2));

    // Find the matching item from the items data
    const matchedItem = items.find(r => r.name === itemName);
    if (!matchedItem) {
      console.warn(`${itemType} "${itemName}" not found, using default item.`);
      // Try to use the default item if the selected one is not found
      const defaultMatchedItem = items.find(r => r.name === defaultItemName);
      if (defaultMatchedItem) {
        if (defaultItemNameFlag === 0) {
          // Set the proficient section to true
          defaultMatchedItem.system.proficient = true;
          // Weapons must opt into the Combat (Attacks) tab — pf1 v11 filters that section on
          // system.showInCombat (no equipped check), so without this the weapon is inventory-only.
          if (itemType === "Weapon") defaultMatchedItem.system.showInCombat = true;

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
    // Weapons must opt into the Combat (Attacks) tab — pf1 v11 filters that section on
    // system.showInCombat (no equipped check), so without this the weapon is inventory-only.
    if (itemType === "Weapon") matchedItem.system.showInCombat = true;

    // Append enhancements to the item (only once)
    console.log(matchedItem);
    appendEnhancementsToDescription(matchedItem, enhancementList);

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

//Wondrous item with default fallback to "Cloak of Resistance +3"
async function processEquipment(characterData) {
  // Initialize defaultItemNameFlag before the loop
  let defaultItemNameFlag = 0;    

  // Check if equipment_list exists and is an array
  if (Array.isArray(characterData.equipment_list)) {
    // Loop through each item in the equipment list using for...of
    for (const item of characterData.equipment_list) {
      console.log("defaultItemNameFlag pre loop:", defaultItemNameFlag);
      // Pass the updated defaultItemNameFlag and receive the new one
      defaultItemNameFlag = await processItem("WondrousItem", everyItemPath, item, '', "Cloak of Resistance +3", defaultItemNameFlag);
      console.log("defaultItemNameFlag post loop:", defaultItemNameFlag);

      // Stop if the default item has been added (flag = 1)
      if (defaultItemNameFlag === 1) {
        console.log("Default item has been added, skipping further iterations.");
        break;
      }
    }
  } else {
    console.error('equipment_list is not an array or is missing');
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
      if (entry.rider) condName += `; ${String(entry.rider)}`;
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

// ----- Size-based damage scaling ----- //
// Every sheet gets a `sizefordamage` feature whose charge value (default 0) drives the
// "Scaling Weapon Damage" script via @resources.sizefordamage. BOTH the main weapon and a separate
// generated ATTACK item (pf1 "Create Attack" equivalent) carry that script and two actions in order:
//   [0] "Attack"      -- the rollable copy (inherits the weapon's maneuver conditionals);
//   [1] "Don't Touch" -- a duplicate the script reads as the pristine base damage to scale from.

// The feature only PROVIDES the resource (@resources.sizefordamage); the operative script lives on
// the attack item below.
async function addSizeForDamageFeature() {
  try {
    const feature = structuredClone(fileDataDictionary[sizeForDamageFeaturePath]);
    feature._id = await generateUniqueID();
    // Pin it to the BOTTOM of the Class Features section. pf1 orders each section ascending by sort
    // (e.sort - t.sort), so give it a sort just above the largest existing class feature.
    const maxSort = Math.max(0, ...(exportTemplate.items || [])
      .filter(i => i.type === 'feat' && i.system && i.system.subType === 'classFeat')
      .map(i => Number(i.sort) || 0));
    feature.sort = maxSort + 1000000;
    appendJsonToTemplate([feature], exportTemplate, 'Feature');
    writeToLocalStorage('exportTemplate', exportTemplate);
    console.log(`Added sizefordamage feature (sort ${feature.sort}, bottom of Class Features).`);
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

    // The WEAPON itself gets the 2-action + script setup so it scales while shown in the Combat tab.
    srcActions[0].name = 'Attack';
    weapon.system.actions = [srcActions[0], await dontTouchFrom(srcActions[0])];
    weapon.system.scriptCalls = [await freshScript()];

    // Plus a separate attack-type item alongside the weapon (same setup, fresh ids so nothing collides).
    const attack = structuredClone(weapon);
    attack.type = 'attack';
    attack._id = await generateUniqueID();
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





} catch (error) {
   console.error("Error in main function:", error);
 }
}