const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '../public/data/artists-dates.json');
const data = JSON.parse(fs.readFileSync(FILE, 'utf-8'));

// Patch Chaïm Soutine
const key = "Chaïm Soutine";
if (data[key]) {
    data[key].birthDate = "1893.01.13";
    data[key].deathDate = "1943.08.09";
    data[key].wikiId = "Q160138";
    data[key].notFound = false;
    console.log("Patched Chaïm Soutine");
} else {
    console.log("Soutine not found in file?");
}

// Patch Lee Jung-seop just in case
const key2 = "이중섭";
if (data[key2]) {
    // Ensure notFound is false
    data[key2].notFound = false;
    console.log("Patched Lee Jung-seop status");
}

fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
console.log("Done");
