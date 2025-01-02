(async () => {
  // Import other scripts
  await import('./fetch-data.js'); // Load fetch-data script
  console.log("fetch-data ran");
  console.log("prep modify-abilities ran");
  await import('./modify-abilities.js'); // Load modify-abilities script
  console.log("modify-abilities ran");

  console.log("All scripts loaded and ready.");

// Function to create the persistent button
// whenever you drag it, the button will auto click
function createPersistentButton() {
  const button = document.createElement('button');
  button.textContent = "CG"; // Short for "Character Generator"
  button.id = "character-generator-button";
  
  // Apply styling to position the button at the bottom left of the screen
  button.style.position = 'fixed';
  button.style.bottom = '10%';
  button.style.left = '2%';
  button.style.width = '50px'; // Small width
  button.style.height = '50px'; // Small height
  button.style.border = '1px solid #ccc';
  button.style.borderRadius = '5px';
  button.style.backgroundColor = '#333'; // Dark grey background
  button.style.color = 'white'; // White text
  button.style.fontSize = '12px';
  button.style.cursor = 'pointer';
  button.style.textAlign = 'center';
  button.style.lineHeight = '50px'; // Center text vertically
  
  // Add event listener to show the dialog when clicked
  button.addEventListener('click', () => {
    showCharacterGeneratorDialog();
  });

  // Add dragging functionality
  let isDragging = false;
  let offsetX, offsetY;

  button.addEventListener('mousedown', (event) => {
    isDragging = true;
    // Store the initial mouse position and button position
    offsetX = event.clientX - button.getBoundingClientRect().left;
    offsetY = event.clientY - button.getBoundingClientRect().top;
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });

  function onMouseMove(event) {
    if (!isDragging) return;

    // Calculate the new position of the button based on mouse movement
    const newX = event.clientX - offsetX;
    const newY = event.clientY - offsetY;

    // Move the button
    button.style.left = `${newX}px`;
    button.style.top = `${newY}px`;
  }

  function onMouseUp() {
    isDragging = false;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  }

  // Append the button to the body
  document.body.appendChild(button);
}


  // Function to create the button that sends over data to the other server
  function showCharacterGeneratorDialog() {
    const html = `
      <button id="generate-character">Generate Character</button>
      <div>
        <label for="character-race">Race: </label>
        <select id="character-race">
          <option value="human">Human</option>
          <option value="elf">Elf</option>
          <option value="orc">Orc</option>
        </select>
      </div>
      <div>
        <label for="character-class">Class: </label>
        <select id="character-class">
          <option value="warrior">Warrior</option>
          <option value="mage">Mage</option>
          <option value="rogue">Rogue</option>
        </select>
      </div>
      <div class="resizable-handle"></div> <!-- Resizable handle -->
    `;
  
    // Create the dialog
    const dialog = new Dialog({
      title: "Random Character Generator",
      content: html,
      buttons: {
        generate: {
          label: "Generate",
          callback: () => {
            const race = document.getElementById("character-race").value;
            const charClass = document.getElementById("character-class").value;
            generateRandomCharacter(race, charClass);
          }
        }
      }
    });

    dialog.render(true);

    const dialogElement = dialog.element[0];
    const resizeHandle = dialogElement.querySelector('.resizable-handle');

    let isResizing = false;
    let lastX = 0;
    let lastY = 0;

    resizeHandle.addEventListener('mousedown', (event) => {
      isResizing = true;
      lastX = event.clientX;
      lastY = event.clientY;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });

    function onMouseMove(event) {
      if (!isResizing) return;

      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;

      dialogElement.style.width = `${dialogElement.offsetWidth + dx}px`;
      dialogElement.style.height = `${dialogElement.offsetHeight + dy}px`;

      lastX = event.clientX;
      lastY = event.clientY;
    }

    function onMouseUp() {
      isResizing = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }

    async function generateRandomCharacter(race, charClass) {
      console.log(`Character Generated with Race: ${race}, Class: ${charClass}`);
      try {
        await main(race, charClass); // Pass the values to modify-abilities.js
      } catch (error) {
        console.error("Error running modify-abilities:", error);
      }
    }
  }

  // Create the button once everything is ready
  Hooks.on('ready', createPersistentButton);

})();
