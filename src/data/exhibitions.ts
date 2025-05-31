import type { Exhibition } from "../types/Exhibition";

export const exhibitions: Exhibition[] = [
  {
    id: "1",
    name: "Tate Modern",
    slug: "tate-modern",
    location: "London, UK",
    description: "20세기 현대미술의 중심지.",
    latitude: 51.5076,
    longitude: -0.0994,
    permanentExhibitions: [
      {
        id: "p1",
        title: "Modern Art Gallery",
        description: "A collection of modern art.",
        startDate: "2025-01-01",
        endDate: "2025-12-31"
      },
      {
        id: "p2",
        title: "Sculpture Gallery",
        description: "Sculptures from renowned artists.",
        startDate: "2025-03-01",
        endDate: "2025-09-30"
      }
    ],
    temporaryExhibitions: [
      {
        id: "t1",
        title: "Picasso Special",
        description: "A special exhibition on Picasso.",
        startDate: "2025-06-01",
        endDate: "2025-09-01"
      },
      {
        id: "t2",
        title: "Impressionist Masters",
        description: "Masterpieces from Impressionist painters.",
        startDate: "2025-07-01",
        endDate: "2025-10-01"
      }
    ]
  },
  {
    id: "2",
    name: "Louvre Museum",
    slug: "louvre-museum",
    location: "Paris, France",
    description: "세계에서 가장 큰 미술관.",
    latitude: 48.8606,
    longitude: 2.3376,
    permanentExhibitions: [
      {
        id: "p3",
        title: "Ancient Art",
        description: "Ancient Greek, Roman, and Egyptian art.",
        startDate: "2025-01-01",
        endDate: "2025-12-31"
      }
    ],
    temporaryExhibitions: [
      {
        id: "t3",
        title: "Mona Lisa's Secrets",
        description: "Behind the scenes of the famous painting.",
        startDate: "2025-08-01",
        endDate: "2025-10-01"
      }
    ]
  }
];