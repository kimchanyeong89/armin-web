// Split Uffizi collection using COMPLETE Pitti Palace titles scraped from website
const fs = require('fs');
const path = require('path');

// All 429 Pitti Palace artwork titles from https://www.uffizi.it/en/pitti-palace/artworks
const PITTI_TITLES = [
    "Woman with a Veil", "Madonna and Child with St. John (known as Madonna of the Chair)", "Woman's gown", "Judith with the Head of Holofernes", "Tunica Delphos", "Abito charleston", "Chanel", "The Beheading of St John the Baptist", "Woman's slipper", "White Hall (or Stucco Hall)", "Woman's shoe", "Bona Room", "Red Salon", "Parasole, italian workshop", "King's study", "Cousin Argia", "King's Bedroom", "Hall of \"Parrots\"", "Queen's salon", "Elector Palatine's cabinet", "The Queen's Bedroom", "Round Room", "St. Mary Magdalen", "Oval Room in the Royal Apartments", "The Penitent Magdalene", "Chapel", "Blue Room", "Throne Room", "Green Room", "Silk crêpe gown", "Parasol", "The Spring (Evening gown)", "Lamentation over the Dead Christ", "Plate decorated with some objects from the the "Hundred Antiques"", "Woman's shoes", "Dancing woman's shoes", "The Concert", "Cup", "Dacian prisoner", "Bust of Antoninus Pius", "Portrait of Lucius Verus", "The Senators of Florence swearing Allegiance to Ferdinando II de' Medici", "Fan", "Italian fan", "Portrait of a Lady ("La Bella")", "Statue in armour", "Japanese lacquered and painted plate featuring a river landscape with plants", "Wedding gown in silk", "Martyrdom of St. Cecilia", "Saint Jerome", "Apollo flaying Marsyas", "Chinese plate with three figures and a small dog", "Ecce Homo", "Amor Vincit Omnia", "Menologium", "Portrait of a lady", "Evening dress", "Black evening dress", "Pull-Together woman's suite", "Curiel evening dress", "Nativity of the Mother of God (1890 n. 6173)", "Tikhvin Mother of God", "Madonna del Granduca", "Young Bacchus", "St. Nicholas the Thaumaturge, with scenes from the story of his life", "The Great Martyr Saint Catherine of Alexandria", "The Mother of God and St. Nicholas Converse with the Sacristan George, with scenes of the feast days", "Kazan Mother of God and certain miracles wrought by the icon", "Solaria at Giubbe Rosse", "Petticoat", "Minidress by Pino Lancetti", "Pigiama Palazzo", "Painting and Poetry", "Ruggiero at the court of the sorceress Alcina", "One of Father Arlotto's Tricks", "Cocktail dress", "Portrait of Pietro Aretino", "God speaks to Noah after the Flood", "Assumption of the Virgin (Assunta Passerini)", "Hylas and the Nymphs", "Madonna with the Child and Scenes from the Life of St Anne", "Stoup decorated with the Annunciation", "Minidress", "Prie-dieu of the Electress Palatine", "The Cloister of Santa Croce", "Expulsion of the Duke of Athens", "Entry of Charles VIII into Florence", "Psyche Abandoned", "Bust with head of Doryphoros", "Portrait of Leopoldo de' Medici in swaddling", "Still life with ram's head", "Abito in poliestere", "Suit", "The cook", "The Genius of Sculpture", "St John the Evangelist in Patmos", "Allegory of the Peace between Florence and Fiesole", "Parable of the Sower", "Dress and overcoat", "Bust of Cosimo I de' Medici", "Hat", "Day dress", "Virgin and Child, St. Elizabeth and the infant St. John the Baptist (Medici Holy Family)", "Portrait of Elisabetta Gonzaga, Duchess of Urbino", "Evening gown with lace", "Young Man with an Apple", "Silk chiffon dress", "Portrait of Cardinal Bibbiena", "Portrait of Tommaso Inghirami, known as "Phaedra"", "Ezekiel's Vision", "Rest in Egypt (Oasis)", "Il Dittatore Folle [The Mad Dictator]", "Portrait of Lyung-Yuk", "Ivory taffeta gown", "Two-piece gown", "Three-piece wedding gown", "Woman's dress", "Wedding gown in satin", "Striped wedding gown", "Two-piece silk gown", "Gown in black silk cloth", "Venetian tunic", "Kimono-style housecoat", "Green Delphos tunic", "At the fountain", "The Viaticum", "Silk chiffon velvet gown", "Opera coat", "Self portrait", "Oration (The prayer)", "Pia de' Tolomei and Nello della Pietra", "Orpheus and Eurydice", "Saint Rocco's sheet", "Trouser suit pattern", "View of Castiglioncello", "Evening Dress", "Piccarda Donati, kidnapped from the convent of Santa Chiara as ordered by her brother, Corso", "Men's Suit", "Men's dressing gown", "Men's formal suite", "Lady's dress", "Sharpshooters leading Austrian prisoners", "St. John the Baptist", "Neapolitan workshop hat", "Baptism of Christ", "Sand Diggers on the Mugnone", "Portico", "The Palatine chapel", "Altar", "Portrait of Napoleon Bonaparte", "Allegories of the Seasons (Spring, Summer, Winter)", "The School of Bears", "San Sebastiano", "Adoration of the Magi", "Pia dei Tolomei taken to the castle of Maremma", "Bust of Piccarda Donati", "Table and dessert service of Grand Duke Leopold II", "Resting quarrymen at Mount Ceceri", "Apostles", "Entrée and dessert service of the Grand Duchess Elisa Baciocchi", "St Zenobius restores the sight of a blind man", "Young St. John in the Desert", "Adoration of the Shepherds", "Lands", "The Masquerade", "The Seven Wonders of the World", "St Elizabeth's Visit to the Mother and Child and St Joseph, with St John the Baptist and St Zachary, known as the Madonna of the Cat", "The Temptation of St. Jerome", "Holy Conversation (also called The Mystic Marriage of St Catherine or the Pitti Panel)", "Livia Drusilla as Ceres", "Antoninus Pius and Faustina the Elder", "Small bust of Antonia the Younger", "Bust of the Empress Marie Louise", "The Three Graces", "Still life of a stool", "Metaphysical composition", "Vase of flowers with watch", "Still life with fruit and a crystal vase", "Saint Sebastian", "Harbour with lighthouse and ships", "Harbour scene", "Still life: three dead birds", "Venus combing Cupid's hair", "Copy of Madonna of St. Jerome after Correggio", "Self-portrait of Montorsoli", "Eterno Idioma", "Self-Portrait", "Natività (La sera)", "Still life", "Gli amici nell'atelier", "Niobidi", "Nadir", "Untitled", "Vase with lid", "Bust of Napoleon I Bonaparte", "Holiday dress", "The Fruits of the Passion of Christ", "Christ Pantocrator Enthroned", "Dormition of the Mother of God", "Apostle John the Theologian in Silent Contemplation", "The Nativity of Jesus", "The Virgin of Vladimir", "The Shepherdess", "Annunciation", "The Centaur Chiron and Achilles", "The Rape of Europa", "Christ the Saviour", "Acheiropoieta", "Deësis (Mother of God; Blessing Christ; St. John the Baptist)", "Kursk Mother of God", "Love Offering", "Solitaire with views of the Kingdom of the Two Sicilies", "Teapot in the shape of a fantasy animal", "The pictorial decoration by Luigi Ademollo in the Palatine Chapel", "Crucifixion on Calvary", "Entry of Christ into Jerusalem", "Rustic scene", "Snail seller", "Last Supper", "Chigi Crucifix", "Shell bust", "Tête-a-tête with Etruscan-style decoration", "Portrait of the sculptor Antoine-Denis Chaudet", "Pair of Cordelier vases", "Monumental vase", "Cup with the effigy of Caroline Bonaparte Murat", "Statuettes depicting Orientals", "Broth cup with saucer", "Tea set", "Pair of spindle-shaped vases", "Dishes for dessert set", "St. Peter, St. Isaac of Dalmatia, St. Boris, St. Gleb, St. Christina, and Alexander Nevsky", "The Tree of Jesse", "Saint Spyridon, Bishop of Trimythous", "The Mother of God, Joy of All Who Sorrow (1890 n. 9324)", "Resurrection of Christ and Descent into Hell, with sixteen scenes of Christ's post-mortem stories", "Saints in prayer", "St. John the Warrior, Martyr, with scenes from the story of his life", ""All creatures rejoice in You"", "The Prophet Elijah in the Desert, with scenes from the story of his life", "The Nativity of the Mother of God (Inv. 1890 no. 9303)", "The Nativity of Jesus (Inv. 1890 no. 9305)", "The Crucifixion (Inv. 1890 n. 9308)", "The Resurrection of Christ and His Descent into Hell (Inv. 1890 no. 9306)", "The Annunciation (Inv. 1890 no. 9304)", "The Transfiguration of Christ", "The Raising of Lazarus", "The Synaxis of the Archangels", "The Seven Sleepers of Ephesus", "The Ascension of Christ", "The Nativity of the Mother of God (1890 n. 9350)", "St. John the Baptist, Angel of the Desert, with scenes from the story of his life", "The Mother of God, Joy of all who sorrow (1890 no. 9367)", "Menelaus and Patroclus (or Ajax and Achilles)", "Charity", "St George Slays the Dragon", "The Mother of God, Joy of All Who Sorrow (1890 n.9316)", "The Coronation of the Mother of God", "The Seven Sleepers of Ephesus (inv. 1890 n. 9326)", "St. Joachim and St. Anne", "The Mother of God, Milk-Giver", "St. Michael the Archangel", "The Miracle of St. Demetrius of Salonica, Martyr (Dimitri Solunski)", "Field flowers", "Venus Italica", "Two-handled vase with lid", "Coffee tête-à-tête with ML monogramming", "Têtê-à- têtê breakfast service", "Solitaire breakfast service", "Flower vase", "Victory", "Public Audience Chamber of the Summer Apartments", "Pair of two-handled vases with lid", "Pythagoras; Heracles; Aristotle", "Déjeuner", "Young Michelangelo", "Private Audience Hall or Hall of Columns of the Summer Apartments", ""Fireplace" stoves", "Singing a ditty", "Coffee service", "Pair of bleached vases", "Oval vase", "Madonna with Child (or Virgin presenting the Child)", "Cradle with child", "Stipo d'Alemagna cabinet", "Christ in the House of Martha, Mary and Lazarus", "Hercules Room", "Portrait of Maria Theresa of Habsburg, Francis I, Holy Roman Emperor, and their thirteen children", "A Pasture", "Portrait of Signora Morrocchi", "The morning of 27 April 1859", "Jupiter Room", "The Calling of Saints Peter and Andrew", "Cameo with portraits of Cosimo I de' Medici, Eleonor of Toledo, and their children", "Pendant with triton", "Ball-Contrefait", "Stone mask from Teotihuacan in Mexico", "Knidian Aphrodite", "Cabinet for the Crown of the King of Italy", "Bust of Philip II of Spain (back side)", "Bust of Don Carlos (front side)", "Martyrdom of St Agatha", "St. Francis of Assisi", "Evening gown", "Room of Venus", "Medici Chest", "Prie-dieu", "Double cup", "Cosimo II de' Medici's Ex voto", "Venus and Cupid", "Piazza del Carmine", "Train for courtly gown", "Nightgown", "Court mantle", "Vase with two handles and lid", "Chained Putto", "Chinese New Year in Bangkok", "The Stranger", "The Story of Lucretia", "Burial clothes of Don Garzia de' Medici: Doublet with breeches, surcoat", "Burial clothes of Cosimo I de' Medici: Doublet, stockings with codpiece, Cappa Magna cope of the Order of St. Stephen", "Made in Florence", "Mars Room", "Stove Room", "Prison in Portoferraio", "Nina Ricci evening dress", "Centrepiece of Elisa Baciocchi", "The Adoration of the Christ Child", "Discovering the Corpse of Jacopo de' Pazzi", "Apollo Room", "Ring with carved stone", "Vase with dragon-shaped lid", "Martyrdom of St. Andrew", "Blade Sharpener", "Landscape at Grizzana", "Flask", "Oval with perspective view of the Piazza Granducale", "The Sleeping Infant St John", "Asclepius", "Athlete", "Mercury with pétasos", "Athena Giustiniani", "Confidences", "Portrait of a female mule", "Allori Loggia", "Hercules and Cerberus", "Christ Pantocrator", "Mother of God "Joy of All Who Sorrow" (inv.1890 n. 9346)", "The dream of Solomon", "Weary Hercules", "Grand Gala Berlin carriage of Grand Duke of Tuscany Ferdinand III", "Hercules and Antaeus", "After the battle of Magenta", "Giuseppe Mazzini's Bust", "Francesco Domenico Guerrazzi's Portrait", "Vincenzo Gioberti's Portrait", "Double portrait of the Archdukes Ferdinand and Maria Anna of Habsburg-Lorraine", "Fig thieves (Urchins)", "Transformation gown", "House dress", "Two-piece ceremony dress, bodice and skirt", "Wedding dress with hat, shoes and stockings", "Gala dress", "Two-piece dress, bodice and skirt", "Tailleur", "Wedding dress", "Women's garden dress", "Madonna and Child Enthroned with Saints Peter, Bernard, Augustine and Ranieri, known as Madonna del Baldacchino", "Madonna col Bambino e i santi Elisabetta, Maddalena (?) e Giovanni Battista detta "Madonna dell'Impannata"", "Portrait of Guidubaldo da Montefeltro", "Portrait of a woman ("La Gravida")", "Portrait of Julius II", "Saint Mary Magdalene", "Deposition (Luco Altarpiece)", "Portrait of Luca Martini", "Minaudière", "Men's Suit", "Dress Maurizio Galante", "Women's hat", "Delphos", "Mantle", "Evening dress and cape", "Long dress", "Dress", "Kaleidoscope evening suit", "Petticoat", "Evening minidress", "Two-piece suit", "Overcoat", "Tunic", "Woman's evening gown", "Jacket and skirt two - piece suit"
];

// Normalize title for comparison
function normalizeTitle(title) {
    if (!title) return '';
    return title
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remove accents
        .replace(/[''`]/g, "'")
        .replace(/[""]/g, '"')
        .replace(/\s+/g, ' ')
        .trim();
}

// Create a Set of normalized Pitti titles for fast lookup
const normalizedPittiTitles = new Set(PITTI_TITLES.map(normalizeTitle));

// Also add common variations
const PITTI_TITLE_VARIATIONS = new Map();
PITTI_TITLES.forEach(title => {
    const normalized = normalizeTitle(title);
    PITTI_TITLE_VARIATIONS.set(normalized, title);

    // Add variation without parentheses content
    const withoutParens = normalized.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
    if (withoutParens !== normalized) {
        PITTI_TITLE_VARIATIONS.set(withoutParens, title);
        normalizedPittiTitles.add(withoutParens);
    }
});

// Additional Pitti location patterns
const PITTI_LOCATIONS = [
    'saturn room', 'sala di saturno', 'saturn\'s hall',
    'jupiter room', 'sala di giove',
    'mars room', 'sala di marte',
    'apollo room', 'sala di apollo',
    'venus room', 'sala di venere', 'room of venus',
    'prometheus room', 'sala di prometeo',
    'ulysses room', 'sala di ulisse',
    'iliad room', 'sala dell\'iliade',
    'education of jupiter room', 'sala dell\'educazione',
    'allegories room',
    'flora room',
    'hercules room',
    'stucco hall', 'white hall',
    'bona room', 'sala di bona',
    'king\'s study', 'king\'s bedroom',
    'queen\'s salon', 'queen\'s bedroom',
    'throne room',
    'red salon', 'green room', 'blue room',
    'round room', 'oval room',
    'royal apartments', 'appartamenti reali',
    'palatine gallery', 'galleria palatina',
    'palatine chapel',
    'summer apartments',
    'silver museum', 'museo degli argenti',
    'costume gallery', 'galleria del costume',
    'porcelain museum', 'museo delle porcellane', 'porcelain  museum',
    'gallery of modern art', 'galleria d\'arte moderna',
    'boboli', 'giardino di boboli',
    'upper botanical garden', 'upper botany garden',
    'giardino del cavaliere',
    'pitti'
];

// Read uffizi collection
const uffiziPath = path.join(__dirname, '../public/data/uffizi-collection.json');
const uffiziData = JSON.parse(fs.readFileSync(uffiziPath, 'utf8'));
const allObjects = uffiziData.objects || [];

// Check if artwork belongs to Pitti
function isPittiPalace(artwork) {
    const artTitle = normalizeTitle(artwork.title);

    // 1. Check exact title match
    if (normalizedPittiTitles.has(artTitle)) {
        return true;
    }

    // 2. Check partial title match (for variations)
    for (const pittiTitle of normalizedPittiTitles) {
        // Check if one contains the other
        if (artTitle.includes(pittiTitle) || pittiTitle.includes(artTitle)) {
            // Only match if at least 10 chars to avoid false positives
            if (pittiTitle.length >= 10 || artTitle.length >= 10) {
                return true;
            }
        }
    }

    // 3. Check location
    const loc = (artwork.location || '').toLowerCase();
    for (const pattern of PITTI_LOCATIONS) {
        if (loc.includes(pattern)) {
            return true;
        }
    }

    return false;
}

// Split the collection
const pittiArtworks = [];
const uffiziArtworks = [];

for (const artwork of allObjects) {
    if (isPittiPalace(artwork)) {
        pittiArtworks.push(artwork);
    } else {
        uffiziArtworks.push(artwork);
    }
}

console.log('🖼️ Splitting with FULL Pitti title list (429 titles)...\n');
console.log(`📊 Total artworks: ${allObjects.length}`);
console.log(`\n✅ Uffizi Gallery: ${uffiziArtworks.length} artworks`);
console.log(`✅ Pitti Palace: ${pittiArtworks.length} artworks`);

// Save files
const uffiziOutput = {
    museum: "Uffizi Gallery",
    museumId: "uffizi-gallery",
    location: "Florence, Italy",
    type: "permanent",
    totalArtworks: uffiziArtworks.length,
    objects: uffiziArtworks
};
fs.writeFileSync(
    path.join(__dirname, '../public/data/uffizi-gallery-collection.json'),
    JSON.stringify(uffiziOutput, null, 2)
);

const pittiOutput = {
    museum: "Pitti Palace",
    museumId: "pitti-palace",
    location: "Florence, Italy",
    type: "permanent",
    totalArtworks: pittiArtworks.length,
    objects: pittiArtworks
};
fs.writeFileSync(
    path.join(__dirname, '../public/data/pitti-palace-collection.json'),
    JSON.stringify(pittiOutput, null, 2)
);

console.log(`\n📁 Saved: uffizi-gallery-collection.json (${uffiziArtworks.length} items)`);
console.log(`📁 Saved: pitti-palace-collection.json (${pittiArtworks.length} items)`);

// Show sample Pitti artworks
console.log('\n📋 Sample Pitti artworks found:');
pittiArtworks.slice(0, 15).forEach(a => {
    console.log(`   - ${a.title} (${a.location || 'Unknown'})`);
});
