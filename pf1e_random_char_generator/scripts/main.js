(async () => {
  // Import other scripts
  await import('./fetch-data.js'); // Load fetch-data script
  console.log("fetch-data ran");
  console.log("prep modify-abilities ran");
  await import('./modify-abilities.js'); // Load modify-abilities script
  console.log("modify-abilities ran");

  console.log("All scripts loaded and ready.");
  await import('./button.js');
  // Call the function to create the persistent button
  createPersistentButton();
})();