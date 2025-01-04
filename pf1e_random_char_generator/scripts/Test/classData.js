function writeToLocalStorage(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    console.log(`${key} has been updated in localStorage.`);
  } catch (err) {
    console.error(`Error writing to localStorage key ${key}:`, err);
  }
}

export async function runAllClassData(characterData, exportTemplate, fileDataDictionary, everyClassPath) {

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
  // Ensure str is a string before attempting to split
  if (typeof str !== 'string') {
    console.error('Expected a string, but received:', str);
    return str; // Return the value unchanged if it's not a string
  }

  return str
    .split(' ') // Split the string into an array of words
    .map(word => {
      // Capitalize the first letter of each part before and after the hyphen
      return word.split('-').map((part, index) => {
        if (index === 0) {
          // Capitalize the first part as usual
          return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
        } else {
          // Capitalize the part after the hyphen
          return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
        }
      }).join('-'); // Rejoin the parts after the hyphen
    })
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

writeToLocalStorage('character_data', characterData);
writeToLocalStorage('exportTemplate', exportTemplate);
}