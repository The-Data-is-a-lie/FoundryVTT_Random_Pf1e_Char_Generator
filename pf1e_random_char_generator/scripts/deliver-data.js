export async function sendDataToServer(data, location, storageKey) {
    // Log the data before sending it
    console.log("1st data send check: ", data);

    // NOTE: this is awaited fully (previously it was fire-and-forget). The returned character is
    // written to localStorage BEFORE this resolves, so the caller can safely build the actor from
    // fresh data right after awaiting — no race with the network round-trip (incl. cold starts).
    try {
        const response = await fetch(location,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data), // Send the data as JSON
        });

        // Log the response status before processing
        console.log("Response status: ", response.status);
        if (!response.ok) {
            console.error('Failed to send data:', response.status, response.statusText);
            throw new Error(`Network response was not ok (${response.status})`);
        }

        const responseData = await response.json();
        // Log the response data returned from the server
        console.log("2nd data send check:", responseData);
        localStorage.setItem(storageKey, JSON.stringify(responseData));
        return responseData;
    } catch (error) {
        console.error('Error sending data to server:', error);
        // Surface a visible error (was previously a silent console-only failure) so the GM knows
        // why nothing appeared instead of getting an actor built from stale data.
        ui.notifications?.error(
            `Character Generator: couldn't reach the backend server at ${location}. ` +
            `Check the "Backend URL" module setting. No character was created.`
        );
        // Re-throw so the caller aborts before building an actor from stale/previous data.
        throw error;
    }
}

