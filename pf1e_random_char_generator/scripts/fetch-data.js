// Define the path to the saved file (locally stored in localStorage)
const storageKey = 'character_data';

// Fetch and save data to localStorage
(async () => {
    try {
        // Fetch the data from the external API
        const url = "https://pathfinder-char-creator.onrender.com/get_character_data"; // Replace with your server URL
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const data = await response.json();
        console.log("Fetched Data:", data);

        // Save the fetched data to localStorage
        localStorage.setItem(storageKey, JSON.stringify(data));
        console.log("Data saved to localStorage.");
        
    } catch (error) {
        console.error("Error fetching or saving data:", error);
    }
})();

// Retrieve data from localStorage
function getCharacterData() {
    const data = localStorage.getItem(storageKey);
    if (data) {
        return JSON.parse(data);
    } else {
        console.log("No data found in localStorage.");
        return null;
    }
}

// Example usage: Retrieve and log the character data
const characterData = getCharacterData();
console.log("Character Data from localStorage:", characterData);
