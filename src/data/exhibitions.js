// src/data/exhibitions.js
export const exhibitions = [
  {
    id: "tate-modern",
    slug: "tate-modern",
    name: "Tate Modern",
    location: "Bankside, London SE1 9TG, United Kingdom",
    description: "Britain’s national museum of international modern and contemporary art on the South Bank.",
    latitude: 51.5076,
    longitude: -0.0994,
    representativeImage: "/images/tate-modern-building.jpg",
    floorPlan: "",
    permanentExhibitions: [
      { id: "tm-perm-1", name: "Tate Collection Highlights", title: "Tate Collection Highlights", description: "Key works from the international modern collection.", startDate: "Permanent", endDate: "Permanent" },
      { id: "tm-perm-2", name: "Surrealism and Beyond", title: "Surrealism and Beyond", description: "Surrealist movements and their legacies.", startDate: "Permanent", endDate: "Permanent" },
      { id: "tm-perm-3", name: "Tate Collection", title: "Tate Collection", description: "Complete collection of artworks from Tate galleries.", startDate: "Permanent", endDate: "Permanent" }
    ],
    temporaryExhibitions: [
      { id: "tm-temp-1", name: "Modern Sculpture", title: "Modern Sculpture", description: "A special exhibition of modern sculptures.", startDate: "2025-06-01", endDate: "2025-09-01" },
      { id: "tm-temp-2", name: "Photography Now", title: "Photography Now", description: "A journey through contemporary photography.", startDate: "2025-09-15", endDate: "2025-12-31" }
    ],
    pastExhibitions: [
      { id: "tm-past-1", name: "Post-War Art", title: "Post-War Art", description: "A retrospective exhibition of post-war art.", startDate: "2023-06-01", endDate: "2023-12-31" },
      { id: "tm-past-2", name: "Baroque Treasures", title: "Baroque Treasures", description: "Masterpieces from the Baroque era.", startDate: "2024-01-01", endDate: "2024-05-31" },
      { id: "tm-past-3", name: "Minimalist Perspectives", title: "Minimalist Perspectives", description: "The evolution of minimalism in art.", startDate: "2024-06-15", endDate: "2024-10-15" }
    ],
  },
  // Tate Britain
  {
    id: "tate-britain",
    slug: "tate-britain",
    name: "Tate Britain",
    location: "Millbank, London SW1P 4RG, United Kingdom",
    description: "Britain's largest museum of British art from the 1500s to the present day, housing the world's greatest collection of British art.",
    latitude: 51.4920,
    longitude: -0.1275,
  representativeImage: "/images/tate-britain-building.jpg",
    floorPlan: "",
    permanentExhibitions: [
      { id: "tb-perm-1", name: "British Art 1500-1900", title: "British Art 1500-1900", description: "Masterpieces from the Tudor period to the Victorian era.", startDate: "Permanent", endDate: "Permanent" },
      { id: "tb-perm-2", name: "British Art 1900-Present", title: "British Art 1900-Present", description: "Modern and contemporary British art from 1900 to the present day.", startDate: "Permanent", endDate: "Permanent" },
      { id: "tb-perm-3", name: "Turner Collection", title: "Turner Collection", description: "The world's largest collection of works by J.M.W. Turner.", startDate: "Permanent", endDate: "Permanent" },
      // Mirror Tate Modern's "Tate Collection" so the modal loads the same local artworks feed
      { id: "tm-perm-3", name: "Tate Collection", title: "Tate Collection", description: "Complete collection of artworks from Tate galleries.", startDate: "Permanent", endDate: "Permanent" }
    ],
    temporaryExhibitions: [
      { id: "tb-temp-1", name: "Pre-Raphaelite Sisters", title: "Pre-Raphaelite Sisters", description: "Exploring the lives and works of women artists associated with the Pre-Raphaelite movement.", startDate: "2025-10-01", endDate: "2026-01-31" },
      { id: "tb-temp-2", name: "Francis Bacon: Man and Beast", title: "Francis Bacon: Man and Beast", description: "A major exhibition exploring Francis Bacon's fascination with animals and the human form.", startDate: "2025-09-15", endDate: "2026-02-28" }
    ],
    pastExhibitions: [
      { id: "tb-past-1", name: "The EY Exhibition: Lucian Freud", title: "The EY Exhibition: Lucian Freud", description: "A comprehensive retrospective of Lucian Freud's work.", startDate: "2024-10-01", endDate: "2025-01-31" },
      { id: "tb-past-2", name: "The EY Exhibition: Van Gogh and Britain", title: "The EY Exhibition: Van Gogh and Britain", description: "Exploring Van Gogh's influence on British artists.", startDate: "2024-03-01", endDate: "2024-08-31" }
    ],
  },
  // London major museums
  {
    id: "british-museum",
    name: "British Museum",
    slug: "british-museum",
    location: "Great Russell St, Bloomsbury, London WC1B 3DG",
    description: "One of the world’s largest and most comprehensive museums of human history and culture.",
    latitude: 51.519413,
    longitude: -0.127022,
    permanentExhibitions: [
      { id: "bm-1", name: "World Cultures", title: "World Cultures", description: "Permanent displays covering global human history.", startDate: "Permanent", endDate: "Permanent" },
      { id: "bm-2", name: "Ancient Egypt", title: "Ancient Egypt", description: "Treasures from Egypt including the Rosetta Stone.", startDate: "Permanent", endDate: "Permanent" }
    ],
    temporaryExhibitions: [
  { id: "bm-t1", name: "Treasures Reimagined", title: "Treasures Reimagined", description: "A fresh look at selected highlights from the collection.", startDate: "2025.07.01", endDate: "2025.12.31" }
    ],
    pastExhibitions: [
      { id: "bm-p1", name: "Ancient Lives", title: "Ancient Lives", description: "Explorations of daily life in antiquity.", startDate: "2024.03.01", endDate: "2024.09.30" }
    ],
  representativeImage: "/images/british-museum-building.jpg",
    floorPlan: "",
    rooms: {
      "room-1": [
        { id: "bm-art-1", name: "Rosetta Stone", artist: "Unknown", year: 196, image: "/images/exhibition1.png", roomId: "room-1", exhibitionName: "Ancient Egypt", exhibitionTitle: "Ancient Egypt" }
      ]
    }
  },
  {
    id: "national-gallery",
    name: "National Gallery",
    slug: "national-gallery",
    location: "Trafalgar Square, London WC2N 5DN",
    description: "Houses a rich collection of European paintings from the 13th to the 19th centuries.",
    latitude: 51.508929,
    longitude: -0.128299,
    permanentExhibitions: [
      { id: "ng-1", name: "European Paintings", title: "European Paintings", description: "Masterworks by Botticelli, Van Gogh, Turner and more.", startDate: "Permanent", endDate: "Permanent" }
    ],
    temporaryExhibitions: [
  { id: "ng-t1", name: "Rembrandt & Company", title: "Rembrandt & Company", description: "A focused display examining Rembrandt’s circle.", startDate: "2025.09.01", endDate: "2026.01.15" }
    ],
    pastExhibitions: [
      { id: "ng-p1", name: "Impressionist Encounters", title: "Impressionist Encounters", description: "Highlights from the Impressionist movement.", startDate: "2024.02.01", endDate: "2024.08.31" }
    ],
  representativeImage: "/images/national-gallery-building.jpg",
    floorPlan: "",
    rooms: {
      "room-1": [
        { id: "ng-art-1", name: "Sunflowers", artist: "Vincent van Gogh", year: 1888, image: "/images/exhibition2.png", roomId: "room-1", exhibitionName: "European Paintings", exhibitionTitle: "European Paintings" }
      ]
    }
  },
  {
    id: "vam",
    name: "Victoria and Albert Museum",
    slug: "vam",
    location: "Cromwell Rd, South Kensington, London SW7 2RL",
    description: "The world’s leading museum of art, design and performance.",
    latitude: 51.496639,
    longitude: -0.172201,
    permanentExhibitions: [
      { id: "vam-1", name: "Design Collections", title: "Design Collections", description: "Applied arts and design across centuries.", startDate: "Permanent", endDate: "Permanent" }
    ],
    temporaryExhibitions: [
  { id: "vam-t1", name: "Cartier: Jewellery and Innovation", title: "Cartier", description: "A major exhibition of Cartier jewellery.", startDate: "2025.09.20", endDate: "2026.02.28" }
    ],
    pastExhibitions: [
      { id: "vam-p1", name: "Fashion Forward", title: "Fashion Forward", description: "Exploring fashion and identity.", startDate: "2024.05.01", endDate: "2024.11.30" }
    ],
  representativeImage: "/images/vam-building.png",
    floorPlan: "",
    rooms: {
      "room-1": [
        { id: "vam-art-1", name: "Sculpture Sample", artist: "Various", year: 1900, image: "/images/exhibition3.png", roomId: "room-1", exhibitionName: "Design Collections", exhibitionTitle: "Design Collections" }
      ]
    }
  },
  {
    id: "science-museum",
    name: "Science Museum",
    slug: "science-museum",
    location: "Exhibition Rd, South Kensington, London SW7 2DD",
    description: "Interactive science and technology museum with award-winning galleries and exhibitions.",
    latitude: 51.497809,
    longitude: -0.174513,
    permanentExhibitions: [
      { id: "sm-1", name: "Exploration and Innovation", title: "Exploration and Innovation", description: "Core displays on science and technology.", startDate: "Permanent", endDate: "Permanent" }
    ],
    temporaryExhibitions: [
  { id: "sm-t1", name: "Future of Food", title: "Future of Food", description: "Examining how food systems may change.", startDate: "2025.06.01", endDate: "2026.01.04" }
    ],
    pastExhibitions: [
      { id: "sm-p1", name: "Wonderlab", title: "Wonderlab", description: "Hands-on interactive gallery for families.", startDate: "2024.04.01", endDate: "2024.10.31" }
    ],
  representativeImage: "/images/science-museum-building.jpg",
    floorPlan: "",
    rooms: {
      "gallery-1": [
        { id: "sm-art-1", name: "Steam Engine", artist: "Various", year: 1850, image: "/images/exhibition4.png", roomId: "gallery-1", exhibitionName: "Exploration and Innovation", exhibitionTitle: "Exploration and Innovation" }
      ]
    }
  },
  // Seoul major museums/exhibition venues
  {
    id: "seoul-1",
  name: "National Museum of Modern and Contemporary Art, Seoul (MMCA Seoul)",
  description: "A leading institution for Korean contemporary art, offering diverse exhibitions and public programs.",
    latitude: 37.579617,
    longitude: 126.981805,
    permanentExhibitions: [
  { id: "s1-1", name: "Korean Contemporary Art Collection", title: "Korean Contemporary Art Collection" },
  { id: "s1-2", name: "Asian Contemporary Art", title: "Asian Contemporary Art" }
    ],
    temporaryExhibitions: [
      {
  id: "s1-3",
  name: "Media Art Special Exhibition",
  title: "Media Art Special Exhibition",
  description: "A special exhibition highlighting contemporary media art works.",
        startDate: "2025.08.01",
        endDate: "2025.10.31"
      }
    ],
    pastExhibitions: [
      {
        id: "s1-4",
        name: "100 Years of Korean Sculpture",
        title: "100 Years of Korean Sculpture",
        description: "A large-scale retrospective surveying the development of Korean sculpture.",
        startDate: "2024.03.01",
        endDate: "2024.08.31"
      }
    ],
    rooms: {
      "room-1": [
        {
          id: "art-1",
          title: "Example Artwork 1",
          image: "/images/exhibition1.png"
        },
        {
          id: "art-2",
          title: "Example Artwork 2",
          image: "/images/exhibition2.png"
        }
      ],
      "room-2": [
        {
          id: "art-3",
          title: "Example Artwork 3",
          image: "/images/exhibition3.png"
        }
      ]
    }
  },
  {
    id: "seoul-2",
  name: "Leeum Museum of Art",
  description: "A world-class museum operated by the Samsung Foundation, showcasing traditional Korean and contemporary art.",
    latitude: 37.539307,
    longitude: 126.994715,
    permanentExhibitions: [
  { id: "s2-1", name: "Korean Classical Art Collection", title: "Korean Classical Art Collection" },
  { id: "s2-2", name: "Modern Art Collection", title: "Modern Art Collection" }
    ],
    temporaryExhibitions: [
      {
        id: "s2-3",
        name: "International Contemporary Art Exhibition",
        title: "International Contemporary Art Exhibition",
        description: "A large exhibition featuring contemporary artists from around the world.",
        startDate: "2025.09.10",
        endDate: "2025.12.20"
      }
    ],
    pastExhibitions: [
      {
        id: "s2-4",
        name: "Korean Ceramics Special Exhibition",
        title: "Korean Ceramics Special Exhibition",
        description: "An exhibition highlighting the beauty of Korean ceramics.",
        startDate: "2024.05.01",
        endDate: "2024.09.30"
      }
    ],
    rooms: {
      "main-hall": [
        {
          id: "art-4",
          title: "Leeum Featured Work",
          image: "/images/exhibition4.png"
        }
      ],
      // 현대미술 컬렉션에 대응하는 room 추가
      "hyundae-art-room": [
        {
          id: "art-7",
          title: "Modern Art Museum Featured Work 1",
          image: "/images/exhibition1.png"
        },
        {
          id: "art-8",
          title: "Modern Art Museum Featured Work 2",
          image: "/images/exhibition2.png"
        }
      ]
    }
  },
  {
    id: "seoul-3",
  name: "Seoul Museum of Art (SeMA)",
  description: "A public museum for the city, presenting a wide range of contemporary art exhibitions.",
    latitude: 37.564362,
    longitude: 126.975221,
    permanentExhibitions: [
      { id: "s3-1", name: "서울미술관 소장품전", title: "서울미술관 소장품전" }
    ],
    temporaryExhibitions: [
      {
        id: "s3-2",
        name: "Young Artists Exhibition",
        title: "Young Artists Exhibition",
        description: "An exhibition showcasing experimental works by emerging artists.",
        startDate: "2025.07.15",
        endDate: "2025.09.15"
      }
    ],
    pastExhibitions: [
      {
        id: "s3-3",
        name: "Landscapes of Seoul",
        title: "Landscapes of Seoul",
        description: "A painting exhibition themed around the diverse landscapes of Seoul.",
        startDate: "2024.10.01",
        endDate: "2025.02.28"
      }
    ],
    rooms: {
      "gallery-1": [
        {
          id: "art-5",
          title: "Seoul Morning",
          image: "/images/exhibition2.png"
        }
      ]
    }
  },
  {
    id: "seoul-4",
  name: "Dongdaemun Design Plaza (DDP)",
  description: "Located within Dongdaemun Design Plaza, a hub for design and creativity.",
    latitude: 37.566541,
    longitude: 127.009387,
    permanentExhibitions: [
      { id: "s4-1", name: "한국 디자인 100년", title: "한국 디자인 100년" }
    ],
    temporaryExhibitions: [
      {
        id: "s4-2",
        name: "Designing Future Cities",
        title: "Designing Future Cities",
        description: "A design exhibition focused on future cities and architecture.",
        startDate: "2025.10.01",
        endDate: "2026.01.31"
      }
    ],
    pastExhibitions: [
      {
        id: "s4-3",
        name: "Fashion and Art",
        title: "Fashion and Art",
        description: "A special exhibition exploring the intersection of fashion and art.",
        startDate: "2024.06.01",
        endDate: "2024.09.30"
      }
    ]
  },
  {
    id: "seoul-5",
  name: "Savina Museum",
  description: "A private museum presenting a variety of contemporary art trends.",
    latitude: 37.601601,
    longitude: 126.957273,
    permanentExhibitions: [
      { id: "s5-1", name: "사비나 소장품전", title: "사비나 소장품전" }
    ],
    temporaryExhibitions: [
      {
        id: "s5-2",
        name: "Women Artists Special Exhibition",
        title: "Women Artists Special Exhibition",
        description: "A special exhibition highlighting the works of women artists.",
        startDate: "2025.09.01",
        endDate: "2025.11.30"
      }
    ],
    pastExhibitions: [
      {
        id: "s5-3",
        name: "현대미술의 흐름전",
        title: "현대미술의 흐름전",
        description: "현대미술의 다양한 경향을 소개하는 전시.",
        startDate: "2024.04.01",
        endDate: "2024.08.31"
      }
    ]
  },
];