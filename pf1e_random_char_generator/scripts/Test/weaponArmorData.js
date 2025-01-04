async function runAllWeaponArmorData(characterData, exportTemplate, everyWeaponPath, everyArmorPath, fileDataDictionary) {
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


writeToLocalStorage('exportTemplate', exportTemplate);


}