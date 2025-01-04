function writeToLocalStorage(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    console.log(`${key} has been updated in localStorage.`);
  } catch (err) {
    console.error(`Error writing to localStorage key ${key}:`, err);
  }
}

export async function runAllItemData(characterData, everyItemPath) {
  
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

writeToLocalStorage('exportTemplate', exportTemplate);
}
