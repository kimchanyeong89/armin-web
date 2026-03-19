const fs = require('fs');

async function testDetailApi() {
    // ID from the sample "La Persane"
    const id = "696505b2dcda770c5709adc8";
    const url = `https://musee-matisse.opacweb.io/api/v2/notices/${id}`;
    console.log(`Fetching ${url}...`);

    try {
        const response = await fetch(url);
        const data = await response.json();
        fs.writeFileSync('matisse-detail-sample.json', JSON.stringify(data, null, 2));
    } catch (e) {
        console.error(e);
    }
}

testDetailApi();
