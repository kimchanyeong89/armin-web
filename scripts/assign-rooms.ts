
import fs from 'fs';
import path from 'path';

const JSON_FILE = path.join(process.cwd(), 'public', 'data', 'national-gallery-permanent.json');

// Room Mappings based on National Gallery Floorplan
const ARTIST_ROOMS: Record<string, string> = {
    // High Renaissance (1500-1600)
    'Michelangelo': '2',
    'Raphael': '8', // or 2
    'Leonardo da Vinci': '66', // Sainsbury Wing usually
    'Bronzino': '8',
    'Titian': '6',
    'Veronese': '6',
    'Tintoretto': '6',
    'Correggio': '10',
    'Parmigianino': '10',
    'Hans Holbein the Younger': '12',
    'Jan Gossaert': '12',
    'Pieter Bruegel the Elder': '12',
    'Lucas Cranach the Elder': '12',
    'Albrecht Dürer': '12',

    // Baroque (1600-1700)
    'Caravaggio': '32',
    'Michelangelo Merisi da Caravaggio': '32',
    'Guido Reni': '32',
    'Annibale Carracci': '32',
    'Domenichino': '32',
    'Guercino': '32',
    'Artemisia Gentileschi': '32',

    'Peter Paul Rubens': '20', // Flemish
    'Anthony van Dyck': '21',
    'Jacob Jordaens': '20',

    'Rembrandt': '22', // Dutch
    'Johannes Vermeer': '16',
    'Frans Hals': '16',
    'Pieter de Hooch': '16',
    'Jan Steen': '16',
    'Aelbert Cuyp': '16',
    'Meindert Hobbema': '16',
    'Jacob van Ruisdael': '16',

    'Diego Velázquez': '30', // Spanish
    'Bartolomé Esteban Murillo': '30',
    'Francisco de Zurbarán': '30',
    'El Greco': '30',

    'Nicolas Poussin': '29', // French
    'Claude Lorrain': '29',

    // 18th Century (1700-1800)
    'Canaletto': '38',
    'Francesco Guardi': '38',
    'Giovanni Battista Tiepolo': '39',
    'Pietro Longhi': '39',

    'William Hogarth': '35',
    'George Stubbs': '35',
    'Thomas Gainsborough': '35',
    'Joshua Reynolds': '35',

    'Jean-Antoine Watteau': '33',
    'Jean-Siméon Chardin': '33',
    'Jean-Honoré Fragonard': '33',
    'François Boucher': '33',

    // 19th Century & Impressionism
    'J.M.W. Turner': '34',
    'John Constable': '34',

    'Jean-Auguste-Dominique Ingres': '41',
    'Eugène Delacroix': '41',
    'Paul Delaroche': '41',

    'Edouard Manet': '43',
    'Claude Monet': '43',
    'Pierre-Auguste Renoir': '43',
    'Edgar Degas': '43',
    'Camille Pissarro': '43',
    'Paul Cézanne': '43',
    'Vincent van Gogh': '43',
    'Georges Seurat': '43',
    'Paul Gauguin': '43',
    'Henri Rousseau': '43',
    'Gustav Klimt': '44',
};

// Fallback Rooms by Year Period
function getRoomByYear(year: number): string {
    if (year < 1500) return '53'; // Early Renaissance / Sainsbury Wing
    if (year < 1600) return '9';  // High Renaissance General
    if (year < 1700) return '25'; // Baroque General
    if (year < 1800) return '34'; // 18th Century General
    if (year < 1930) return '43'; // 19th Century / Impressionism
    return 'Not on display';
}

function assignRooms() {
    if (!fs.existsSync(JSON_FILE)) {
        console.error("JSON file not found.");
        return;
    }

    const raw = fs.readFileSync(JSON_FILE, 'utf-8');
    const data = JSON.parse(raw);
    const items = data.items;

    let updatedCount = 0;

    items.forEach((item: any) => {
        // Only update items that are "Not on display"
        if (item.roomId === 'Not on display') {
            let assignedRoom = 'Not on display';

            // 1. Try Artist Match
            // Check direct match or if artist name contains key artist
            for (const [key, room] of Object.entries(ARTIST_ROOMS)) {
                if (item.artist && item.artist.includes(key)) {
                    assignedRoom = room;
                    break;
                }
            }

            // 2. Fallback to Year
            if (assignedRoom === 'Not on display' && item.year) {
                assignedRoom = getRoomByYear(item.year);
            }

            if (assignedRoom !== 'Not on display') {
                item.roomId = assignedRoom;
                updatedCount++;
                // console.log(`Assigned [${item.id}] (Artist: ${item.artist}, Year: ${item.year}) -> Room ${assignedRoom}`);
            }
        }
    });

    // Sort again
    items.sort((a: any, b: any) => {
        const roomA = a.roomId?.match(/^\d+$/) ? parseInt(a.roomId, 10) : 9999;
        const roomB = b.roomId?.match(/^\d+$/) ? parseInt(b.roomId, 10) : 9999;
        return roomA - roomB;
    });

    data.items = items;
    fs.writeFileSync(JSON_FILE, JSON.stringify(data, null, 2));

    console.log(`Updated rooms for ${updatedCount} items.`);
}

assignRooms();
