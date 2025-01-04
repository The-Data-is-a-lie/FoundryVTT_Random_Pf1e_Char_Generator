// deliver-data.js
import * as axios from 'https://cdn.jsdelivr.net/npm/axios/dist/axios.min.js';

// Export sendDataToServer
export async function sendDataToServer(data, location) {
    try {
        const response = await axios.post(location, data, {
            headers: {
                'Content-Type': 'application/json',
            },
        });

        console.log('Successfully sent data:', response.data);
    } catch (error) {
        console.error('Error sending data to server:', error);
    }
}

