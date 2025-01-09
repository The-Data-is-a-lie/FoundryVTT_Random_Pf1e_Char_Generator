async function createCharacterFunc() {
  const actor = await Actor.create({
    name: "New Test Actor",
    type: "character",
  });

  console.log("Actor created:", actor);
  return actor;
}

// Grab data from localStorage and inject into charactersheet
async function injectJsonDataIntoNewActor(actor) {
  const exportFoundryPath = localStorage.getItem('exportFoundryPath');
  
  if (exportFoundryPath) {
    const parsedData = JSON.parse(exportFoundryPath);
    console.log("parsedData part1:", parsedData)
    
    // Inject the parsed data into the actor to overwrite all Data
    try {
      await actor.update(parsedData);
      console.log("Actor data successfully overwritten with exportFoundryPath:", parsedData);
    } catch (error) {
      console.error("Error updating actor with parsed data:", error);
    }
  } else {
    console.error("No data found in localStorage under 'exportFoundryPath'");
  }
}

async function generateRandomizedCharacterFolder() {
  // Check if the "Random Characters" folder exists
  let folder = game.folders.contents.find(f => f.name === "Random Characters");

  // If the folder doesn't exist, create it
  if (!folder) {
    folder = await Folder.create({
      name: "Random Characters",
      type: "Actor", 
      parent: null,  
    });
    console.log("Created new folder:", folder);
  } else {
    console.log("Found existing folder:", folder);
  }

  return folder.id;
}

async function adjustLevel(actor) {
  const characterData = await localStorage.getItem("pulledCharacterData");
  console.log("actor:", actor)
  if (characterData) {
    try {
      const parsedData = JSON.parse(characterData);
      console.log("this is the adjustLevel function", parsedData);

      // Extract c_class and level
      const c_class = parsedData.c_class.capitalize();
      const level = parsedData.level;

      console.log("Extracted c_class and level:", c_class, level);

      // Find the class item in the actor's items
      const classItem = actor.items.find(item => item.name === c_class);
      if (classItem) {
        // Update the class level
        await classItem.update({ "system.level": level });
        console.log(`Updated ${c_class} level to ${level}`);
      } else {
        console.error(`Class item ${c_class} not found in actor's items.`);
      }
    } catch (error) {
      console.error("Error parsing CharacterData or accessing c_class and level:", error);
    }
  } else {
    console.error("No CharacterData found in localStorage under 'pulledCharacterData'");
  }
}


// Calls all Actor Creation functions
async function createAndAssignActor() {
  const folderId = await generateRandomizedCharacterFolder();

  const actor = await createCharacterFunc();

  await injectJsonDataIntoNewActor(actor);

  await actor.update({ folder: folderId });

  await adjustLevel(actor);

  console.log("Actor successfully created and added to the 'Random Characters' folder.");
}

