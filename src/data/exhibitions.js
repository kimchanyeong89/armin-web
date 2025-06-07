// src/data/exhibitions.js
export const exhibitions = [
  {
    id: "1",
    name: "TATE Modern",
    description: "20세기 현대미술의 중심지.",
    latitude: 51.5074,
    longitude: -0.1278,
    permanentExhibitions: [
      { id: "1", name: "Tate Collection Highlights", title: "Tate Collection Highlights" },
      { id: "2", name: "Impressionist Masters", title: "Impressionist Masters" },
      { id: "3", name: "Contemporary Art", title: "Contemporary Art" },
      { id: "4", name: "Abstract Revolution", title: "Abstract Revolution" },
    ],
    temporaryExhibitions: [
      {
        id: "5",
        name: "Modern Sculpture",
        title: "Modern Sculpture",
        description: "A special exhibition of modern sculptures.",
        startDate: "2025.06.01",
        endDate: "2025.09.01",
      },
      {
        id: "6",
        name: "Photography Now",
        title: "Photography Now",
        description: "A journey through contemporary photography.",
        startDate: "2025.09.15",
        endDate: "2025.12.31",
      },
      {
        id: "7",
        name: "Digital Horizons",
        title: "Digital Horizons",
        description: "Exploring digital art and media.",
        startDate: "2026.01.10",
        endDate: "2026.04.30",
      },
    ],
    pastExhibitions: [
      {
        id: "8",
        name: "Post-War Art",
        title: "Post-War Art",
        description: "A retrospective exhibition of post-war art.",
        startDate: "2023.06.01",
        endDate: "2023.12.31",
      },
      {
        id: "9",
        name: "Baroque Treasures",
        title: "Baroque Treasures",
        description: "Masterpieces from the Baroque era.",
        startDate: "2024.01.01",
        endDate: "2024.05.31",
      },
      {
        id: "10",
        name: "Minimalist Perspectives",
        title: "Minimalist Perspectives",
        description: "The evolution of minimalism in art.",
        startDate: "2024.06.15",
        endDate: "2024.10.15",
      },
    ],
  },
  // ... other exhibition venues
];