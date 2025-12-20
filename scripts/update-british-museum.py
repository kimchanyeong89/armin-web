#!/usr/bin/env python3
"""Update British Museum section in exhibitions.js"""

import re

# Read the file
with open('src/data/exhibitions.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the British Museum section using regex
pattern = r'(id: "british-museum",\n    name: "British Museum",.*?rooms: \{.*?\}.*?\}\n  \},)'

# Find the match
match = re.search(pattern, content, re.DOTALL)

if match:
    print(f"Found British Museum section at {match.start()}-{match.end()}")
    
    new_bm = '''id: "british-museum",
    name: "British Museum",
    slug: "british-museum",
    location: "Great Russell St, Bloomsbury, London WC1B 3DG",
    description: "The British Museum, founded in 1753, is one of the world's largest and most comprehensive museums. Its permanent collection of eight million works covers over two million years of human history, from ancient civilizations to the modern day. The museum features iconic treasures including the Rosetta Stone, Parthenon sculptures, Egyptian mummies, and Assyrian reliefs.",
    latitude: 51.519413,
    longitude: -0.127022,
    region: "Central London",
    website: "https://www.britishmuseum.org",
    // Room-based archive sourced from british-museum-galleries.json
    // Major departments: Egypt and Sudan, Greece and Rome, Middle East, Britain/Europe/Prehistory, Asia, Africa/Oceania/Americas, Prints and Drawings, Money and Medals
    permanentExhibitions: [
      { id: "bm-archive-rooms", name: "Galleries Archive (Rooms)", title: "Galleries Archive (Rooms)", description: "Objects grouped by British Museum rooms from the galleries archive.", startDate: "Permanent", endDate: "Permanent", image: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/british-museum/great-court.jpg" },
      { id: "bm-egypt", name: "Ancient Egypt and Sudan", title: "Ancient Egypt and Sudan", description: "One of the world's greatest collections of Egyptian antiquities, including the Rosetta Stone, mummies, coffins, and sculptures. The collection comprises over 110,000 objects spanning from 6000 BC to the 12th century AD.", startDate: "Permanent", endDate: "Permanent", room: "Rooms 4, 61-66", image: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/british-museum/rosetta-stone.jpg" },
      { id: "bm-greece-rome", name: "Ancient Greece and Rome", title: "Ancient Greece and Rome", description: "Over 100,000 objects from the Classical world, including the Parthenon sculptures (Elgin Marbles), Mausoleum at Halicarnassus fragments, Nereid Monument, and the Portland Vase.", startDate: "Permanent", endDate: "Permanent", room: "Rooms 11-23, 69-73, 77-85", image: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/british-museum/parthenon.jpg" },
      { id: "bm-middle-east", name: "Ancient Middle East", title: "Ancient Middle East", description: "One of the world's most comprehensive collections of Mesopotamian antiquities, featuring Assyrian palace reliefs from Nineveh and Nimrud, the Standard of Ur, Royal Game of Ur, and the Oxus Treasure.", startDate: "Permanent", endDate: "Permanent", room: "Rooms 6-10, 34, 52-59", image: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/british-museum/assyrian-lions.jpg" },
      { id: "bm-britain-europe", name: "Britain, Europe and Prehistory", title: "Britain, Europe and Prehistory", description: "Collections spanning Stone Age to modern times, including Sutton Hoo treasures, Lindow Man, Lewis Chessmen, Mold Gold Cape, and the Royal Gold Cup.", startDate: "Permanent", endDate: "Permanent", room: "Rooms 38-51", image: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/british-museum/sutton-hoo.jpg" },
      { id: "bm-asia", name: "Asia", title: "Asia", description: "Outstanding collections from China, South Asia, Southeast Asia, and Japan, including the Admonitions Scroll, Amaravati sculptures, and the Percival David Collection of Chinese ceramics.", startDate: "Permanent", endDate: "Permanent", room: "Rooms 33, 67, 91-95", image: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/british-museum/asia-gallery.jpg" },
      { id: "bm-africa-oceania", name: "Africa, Oceania and the Americas", title: "Africa, Oceania and the Americas", description: "Over 350,000 objects representing indigenous cultures worldwide, including Benin Bronzes, Hoa Hakananai'a moai statue, and Aztec turquoise mosaics.", startDate: "Permanent", endDate: "Permanent", room: "Rooms 24-27", image: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/british-museum/africa-gallery.jpg" },
      { id: "bm-prints", name: "Prints and Drawings", title: "Prints and Drawings", description: "One of the world's greatest print rooms with approximately 50,000 drawings and over two million prints, including works by Durer, Michelangelo, Rembrandt, and Picasso.", startDate: "Permanent", endDate: "Permanent", room: "Room 90", image: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/british-museum/prints-drawings.jpg" },
      { id: "bm-enlightenment", name: "Enlightenment Gallery", title: "Enlightenment Gallery", description: "Room 1, the former King's Library, explores how people understood the world in the Age of Enlightenment (1680-1820) through the founding collections.", startDate: "Permanent", endDate: "Permanent", room: "Room 1", image: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/british-museum/enlightenment.jpg" }
    ],
    temporaryExhibitions: [
      { id: "bm-mumbai-london", name: "Mumbai + London: New Perspectives on the Ancient World", title: "Mumbai + London: New Perspectives on the Ancient World", description: "A groundbreaking collaboration between the British Museum and CSMVS Mumbai exploring new interpretations of ancient objects from both collections.", startDate: "2025.04.24", endDate: "2026.01.11", room: "Sainsbury Exhibitions Gallery", image: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/british-museum/mumbai-london.jpg" },
      { id: "bm-nordic-noir", name: "Nordic Noir: Works on Paper from Edvard Munch to Mamma Andersson", title: "Nordic Noir: Works on Paper from Edvard Munch to Mamma Andersson", description: "Exploring the darker side of Scandinavian art through prints and drawings, from Edvard Munch's iconic imagery to contemporary Swedish artist Mamma Andersson.", startDate: "2025.10.09", endDate: "2026.03.22", room: "Room 90", image: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/british-museum/nordic-noir.jpg" }
    ],
    pastExhibitions: [
      { id: "bm-p-silk-roads", name: "Silk Roads", title: "Silk Roads", description: "Major exhibition exploring the networks of exchange and ideas that connected East and West across Asia for millennia.", startDate: "2024.09.26", endDate: "2025.02.23" },
      { id: "bm-p-nero", name: "Nero: The Man Behind the Myth", title: "Nero: The Man Behind the Myth", description: "Re-examination of the infamous Roman emperor, separating fact from fiction through archaeology and contemporary sources.", startDate: "2021.05.27", endDate: "2021.10.24" },
      { id: "bm-p-hokusai", name: "Hokusai: Beyond the Great Wave", title: "Hokusai: Beyond the Great Wave", description: "Focusing on the last 30 years of Japanese artist Katsushika Hokusai's life, when he created some of his most celebrated masterpieces.", startDate: "2017.05.25", endDate: "2017.08.13" }
    ],
    representativeImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/british-museum/building.jpg",
    floorPlan: "",
    rooms: {
      "room-4": [
        { id: "bm-art-rosetta", name: "Rosetta Stone", artist: "Unknown", year: -196, image: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/british-museum/rosetta-stone.jpg", roomId: "room-4", exhibitionName: "Ancient Egypt and Sudan", exhibitionTitle: "Ancient Egypt and Sudan", description: "Trilingual stela that unlocked the ancient Egyptian hieroglyphics (196 BC)" }
      ],
      "room-18": [
        { id: "bm-art-parthenon", name: "Parthenon Sculptures", artist: "Phidias workshop", year: -438, image: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/british-museum/parthenon.jpg", roomId: "room-18", exhibitionName: "Ancient Greece and Rome", exhibitionTitle: "Ancient Greece and Rome", description: "Sculptures from the Parthenon temple in Athens, 447-438 BC" }
      ],
      "room-10": [
        { id: "bm-art-lion-hunt", name: "Lion Hunt of Ashurbanipal", artist: "Unknown", year: -645, image: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/british-museum/lion-hunt.jpg", roomId: "room-10", exhibitionName: "Ancient Middle East", exhibitionTitle: "Ancient Middle East", description: "Assyrian palace reliefs from Nineveh depicting the royal lion hunt, c. 645 BC" }
      ],
      "room-41": [
        { id: "bm-art-sutton-hoo", name: "Sutton Hoo Helmet", artist: "Unknown", year: 625, image: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/british-museum/sutton-hoo.jpg", roomId: "room-41", exhibitionName: "Britain, Europe and Prehistory", exhibitionTitle: "Britain, Europe and Prehistory", description: "Anglo-Saxon helmet from the Sutton Hoo ship burial, early 7th century" }
      ],
      "room-40": [
        { id: "bm-art-lewis", name: "Lewis Chessmen", artist: "Unknown", year: 1150, image: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/british-museum/lewis-chessmen.jpg", roomId: "room-40", exhibitionName: "Britain, Europe and Prehistory", exhibitionTitle: "Britain, Europe and Prehistory", description: "Medieval chess pieces found in the Outer Hebrides, Scotland, 12th century" }
      ],
      "room-24": [
        { id: "bm-art-moai", name: "Hoa Hakananai'a", artist: "Rapa Nui people", year: 1200, image: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/british-museum/moai.jpg", roomId: "room-24", exhibitionName: "Africa, Oceania and the Americas", exhibitionTitle: "Africa, Oceania and the Americas", description: "Basalt moai statue from Easter Island, c. 1000-1200 AD" }
      ]
    }
  },'''
    
    content = content[:match.start()] + new_bm + content[match.end():]
    
    with open('src/data/exhibitions.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print("SUCCESS: British Museum updated")
else:
    print("NOT FOUND: Pattern did not match")
