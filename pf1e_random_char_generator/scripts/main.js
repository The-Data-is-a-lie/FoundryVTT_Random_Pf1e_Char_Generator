(async () => {

  // Settings FIRST: module.js registers the module settings inside Hooks.once("init"), and
  // esmodules execute before Foundry fires init — but only if this import actually runs.
  // (module.js was previously only listed in module.json's classic "scripts" array, where its
  // `export` is a SyntaxError, so registerSettings never ran and no settings ever appeared.)
  await import('./module.js');
  console.log("module (settings) ran");

  // Import necessary scripts
  await import('./deliver-data.js');
  console.log("deliver-data ran");

  await import('./fetch-data.js'); // Load fetch-data script
  console.log("fetch-data ran");

  await import('./modify-abilities.js'); // Load modify-abilities script
  console.log("modify-abilities ran");

  await import('./pow-sort-override.js'); // pf1-pow Path of War tab sort override (registers a ready hook)
  console.log("pow-sort-override ran");

  await import('./attack-dialog-resize.js'); // make the pf1 attack-roll dialog a resizable window (registers a ready hook)
  console.log("attack-dialog-resize ran");

  console.log("All scripts loaded and ready.");

  // Now, import button.js and create the persistent button
  await import('./button.js').then(module => {
    module.createPersistentButton(); // Call the function from button.js to create the button
  });
})();
