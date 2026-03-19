
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '../public/data/artists-dates.json');

const seeds = {
    "Pablo Picasso": {
        "name": "Pablo Picasso",
        "deathDate": "1973.09.12",
        "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/9/98/Pablo_picasso_1.jpg",
        "wikiId": "Q5593",
        "notFound": false
    },
    "Vincent van Gogh": {
        "name": "Vincent van Gogh",
        "deathDate": "1890.07.29",
        "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/4/4c/Vincent_van_Gogh_-_Self-Portrait_-_Google_Art_Project_%28454045%29.jpg",
        "wikiId": "Q5582",
        "notFound": false
    },
    "Claude Monet": {
        "name": "Claude Monet",
        "deathDate": "1926.12.05",
        "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/a/a4/Claude_Monet_1899_Nadar_crop.jpg",
        "wikiId": "Q296",
        "notFound": false
    },
    "Salvador Dalí": {
        "name": "Salvador Dalí",
        "deathDate": "1989.01.23",
        "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/2/24/Salvador_Dal%C3%AD_1939.jpg",
        "wikiId": "Q5577",
        "notFound": false
    }
};

let data = {};
if (fs.existsSync(FILE)) {
    try {
        data = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
    } catch (e) { }
}

// Merge seeds
Object.keys(seeds).forEach(key => {
    data[key] = seeds[key];
});

fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
console.log("Seeded artists-dates.json properly.");
