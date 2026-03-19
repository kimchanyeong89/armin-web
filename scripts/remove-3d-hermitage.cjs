const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../public/data/hermitage-highlights.json');

// Copied from src/utils/artworkClassification.ts
const CATEGORY_MAP = {
    "drawing": "Drawing",
    "drawings": "Drawing",
    "draw": "Drawing",
    "dibujo": "Drawing",
    "dibujos": "Drawing",
    "disegno": "Drawing",
    "engravings (prints)": "Graphic artwork",
    "engravings": "Graphic artwork",
    "engraving": "Graphic artwork",
    "prints": "Graphic artwork",
    "print": "Graphic artwork",
    "graphic artwork": "Graphic artwork",
    "graphic artworks": "Graphic artwork",
    "lithographs": "Graphic artwork",
    "lithograph": "Graphic artwork",
    "oil painting": "Painting",
    "paintings": "Painting",
    "painting": "Painting",
    "pintura": "Painting",
    "pinturas": "Painting",
    "pottery (visual works)": "Ceramics",
    "pottery": "Ceramics",
    "ceramic": "Ceramics",
    "ceramics": "Ceramics",
    "sculpture (visual work)": "Sculpture",
    "sculptures": "Sculpture",
    "sculpture": "Sculpture",
    "escultura": "Sculpture",
    "esculturas": "Sculpture",
    "sketchbooks": "Sketchbooks",
    "sketchbook": "Sketchbooks",
    "photography": "Photography",
    "photograph": "Photography",
    "photos": "Photography",
    "posters": "Posters",
    "poster": "Posters",
};
const CATEGORY_ENTRIES = Object.entries(CATEGORY_MAP);

const normalizeCategory = (cat) => {
    if (!cat) return '';
    const lower = cat.toLowerCase().trim();

    if (CATEGORY_MAP[lower]) {
        return CATEGORY_MAP[lower];
    }

    for (const [key, value] of CATEGORY_ENTRIES) {
        if (lower.includes(key) || key.includes(lower)) {
            return value;
        }
    }

    return cat.split(/\s+/).map(word =>
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ');
};

const normalizeForMatch = (v) => String(v ?? '').toLowerCase().trim();

// Copied material map (though mostly useful for Korean museums, good to have)
const MATERIAL_TO_TYPE = {
    '지': '2D', '사직': '2D', '종이': '2D', '섬유': '2D',
    '도자기': '3D', '토제': '3D', '금속': '3D', '석': '3D', '나무': '3D',
    '유리/보석': '3D', '골각패갑': '3D', '피모': '3D', '초제': '3D',
    '광물': '3D', '흙': '3D', '경질': '3D', '연질': '3D', '와질': '3D',
    '청자': '3D', '백자': '3D', '분청': '3D', '철': '3D', '청동': '3D',
    '동합금': '3D', '금동': '3D', '금': '3D', '은': '3D', '화강암': '3D',
    '돌': '3D', '옥': '3D', '기타': '3D', '칠기': '3D', '뼈/뿔/조개': '3D',
};

const classifyArtwork = (artwork) => {
    let category = artwork.category || artwork.classification || artwork.artworkType || artwork.objectType || '';
    // Combine technique and material for medium for Hermitage data structure
    const medium = [artwork.medium, artwork.technique, artwork.material, artwork.materials].filter(Boolean).join(' ');

    if (!category || category === 'Artwork' || category === 'Untitled') {
        if (medium) {
            category = medium;
        }
    }

    const normalizedCategory = normalizeCategory(category);

    if (MATERIAL_TO_TYPE[category] || MATERIAL_TO_TYPE[medium]) {
        return {
            type: MATERIAL_TO_TYPE[category] || MATERIAL_TO_TYPE[medium],
            category: normalizedCategory
        };
    }

    const categoryText = normalizeForMatch(category);
    const mediumText = normalizeForMatch(medium);
    const combinedText = `${categoryText} ${mediumText}`;

    if (/video|film|animation|projection|moving image/i.test(combinedText)) {
        return { type: '2D', category: normalizedCategory };
    }

    // UPDATED REGEX FROM RECENT CONVERSATION
    const has3DObjectCue = /\b(sculptures?|sculptural|statues?|statuettes?|busts?|reliefs?|objects?|vessels?|coins?|medals?|weapons?|armors?|armours?|masks?|dolls?|furniture|jewelr(y|ies)|jewellery|installations?|architecture|skulptur(en)?|plastik(en)?|b\.?ste|objekt(e)?|kunsthandwerk|skulptural|esculturas?|estatuas?|bustos?|relieves?|objetos?|sculturas?|riliev[oi]|objets?|contemporary art|assemblages?|constructions?|mobiles?|ceramics?|keramik(en)?|potter(y|ies)|terracottas?|porcelains?|clays?|stones?|marbles?|bronzes?|woods?|carvings?|metals?|textiles?|tapestr(y|ies)|applied arts?|artifacts?|archaeological|gems?|glasser?|ivor(y|ies)|fans?)\b/i.test(combinedText);

    if (has3DObjectCue) {
        return { type: '3D', category: normalizedCategory };
    }

    const has2DCue = /\b(painting|drawing|print|calligraphy|photography|graphic|collage|poster|sketch|watercolor|watercolour|lithograph|etching|engraving|woodcut|screen ?print|silkscreen|dipinto|disegno|incisione|stampa|fotografia|acquarello|litografia|xilografia|pittura|peinture|dessin|estampe|gravure|photographie|aquarelle|pintura|dibujo|grabado|acuarela|oil|acrylic|tempera|gouache|ink|pencil|charcoal|pastel|crayon|canvas|paper|cardboard|panel|parchment)\b/i.test(combinedText);

    if (has2DCue) {
        return { type: '2D', category: normalizedCategory };
    }

    return { type: '2D', category: normalizedCategory || 'Unknown' };
};

try {
    const rawData = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(rawData);

    console.log(`Original count: ${data.length}`);

    const filteredData = data.filter(item => {
        const result = classifyArtwork(item);
        // Debug logging for 3D items being removed
        if (result.type === '3D') {
            // console.log(`Removing 3D item: ${item.title} (${item.category} / ${item.technique} / ${item.material})`);
            return false;
        }
        return true;
    });

    console.log(`Filtered count: ${filteredData.length}`);
    console.log(`Removed ${data.length - filteredData.length} items.`);

    fs.writeFileSync(filePath, JSON.stringify(filteredData, null, 2));
    console.log('Successfully updated hermitage-highlights.json');

} catch (err) {
    console.error('Error processing file:', err);
}
