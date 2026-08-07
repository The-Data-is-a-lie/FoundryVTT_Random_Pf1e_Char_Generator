import { createBondedCreatures } from './createCompanions.js';
import { capitalizeWords } from './shared/text.js';
import { forceRederive } from './shared/foundry-doc.js';
import { readExportPath, hasExportPath, readCharacterPayload } from './shared/storage.js';

async function createCharacterFunc() {
  const actor = await Actor.create({
    name: "New Test Actor",
    type: "character",
  });

  console.log("Actor created:", actor);
  return actor;
}

// Grab data from localStorage and inject into charactersheet
async function injectJsonDataIntoNewActor(actor, folderId) {
  const parsedData = readExportPath();

  if (!parsedData) {
    throw new Error("No data found in localStorage under 'exportFoundryPath'");
  }

  console.log("parsedData part1:", parsedData)

  // The folder rides IN on this update rather than following it as a second one.
  //
  // Both export templates carry their own top-level `folder` key, so injecting the sheet overwrites
  // whatever folder the actor was created in -- which is why a separate `actor.update({folder})`
  // used to run afterwards to put it back. That second write lands on a fully populated actor and
  // makes Foundry re-prepare all ~90-215 items to change one metadata field. Setting the key here
  // makes one write do both jobs.
  parsedData.folder = folderId;

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

async function adjustLevel(actor) {
  const parsedData = readCharacterPayload();
  console.log("actor:", actor)
  if (parsedData) {
    try {
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
          // The class item is injected at the every_class.json template level (20), so for a
          // max-level character this update is a same-value no-op Foundry fires no change event
          // for — see forceRederive in shared/foundry-doc.js.
          await forceRederive(classItem, 'system.level', target, { current: classItem.system.level });
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
  if (!hasExportPath()) {
    throw new Error("No generated character data to inject ('exportFoundryPath' is empty)");
  }

  const folderId = await generateRandomizedCharacterFolder();

  const actor = await createCharacterFunc();

  await injectJsonDataIntoNewActor(actor, folderId);

  await adjustLevel(actor);

  console.log("Actor successfully created and added to the 'Random Characters' folder.");

  // §8 D1: a bonded creature is its own Actor, never a block on its master's sheet. Runs last and
  // never throws upward -- a companion that fails to build must not cost the character that was
  // already created, and the reason is on the console either way.
  try {
    const payload = readCharacterPayload() || {};
    await createBondedCreatures(payload, folderId);
  } catch (error) {
    console.error("Bonded creatures: none were created —", error);
    ui.notifications?.warn("Character created, but its bonded creatures were not — see the console.");
  }
}

