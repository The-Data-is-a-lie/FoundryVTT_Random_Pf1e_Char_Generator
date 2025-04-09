// Function to fetch data and save it to localStorage
export async function fetchDataAndSaveToLocalStorage(location, storageKey) {
    console.log("fetching data location:", location);
    try {
        // Fetch data from the backend
        const response = await fetch(location, {
            method: 'POST',
            credentials: 'include', // Include cookies/session if needed
        });

        console.log("grabbed cookie", document.cookie)

        // Check if the response is successful
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        // Parse the JSON response
        const data = await response.json();

        // Log the fetched data
        console.log('Fetched Data:', data);

        // Save the fetched data to localStorage (convert to JSON string)
        localStorage.setItem(storageKey, JSON.stringify(data));

        // Confirm saving to localStorage
        console.log(`${storageKey} saved to localStorage.`);
    } catch (error) {
        console.error('Error fetching or saving data:', error);
    }
}


async function stableStringify(obj) {
    if (Array.isArray(obj)) {
      return `[${obj.map(stableStringify).join(',')}]`;
    } else if (obj && typeof obj === 'object') {
      const keys = Object.keys(obj); // preserve original key order
      const keyValuePairs = keys.map(key => `"${key}":${stableStringify(obj[key])}`);
      return `{${keyValuePairs.join(',')}}`;
    } else {
      return JSON.stringify(obj);
    }
  }
// // Function to retrieve the data from localStorage
// export async function getCharacterData(storageKey) {
//     // Get the character data from localStorage
//     const pulledCharacterData = JSON.parse(localStorage.getItem(storageKey));

//     // Check if the data exists and log it
//     if (pulledCharacterData) {
//         console.log('Pulled Character Data:', pulledCharacterData);
//         return pulledCharacterData;
//     } else {
//         console.log('No character data found in localStorage.');
//         return null;
//     }
// }