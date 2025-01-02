(async () => {
  // Import other scripts

  await import('./fetch-data.js'); // Load fetch-data script
  console.log("fetch-data ran");
  console.log("prep modify-abilities ran");
  await import('./modify-abilities.js'); // Load modify-abilities script
  console.log("modify-abilities ran");

  console.log("All scripts loaded and ready.");

  // HTML button code
  // Create and render the button once all scripts are loaded
  Hooks.on('ready', () => {
    // HTML content for the dialog with the button
    const html = `
      <button id="generate-character">Generate Character</button>
    `;

    // Create the dialog and show it
    new Dialog({
      title: "Random Character Generator",
      content: html,
      buttons: {
        generate: {
          label: "Generate",
          callback: () => {
            // This will be triggered when the button is clicked
            generateRandomCharacter(); // Call the function to generate a character
          }
        }
      }
    }).render(true); // Render the dialog

    // Function that will be triggered when the button is clicked
    async function generateRandomCharacter() {
      console.log("Character Generated!");
      
      // Run the modify-abilities.js script here
      try {
        // Assuming modify-abilities.js has an exported function to modify abilities
          await main(); // Call the function from modify-abilities.js
      } catch (error) {
        console.error("Error running modify-abilities:", error);
      }
    }
  });
})();
