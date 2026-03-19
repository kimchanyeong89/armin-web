const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '../public/data/artists-dates.json');
const data = JSON.parse(fs.readFileSync(FILE, 'utf-8'));

// Remove modified keys to prove logic works
const targets = ["Chaïm Soutine", "이중섭", "Lee Jung-seop", "Chaim Soutine"];
targets.forEach(k => {
    if (data[k]) {
        console.log(`Deleting existing key: ${k}`);
        delete data[k];
    }
});

fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
console.log("Cleaned target artists. Ready to test logic.");
