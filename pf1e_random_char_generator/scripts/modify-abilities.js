async function main() {
  try {
    // Retrieve the module dynamically using the module name
    const module = game.modules.get('pf1e_random_char_generator');
    if (!module) {
      console.error("Module 'pf1e_random_char_generator' not found.");
      return;
    }

    // ----- Setting up filePaths ----- //

    // char_sheet_folder Base
    const charSheetBase = await FilePicker.browse('data', 'modules/pf1e_random_char_generator/templates/character_sheet_folder'); 
    // base_folder Base
    const base = await FilePicker.browse('data', 'modules/pf1e_random_char_generator/templates/base_folder'); 
    // collected items Base
    const collectedBase = await FilePicker.browse('data', 'modules/pf1e_random_char_generator/templates/collected_folder'); 

    // char_sheet_folders
    const unmodifiedPreExportTemplatePath = charSheetBase.target + "/unmodified_pre_export_template.json";
    const preExportTemplatePath = charSheetBase.target + "/pre_export_template.json";
    const everyArmorPath = charSheetBase.target + "/every_armor.json";
    const everyClassPath = charSheetBase.target + "/every_class.json";
    const everyFeatPath = charSheetBase.target + "/every_feat.json";
    const everyRacePath = charSheetBase.target + "/every_race.json";
    const everySpellPath = charSheetBase.target + "/every_spell.json";
    const everyTraitPath = charSheetBase.target + "/every_trait.json";
    const everyWeaponPath = charSheetBase.target + "/every_weapon.json";

    // base_folder
    const baseFeatPath = base.target + "/base_feat.json";
    const baseskillPath = base.target + "/base_skill.json";
    

    // manual filePaths
    const filePaths = [
      unmodifiedPreExportTemplatePath,
      preExportTemplatePath,
      everyArmorPath,
      everyClassPath,
      everyFeatPath,
      everyRacePath,
      everySpellPath,
      everyTraitPath,
      everyWeaponPath,
      baseFeatPath,
      baseskillPath,
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

// console.log("fileDataDictionary", fileDataDictionary);


// ----- End of setting up filePaths ----- //



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

   // Stats
   updateAttribute(characterData.str, exportTemplate.system.abilities.str, 'value');
   updateAttribute(characterData.dex, exportTemplate.system.abilities.dex, 'value');
   updateAttribute(characterData.con, exportTemplate.system.abilities.con, 'value');
   updateAttribute(characterData.int, exportTemplate.system.abilities.int, 'value');
   updateAttribute(characterData.wis, exportTemplate.system.abilities.wis, 'value');
   updateAttribute(characterData.cha, exportTemplate.system.abilities.cha, 'value');

   // Saving Throws
   updateAttribute(characterData.fort_saving_throw, exportTemplate.system.attributes.savingThrows.fort, 'base');
   updateAttribute(characterData.will_saving_throw, exportTemplate.system.attributes.savingThrows.will, 'base');
   updateAttribute(characterData.ref_saving_throw, exportTemplate.system.attributes.savingThrows.ref, 'base');

   // Health (HP)
   updateAttribute(characterData.alignment, exportTemplate.system.details, 'alignment');
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

   function stackWithParagraphs(...values) {
     return values.map(value => `<p>${value}</p><p></p>`).join('');
   }

   const combined_bio = stackWithParagraphs(
     characterData.younger_brothers,
     characterData.younger_sisters,
     characterData.older_brothers,
     characterData.older_sisters,
     characterData.parents,
     characterData.mannerisms,
     characterData.flaws,
     characterData.hair_type,
     characterData.hair_color,
     characterData.eye_color,
     characterData.appearance,
     characterData.background_traits,
     characterData.region
   );

   updateAttribute(combined_bio, exportTemplate.system.details.biography, 'value');
   // ----- End of simple data update ----- //



// ------ Start of Class Data Section ------ //

// Function to parse JSON data
function parseJson(data) {
  try {
    return JSON.parse(data);
  } catch (err) {
    console.error('Error parsing the JSON data:', err);
    return null;
  }
}

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

    if (item.name === targetClass) {
      collecting = true;  // Start collecting after finding the target class
    }

    if (classList.includes(item.name) && item.name !== targetClass) {
      collecting = false;  // Stop collecting once a new class name is encountered
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
// Function to append collected items to the export template
function appendJsonToTemplate(collectedItems, exportTemplate, sectionKey) {
  if (!exportTemplate.items) {
    exportTemplate.items = {}; // Initialize if it doesn't exist
  }

  // Append new items to the existing array under the sectionKey
  exportTemplate.items = [...exportTemplate.items, ...collectedItems];

  console.log(`Appended ${collectedItems.length} items to ${sectionKey} in exportTemplate.`);
}

// Main function to process class data and update class level
function processClass(targetClass, newLevel, classList) {
  const everyClassPathData = fileDataDictionary[everyClassPath];
  const items = extractItems(everyClassPathData);
  if (!items) return;

  // Update level in the class data
  updateLevel(items, targetClass, newLevel);

  // Collect the items for the given class
  const newCollectedItems = collectItems(items, targetClass, classList);

  // Append the collected items to exportTemplate
  appendJsonToTemplate(newCollectedItems, exportTemplate, "Class");

  // Save the updated exportTemplate back to localStorage
  writeToLocalStorage('exportTemplate', exportTemplate);
}


// function to capitalize the first letter of each word in a string
function capitalizeWords(str) {
  return str
    .split(' ') // Split the string into an array of words
    .map(word => 
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() // Capitalize first letter
    )
    .join(' '); // Join all words together
}

// Example inputs
const upper_case_class = capitalizeWords(characterData.c_class);

const class_list = [
  "Alchemist", "Antipaladin", "Arcanist", "Barbarian", "Barbarian (Unchained)", "Bard", "Bloodrager", "Brawler", 
  "Cavalier", "Cleric", "Druid", "Fighter", "Gunslinger", "Hunter", "Investigator", "Inquisitor", "Kineticist", 
  "Magus", "Medium", "Mesmerist", "Monk", "Monk (Unchained)", "Occultist", "Oracle", "Paladin", "Psychic", 
  "Ranger", "Rogue", "Rogue (Unchained)", "Shaman", "Skald", "Slayer", "Sorcerer", "Spiritualist", "Swashbuckler", 
  "Summoner", "Summoner (Unchained)", "Warpriest", "Witch", "Wizard"
];

processClass(upper_case_class, characterData.level, class_list);

// ------ End of Class Data Section ------ //


// ------ Generalized Features Page Functions ------ //

// Utility function to generate a unique 16-character alphanumeric ID
async function generateUniqueID() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return [...Array(16)]
    .map(() => characters.charAt(Math.floor(Math.random() * characters.length)))
    .join('');
}

// ------ End of Generalized Features Page Functions ------ //


// ----- Start of Feat/Trait section ----- //

async function processFeatTrait(everyDataPath, dataListChooseFrom, dataType) {
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

    for (const item of dataListChooseFrom) {
      // Logs all data being processed
      console.log(`Processing ${dataType}:`, item);

      const matchedItem = data.find(r => {
        // Extract the part of the name before the first parenthesis
        const namePart = r.name.split(' (')[0];
        // Ensuring that characters can't select mythic entries
        return namePart === item && !r.name.includes('(Mythic)');
      });

      if (matchedItem) {
        allMatchedItems.push(matchedItem);
      } else {
        console.warn(`${dataType} "${item}" not found.`);
      }
    }

    if (allMatchedItems.length > 0) {
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

// Feats section
processFeatTrait(everyFeatPath, characterData.feats, 'feat');
// Traits section
processFeatTrait(everyTraitPath, characterData.selected_traits, 'trait');

// ------ End of Feat/Trait Section ------ //


// ----- Start of Spell Section ----- //

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



// ----- End of Spell Section ----- //


// ----- Start of Weapon/Armor Section ----- //
// Function to append enhancements to description
function appendEnhancementsToDescription(item, enhancements) {
  if (item.system && item.system.description) {
    const enhancementText = (Array.isArray(enhancements) ? enhancements : [])
      .map(enhancement => `<li>${enhancement}</li>`)
      .join('');
    const message = enhancementText ? 
                    `<p>These are the enhancements: </p><ul>${enhancementText}</ul>` : 
                    '<p>No enhancements available.</p>';
    
    // Add enhancements only once
    if (!item.system.description.value.includes(message)) {
      item.system.description.value += message;
    }
  }
}

// General function to process items (weapon, armor, etc.)
async function processItem(itemType, everyItemPath, itemName, enhancementList, defaultItemName) {
  try {
    // If itemName is empty or undefined, use defaultItemName (e.g., "Longsword" for weapons)
    itemName = itemName || defaultItemName;

    // Ensure the item name is not empty or undefined
    if (!itemName) {
      console.error(`Character class ${characterData.c_class} does not have any selected ${itemType}.`);
      return;
    }

    // Retrieve the items data from the fileDataDictionary
    const items = fileDataDictionary[everyItemPath];

    // Check if the items data is an array
    if (!Array.isArray(items)) {
      console.error(`${itemType} data is not an array or is undefined:`, items);
      return;
    }

    console.log(`${itemType} data structure`, JSON.stringify(itemName, null, 2));

    // Find the matching item from the items data
    const matchedItem = items.find(r => r.name === itemName);
    if (!matchedItem) {
      console.warn(`${itemType} "${itemName}" not found, using default item.`);
      // Try to use the default item if the selected one is not found
      const defaultMatchedItem = items.find(r => r.name === defaultItemName);
      if (defaultMatchedItem) {
        appendEnhancementsToDescription(defaultMatchedItem, enhancementList);
        writeToLocalStorage(`collected${itemType}s`, [defaultMatchedItem]);
        appendJsonToTemplate([defaultMatchedItem], exportTemplate, itemType);
        writeToLocalStorage('exportTemplate', exportTemplate);
        console.log(`Successfully added default ${itemType} data to the export template.`);
      } else {
        console.error(`Default ${itemType} "${defaultItemName}" also not found.`);
      }
      return;
    }

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
  } catch (error) {
    console.error(`Error reading or processing the ${itemType} Section:`, error);
  }
}

// Example usage for Weapon with default fallback to "Longsword"
await processItem("Weapon", everyWeaponPath, characterData.weapon_name, characterData.weapon_enhancement_chosen_list, "Longsword");

// Example usage for Armor with default fallback to "Leather Armor"
await processItem("Armor", everyArmorPath, characterData.armor_name, characterData.armor_enhancement_chosen_list, "Leather Armor");

// ----- End of Weapon/Armor Section ----- //


 } catch (error) {
   console.error("Error in main function:", error);
 }
}