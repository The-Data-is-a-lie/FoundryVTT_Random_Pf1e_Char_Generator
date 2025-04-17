export async function sendDataToServer(data, location, storageKey) {
    // Log the data before sending it
    console.log("1st data send check: ", data);
    
    fetch(location, 
    {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data), // Send the data as JSON
    })
    .then(response => {
        // Log the response status and the response body before processing
        console.log("Response status: ", response.status);
        
        if (!response.ok) {
            console.error('Failed to send data:', response.status, response.statusText);
            throw new Error('Network response was not ok');
        }
        return response.json();
    })
    .then(responseData => {
        // Log the response data returned from the server
        console.log("2nd data send check:", responseData);
        localStorage.setItem(storageKey, JSON.stringify(responseData));

    })
    .catch(error => {
        console.error('Error sending data to server:', error);
    });
}

