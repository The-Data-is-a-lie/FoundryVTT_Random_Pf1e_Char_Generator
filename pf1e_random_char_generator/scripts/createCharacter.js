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

// Calls all Actor Creation functions
async function createAndAssignActor() {
  const folderId = await generateRandomizedCharacterFolder();

  const actor = await createCharacterFunc();

  await injectJsonDataIntoNewActor(actor);

  await actor.update({ folder: folderId });

  console.log("Actor successfully created and added to the 'Random Characters' folder.");
}

