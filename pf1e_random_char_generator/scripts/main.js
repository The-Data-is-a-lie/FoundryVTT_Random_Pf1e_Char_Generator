import { log } from './shared/log.js';
import { registerButtonLocations } from './button-locations.js';

// Registered SYNCHRONOUSLY, before the async IIFE below and before Foundry's "init".
//
// `getSceneControlButtons` fires ONCE per control-list build, and the IIFE is not awaited by
// Foundry — module evaluation returns the moment it hits its first `await`, so anything registered
// inside it is registered a few network round trips late and can miss a hook that never fires again.
// Each callback reads its own setting when it fires, so registering this early costs nothing.
registerButtonLocations();

(async () => {

  // Settings FIRST: module.js registers the module settings inside Hooks.once("init"), and
  // esmodules execute before Foundry fires init — but only if this import actually runs.
  // (module.js was previously only listed in module.json's classic "scripts" array, where its
  // `export` is a SyntaxError, so registerSettings never ran and no settings ever appeared.)
  await import('./module.js');
  log.debug("module (settings) ran");

  // Import necessary scripts
  await import('./deliver-data.js');
  log.debug("deliver-data ran");

  await import('./modify-abilities.js'); // Load modify-abilities script
  log.debug("modify-abilities ran");

  await import('./pow-sort-override.js'); // pf1-pow Path of War tab sort override (registers a ready hook)
  log.debug("pow-sort-override ran");

  await import('./attack-dialog-resize.js'); // make the pf1 attack-roll dialog a resizable window (registers a ready hook)
  log.debug("attack-dialog-resize ran");

  log.debug("All scripts loaded and ready.");

  // Now, import button.js and create the persistent button
  await import('./button.js').then(module => {
    module.createPersistentButton(); // Call the function from button.js to create the button
  });
})();
