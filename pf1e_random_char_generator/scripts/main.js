// main.js

(async () => {
  // Import necessary scripts
  await import('./fetch-data.js'); // Load fetch-data script
  console.log("fetch-data ran");

  await import('./modify-abilities.js'); // Load modify-abilities script
  console.log("modify-abilities ran");

  console.log("All scripts loaded and ready.");

  // Now, import button.js and create the persistent button
  await import('./button.js').then(module => {
    module.createPersistentButton(); // Call the function from button.js to create the button
  });
})();
