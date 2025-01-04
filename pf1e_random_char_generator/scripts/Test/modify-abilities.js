const characterData = JSON.parse(localStorage.getItem('character_data'));

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
    // collected items Base
    const collectedBase = await FilePicker.browse('data', 'modules/pf1e_random_char_generator/templates/collected_folder'); 

    // char_sheet_folders
    const unmodifiedPreExportTemplatePath = `${charSheetBase.target}/unmodified_pre_export_template.json`;
    const preExportTemplatePath = `${charSheetBase.target}/pre_export_template.json`;
    const everyArmorPath = `${charSheetBase.target}/every_armor.json`;
    const everyClassPath = `${charSheetBase.target}/every_class.json`;
    const everyFeatPath = `${charSheetBase.target}/every_feat.json`;
    const everyItemPath = `${charSheetBase.target}/every_item.json`;
    const everyRacePath = `${charSheetBase.target}/every_race.json`;
    const everySpellPath = `${charSheetBase.target}/every_spell.json`;
    const everyTraitPath = `${charSheetBase.target}/every_trait.json`;
    const everyWeaponPath = `${charSheetBase.target}/every_weapon.json`;

    // base_folder
    const baseFeatPath = `${base.target}/base_feat.json`;
    const baseSkillPath = `${base.target}/base_skill.json`;

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
    ];

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

    // ----- Start of exportTemplate setup ----- //

    // we want to use unmodified template if it exists
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

    console.log("First exportTemplate:", exportTemplate);
    localStorage.setItem('exportTemplate', JSON.stringify(exportTemplate));

    // ----- End of exportTemplate setup ----- //

    // ----- Running all Character Sheet functions ----- //
    function writeToLocalStorage(key, data) {
      try {
        localStorage.setItem(key, JSON.stringify(data));
        console.log(`${key} has been updated in localStorage.`);
      } catch (err) {
        console.error(`Error writing to localStorage key ${key}:`, err);
      }
    }

    const importModules = [
      { path: './simpleData.js', func: 'runAllSimpleData', params: [characterData, exportTemplate] },
      { path: './classData.js', func: 'runAllClassData', params: [characterData, exportTemplate, fileDataDictionary, everyClassPath] },
      { path: './featTraitData.js', func: 'runAllTraitFeatData', params: [characterData, exportTemplate, fileDataDictionary, everyClassPath] },
      { path: './spellData.js', func: 'runAllSpellData', params: [characterData, exportTemplate, everySpellPath] },
      { path: './weaponArmorData.js', func: 'runAllWeaponArmorData', params: [characterData, exportTemplate, everyWeaponPath, everyArmorPath, fileDataDictionary]},
      { path: './wondrousItemData.js', func: 'runAllWondrousItemData', params: [characterData, exportTemplate, everyItemPath, collectedBase] },
      // { path: './skillsData.js', func: 'runAllSkillData', params: [characterData, exportTemplate, baseSkillPath,  collectedBase] },
    ];
    
    for (const { path, func, params = [] } of importModules) {
      const module = await import(path);
      if (module[func]) {
        await module[func](...params); // Ensure params are spread correctly
      }
    }

    // ----- End of running Character Sheet functions ----- //

  // Rewriting the export file directly (with export template)



  writeToLocalStorage('exportFoundryPath', exportTemplate);

  } catch (error) {
    console.error("Error in main function:", error);
  }
}
