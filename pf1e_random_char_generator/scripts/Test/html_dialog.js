export function showCharacterGeneratorDialog() {
    // Get the saved character data from localStorage
    const savedData = JSON.parse(localStorage.getItem('deliverData.json')) || {};
  
    const html = `
      <button id="generate-character">Generate Character</button>
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
      <div>
        <label for="inherents">Do you want inherent stats:</label>
          <option value="y" ${savedData.inherents === "y" ? "selected" : ""}>Yes</option>
          <option value="n" ${savedData.inherents === "n" ? "selected" : ""}>No</option>
      </div>
      <div class="resizable-handle"></div> <!-- Resizable handle -->
    `;

    // Render the Dialog instead of returning the HTML
    new Dialog({
      title: "Random Character Generator",
      content: html,
      buttons: {
          generate: {
              label: "Generate Character",
              callback: () => {
                  const characterData = {
                      region: document.getElementById('character-region').value
                  };

                  localStorage.setItem('deliverData.json', JSON.stringify(characterData));
                  console.log("Character Data Generated:", characterData);
              }
          }
      }
  }).render(true);
}