function writeToLocalStorage(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    console.log(`${key} has been updated in localStorage.`);
  } catch (err) {
    console.error(`Error writing to localStorage key ${key}:`, err);
  }
}

export async function runAllSkillData(characterData, exportTemplate, baseSkillPath, fileDataDictionary) {
  const skillsDict = {
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
    let reconstructedString = '';
    for (const key in characterData) {
      reconstructedString += characterData[key];
    }

    const characterDataParsed = JSON.parse(reconstructedString);

    console.log("Reconstructed character data:", characterDataParsed);

    const newCharacterData = {};

    for (const skill in characterDataParsed) {
      if (skillsDict[skill]) {
        newCharacterData[skillsDict[skill]] = characterDataParsed[skill];
      } else {
        newCharacterData[skill] = characterDataParsed[skill];
      }
    }

    console.log("Updated character data after skill name conversion:", newCharacterData);
    return newCharacterData;
  }

  async function createUpdatedSkills(updatedCharacterData, baseSkillPathData) {
    for (let skill in updatedCharacterData) {
      console.log("Updating skill:", skill, "with rank:", updatedCharacterData[skill]);
      if (baseSkillPathData[skill]) {
        baseSkillPathData[skill].rank = updatedCharacterData[skill];
      } else {
        console.warn(`Skill "${skill}" not found in baseSkillPathData.`);
      }
    }

    writeToLocalStorage('collectedSkills', baseSkillPathData);
  }

  async function overwriteData(collectedData) {
    const parsedSkills = JSON.parse(collectedData);
    exportTemplate.system.skills = parsedSkills;
    writeToLocalStorage('exportTemplate', exportTemplate);
  }

  console.log("Character skill ranks:", characterData.skill_ranks);

  const updatedCharacterData = await convertSkillNames(characterData.skill_ranks, skillsDict);

  console.log("fileDataDictionary:", fileDataDictionary);
  console.log("Base skill path:", baseSkillPath);

  const baseSkillTemplate = fileDataDictionary[baseSkillPath];
  if (!baseSkillTemplate) {
    console.error(`Base skill template not found at path: ${baseSkillPath}`);
  } else {
    console.log("Base skill template:", baseSkillTemplate);
  }

  await createUpdatedSkills(updatedCharacterData, baseSkillTemplate);
  await overwriteData(localStorage.getItem('collectedSkills'));

  writeToLocalStorage('exportFoundryPath', exportTemplate);
}
