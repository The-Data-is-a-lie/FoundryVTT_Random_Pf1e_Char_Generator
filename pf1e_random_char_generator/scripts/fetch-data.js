// Fetch and save data to localStorage
export async function fetchDataAndSaveToLocalStorage(location, storageKey) {
    try {
        // Fetch the data from the external API
        const response = await fetch(location);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const data = await response.json();
        console.log("Fetched Data:", data);

        // Save the fetched data to localStorage
        localStorage.setItem(storageKey, JSON.stringify(data));
        console.log("Data saved to localStorage.");
        
    } catch (error) {
        console.error("Error fetching or saving data:", error);
    }
}

// Retrieve data from localStorage
export async function getCharacterData(storageKey) {
    const data = localStorage.getItem(storageKey);
    if (data) {
        return JSON.parse(data);
    } else {
        console.log("No data found in localStorage.");
        return null;
    }
}
