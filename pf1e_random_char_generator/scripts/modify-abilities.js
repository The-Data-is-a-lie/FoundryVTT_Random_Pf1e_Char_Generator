export async function main() {
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


    // char_sheet_folders
    const unmodifiedPreExportTemplatePath = charSheetBase.target + "/unmodified_pre_export_template.json";
    const preExportTemplatePath = charSheetBase.target + "/pre_export_template.json";
    const everyArmorPath = charSheetBase.target + "/every_armor.json";
    const everyClassPath = charSheetBase.target + "/every_class.json";
    const everyFeatPath = charSheetBase.target + "/every_feat.json";
    const everyItemPath = charSheetBase.target + "/every_item.json";
    const everyRacePath = charSheetBase.target + "/every_race.json";
    const everySpellPath = charSheetBase.target + "/every_spell.json";
    const everyTraitPath = charSheetBase.target + "/every_trait.json";
    const everyWeaponPath = charSheetBase.target + "/every_weapon.json";
    const archetypePath = charSheetBase.target + "/archetype.json";

    // base_folder
    const baseFeatPath = base.target + "/base_feat.json";
    const baseSkillPath = base.target + "/base_skill.json";
    

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
const prepared_caster_list = ["Alchemist", "Bard", "Cleric", "Druid", "Inquisitor", "Investigator", "Magus", "Paladin", "Ranger", "Summoner", "Summoner (Unchained)", "Skald", "Warpriest", "Wizard", "Witch"]
const upper_case_class = capitalizeWords(characterData.c_class);

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

const class_list = [
  "Alchemist", "Antipaladin", "Arcanist", "Barbarian", "Barbarian (Unchained)", "Bard", "Bloodrager", "Brawler", 
  "Cavalier", "Cleric", "Druid", "Fighter", "Gunslinger", "Hunter", "Investigator", "Inquisitor", "Kineticist", 
  "Magus", "Medium", "Mesmerist", "Monk", "Monk (Unchained)", "Occultist", "Oracle", "Paladin", "Psychic", 
  "Ranger", "Rogue", "Rogue (Unchained)", "Shaman", "Skald", "Slayer", "Sorcerer", "Spiritualist", "Swashbuckler", 
  "Summoner", "Summoner (Unchained)", "Warpriest", "Witch", "Wizard"
];

processClass(upper_case_class, characterData.level, class_list);

// ------ End of Class Data Section ------ //


// ------ Start of Archetype Section ------ //
async function processArchetype(targetArchetype) {
  if (!targetArchetype || typeof targetArchetype !== 'object') {
      console.error("Invalid targetArchetype:", targetArchetype);
      return;
  }

  // Get archetypeInfo and ensure it's an object
  let archetypeInfo = fileDataDictionary[archetypePath];

  if (typeof archetypeInfo !== 'object' || archetypeInfo === null) {
      console.warn("archetypeInfo is not an object. Attempting to fix...");
      
      // Check if it's a valid JSON string and parse it
      try {
          archetypeInfo = JSON.parse(archetypeInfo);
      } catch (error) {
          console.error("archetypeInfo could not be parsed as JSON. Resetting to an empty object.");
          archetypeInfo = {};  
      }
  }

  console.log("archetype pre trial", archetypeInfo);
  console.log("targetArchetype", targetArchetype);

  // Extract the first key from targetArchetype (e.g., "Visionary")
  const archetypeKey = Object.keys(targetArchetype)[0]; 

  if (!archetypeKey) {
      console.error("No valid key found in targetArchetype:", targetArchetype);
      return;
  }

  // Set the name of the archetype
  archetypeInfo.name = archetypeKey;

  // Ensure system and description exist before modifying
  // archetypeInfo.system = archetypeInfo.system || {};
  // archetypeInfo.system.description = archetypeInfo.system.description || {};
  archetypeInfo.system.description.value = convertToStringSimple(archetypeKey,targetArchetype);

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
// function convertToStringPrereqBenefit(featureData) {
//   if (!featureData || typeof featureData !== "object") {
//       return "<p><strong>Benefits:</strong> No benefits available.</p>";
//   }

//   // Extract benefits and prerequisites safely
//   let benefits = featureData.benefits?.value || featureData.benefits || "No benefits available.";
//   let prerequisites = featureData.prerequisites?.value || featureData.prerequisites || null;

//   let htmlString = "<p>";

//   // Add prerequisites if they exist
//   if (prerequisites) {
//       htmlString += `<strong>Prerequisites:</strong> ${prerequisites}</p><p>`;
//   }

//   // Add benefits (always included)
//   htmlString += `<strong>Benefits:</strong> ${benefits}</p>`;

//   return htmlString;
// }


function convertToStringSimple(key, featureData) {
  if (!featureData || typeof featureData !== "object") {
      return "<p>No feature data available.</p>";
  }

  let htmlString = `<p><strong>${key}</strong></p><ul>`;

  for (const [key, value] of Object.entries(featureData)) {
      htmlString += `<li><strong>${key}:</strong> ${typeof value === "object" ? JSON.stringify(value, null, 2) : value}</li>`;
  }

  htmlString += "</ul>";
  return htmlString;
}

// function convertSorcererAbilityToHtmlWithBoldNames(featureData) {
//   let htmlString = '';

//   // Check if the featureData is an array (like bonus feats or bonus spells)
//   if (Array.isArray(featureData)) {
//     htmlString = '<ul>';
//     featureData.forEach(item => {
//       htmlString += `<li>${item}</li>`;
//     });
//     htmlString += '</ul>';
//   }
//   // Check if the featureData is a string (ability description)
//   else if (typeof featureData === 'string') {
//     htmlString = `<p>${featureData}</p>`;
//   }
//   // If it's an object (though not expected for a sorcerer ability), convert to a formatted string
//   else if (typeof featureData === 'object') {
//     htmlString = `<pre>${JSON.stringify(featureData, null, 2)}</pre>`;
//   }

//   return htmlString;
// }

// function formatSorcererBloodline(featureData) {
//   let htmlString = '';

//   for (const [key, value] of Object.entries(featureData)) {
//     // Bold the name of the ability
//     htmlString += `<strong>${key}</strong>: ${convertSorcererAbilityToHtmlWithBoldNames(value)}<br>`;
//   }

//   return htmlString;
// }



async function updateClassFeatures(fileDataDictionary, classFeatures) {
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
      const feature = JSON.parse(JSON.stringify(fileDataDictionary));  
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



// ----- End of Weapon/Armor Section ----- //


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
  // Reconstruct string (otherwise it reads as each alphabetical letter as a key)
  let reconstructedString = '';
  for (const key in characterData) {
    reconstructedString += characterData[key];
  }

  const characterDataParsed = JSON.parse(reconstructedString);

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

async function createUpdatedSkills(updatedCharacterData, baseSkillPathData) {
  // Loop through each skill in updatedCharacterData and update the rank value
  for (let skill in updatedCharacterData) {
    if (baseSkillPathData[skill]) {
      // Update the rank value in the baseSkillPathData structure
      baseSkillPathData[skill].rank = updatedCharacterData[skill];
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
const updatedCharacterData = await convertSkillNames(characterData.skill_ranks, skillsDict);
const baseSkillTemplate = fileDataDictionary[baseSkillPath]; // Example, replace with your actual path
// Now we have a JSON object with the proper names and ranks -> need to update the skills
await createUpdatedSkills(updatedCharacterData, baseSkillTemplate);
// Now that we have updated skills -> need to overwrite the export file (stored in localStorage)
await overwriteData(localStorage.getItem('collectedSkills'));

// Rewriting the export file directly (with export template)
writeToLocalStorage('exportFoundryPath', exportTemplate);

// ----- End of Skills Section ----- //





} catch (error) {
   console.error("Error in main function:", error);
 }
}