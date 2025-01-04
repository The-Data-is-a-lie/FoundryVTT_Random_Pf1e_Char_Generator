function writeToLocalStorage(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    console.log(`${key} has been updated in localStorage.`);
  } catch (err) {
    console.error(`Error writing to localStorage key ${key}:`, err);
  }
}

async function runAllTraitFeatData() {
  
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

writeToLocalStorage('exportTemplate', exportTemplate);
}
