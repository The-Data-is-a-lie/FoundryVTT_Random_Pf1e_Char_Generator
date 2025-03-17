// // Imports
import { sendDataToServer } from './deliver-data.js';
// import { fetchDataAndSaveToLocalStorage, getCharacterData } from './fetch-data.js';
import { main } from './modify-abilities.js';

// import { getCharacterData } from './fetch-data.js';
// import { sendDataToServer } from './deliver-data.js';
// import { fetchDataAndSaveToLocalStorage, getCharacterData} from './fetch-data.js';
// import { main } from './modify-abilities.js';


// Function to create the persistent button
// need export so we can import in main.js
export async function createPersistentButton() {
  // test server
  // const deliver_location = 'http://localhost:5000/update_character_data';
  // perm server
  const deliver_location = 'https://pathfinder-char-creator.onrender.com/update_character_data';
  


  const button = document.createElement('button');
  button.textContent = "Character Generator";
  button.id = "character-generator-button";

  // Button Style options
  button.style.position = 'fixed';
  button.style.bottom = '10%';
  button.style.left = '2%';
  button.style.width = '125px';
  button.style.height = '75px';
  button.style.border = '1px solid #ccc';
  button.style.borderRadius = '5px';
  button.style.backgroundColor = '#333';
  button.style.color = 'white';
  button.style.fontSize = '12px';
  button.style.cursor = 'pointer';
  button.style.textAlign = 'center';
  button.style.lineHeight = '50px';

  // Add event listener to show the dialog when clicked
  // clicking the persistent button should only show the dialog
  button.addEventListener('click', async () => {
      showCharacterGeneratorDialog();

  // Import deliver-data.js
  try {  
    // await import('./deliver-data.js');
    
    const savedData = JSON.parse(localStorage.getItem('deliverData.json')) || {};
    // console.log("Data sent over to server:", savedData);
    
    console.log('deliver_location', deliver_location)
    await sendDataToServer(savedData, deliver_location, 'pulledCharacterData');
    // for some reason sendDataToServer grabs the correct data as well

  } catch (error) {
    console.error("Error deliver-data.js in button.js:", error);
  }  

  // Don't use anymore (sendDataToServer sends data + grabs it)
  // // Import fetch-data.js
  // try {
  //   // await import('./fetch-data.js');
  //   await fetchDataAndSaveToLocalStorage(deliver_location, 'pulledCharacterData');
  //   await getCharacterData('pulledCharacterData');
  // } catch (error) {
  //   console.error("Error importing fetch-data.js in button.js:", error);
  // }

  // Import main from modify-abilities.js (bulk of the character creation)
  try {
    // await import('./modify-abilities.js');
    await main();
  } catch (error) {
    console.error("Error importing modify-abilities in button.js:", error);
  }
  
  // Import createCharacterFunc from createCharacter.js
  try {
    // await import('./createCharacter.js');
    await createAndAssignActor();
  } catch (error) {
    console.error("Error importing createCharacter in button.js:", error);
  }
});



  // Add dragging functionality
  let isDragging = false;
  let offsetX, offsetY;

  button.addEventListener('mousedown', (event) => {
      isDragging = true;
      offsetX = event.clientX - button.getBoundingClientRect().left;
      offsetY = event.clientY - button.getBoundingClientRect().top;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
  });

  function onMouseMove(event) {
      if (!isDragging) return;
      const newX = event.clientX - offsetX;
      const newY = event.clientY - offsetY;
      button.style.left = `${newX}px`;
      button.style.top = `${newY}px`;
  }

  function onMouseUp() {
      isDragging = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
  }

  document.body.appendChild(button);
}

function showCharacterGeneratorDialog() {
  // Get the saved character data from localStorage
  const savedData = JSON.parse(localStorage.getItem('deliverData.json')) || {};

  const html = `
    <div>
      <label for="character-region">Select Region:</label>
      <select id="character-region">
        <option value="0" ${savedData.region === "0" ? "selected" : ""}>Random</option>
        <option value="1" ${savedData.region === "1" ? "selected" : ""}>Tal-falko</option>
        <option value="2" ${savedData.region === "2" ? "selected" : ""}>Dolestan</option>
        <option value="3" ${savedData.region === "3" ? "selected" : ""}>Sojoria</option>
        <option value="4" ${savedData.region === "4" ? "selected" : ""}>Ieso</option>
        <option value="5" ${savedData.region === "5" ? "selected" : ""}>Spire</option>
        <option value="6" ${savedData.region === "6" ? "selected" : ""}>Feyador</option>
        <option value="7" ${savedData.region === "7" ? "selected" : ""}>Esterdragon</option>
        <option value="8" ${savedData.region === "8" ? "selected" : ""}>Grundykin Damplands</option>
        <option value="9" ${savedData.region === "9" ? "selected" : ""}>Dust Cairn</option>
        <option value="10" ${savedData.region === "10" ? "selected" : ""}>Kaeru no Tochi</option>
      </select>
    </div>
    <div>
      <label for="character-race">Select Race:</label>
      <select id="character-race">
        ${[
          'Dwarf', 'Elf', 'Gnome', 'Half-Elf', 'Halfling', 'Half-Orc', 'Human',
          'Aasimar', 'Aquatic Elf', 'Catfolk', 'Changeling', 'Dhampir', 'Drow',
          'Fetchling', 'Gathlain', 'Ghoran', 'Gillman', 'Goblin', 'Grippli',
          'Hobgoblin', 'Ifrit', 'Kitsune', 'Kobold', 'Locathah', 'Merfolk',
          'Monkey Goblin', 'Nagaji', 'Orc', 'Oread', 'Ratfolk', 'Sahuagin',
          'Skinwalker', 'Strix', 'Svirfneblin', 'Sylph', 'Syrinx', 'Tengu',
          'Tiefling', 'Triaxian', 'Triton', 'Undine', 'Vanara', 'Vine Leshy',
          'Vishkanya', 'Wayang', 'Wyrwood', 'Wyvaran', 'Yaddithian'
        ].map(race => 
          `<option value="${race.toLowerCase().replace(/\s/g, '-')}" 
            ${savedData.race === race.toLowerCase().replace(/\s/g, '-') ? "selected" : ""}>
            ${race}
          </option>`
        ).join('')}
      </select>
    </div>
    <div>
      <label for="character-class">Select Class:</label>
      <select id="character-class">
        ${[
          'Random', 'Alchemist', 'Antipaladin', 'Arcanist', 'Barbarian', 'Barbarian (Unchained)', 'Bard',
          'Bloodrager', 'Brawler', 'Cavalier', 'Cleric', 'Druid', 'Fighter', 'Gunslinger', 'Hunter', 'Inquisitor',
          'Investigator', 'Magus', 'Monk', 'Monk (Unchained)', 'Ninja', 'Oracle', 'Paladin', 'Ranger', 'Rogue',
          'Rogue (Unchained)', 'Samurai', 'Shaman', 'Shifter', 'Skald', 'Slayer', 'Sorcerer', 'Summoner',
          'Summoner (Unchained)', 'Swashbuckler', 'Vigilante', 'Warpriest', 'Witch', 'Wizard'
        ].map(char_class => 
          `<option value="${char_class.toLowerCase().replace(/\s/g, '-')}" 
            ${savedData.class === char_class.toLowerCase().replace(/\s/g, '-') ? "selected" : ""}>
            ${char_class}
          </option>`
        ).join('')}
      </select>
    </div>
    <div>
      <label for="multiclass">Multiclass:</label>
      <select id="multiclass">
        <option value="n" ${savedData.multiclass === "n" ? "selected" : ""}>No</option>
      </select>
    </div>
    <div>
      <label for="alignment">Choose Alignment:</label>
      <select id="alignment">
        <option value="random" ${savedData.alignment === "random" ? "selected" : ""}>Random</option>
        <option value="cg" ${savedData.alignment === "cg" ? "selected" : ""}>Chaotic Good</option>
        <option value="cn" ${savedData.alignment === "cn" ? "selected" : ""}>Chaotic Neutral</option>
        <option value="ce" ${savedData.alignment === "ce" ? "selected" : ""}>Chaotic Evil</option>
        <option value="ng" ${savedData.alignment === "ng" ? "selected" : ""}>Neutral Good</option>
        <option value="n" ${savedData.alignment === "n" ? "selected" : ""}>Neutral</option>
        <option value="ne" ${savedData.alignment === "ne" ? "selected" : ""}>Neutral Evil</option>
        <option value="lg" ${savedData.alignment === "lg" ? "selected" : ""}>Lawful Good</option>
        <option value="ln" ${savedData.alignment === "ln" ? "selected" : ""}>Lawful Neutral</option>
        <option value="le" ${savedData.alignment === "le" ? "selected" : ""}>Lawful Evil</option>
      </select>
    </div>
    <div>
      <label for="gender">Choose Gender:</label>
      <select id="gender">
        <option value="random" ${savedData.gender === "random" ? "selected" : ""}>Random</option>
        <option value="male" ${savedData.gender === "male" ? "selected" : ""}>Male</option>
        <option value="female" ${savedData.gender === "female" ? "selected" : ""}>Female</option>
      </select>
    </div>
    <div>
      <label for="random-feats">Truly Randomized Feats:</label>
      <select id="random-feats">
        <option value="y" ${savedData.randomFeats === "y" ? "selected" : ""}>Yes</option>
        <option value="n" ${savedData.randomFeats === "n" ? "selected" : ""}>No</option>
      </select>
    </div>
    <div>
      <label for="dice-rolls">Number of Dice:</label>
      <input type="number" id="dice-rolls" min="1" value="${savedData.diceRolls || ''}">
    </div>
    <div>
      <label for="dice-sides">Number of Sides on Each Die:</label>
      <input type="number" id="dice-sides" min="1" value="${savedData.diceSides || ''}">
    </div>
    <div>
      <label for="highest-level">Enter Highest Level:</label>
      <input type="number" id="highest-level" min="1" value="${savedData.highestLevel || ''}">
    </div>
    <div>
      <label for="lowest-level">Enter Lowest Level:</label>
      <input type="number" id="lowest-level" min="1" value="${savedData.lowestLevel || ''}">
    </div>
    <div>
      <label for="gold-amount">Desired Gold Amount (or leave blank):</label>
      <input type="number" id="gold-amount" min="0" value="${savedData.goldAmount || ''}" placeholder="Optional">
    </div>
    <div class="resizable-handle"></div> <!-- Resizable handle -->
  `;

  const dialog = new Dialog({
    title: "Random Character Generator",
    content: html,
    buttons: {
      generate: {
        label: "Change Generated Character Info",
        callback: () => {
          // Get form data
          const characterData = {
            input: "Y",  // Ensure the first value is "Y"
            region: document.getElementById('character-region').value,
            race: document.getElementById('character-race').value,
            class: document.getElementById('character-class').value,
            multiclass: document.getElementById('multiclass').value,
            alignment: document.getElementById('alignment').value,
            gender: document.getElementById('gender').value,
            randomFeats: document.getElementById('random-feats').value,
            diceRolls: document.getElementById('dice-rolls').value,
            diceSides: document.getElementById('dice-sides').value,
            highestLevel: document.getElementById('highest-level').value,
            lowestLevel: document.getElementById('lowest-level').value,
            goldAmount: document.getElementById('gold-amount').value
          };
  
          // Save the data to localStorage
          localStorage.setItem('deliverData.json', JSON.stringify(characterData));
  
          // You can proceed with your logic for generating the character here
          console.log("Character Data Generated: ", characterData);
        }
      }
    }
  }).render(true);
  
}
