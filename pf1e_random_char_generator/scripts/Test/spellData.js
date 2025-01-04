
function writeToLocalStorage(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    console.log(`${key} has been updated in localStorage.`);
  } catch (err) {
    console.error(`Error writing to localStorage key ${key}:`, err);
  }
}

async function runAllSpellData(characterData, exportTemplate, everySpellPath) {
  
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
      writeToLocalStorage('collectedSpells', allMatchedSpells);


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

writeToLocalStorage('exportTemplate', exportTemplate);

}
