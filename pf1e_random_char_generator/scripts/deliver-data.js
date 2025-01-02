const axios = require('axios');

// Manually set the values for now
var data = {
    input1: "Y",
    input2: "North",  // Example manual data for region
    input3: "Elf",  // Example manual data for race
    input4: "Wizard",  // Example manual data for class
    input5: "Sorcerer",  // Example manual data for multi-class
    input6: "Lawful Good",  // Example manual data for alignment
    input7: "Male",  // Example manual data for gender
    input8: "Yes",  // Example manual data for truly-random-feats
    input9: "5",  // Example manual data for number-of-dice
    input10: "6",  // Example manual data for dice-size
    input11: "10",  // Example manual data for highest-level-possible
    input12: "1",  // Example manual data for lowest-level-possible
    input13: "1000"  // Example manual data for starting-gold
};

// Make sure the URL and method are correct for the endpoint
sendDataToServer(data);

function sendDataToServer(data) {
    axios.post('https://pathfinder-char-creator.onrender.com/update_character_data', data, {
        headers: {
            'Content-Type': 'application/json'  // Ensure the server knows to expect JSON data
        }
    })
    .then((response) => {
        console.log('Successfully sent data:', response.data);
    })
    .catch((error) => {
        console.error('Error sending data to server:', error);
    });
}
