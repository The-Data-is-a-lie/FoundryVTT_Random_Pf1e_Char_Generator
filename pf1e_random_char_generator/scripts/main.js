import { log } from './shared/log.js';
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
