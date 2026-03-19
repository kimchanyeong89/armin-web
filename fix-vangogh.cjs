const fs = require('fs');

const file = 'public/data/vangogh-museum-collection.json';
let data = JSON.parse(fs.readFileSync(file, 'utf8'));

// simple html decode
function decodeHTMLEntities(text) {
    const entities = {
        '&#x27;': "'", '&#xE9;': "é", '&#x14D;': "ō", '&#xE8;': "è", '&#x2019;': "’",
        '&#xE7;': "ç", '&#xEB;': "ë", '&#xE1;': "á", '&#xEF;': "ï", '&#x2018;': "‘",
        '&#xE0;': "à", '&#xFC;': "ü", '&#xE2;': "â", '&#xF4;': "ô", '&#xE6;': "æ",
        '&#xEE;': "î", '&#xF6;': "ö", '&#xE4;': "ä", '&#xDF;': "ß", '&#xED;': "í",
        '&#x2013;': "–", '&#x2014;': "—", '&#x201D;': "”", '&#x201C;': "“"
    };
    return text.replace(/&#x[0-9A-Fa-f]+;/g, match => entities[match] || match)
               .replace(/&amp;/g, '&');
}

data.forEach(item => {
    let title = item.title;
    if (title) {
        title = decodeHTMLEntities(title);
        
        let artist = item.artist || '';
        artist = decodeHTMLEntities(artist);
        item.artist = artist;
        
        // Match trailing ", <year>" or " <artist>, <year>"
        const yearMatch = title.match(/^(.*?)\s+([^,]+),\s*(\w*\s*\d{4}(?:\s*-\s*\d{4})?)$/);
        // also just match if it ends directly with year that shouldn't be there
        if (yearMatch) {
            let coreTitle = yearMatch[1];
            let possibleYear = yearMatch[3];
            
            title = coreTitle;
            let m = possibleYear.match(/\d{4}/);
            if (m) {
                item.year = parseInt(m[0]);
                item.date = possibleYear;
            }
        }
        item.title = title;
    }
    
    if (item.description && item.description.includes("uses cookies")) {
        item.description = "";
    }
    
    // Many Van Gogh items got his birth year as date
    if (item.year === 1853 && item.artist === "Vincent van Gogh") {
        item.year = 0;
        item.date = "Unknown";
    }
    
});

fs.writeFileSync(file, JSON.stringify(data, null, 2));
console.log("Fixed van gogh!");
