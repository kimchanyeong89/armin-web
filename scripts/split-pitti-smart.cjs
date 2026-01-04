const fs = require('fs');
const path = require('path');

// Read uffizi collection
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/data/uffizi-collection.json'), 'utf8'));
const allObjects = data.objects || [];

// 421 Pitti titles from website
const PITTI_TITLES = [
    "Woman with a Veil", "Madonna and Child with St. John", "Madonna of the Chair",
    "Judith with the Head of Holofernes", "Tunica Delphos", "Abito charleston", "Chanel",
    "The Beheading of St John the Baptist", "White Hall", "Stucco Hall", "Bona Room",
    "Red Salon", "King's study", "King's Bedroom", "Cousin Argia", "Hall of Parrots",
    "Queen's salon", "Elector Palatine's cabinet", "Queen's Bedroom", "Round Room",
    "St. Mary Magdalen", "Mary Magdalen", "Oval Room", "Penitent Magdalene", "Chapel",
    "Blue Room", "Throne Room", "Green Room", "The Spring", "Lamentation over the Dead Christ",
    "The Concert", "Concert", "Cup", "Dacian prisoner", "Bust of Antoninus Pius",
    "Portrait of Lucius Verus", "Senators of Florence", "Ferdinando II de' Medici",
    "Portrait of a Lady", "La Bella", "Statue in armour", "Wedding gown",
    "Martyrdom of St. Cecilia", "Saint Jerome", "Apollo flaying Marsyas", "Apollo and Marsyas",
    "Ecce Homo", "Amor Vincit Omnia", "Menologium", "Madonna del Granduca",
    "Young Bacchus", "St. Nicholas the Thaumaturge", "Saint Catherine of Alexandria",
    "Solaria at Giubbe Rosse", "Petticoat", "Minidress", "Pigiama Palazzo",
    "Painting and Poetry", "Ruggiero", "Father Arlotto", "Cocktail dress",
    "Portrait of Pietro Aretino", "Pietro Aretino", "God speaks to Noah",
    "Assumption of the Virgin", "Hylas and the Nymphs", "Madonna with the Child",
    "Life of St Anne", "Stoup decorated with the Annunciation", "Prie-dieu",
    "Cloister of Santa Croce", "Expulsion of the Duke of Athens",
    "Entry of Charles VIII", "Psyche Abandoned", "Bust with head of Doryphoros",
    "Portrait of Leopoldo de' Medici", "Leopoldo de' Medici", "Still life with ram's head",
    "The cook", "Genius of Sculpture", "St John the Evangelist in Patmos",
    "Allegory of the Peace", "Florence and Fiesole", "Parable of the Sower",
    "Bust of Cosimo I", "Cosimo I de' Medici", "Virgin and Child, St. Elizabeth",
    "Medici Holy Family", "Portrait of Elisabetta Gonzaga", "Duchess of Urbino",
    "Young Man with an Apple", "Portrait of Cardinal Bibbiena", "Cardinal Bibbiena",
    "Portrait of Tommaso Inghirami", "Tommaso Inghirami", "Phaedra", "Ezekiel's Vision",
    "Rest in Egypt", "Oasis", "Dittatore Folle", "Mad Dictator", "Portrait of Lyung-Yuk",
    "At the fountain", "The Viaticum", "Opera coat", "Self portrait", "Self-portrait",
    "Oration", "The prayer", "Pia de' Tolomei", "Nello della Pietra", "Orpheus and Eurydice",
    "Saint Rocco", "View of Castiglioncello", "Evening Dress", "Piccarda Donati",
    "Sharpshooters", "Austrian prisoners", "St. John the Baptist", "Baptism of Christ",
    "Sand Diggers", "Mugnone", "Portico", "Palatine chapel", "Altar",
    "Portrait of Napoleon Bonaparte", "Napoleon", "Allegories of the Seasons",
    "School of Bears", "San Sebastiano", "Saint Sebastian", "Adoration of the Magi",
    "Pia dei Tolomei", "Bust of Piccarda Donati", "Leopold II", "Mount Ceceri",
    "Apostles", "Elisa Baciocchi", "St Zenobius", "Young St. John in the Desert",
    "Adoration of the Shepherds", "The Masquerade", "Seven Wonders of the World",
    "St Elizabeth's Visit", "Madonna of the Cat", "Temptation of St. Jerome",
    "Holy Conversation", "Mystic Marriage of St Catherine", "Pitti Panel",
    "Livia Drusilla", "Ceres", "Antoninus Pius and Faustina", "Antonia the Younger",
    "Empress Marie Louise", "Three Graces", "Still life of a stool",
    "Metaphysical composition", "Vase of flowers with watch", "crystal vase",
    "Harbour with lighthouse", "Harbour scene", "three dead birds",
    "Venus combing Cupid's hair", "Madonna of St. Jerome", "Correggio",
    "Self-portrait of Montorsoli", "Eterno Idioma", "Natività", "La sera",
    "Gli amici nell'atelier", "Niobidi", "Nadir", "Vase with lid",
    "Bust of Napoleon I Bonaparte", "Holiday dress", "Fruits of the Passion",
    "Christ Pantocrator", "Dormition of the Mother of God", "Apostle John the Theologian",
    "Nativity of Jesus", "Virgin of Vladimir", "Shepherdess", "Annunciation",
    "Centaur Chiron and Achilles", "Rape of Europa", "Christ the Saviour",
    "Acheiropoieta", "Kursk Mother of God", "Love Offering", "Kingdom of the Two Sicilies",
    "Teapot", "fantasy animal", "Luigi Ademollo", "Crucifixion on Calvary",
    "Entry of Christ into Jerusalem", "Rustic scene", "Snail seller", "Last Supper",
    "Chigi Crucifix", "Shell bust", "Etruscan-style decoration", "Antoine-Denis Chaudet",
    "Cordelier vases", "Monumental vase", "Caroline Bonaparte", "Murat",
    "Statuettes", "Orientals", "Broth cup", "Tea set", "spindle-shaped vases",
    "dessert set", "Tree of Jesse", "Saint Spyridon", "Bishop of Trimythous",
    "Joy of All Who Sorrow", "Resurrection of Christ", "Descent into Hell",
    "Saints in prayer", "St. John the Warrior", "Prophet Elijah",
    "Transfiguration of Christ", "Raising of Lazarus", "Synaxis of the Archangels",
    "Seven Sleepers of Ephesus", "Ascension of Christ", "Menelaus and Patroclus",
    "Ajax and Achilles", "Charity", "St George Slays the Dragon",
    "Coronation of the Mother of God", "St. Joachim and St. Anne", "Milk-Giver",
    "St. Michael the Archangel", "St. Demetrius of Salonica", "Field flowers",
    "Venus Italica", "Two-handled vase", "breakfast service", "Flower vase", "Victory",
    "Public Audience Chamber", "Summer Apartments", "Pythagoras", "Heracles", "Aristotle",
    "Young Michelangelo", "Singing a ditty", "Coffee service", "Oval vase",
    "Madonna with Child", "Virgin presenting the Child", "Cradle with child",
    "Stipo d'Alemagna", "Christ in the House of Martha", "Mary and Lazarus",
    "Hercules Room", "Maria Theresa of Habsburg", "Francis I", "Holy Roman Emperor",
    "A Pasture", "Portrait of Signora Morrocchi", "morning of 27 April 1859",
    "Jupiter Room", "Calling of Saints Peter and Andrew", "Cameo", "Eleonor of Toledo",
    "Pendant with triton", "Ball-Contrefait", "Stone mask", "Teotihuacan",
    "Knidian Aphrodite", "Cabinet for the Crown", "Philip II of Spain",
    "Bust of Don Carlos", "Martyrdom of St Agatha", "St. Francis of Assisi",
    "Room of Venus", "Medici Chest", "Double cup", "Cosimo II de' Medici's Ex voto",
    "Venus and Cupid", "Piazza del Carmine", "Train for courtly gown", "Nightgown",
    "Court mantle", "Chained Putto", "Chinese New Year in Bangkok", "The Stranger",
    "Story of Lucretia", "Burial clothes of Don Garzia", "Burial clothes of Cosimo I",
    "Made in Florence", "Mars Room", "Stove Room", "Prison in Portoferraio",
    "Nina Ricci", "Centrepiece", "Adoration of the Christ Child",
    "Corpse of Jacopo de' Pazzi", "Apollo Room", "Ring with carved stone",
    "Vase with dragon-shaped lid", "Martyrdom of St. Andrew", "Blade Sharpener",
    "Landscape at Grizzana", "Flask", "Piazza Granducale", "Sleeping Infant St John",
    "Asclepius", "Athlete", "Mercury with pétasos", "Mercury with petasos",
    "Athena Giustiniani", "Confidences", "Portrait of a female mule", "Allori Loggia",
    "Hercules and Cerberus", "dream of Solomon", "Weary Hercules",
    "Grand Gala Berlin carriage", "Ferdinand III", "Hercules and Antaeus",
    "battle of Magenta", "Giuseppe Mazzini", "Francesco Domenico Guerrazzi",
    "Vincenzo Gioberti", "Ferdinand and Maria Anna", "Habsburg-Lorraine",
    "Fig thieves", "Urchins", "Transformation gown", "House dress",
    "ceremony dress", "Wedding dress", "Gala dress", "Women's garden dress",
    "Madonna del Baldacchino", "Madonna dell'Impannata", "Guidubaldo da Montefeltro",
    "La Gravida", "Portrait of Julius II", "Julius II", "Saint Mary Magdalene",
    "Deposition", "Luco Altarpiece", "Portrait of Luca Martini", "Luca Martini",
    "Minaudière", "Maurizio Galante", "Delphos", "Mantle", "Long dress",
    "Kaleidoscope evening suit", "Evening minidress", "Two-piece suit", "Overcoat",
    "Tunic", "Woman's evening gown", "Jacket and skirt", "Rosa", "Banksiae",
    "Clementina Carbonieri", "Débutante", "Centifolia", "Alba Incarnata"
];

// Location patterns for Pitti
const PITTI_LOCATIONS = [
    'saturn room', 'jupiter room', 'mars room', 'apollo room', 'venus room',
    'prometheus room', 'ulysses room', 'iliad room', 'education of jupiter',
    'allegories room', 'flora room', 'hercules room', 'castagnoli room',
    'bona room', 'white hall', 'stucco hall', 'king', 'queen', 'throne room',
    'red salon', 'green room', 'blue room', 'round room', 'oval room', 'chapel',
    'royal apartments', 'palatine', 'pitti', 'boboli', 'botanical garden',
    'giardino del cavaliere', 'porcelain museum', 'costume gallery',
    'silver museum', 'gallery of modern art', 'limonaia', 'lemon house'
];

// Normalize for comparison
function normalize(str) {
    if (!str) return '';
    return str.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[''`]/g, "'")
        .replace(/[""]/g, '"')
        .replace(/\s+/g, ' ')
        .trim();
}

// Check if artwork is Pitti
function isPitti(artwork) {
    const title = normalize(artwork.title || '');
    const location = normalize(artwork.location || '');
    const sourceUrl = normalize(artwork.sourceUrl || '');
    const description = normalize(artwork.description || '');

    // 1. Location match
    for (const loc of PITTI_LOCATIONS) {
        if (location.includes(loc)) return { match: true, reason: 'location: ' + loc };
    }

    // 2. SourceUrl contains pitti
    if (sourceUrl.includes('pitti')) return { match: true, reason: 'sourceUrl contains pitti' };

    // 3. Title match (partial)
    for (const pittiTitle of PITTI_TITLES) {
        const normalizedPitti = normalize(pittiTitle);
        if (normalizedPitti.length >= 5) {
            if (title.includes(normalizedPitti) || normalizedPitti.includes(title)) {
                // Avoid false positives on very short matches
                if (title.length >= 5 || normalizedPitti.length >= 10) {
                    return { match: true, reason: 'title match: ' + pittiTitle };
                }
            }
        }
    }

    // 4. Description mentions Pitti or Palatine
    if (description.includes('pitti palace') || description.includes('palatine gallery') ||
        description.includes('pitti') || description.includes('palatine')) {
        return { match: true, reason: 'description mentions Pitti/Palatine' };
    }

    return { match: false };
}

// Split
const pittiArtworks = [];
const uffiziArtworks = [];

for (const artwork of allObjects) {
    const result = isPitti(artwork);
    if (result.match) {
        artwork._matchReason = result.reason;
        pittiArtworks.push(artwork);
    } else {
        uffiziArtworks.push(artwork);
    }
}

console.log('📊 Total:', allObjects.length);
console.log('✅ Pitti Palace:', pittiArtworks.length);
console.log('✅ Uffizi Gallery:', uffiziArtworks.length);

// Save Pitti
const pittiOutput = {
    museum: "Pitti Palace",
    museumId: "pitti-palace",
    location: "Florence, Italy",
    type: "permanent",
    totalArtworks: pittiArtworks.length,
    objects: pittiArtworks.map(a => { delete a._matchReason; return a; })
};
fs.writeFileSync(path.join(__dirname, '../public/data/pitti-palace-collection.json'), JSON.stringify(pittiOutput, null, 2));

// Save Uffizi
const uffiziOutput = {
    museum: "Uffizi Gallery",
    museumId: "uffizi-gallery",
    location: "Florence, Italy",
    type: "permanent",
    totalArtworks: uffiziArtworks.length,
    objects: uffiziArtworks
};
fs.writeFileSync(path.join(__dirname, '../public/data/uffizi-gallery-collection.json'), JSON.stringify(uffiziOutput, null, 2));

console.log('\n✅ Files saved!');
console.log('\nSample Pitti (first 15):');
pittiArtworks.slice(0, 15).forEach(a => console.log('  -', a.title));
