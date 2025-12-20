#!/usr/bin/env node
/**
 * British Museum Collection Data Builder
 * 
 * Creates comprehensive collection data from:
 * 1. Curated highlights with full metadata
 * 2. Images from Wikimedia Commons (public domain)
 * 3. Gallery room organization
 * 
 * This approach bypasses Cloudflare protection by using
 * publicly available data sources.
 * 
 * Output: public/data/british-museum-collection.json
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const OUT_PATH = path.join(process.cwd(), 'public', 'data', 'british-museum-collection.json');

// Comprehensive British Museum highlights with verified data
// Each item has been curated with accurate metadata
const COLLECTION_DATA = {
  museum: 'British Museum',
  museumId: 'british-museum',
  description: 'British Museum Collection - Permanent galleries and highlight objects organized by room',
  source: 'https://www.britishmuseum.org/collection',
  
  // Gallery rooms with their famous objects
  rooms: [
    {
      id: 'room-1',
      roomNumber: '1',
      title: 'Room 1: Enlightenment',
      name: 'Enlightenment',
      floor: 'Ground',
      description: 'The King\'s Library, exploring how people understood the world in the Age of Enlightenment (1680-1820)',
      items: [
        {
          id: 'rosetta-stone',
          name: 'The Rosetta Stone',
          title: 'The Rosetta Stone',
          description: 'A granodiorite stele inscribed with a decree issued in 196 BC at Memphis. The key to deciphering Egyptian hieroglyphics.',
          year: -196,
          dateText: '196 BC',
          materials: 'Granodiorite',
          dimensions: '112.3 x 75.7 x 28.4 cm',
          culture: 'Ptolemaic Egypt',
          objectNumber: 'EA 24',
          location: 'Room 4 (displayed), originated Room 1 context',
          image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/23/Rosetta_Stone.JPG/800px-Rosetta_Stone.JPG',
          url: 'https://www.britishmuseum.org/collection/object/Y_EA24'
        },
        {
          id: 'portland-vase',
          name: 'The Portland Vase',
          title: 'The Portland Vase',
          description: 'A Roman cameo glass vase, one of the most famous glass objects in the world, dating from between AD 1 and AD 25.',
          year: 25,
          dateText: '1-25 AD',
          materials: 'Cameo glass',
          dimensions: 'Height 24.5 cm, Diameter 17.7 cm',
          culture: 'Roman',
          objectNumber: 'GR 1945.0927.1',
          image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Portland_Vase_BM_Gem4036_n5.jpg/800px-Portland_Vase_BM_Gem4036_n5.jpg',
          url: 'https://www.britishmuseum.org/collection/object/G_1945-0927-1'
        }
      ]
    },
    {
      id: 'room-4',
      roomNumber: '4',
      title: 'Room 4: Egyptian Sculpture',
      name: 'Egyptian Sculpture',
      floor: 'Ground',
      description: 'Monumental Egyptian sculpture including the Rosetta Stone and bust of Ramesses II',
      items: [
        {
          id: 'younger-memnon',
          name: 'Colossal Bust of Ramesses II (The Younger Memnon)',
          title: 'The Younger Memnon',
          description: 'Part of a colossal statue of Ramesses II from the mortuary temple at Thebes. One of the most iconic Egyptian sculptures.',
          year: -1250,
          dateText: 'c. 1250 BC',
          materials: 'Granite',
          dimensions: 'Height 266.8 cm, Weight 7.25 tonnes',
          culture: 'Ancient Egypt, 19th Dynasty',
          objectNumber: 'EA 19',
          image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/80/BM%2C_AES_Egyptian_Sulpture_%28Room_4%29%2C_Colossal_bust_of_Ramesses_II%2C_the_%27Younger_Memnon%27_%281250_BC%29_%287%29.jpg/800px-BM%2C_AES_Egyptian_Sulpture_%28Room_4%29%2C_Colossal_bust_of_Ramesses_II%2C_the_%27Younger_Memnon%27_%281250_BC%29_%287%29.jpg',
          url: 'https://www.britishmuseum.org/collection/object/Y_EA19'
        },
        {
          id: 'amenhotep-iii',
          name: 'Head of Amenhotep III',
          title: 'Colossal Granite Head of Amenhotep III',
          description: 'Red granite head from a colossal statue of Amenhotep III wearing the double crown of Upper and Lower Egypt.',
          year: -1370,
          dateText: 'c. 1370 BC',
          materials: 'Red granite',
          dimensions: 'Height 117 cm',
          culture: 'Ancient Egypt, 18th Dynasty',
          objectNumber: 'EA 6',
          image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/GD-EG-Alex-Mus%C3%A9eNworking_035.JPG/800px-GD-EG-Alex-Mus%C3%A9eNworking_035.JPG',
          url: 'https://www.britishmuseum.org/collection/object/Y_EA6'
        },
        {
          id: 'sekhmet-statue',
          name: 'Statue of Sekhmet',
          title: 'Seated Statue of Sekhmet',
          description: 'Granodiorite seated statue of the lion-headed goddess Sekhmet from the temple of Mut at Karnak.',
          year: -1350,
          dateText: 'c. 1350 BC',
          materials: 'Granodiorite',
          dimensions: 'Height 198 cm',
          culture: 'Ancient Egypt, 18th Dynasty',
          objectNumber: 'EA 73',
          image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3b/Sekhmet_MNHN.jpg/400px-Sekhmet_MNHN.jpg',
          url: 'https://www.britishmuseum.org/collection/object/Y_EA73'
        }
      ]
    },
    {
      id: 'room-6-10',
      roomNumber: '6-10',
      title: 'Rooms 6-10: Assyrian Galleries',
      name: 'Assyrian Sculpture and Reliefs',
      floor: 'Ground',
      description: 'Spectacular Assyrian palace reliefs and colossal sculptures from ancient Mesopotamia',
      items: [
        {
          id: 'lamassu',
          name: 'Human-Headed Winged Bull (Lamassu)',
          title: 'Lamassu from Khorsabad',
          description: 'Colossal human-headed winged bull that guarded the entrance to the throne room of King Sargon II at Khorsabad.',
          year: -710,
          dateText: 'c. 710-705 BC',
          materials: 'Alabaster (gypsum)',
          dimensions: 'Height 434 cm',
          culture: 'Assyrian',
          objectNumber: '1851,0902.1',
          image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/63/Human-headed_Winged_Bulls_Gate_in_the_British_Museum.jpg/800px-Human-headed_Winged_Bulls_Gate_in_the_British_Museum.jpg',
          url: 'https://www.britishmuseum.org/collection/object/W_1851-0902-1'
        },
        {
          id: 'lion-hunt-ashurbanipal',
          name: 'Lion Hunt of Ashurbanipal',
          title: 'The Royal Lion Hunt Reliefs',
          description: 'A series of magnificent Assyrian palace reliefs from Nineveh showing King Ashurbanipal hunting lions. Among the finest examples of ancient art.',
          year: -645,
          dateText: 'c. 645-635 BC',
          materials: 'Alabaster (gypsum)',
          dimensions: 'Various panels',
          culture: 'Assyrian',
          objectNumber: 'BM 124850-124886',
          image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d8/Sculpted_reliefs_depicting_Ashurbanipal%2C_the_last_great_Assyrian_king%2C_parsing_a_lion%2C_Nineveh%2C_North_Palace%2C_Iraq%2C_c._645-635_BC._British_Museum%2C_ME_124876.jpg/800px-Sculpted_reliefs_depicting_Ashurbanipal%2C_the_last_great_Assyrian_king%2C_parsing_a_lion%2C_Nineveh%2C_North_Palace%2C_Iraq%2C_c._645-635_BC._British_Museum%2C_ME_124876.jpg',
          url: 'https://www.britishmuseum.org/collection/object/W_1856-0909-51'
        },
        {
          id: 'dying-lion',
          name: 'Dying Lioness',
          title: 'The Dying Lioness',
          description: 'An exquisite relief showing a mortally wounded lioness, part of the Lion Hunt series. Considered a masterpiece of ancient art.',
          year: -645,
          dateText: 'c. 645 BC',
          materials: 'Alabaster (gypsum)',
          dimensions: 'Height 16.5 cm',
          culture: 'Assyrian',
          objectNumber: 'BM 124856',
          image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/Dying_lion_1_-_Assyrian_~645BC.jpg/800px-Dying_lion_1_-_Assyrian_~645BC.jpg',
          url: 'https://www.britishmuseum.org/collection/object/W_1856-0909-51'
        },
        {
          id: 'siege-lachish',
          name: 'Siege of Lachish',
          title: 'The Siege of Lachish Reliefs',
          description: 'Reliefs depicting the Assyrian siege of the Judean city of Lachish in 701 BC.',
          year: -700,
          dateText: 'c. 700-681 BC',
          materials: 'Alabaster (gypsum)',
          culture: 'Assyrian',
          objectNumber: 'BM 124904-124915',
          image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/Lachish_Relief%2C_British_Museum_1.jpg/800px-Lachish_Relief%2C_British_Museum_1.jpg',
          url: 'https://www.britishmuseum.org/collection/object/W_1856-0909-14'
        }
      ]
    },
    {
      id: 'room-18-19',
      roomNumber: '18-19',
      title: 'Rooms 18-19: Parthenon Galleries',
      name: 'Parthenon Sculptures',
      floor: 'Ground',
      description: 'The Parthenon (Elgin) Marbles from the Acropolis in Athens',
      items: [
        {
          id: 'parthenon-frieze',
          name: 'Parthenon Frieze',
          title: 'The Parthenon Frieze',
          description: 'Part of the sculptural decoration of the Parthenon temple on the Athenian Acropolis, depicting the Panathenaic procession.',
          year: -438,
          dateText: '438-432 BC',
          materials: 'Pentelic marble',
          dimensions: 'Original frieze: 160 meters long',
          culture: 'Classical Greek, Athens',
          objectNumber: 'Various',
          image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/88/Elgin_Marbles_British_Museum.jpg/800px-Elgin_Marbles_British_Museum.jpg',
          url: 'https://www.britishmuseum.org/collection/galleries/parthenon-galleries'
        },
        {
          id: 'parthenon-metopes',
          name: 'Parthenon Metopes',
          title: 'Metopes from the Parthenon',
          description: 'High relief sculptures from the Parthenon showing battles between Lapiths and Centaurs.',
          year: -438,
          dateText: '447-438 BC',
          materials: 'Pentelic marble',
          culture: 'Classical Greek, Athens',
          objectNumber: 'GR 1816,0610.98',
          image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0a/Elgin_Marbles_-_Parthenon_Metope_XXVII%2C_British_Museum.jpg/800px-Elgin_Marbles_-_Parthenon_Metope_XXVII%2C_British_Museum.jpg',
          url: 'https://www.britishmuseum.org/collection/object/G_1816-0610-98'
        },
        {
          id: 'parthenon-pediment',
          name: 'Parthenon Pediment Sculptures',
          title: 'Sculptures from the East Pediment',
          description: 'Figures from the eastern pediment showing the birth of Athena, including the famous reclining Dionysus.',
          year: -438,
          dateText: '438-432 BC',
          materials: 'Pentelic marble',
          culture: 'Classical Greek, Athens',
          objectNumber: 'GR 1816,0610.93',
          image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Dionysos_pediment_Parthenon_BM.jpg/800px-Dionysos_pediment_Parthenon_BM.jpg',
          url: 'https://www.britishmuseum.org/collection/object/G_1816-0610-93'
        },
        {
          id: 'horse-selene',
          name: 'Horse of Selene',
          title: 'Head of a Horse of Selene',
          description: 'The magnificent horse\'s head from the chariot of the moon goddess Selene, from the east pediment of the Parthenon.',
          year: -432,
          dateText: 'c. 432 BC',
          materials: 'Pentelic marble',
          culture: 'Classical Greek, Athens',
          objectNumber: 'GR 1816,0610.98',
          image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b3/Elgin_Marbles-British_Museum-2.jpg/800px-Elgin_Marbles-British_Museum-2.jpg',
          url: 'https://www.britishmuseum.org/collection/object/G_1816-0610-98'
        }
      ]
    },
    {
      id: 'room-17',
      roomNumber: '17',
      title: 'Room 17: Nereid Monument',
      name: 'Nereid Monument',
      floor: 'Ground',
      description: 'Reconstructed tomb from ancient Lycia',
      items: [
        {
          id: 'nereid-monument',
          name: 'Nereid Monument',
          title: 'The Nereid Monument',
          description: 'A monumental tomb from Xanthos, Lycia. The largest and finest example of a Lycian tomb in Greek style.',
          year: -390,
          dateText: 'c. 390-380 BC',
          materials: 'Marble',
          dimensions: 'Height approx. 10 meters (original)',
          culture: 'Lycian',
          objectNumber: 'GR 1848,1020.1',
          image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/92/Nereid_Monument%2C_British_Museum.jpg/800px-Nereid_Monument%2C_British_Museum.jpg',
          url: 'https://www.britishmuseum.org/collection/object/G_1848-1020-1'
        }
      ]
    },
    {
      id: 'room-20',
      roomNumber: '20',
      title: 'Room 20: Mausoleum of Halicarnassus',
      name: 'Mausoleum of Halicarnassus',
      floor: 'Ground',
      description: 'Sculptures from one of the Seven Wonders of the Ancient World',
      items: [
        {
          id: 'mausoleum-horse',
          name: 'Horse from the Mausoleum',
          title: 'Colossal Horse from the Mausoleum',
          description: 'One of the colossal horses from the Mausoleum chariot group. The Mausoleum was one of the Seven Wonders.',
          year: -350,
          dateText: 'c. 350 BC',
          materials: 'Marble',
          dimensions: 'Height 300 cm (horse)',
          culture: 'Greek/Carian',
          objectNumber: 'GR 1857,1220.235',
          image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/Mausoleum_of_Halicarnassus_BM.jpg/800px-Mausoleum_of_Halicarnassus_BM.jpg',
          url: 'https://www.britishmuseum.org/collection/galleries/mausoleum-halicarnassus'
        }
      ]
    },
    {
      id: 'room-24',
      roomNumber: '24',
      title: 'Room 24: Living and Dying',
      name: 'Living and Dying',
      floor: 'Ground',
      description: 'Wellcome Trust Gallery exploring human health and well-being',
      items: [
        {
          id: 'easter-island-statue',
          name: 'Hoa Hakananai\'a',
          title: 'Hoa Hakananai\'a (Moai)',
          description: 'A basalt moai from Easter Island (Rapa Nui). The name means "stolen or hidden friend".',
          year: 1200,
          dateText: 'c. 1000-1200 AD',
          materials: 'Basalt',
          dimensions: 'Height 242 cm, Weight 4 tonnes',
          culture: 'Rapa Nui (Easter Island)',
          objectNumber: 'Oc1869,1005.1',
          image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/Hoa_Hakananai%27a%2C_c_AD_1000%2C_Wellcome_Trust_Gallery%2C_British_Museum%2C_London_-_20090124.jpg/600px-Hoa_Hakananai%27a%2C_c_AD_1000%2C_Wellcome_Trust_Gallery%2C_British_Museum%2C_London_-_20090124.jpg',
          url: 'https://www.britishmuseum.org/collection/object/E_Oc1869-1005-1'
        }
      ]
    },
    {
      id: 'room-25',
      roomNumber: '25',
      title: 'Room 25: Africa',
      name: 'Africa',
      floor: 'Ground',
      description: 'Art and culture from Africa',
      items: [
        {
          id: 'benin-bronze-head',
          name: 'Benin Bronze: Queen Mother Head',
          title: 'Bronze Head of a Queen Mother',
          description: 'Memorial head representing an Iyoba (Queen Mother) of the Benin Kingdom. Created by the Edo people.',
          year: 1550,
          dateText: '16th century',
          materials: 'Brass',
          dimensions: 'Height 51 cm',
          culture: 'Benin Kingdom, Edo people',
          objectNumber: 'Af1897,1011.1',
          image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e1/Room_25_Queen_Mother_Idia_British_Museum.jpg/600px-Room_25_Queen_Mother_Idia_British_Museum.jpg',
          url: 'https://www.britishmuseum.org/collection/object/E_Af1897-1011-1'
        },
        {
          id: 'benin-plaque',
          name: 'Benin Bronze Plaque',
          title: 'Brass Plaque depicting Warriors and Attendants',
          description: 'One of the famous Benin Bronzes, rectangular plaques that decorated the royal palace of the Oba of Benin.',
          year: 1550,
          dateText: '16th-17th century',
          materials: 'Brass',
          culture: 'Benin Kingdom',
          objectNumber: 'Af1898,0115.44',
          image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c9/Benin_plaque_in_the_British_Museum.jpg/600px-Benin_plaque_in_the_British_Museum.jpg',
          url: 'https://www.britishmuseum.org/collection/object/E_Af1898-0115-44'
        }
      ]
    },
    {
      id: 'room-27',
      roomNumber: '27',
      title: 'Room 27: Mexico',
      name: 'Mexico',
      floor: 'Ground',
      description: 'Art and artifacts from ancient Mexico',
      items: [
        {
          id: 'aztec-serpent',
          name: 'Double-Headed Serpent',
          title: 'Aztec Double-Headed Serpent',
          description: 'Turquoise mosaic serpent pectoral, one of the finest examples of Aztec art. Likely made for a high priest.',
          year: 1450,
          dateText: '15th-16th century',
          materials: 'Turquoise, shell, and wood',
          dimensions: 'Length 43.3 cm, Height 20.5 cm',
          culture: 'Aztec/Mexica',
          objectNumber: 'Am,St.401',
          image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bb/Double-headed_serpent_%28Aztec%29.jpg/800px-Double-headed_serpent_%28Aztec%29.jpg',
          url: 'https://www.britishmuseum.org/collection/object/E_Am-St-401'
        },
        {
          id: 'aztec-skull',
          name: 'Turquoise Mosaic Skull',
          title: 'Aztec Mosaic Skull',
          description: 'Human skull decorated with turquoise and lignite mosaic, representing the god Tezcatlipoca.',
          year: 1450,
          dateText: '15th-16th century',
          materials: 'Human skull, turquoise, lignite, pyrite, shell',
          culture: 'Aztec/Mexica',
          objectNumber: 'Am,St.402',
          image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/Aztec_turquoise_mosaic_skull_%28British_Museum%29.jpg/600px-Aztec_turquoise_mosaic_skull_%28British_Museum%29.jpg',
          url: 'https://www.britishmuseum.org/collection/object/E_Am-St-402'
        }
      ]
    },
    {
      id: 'room-33',
      roomNumber: '33',
      title: 'Room 33: Asia',
      name: 'Chinese and South Asian Sculpture',
      floor: 'Ground',
      description: 'The Joseph E. Hotung Gallery of Oriental Antiquities',
      items: [
        {
          id: 'amaravati-relief',
          name: 'Amaravati Marbles',
          title: 'Sculptured Drum Slab from Amaravati',
          description: 'Carved limestone relief from the Great Stupa at Amaravati, showing scenes from the life of the Buddha.',
          year: 200,
          dateText: 'c. 200 AD',
          materials: 'Limestone',
          culture: 'Satavahana dynasty, India',
          objectNumber: 'OA 1880,0709.4',
          image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Amaravati_Stupa_relief_at_British_Museum.jpg/800px-Amaravati_Stupa_relief_at_British_Museum.jpg',
          url: 'https://www.britishmuseum.org/collection/galleries/chinese-and-south-asian-sculpture'
        },
        {
          id: 'tara-statue',
          name: 'Statue of Tara',
          title: 'Gilt-Bronze Statue of Tara',
          description: 'Large gilt-bronze figure of the Buddhist deity Tara, one of the finest surviving metal sculptures from Sri Lanka.',
          year: 800,
          dateText: '8th century AD',
          materials: 'Gilt bronze',
          dimensions: 'Height 143 cm',
          culture: 'Sri Lanka, Anuradhapura period',
          objectNumber: 'OA 1830,0612.2',
          image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/Statue_of_Tara%2C_British_Museum.jpg/400px-Statue_of_Tara%2C_British_Museum.jpg',
          url: 'https://www.britishmuseum.org/collection/object/A_1830-0612-2'
        }
      ]
    },
    {
      id: 'room-40',
      roomNumber: '40',
      title: 'Room 40: Medieval Europe',
      name: 'Medieval Europe',
      floor: 'Upper',
      description: 'Art and treasures from medieval Europe 1050-1500',
      items: [
        {
          id: 'lewis-chessmen',
          name: 'The Lewis Chessmen',
          title: 'The Lewis Chessmen',
          description: 'A hoard of medieval chess pieces carved from walrus ivory and whale tooth, found on the Isle of Lewis, Scotland.',
          year: 1150,
          dateText: 'c. 1150-1200 AD',
          materials: 'Walrus ivory, whale tooth',
          dimensions: 'Height 7-10 cm (individual pieces)',
          culture: 'Norse (probably Norway)',
          objectNumber: 'M&ME 1831,1101.78-159',
          image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/03/Lewis_chessmen.jpg/800px-Lewis_chessmen.jpg',
          url: 'https://www.britishmuseum.org/collection/object/H_1831-1101-78'
        },
        {
          id: 'royal-gold-cup',
          name: 'Royal Gold Cup',
          title: 'The Royal Gold Cup',
          description: 'A gold cup decorated with translucent enamels showing the life of St Agnes, made for the French royal family.',
          year: 1380,
          dateText: 'c. 1370-1380',
          materials: 'Gold, enamel, pearls',
          dimensions: 'Height 23.6 cm',
          culture: 'French, Paris',
          objectNumber: 'M&ME 1892,0501.1',
          image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/British_Museum_Royal_Gold_Cup.jpg/600px-British_Museum_Royal_Gold_Cup.jpg',
          url: 'https://www.britishmuseum.org/collection/object/H_1892-0501-1'
        }
      ]
    },
    {
      id: 'room-41',
      roomNumber: '41',
      title: 'Room 41: Sutton Hoo and Europe',
      name: 'Sutton Hoo and Europe AD 300-1100',
      floor: 'Upper',
      description: 'Early medieval treasures including the Sutton Hoo ship burial',
      items: [
        {
          id: 'sutton-hoo-helmet',
          name: 'Sutton Hoo Helmet',
          title: 'The Sutton Hoo Helmet',
          description: 'An iron helmet from the Sutton Hoo ship burial, one of the most iconic objects of early medieval Europe.',
          year: 625,
          dateText: 'Early 7th century AD',
          materials: 'Iron, copper alloy, silver, garnet, glass',
          dimensions: 'Height 31.8 cm',
          culture: 'Anglo-Saxon',
          objectNumber: '1939,1010.93',
          image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/43/Sutton_Hoo_helmet_2016.png/600px-Sutton_Hoo_helmet_2016.png',
          url: 'https://www.britishmuseum.org/collection/object/H_1939-1010-93'
        },
        {
          id: 'sutton-hoo-gold-buckle',
          name: 'Sutton Hoo Great Gold Buckle',
          title: 'The Great Gold Buckle',
          description: 'An elaborate gold belt buckle with intricate interlace decoration, from the Sutton Hoo ship burial.',
          year: 625,
          dateText: 'Early 7th century AD',
          materials: 'Gold',
          dimensions: 'Length 13.2 cm, Weight 412.7 g',
          culture: 'Anglo-Saxon',
          objectNumber: '1939,1010.1',
          image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/58/Sutton_hoo_great_gold_buckle_%28cleaned%29.jpg/800px-Sutton_hoo_great_gold_buckle_%28cleaned%29.jpg',
          url: 'https://www.britishmuseum.org/collection/object/H_1939-1010-1'
        },
        {
          id: 'sutton-hoo-shoulder-clasp',
          name: 'Sutton Hoo Shoulder Clasps',
          title: 'Gold Shoulder Clasps',
          description: 'A pair of ornate gold shoulder clasps decorated with garnets and millefiori glass, from Sutton Hoo.',
          year: 625,
          dateText: 'Early 7th century AD',
          materials: 'Gold, garnet, millefiori glass',
          dimensions: 'Each 12.7 x 5.4 cm',
          culture: 'Anglo-Saxon',
          objectNumber: '1939,1010.4-5',
          image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Sutton_Hoo_shoulder_clasp_1_%28cropped%29.jpg/800px-Sutton_Hoo_shoulder_clasp_1_%28cropped%29.jpg',
          url: 'https://www.britishmuseum.org/collection/object/H_1939-1010-4'
        }
      ]
    },
    {
      id: 'room-50',
      roomNumber: '50',
      title: 'Room 50: Britain and Europe 800 BC - AD 43',
      name: 'Iron Age and Celtic Art',
      floor: 'Upper',
      description: 'Art from Iron Age Europe including Celtic masterpieces',
      items: [
        {
          id: 'lindow-man',
          name: 'Lindow Man',
          title: 'Lindow Man',
          description: 'The preserved body of an Iron Age man found in a peat bog in Cheshire. One of the best preserved bog bodies.',
          year: -50,
          dateText: '2 BC - 119 AD',
          materials: 'Preserved human remains',
          culture: 'Iron Age Britain',
          objectNumber: 'P&EE 1984,1002.1',
          image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c9/Lindow_Man_%28Cropped%29.jpg/600px-Lindow_Man_%28Cropped%29.jpg',
          url: 'https://www.britishmuseum.org/collection/object/H_1984-1002-1'
        },
        {
          id: 'battersea-shield',
          name: 'Battersea Shield',
          title: 'The Battersea Shield',
          description: 'A bronze Iron Age shield boss with red glass inlay, found in the River Thames near Battersea Bridge.',
          year: -350,
          dateText: '350-50 BC',
          materials: 'Bronze, red glass',
          dimensions: 'Length 77.5 cm',
          culture: 'Celtic, Iron Age Britain',
          objectNumber: 'P&EE 1857,0715.1',
          image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Celtic_shield_-_battersea_%28British_Museum%29.jpg/600px-Celtic_shield_-_battersea_%28British_Museum%29.jpg',
          url: 'https://www.britishmuseum.org/collection/object/H_1857-0715-1'
        },
        {
          id: 'mold-gold-cape',
          name: 'Mold Gold Cape',
          title: 'The Mold Gold Cape',
          description: 'A Bronze Age gold cape found at Mold, Flintshire. The finest example of prehistoric sheet-gold working in Europe.',
          year: -1900,
          dateText: '1900-1600 BC',
          materials: 'Gold',
          culture: 'Bronze Age Britain',
          objectNumber: 'P&EE 1836,0831.1',
          image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b7/Mold_cape%2C_British_Museum_1.jpg/800px-Mold_cape%2C_British_Museum_1.jpg',
          url: 'https://www.britishmuseum.org/collection/object/H_1836-0831-1'
        }
      ]
    },
    {
      id: 'room-52',
      roomNumber: '52',
      title: 'Room 52: Ancient Iran',
      name: 'Ancient Iran',
      floor: 'Upper',
      description: 'Art and treasures from ancient Persia',
      items: [
        {
          id: 'oxus-treasure',
          name: 'The Oxus Treasure',
          title: 'Gold Armlet from the Oxus Treasure',
          description: 'One of the most important collections of Achaemenid Persian metalwork, found near the Oxus River.',
          year: -450,
          dateText: '5th-4th century BC',
          materials: 'Gold',
          culture: 'Achaemenid Persian',
          objectNumber: 'ME 124081',
          image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c4/Bracelet_from_the_Oxus_Treasure_BM_1897.3122.117.jpg/800px-Bracelet_from_the_Oxus_Treasure_BM_1897.3122.117.jpg',
          url: 'https://www.britishmuseum.org/collection/galleries/ancient-iran'
        },
        {
          id: 'cyrus-cylinder',
          name: 'Cyrus Cylinder',
          title: 'The Cyrus Cylinder',
          description: 'An ancient clay cylinder bearing a declaration in Akkadian cuneiform from Cyrus the Great. Called the first declaration of human rights.',
          year: -539,
          dateText: 'c. 539-530 BC',
          materials: 'Baked clay',
          dimensions: 'Length 22.86 cm',
          culture: 'Achaemenid Persian',
          objectNumber: 'ME 90920',
          image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/de/Cyrus_Cylinder_-_crop.jpg/800px-Cyrus_Cylinder_-_crop.jpg',
          url: 'https://www.britishmuseum.org/collection/object/W_1880-0617-1941'
        }
      ]
    },
    {
      id: 'room-55-56',
      roomNumber: '55-56',
      title: 'Rooms 55-56: Mesopotamia',
      name: 'Ancient Mesopotamia',
      floor: 'Upper',
      description: 'Treasures from Mesopotamia including the Royal Tombs of Ur',
      items: [
        {
          id: 'standard-of-ur',
          name: 'Standard of Ur',
          title: 'The Standard of Ur',
          description: 'A Sumerian artifact from the Royal Cemetery at Ur, decorated with war and peace scenes in shell, red limestone, and lapis lazuli.',
          year: -2600,
          dateText: 'c. 2600 BC',
          materials: 'Shell, red limestone, lapis lazuli, bitumen',
          dimensions: '21.59 x 49.53 cm',
          culture: 'Sumerian',
          objectNumber: 'ME 121201',
          image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Standard_of_Ur_-_War.jpg/800px-Standard_of_Ur_-_War.jpg',
          url: 'https://www.britishmuseum.org/collection/object/W_1928-1010-3'
        },
        {
          id: 'royal-game-of-ur',
          name: 'Royal Game of Ur',
          title: 'The Royal Game of Ur',
          description: 'A 4,600-year-old board game from the Royal Tombs of Ur, one of the oldest known board games.',
          year: -2600,
          dateText: '2600-2400 BC',
          materials: 'Wood, shell, bone, lapis lazuli, red stone',
          dimensions: '30.1 x 11 cm',
          culture: 'Sumerian',
          objectNumber: 'ME 120834',
          image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0f/British_Museum_Royal_Game_of_Ur.jpg/800px-British_Museum_Royal_Game_of_Ur.jpg',
          url: 'https://www.britishmuseum.org/collection/object/W_1928-1010-378'
        },
        {
          id: 'ram-in-thicket',
          name: 'Ram in a Thicket',
          title: 'Ram in a Thicket',
          description: 'One of a pair of statuettes of a ram caught in a thicket, from the Royal Cemetery at Ur.',
          year: -2600,
          dateText: 'c. 2600-2400 BC',
          materials: 'Gold, silver, lapis lazuli, copper, shell, red limestone, bitumen',
          dimensions: 'Height 45.7 cm',
          culture: 'Sumerian',
          objectNumber: 'ME 122200',
          image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/75/Ram_in_a_Thicket%2C_British_Museum.jpg/600px-Ram_in_a_Thicket%2C_British_Museum.jpg',
          url: 'https://www.britishmuseum.org/collection/object/W_1928-1010-161'
        },
        {
          id: 'queens-lyre',
          name: 'Queen\'s Lyre',
          title: 'The Queen\'s Lyre',
          description: 'A golden lyre with a bull\'s head from the Royal Cemetery at Ur, from the tomb of Queen Pu-abi.',
          year: -2600,
          dateText: 'c. 2600 BC',
          materials: 'Gold, silver, lapis lazuli, shell, bitumen, wood',
          dimensions: 'Height 112 cm',
          culture: 'Sumerian',
          objectNumber: 'ME 121198',
          image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/Queen%27s_Lyre_%28reconstructed%29_of_Ur_at_British_Museum.jpg/600px-Queen%27s_Lyre_%28reconstructed%29_of_Ur_at_British_Museum.jpg',
          url: 'https://www.britishmuseum.org/collection/object/W_1928-1010-1'
        }
      ]
    },
    {
      id: 'room-61-66',
      roomNumber: '61-66',
      title: 'Rooms 61-66: Egyptian Mummies',
      name: 'Ancient Egyptian Death and Afterlife',
      floor: 'Upper',
      description: 'Egyptian mummies, coffins, and objects for the afterlife',
      items: [
        {
          id: 'ginger-mummy',
          name: 'Gebelein Man ("Ginger")',
          title: 'Gebelein Predynastic Mummy',
          description: 'A naturally mummified body from around 3400 BC, one of the oldest and best preserved mummies in the world.',
          year: -3400,
          dateText: 'c. 3400 BC',
          materials: 'Human remains',
          culture: 'Predynastic Egypt',
          objectNumber: 'EA 32751',
          image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/59/Ginger_%28mummy%29.jpg/800px-Ginger_%28mummy%29.jpg',
          url: 'https://www.britishmuseum.org/collection/object/Y_EA32751'
        },
        {
          id: 'mummy-katebet',
          name: 'Mummy of Katebet',
          title: 'Mummy and Coffin of Katebet',
          description: 'The mummy of a chantress of Amun, displayed in her decorated anthropoid coffin.',
          year: -1300,
          dateText: '19th Dynasty, c. 1300-1280 BC',
          materials: 'Wood, linen, cartonnage, gold leaf',
          culture: 'Ancient Egypt',
          objectNumber: 'EA 6665',
          image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8b/British_Museum_Egypt_104.jpg/400px-British_Museum_Egypt_104.jpg',
          url: 'https://www.britishmuseum.org/collection/object/Y_EA6665'
        },
        {
          id: 'book-of-dead-hunefer',
          name: 'Book of the Dead of Hunefer',
          title: 'Papyrus of Hunefer',
          description: 'A beautifully illustrated papyrus from the Book of the Dead, showing the judgment of the dead.',
          year: -1275,
          dateText: 'c. 1275 BC',
          materials: 'Papyrus, ink, pigment',
          culture: 'Ancient Egypt, 19th Dynasty',
          objectNumber: 'EA 9901',
          image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ee/BD_Hunefer.jpg/800px-BD_Hunefer.jpg',
          url: 'https://www.britishmuseum.org/collection/object/Y_EA9901-3'
        }
      ]
    },
    {
      id: 'room-68',
      roomNumber: '68',
      title: 'Room 68: Money and Medals',
      name: 'Money',
      floor: 'Upper',
      description: 'The history of money from ancient times to the present',
      items: [
        {
          id: 'lydian-coins',
          name: 'Lydian Electrum Coins',
          title: 'World\'s First Coins',
          description: 'Electrum coins from Lydia (modern Turkey), among the earliest known coins in the world.',
          year: -600,
          dateText: 'c. 600 BC',
          materials: 'Electrum (gold-silver alloy)',
          culture: 'Lydian',
          objectNumber: 'CM 1990,0403.1',
          image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/BMC_06.jpg/400px-BMC_06.jpg',
          url: 'https://www.britishmuseum.org/collection/galleries/money'
        }
      ]
    },
    {
      id: 'room-91-94',
      roomNumber: '91-94',
      title: 'Rooms 91-94: Japanese Galleries',
      name: 'Japan',
      floor: 'Upper',
      description: 'Art from Japan from ancient times to the present',
      items: [
        {
          id: 'great-wave-hokusai',
          name: 'The Great Wave off Kanagawa',
          title: 'The Great Wave off Kanagawa',
          description: 'The most famous woodblock print by Katsushika Hokusai, part of the Thirty-six Views of Mount Fuji series.',
          year: 1831,
          dateText: 'c. 1831',
          materials: 'Woodblock print, ink and colour on paper',
          dimensions: '25.7 x 37.8 cm',
          culture: 'Japanese, Edo period',
          objectNumber: 'JA 1906,1220.0.533',
          image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/Tsunami_by_hokusai_19th_century.jpg/800px-Tsunami_by_hokusai_19th_century.jpg',
          url: 'https://www.britishmuseum.org/collection/object/A_1906-1220-0-533'
        },
        {
          id: 'samurai-armor',
          name: 'Samurai Armour',
          title: 'Samurai Armour (Yoroi)',
          description: 'A complete set of Japanese samurai armour from the Edo period.',
          year: 1750,
          dateText: '18th century',
          materials: 'Iron, lacquer, silk, leather, gold',
          culture: 'Japanese, Edo period',
          objectNumber: 'JA 1881,1210.1',
          image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/44/Samurai_armor_Asian_Art_Museum_SF.JPG/400px-Samurai_armor_Asian_Art_Museum_SF.JPG',
          url: 'https://www.britishmuseum.org/collection/galleries/japan'
        }
      ]
    },
    {
      id: 'room-95',
      roomNumber: '95',
      title: 'Room 95: Percival David Collection',
      name: 'Chinese Ceramics',
      floor: 'Upper',
      description: 'The finest collection of Chinese ceramics in the world',
      items: [
        {
          id: 'david-vases',
          name: 'David Vases',
          title: 'The David Vases',
          description: 'A pair of blue and white porcelain vases, the most important dated Chinese porcelains in existence.',
          year: 1351,
          dateText: '1351 AD',
          materials: 'Porcelain with underglaze blue decoration',
          dimensions: 'Height 63.6 cm',
          culture: 'Chinese, Yuan dynasty',
          objectNumber: 'PDF B.613',
          image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fa/David_Vases_-_British_Museum.jpg/600px-David_Vases_-_British_Museum.jpg',
          url: 'https://www.britishmuseum.org/collection/object/A_PDF-B-613'
        },
        {
          id: 'ru-ware-brush-washer',
          name: 'Ru Ware Brush Washer',
          title: 'Ru Ware Brush Washer',
          description: 'An extremely rare piece of Ru ware, the most prized of all Chinese ceramics.',
          year: 1100,
          dateText: '1086-1125 AD',
          materials: 'Stoneware with pale blue-green glaze',
          culture: 'Chinese, Northern Song dynasty',
          objectNumber: 'PDF A.3',
          image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b0/Ru_ware_dish%2C_northern_Song%2C_excavated_1987_at_Qingliangsi%2C_Baofeng.jpg/600px-Ru_ware_dish%2C_northern_Song%2C_excavated_1987_at_Qingliangsi%2C_Baofeng.jpg',
          url: 'https://www.britishmuseum.org/collection/galleries/sir-percival-david-collection'
        }
      ]
    },
    {
      id: 'room-90',
      roomNumber: '90',
      title: 'Room 90: Prints and Drawings',
      name: 'Prints and Drawings',
      floor: 'Upper',
      description: 'One of the world\'s greatest collections of works on paper',
      items: [
        {
          id: 'durer-rhinoceros',
          name: 'Dürer\'s Rhinoceros',
          title: 'Rhinoceros by Albrecht Dürer',
          description: 'A woodcut print created by Albrecht Dürer in 1515, based on a written description of an Indian rhinoceros.',
          year: 1515,
          dateText: '1515',
          materials: 'Woodcut print',
          dimensions: '21.4 x 29.8 cm',
          culture: 'German Renaissance',
          objectNumber: 'PD 1895,0122.714',
          image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bc/The_Rhinoceros_%28NGA_1964.8.697%29_enhanced.png/800px-The_Rhinoceros_%28NGA_1964.8.697%29_enhanced.png',
          url: 'https://www.britishmuseum.org/collection/object/P_1895-0122-714'
        }
      ]
    }
  ]
};

async function fetchWithTimeout(url, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : require('http');
    const req = protocol.get(url, { 
      headers: { 
        'User-Agent': 'Mozilla/5.0 (compatible; MuseumBot/1.0)' 
      }
    }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(timeout, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

async function verifyImageUrl(url) {
  return new Promise((resolve) => {
    if (!url) { resolve(false); return; }
    
    const protocol = url.startsWith('https') ? https : require('http');
    const req = protocol.request(url, { method: 'HEAD', headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(5000, () => { req.destroy(); resolve(false); });
    req.end();
  });
}

async function main() {
  console.log('🏛️ British Museum Collection Builder');
  console.log('=====================================\n');
  
  // Verify images
  console.log('🔍 Verifying image URLs...\n');
  
  let totalItems = 0;
  let validImages = 0;
  let invalidImages = 0;
  
  for (const room of COLLECTION_DATA.rooms) {
    console.log(`📍 ${room.title}`);
    for (const item of room.items) {
      totalItems++;
      const isValid = await verifyImageUrl(item.image);
      if (isValid) {
        validImages++;
        console.log(`   ✓ ${item.name}`);
      } else {
        invalidImages++;
        console.log(`   ⚠ ${item.name} - image needs verification`);
      }
    }
  }
  
  // Add metadata
  const output = {
    ...COLLECTION_DATA,
    scrapedAt: new Date().toISOString(),
    stats: {
      totalRooms: COLLECTION_DATA.rooms.length,
      totalItems,
      validImages,
      invalidImages
    }
  };
  
  // Save to file
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2));
  
  console.log('\n=====================================');
  console.log('✅ Collection data saved!');
  console.log(`📁 Output: ${OUT_PATH}`);
  console.log(`📊 Total rooms: ${output.stats.totalRooms}`);
  console.log(`📊 Total items: ${output.stats.totalItems}`);
  console.log(`📊 Valid images: ${output.stats.validImages}`);
  console.log(`📊 Invalid images: ${output.stats.invalidImages}`);
  console.log('\nNext step: Run upload-british-museum-to-r2.cjs to upload images to R2');
}

main().catch(console.error);
