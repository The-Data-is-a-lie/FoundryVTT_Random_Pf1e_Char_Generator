
function writeToLocalStorage(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    console.log(`${key} has been updated in localStorage.`);
  } catch (err) {
    console.error(`Error writing to localStorage key ${key}:`, err);
  }
}
export async function updateAttribute(variable, attributePath, type, exportTemplate) {
    attributePath[type] = variable;
    console.log(attributePath[type]);

    // Save updated exportTemplate to localStorage
    localStorage.setItem('exportTemplate', JSON.stringify(exportTemplate));
  }

export async function runAllSimpleData(characterData, exportTemplate){

  console.log("exportTemplate", exportTemplate);
  // Stats
  updateAttribute(characterData.str, exportTemplate.system.abilities.str, 'value', exportTemplate);
  updateAttribute(characterData.dex, exportTemplate.system.abilities.dex, 'value', exportTemplate);
  updateAttribute(characterData.con, exportTemplate.system.abilities.con, 'value', exportTemplate);
  updateAttribute(characterData.int, exportTemplate.system.abilities.int, 'value', exportTemplate);
  updateAttribute(characterData.wis, exportTemplate.system.abilities.wis, 'value', exportTemplate);
  updateAttribute(characterData.cha, exportTemplate.system.abilities.cha, 'value', exportTemplate);

  // Saving Throws
  updateAttribute(characterData.fort_saving_throw, exportTemplate.system.attributes.savingThrows.fort, 'base', exportTemplate);
  updateAttribute(characterData.will_saving_throw, exportTemplate.system.attributes.savingThrows.will, 'base', exportTemplate);
  updateAttribute(characterData.ref_saving_throw, exportTemplate.system.attributes.savingThrows.ref, 'base', exportTemplate);

  // Health (HP)
  updateAttribute(characterData.alignment, exportTemplate.system.details, 'alignment', exportTemplate);
  updateAttribute(characterData.deity_name, exportTemplate.system.details, 'deity', exportTemplate);
  updateAttribute(characterData.age_number, exportTemplate.system.details, 'age', exportTemplate);

  // Currency
  updateAttribute(characterData.platnium, exportTemplate.system.currency, 'pp', exportTemplate);

  // Background info
  updateAttribute(characterData.character_full_name, exportTemplate, 'name', exportTemplate);
  updateAttribute(characterData.language_text, exportTemplate.system.traits.languages, 'value', exportTemplate);
  updateAttribute(characterData.gender, exportTemplate.system.details, 'gender', exportTemplate);
  updateAttribute(characterData.height_number, exportTemplate.system.details, 'height', exportTemplate);
  updateAttribute(characterData.weight_number, exportTemplate.system.details, 'weight', exportTemplate);

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

  updateAttribute(combined_bio, exportTemplate.system.details.biography, 'value', exportTemplate);

  writeToLocalStorage('exportTemplate', exportTemplate);
}