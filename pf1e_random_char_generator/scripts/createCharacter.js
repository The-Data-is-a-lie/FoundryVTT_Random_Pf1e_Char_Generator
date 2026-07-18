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

  if (!exportFoundryPath) {
    throw new Error("No data found in localStorage under 'exportFoundryPath'");
  }

  const parsedData = JSON.parse(exportFoundryPath);
  console.log("parsedData part1:", parsedData)

  // Inject the parsed data into the actor to overwrite all Data
  try {
    await actor.update(parsedData);
    console.log("Actor data successfully overwritten with exportFoundryPath:", parsedData);
  } catch (error) {
    console.error("Error updating actor with parsed data:", error);
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

// function to capitalize the first letter of each word in a string
function capitalizeWords(str) {
  // Ensure str is a string before attempting to split
  if (typeof str !== 'string') {
    console.error('Expected a string, but received:', str);
    return str; // Return the value unchanged if it's not a string
  }

  const ignoreWords = ['of', 'the', 'and', 'in', 'on', 'at', 'to', 'with', 'from'];

  // List of specific Roman numerals to capitalize
  const romanNumerals = ['ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii'];

  return str
    .split(' ') // Split the string into an array of words
    .map((word, index) => {
      // Lowercase the word for comparison
      const lowerWord = word.toLowerCase();

      // Capitalize Roman numerals
      if (romanNumerals.includes(lowerWord)) {
        return word.toUpperCase();
      }

      // Capitalize the first letter if it's the first word or not in ignoreWords
      if (index === 0 || !ignoreWords.includes(lowerWord)) {
        return word
          .split('-') // Handle hyphenated words
          .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
          .join('-');
      } else {
        // Keep the word in lowercase if it's in the ignore list and not the first word
        return word.toLowerCase();
      }
    })
    .join(' '); // Join all words together
}

async function adjustLevel(actor) {
  const characterData = await localStorage.getItem("pulledCharacterData");
  console.log("actor:", actor)
  if (characterData) {
    try {
      const parsedData = JSON.parse(characterData);
      console.log("this is the adjustLevel function", parsedData);

      // Extract c_class and level with proper error handling
      if (!parsedData.c_class) {
        console.error("c_class is undefined in parsedData:", parsedData);
        return;
      }
      
      // Multiclass-aware: level EVERY class item the backend rolled. Old payloads without
      // `classes` fall back to the legacy single-class entry. Prefer the backend's display name
      // (e.g. "Barbarian (Unchained)") so we find the correct unchained class item.
      const classEntries = (Array.isArray(parsedData.classes) && parsedData.classes.length)
        ? parsedData.classes
        : [{ display: parsedData.c_class_display || capitalizeWords(parsedData.c_class), level: parsedData.level }];

      for (const entry of classEntries) {
        const c_class = entry.display || capitalizeWords(entry.name || '');
        const target = Number(entry.level);

        console.log("Extracted c_class and level:", c_class, target);

        // Find the class item in the actor's items
        const classItem = actor.items.find(item => item.type === 'class' && item.name === c_class);
        if (classItem) {
          // The class item is injected at the every_class.json template level (20). For a max-level
          // (20) character, update({ level: 20 }) is a same-value no-op: Foundry fires no change
          // event, pf1 never derives the character level, and the sheet stays at Level 0 /
          // "missing a class" until the user manually clicks Level Up. Nudge to a different level
          // first to guarantee a class-level change event so pf1 recomputes. Sub-max characters
          // already differ from the template, so the single update below is enough for them.
          if (Number(classItem.system.level) === target) {
            await classItem.update({ "system.level": target > 1 ? target - 1 : target + 1 });
          }
          await classItem.update({ "system.level": target });
          console.log(`Updated ${c_class} level to ${target}`);
        } else {
          console.error(`Class item ${c_class} not found in actor's items.`);
        }
      }
    } catch (error) {
      console.error("Error parsing CharacterData or accessing c_class and level:", error);
    }
  } else {
    console.error("No CharacterData found in localStorage under 'pulledCharacterData'");
  }
}


// Calls all Actor Creation functions. Exported: button.js imports this — the file used to be a
// classic script in module.json's "scripts" array that defined it as a global.
export async function createAndAssignActor() {
  // Bail before creating anything: an actor with no sheet data to inject would just be a blank
  // "New Test Actor" littering the Random Characters folder.
  if (!localStorage.getItem('exportFoundryPath')) {
    throw new Error("No generated character data to inject ('exportFoundryPath' is empty)");
  }

  const folderId = await generateRandomizedCharacterFolder();

  const actor = await createCharacterFunc();

  await injectJsonDataIntoNewActor(actor);

  await actor.update({ folder: folderId });

  await adjustLevel(actor);

  console.log("Actor successfully created and added to the 'Random Characters' folder.");
}

