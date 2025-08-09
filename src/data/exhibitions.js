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
  // 서울 주요 미술관/전시장
  {
    id: "seoul-1",
    name: "국립현대미술관 서울관",
    description: "한국 현대미술의 중심지, 다양한 전시와 프로그램 제공.",
    latitude: 37.579617,
    longitude: 126.981805,
    permanentExhibitions: [
      { id: "s1-1", name: "한국 현대미술 컬렉션", title: "한국 현대미술 컬렉션" },
      { id: "s1-2", name: "아시아 현대미술", title: "아시아 현대미술" }
    ],
    temporaryExhibitions: [
      {
        id: "s1-3",
        name: "미디어 아트 특별전",
        title: "미디어 아트 특별전",
        description: "최신 미디어 아트 작품을 조명하는 특별전.",
        startDate: "2025.08.01",
        endDate: "2025.10.31"
      }
    ],
    pastExhibitions: [
      {
        id: "s1-4",
        name: "한국 조각 100년",
        title: "한국 조각 100년",
        description: "한국 조각의 흐름을 조망하는 대규모 회고전.",
        startDate: "2024.03.01",
        endDate: "2024.08.31"
      }
    ],
    rooms: {
      "room-1": [
        {
          id: "art-1",
          title: "예시 작품 1",
          image: "/images/exhibition1.png"
        },
        {
          id: "art-2",
          title: "예시 작품 2",
          image: "/images/exhibition2.png"
        }
      ],
      "room-2": [
        {
          id: "art-3",
          title: "예시 작품 3",
          image: "/images/exhibition3.png"
        }
      ]
    }
  },
  {
    id: "seoul-2",
    name: "리움미술관",
    description: "삼성문화재단이 운영하는 세계적 수준의 미술관.",
    latitude: 37.539307,
    longitude: 126.994715,
    permanentExhibitions: [
      { id: "s2-1", name: "한국 고미술 컬렉션", title: "한국 고미술 컬렉션" },
      { id: "s2-2", name: "현대미술 컬렉션", title: "현대미술 컬렉션" }
    ],
    temporaryExhibitions: [
      {
        id: "s2-3",
        name: "국제 현대미술전",
        title: "국제 현대미술전",
        description: "세계 각국의 현대미술 작가들이 참여하는 대규모 전시.",
        startDate: "2025.09.10",
        endDate: "2025.12.20"
      }
    ],
    pastExhibitions: [
      {
        id: "s2-4",
        name: "한국 도자기 특별전",
        title: "한국 도자기 특별전",
        description: "한국 도자기의 아름다움을 조명하는 전시.",
        startDate: "2024.05.01",
        endDate: "2024.09.30"
      }
    ],
    rooms: {
      "main-hall": [
        {
          id: "art-4",
          title: "리움 대표작품",
          image: "/images/exhibition4.png"
        }
      ],
      // 현대미술 컬렉션에 대응하는 room 추가
      "hyundae-art-room": [
        {
          id: "art-7",
          title: "현대미술관 대표작품 1",
          image: "/images/exhibition1.png"
        },
        {
          id: "art-8",
          title: "현대미술관 대표작품 2",
          image: "/images/exhibition2.png"
        }
      ]
    }
  },
  {
    id: "seoul-3",
    name: "서울시립미술관",
    description: "시민과 함께하는 열린 미술관, 다양한 현대미술 전시 개최.",
    latitude: 37.564362,
    longitude: 126.975221,
    permanentExhibitions: [
      { id: "s3-1", name: "서울미술관 소장품전", title: "서울미술관 소장품전" }
    ],
    temporaryExhibitions: [
      {
        id: "s3-2",
        name: "청년작가전",
        title: "청년작가전",
        description: "신진 작가들의 실험적 작품을 소개하는 전시.",
        startDate: "2025.07.15",
        endDate: "2025.09.15"
      }
    ],
    pastExhibitions: [
      {
        id: "s3-3",
        name: "서울의 풍경전",
        title: "서울의 풍경전",
        description: "서울의 다양한 풍경을 주제로 한 회화전.",
        startDate: "2024.10.01",
        endDate: "2025.02.28"
      }
    ],
    rooms: {
      "gallery-1": [
        {
          id: "art-5",
          title: "서울의 아침",
          image: "/images/exhibition2.png"
        }
      ]
    }
  },
  {
    id: "seoul-4",
    name: "DDP 디자인뮤지엄",
    description: "동대문디자인플라자 내 위치, 디자인과 창의의 허브.",
    latitude: 37.566541,
    longitude: 127.009387,
    permanentExhibitions: [
      { id: "s4-1", name: "한국 디자인 100년", title: "한국 디자인 100년" }
    ],
    temporaryExhibitions: [
      {
        id: "s4-2",
        name: "미래도시 디자인전",
        title: "미래도시 디자인전",
        description: "미래 도시와 건축을 주제로 한 디자인 전시.",
        startDate: "2025.10.01",
        endDate: "2026.01.31"
      }
    ],
    pastExhibitions: [
      {
        id: "s4-3",
        name: "패션과 예술전",
        title: "패션과 예술전",
        description: "패션과 예술의 융합을 다룬 특별전.",
        startDate: "2024.06.01",
        endDate: "2024.09.30"
      }
    ]
  },
  {
    id: "seoul-5",
    name: "사비나미술관",
    description: "현대미술의 다양한 흐름을 소개하는 사립 미술관.",
    latitude: 37.601601,
    longitude: 126.957273,
    permanentExhibitions: [
      { id: "s5-1", name: "사비나 소장품전", title: "사비나 소장품전" }
    ],
    temporaryExhibitions: [
      {
        id: "s5-2",
        name: "여성작가 특별전",
        title: "여성작가 특별전",
        description: "여성 작가들의 작품을 조명하는 특별전.",
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