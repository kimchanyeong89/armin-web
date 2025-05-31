// src/data/exhibitions.js
export const exhibitions = [
  {
    id: "1",
    name: "TATE Modern",
    description: "20세기 현대미술의 중심지.",
    latitude: 51.5074,
    longitude: -0.1278,
    permanentExhibitions: [
      { title: "Tate Collection Highlights" },
    ],
    temporaryExhibitions: [
      { title: "Modern Sculpture", endDate: "2025-09-01" },
    ],
    pastExhibitions: [
      { title: "Post-War Art", endDate: "2023-12-31" },
    ],
  },
  // ... 다른 전시관들
];