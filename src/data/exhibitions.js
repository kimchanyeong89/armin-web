// src/data/exhibitions.js
export const exhibitions = [
  {
    id: "mfa-boston",
    description_ko: "세계에서 손꼽히는 종합 미술관으로, 보스턴에 자리한다. 고대 이집트와 아시아 미술부터 모네를 비롯한 인상주의 회화, 미국 미술까지 50만 점에 이르는 컬렉션을 폭넓게 아우른다.",
    slug: "mfa-boston",
    name: "Museum of Fine Arts, Boston",
    name_ko: "보스턴 미술관",
    location: "Boston, USA",
    description: "The Museum of Fine Arts, Boston, is one of the most comprehensive art museums in the world.",
    latitude: 42.3394,
    longitude: -71.0940,
    country: "USA",
    region: "Massachusetts",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c8/Museum_of_Fine_Arts_Boston.jpg/640px-Museum_of_Fine_Arts_Boston.jpg",
    permanentExhibitions: [],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "mfah",
    description_ko: "미국에서 가장 큰 미술관 가운데 하나로, 휴스턴에 자리한다. 6천 년에 걸친 인류의 미술을 아우르며, 여러 건물과 조각 정원으로 이루어진 너른 캠퍼스를 갖추었다.",
    slug: "mfah",
    name: "Museum of Fine Arts, Houston",
    name_ko: "휴스턴 미술관",
    location: "Houston, USA",
    description: "The Museum of Fine Arts, Houston, is one of the largest museums in the United States. Its collection spans more than 6,000 years of history.",
    latitude: 29.7256,
    longitude: -95.3905,
    country: "USA",
    region: "Texas",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c2/Museum_of_Fine_Arts_Houston_audrey_jones_beck_building.jpg/640px-Museum_of_Fine_Arts_Houston_audrey_jones_beck_building.jpg",
    permanentExhibitions: [],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "thebroad",
    name_ko: "더 브로드",
    description_ko: "수집가 일라이 브로드 부부가 세운 로스앤젤레스의 현대미술관이다. 벌집 모양의 흰 외피로 감싼 건물로 유명하며, 전후부터 동시대까지 현대미술을 소장한다. 무료 관람으로도 잘 알려져 있다.",
    slug: "thebroad",
    name: "The Broad",
    location: "Los Angeles, USA",
    description: "The Broad is a contemporary art museum founded by Eli and Edythe Broad. It houses a prominent collection of postwar and contemporary art.",
    latitude: 34.0545,
    longitude: -118.2506,
    country: "USA",
    region: "California",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/69/The_Broad_Museum_Los_Angeles.jpg/640px-The_Broad_Museum_Los_Angeles.jpg",
    permanentExhibitions: [
      {
        id: "thebroad-collection",
        name: "Collection",
        title: "Collection",
        description: "A selection of postwar and contemporary artworks from The Broad collection.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "thebroad-collection.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "crystalbridges",
    name_ko: "크리스털 브리지스 미국미술관",
    description_ko: "아칸소주 벤턴빌의 숲과 시내를 끌어안은 자리에 들어선 미국 미술 전문 미술관이다. 건축가 모셰 사프디가 설계했으며, 식민기부터 동시대까지 미국 미술을 망라하는 컬렉션을 자연과 어우러진 공간에서 선보인다.",
    slug: "crystalbridges",
    name: "Crystal Bridges Museum of American Art",
    location: "Bentonville, USA",
    description: "Crystal Bridges Museum of American Art offers a unique blend of art, nature, and architecture, housing a world-class collection of American art.",
    latitude: 36.3840,
    longitude: -94.2045,
    country: "USA",
    region: "Arkansas",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/14/Crystal_Bridges_Museum_of_American_Art%2C_Bentonville%2C_Arkansas_-_20121008.jpg/640px-Crystal_Bridges_Museum_of_American_Art%2C_Bentonville%2C_Arkansas_-_20121008.jpg",
    permanentExhibitions: [
      {
        id: "crystalbridges-collection",
        name: "Collection Highlights",
        title: "Collection Highlights",
        description: "Highlights from the Crystal Bridges collection featuring American masterworks.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "crystal-bridges-gac.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "lacma",
    description_ko: "미국 서부에서 가장 큰 미술관으로, 로스앤젤레스에 자리한다. 6천 년에 걸친 세계 미술 15만여 점을 소장하며, 거리에 늘어선 가로등을 모은 설치작 '도시의 빛'으로도 친숙하다.",
    slug: "lacma",
    name: "Los Angeles County Museum of Art (LACMA)",
    name_ko: "로스앤젤레스 카운티 미술관",
    location: "Los Angeles, USA",
    description: "LACMA is the largest art museum in the western United States, with a collection of nearly 150,000 objects reflecting 6,000 years of art history.",
    latitude: 34.0629,
    longitude: -118.3591,
    country: "USA",
    region: "California",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/LACMA_Urban_Light_2022.jpg/640px-LACMA_Urban_Light_2022.jpg",
    permanentExhibitions: [
      {
        id: "lacma-paintings",
        name: "Collection (Paintings, Drawings & Japanese Prints)",
        title: "Collection: Paintings, Drawings, and Prints",
        description: "A selection of paintings (Classification 22), drawings (Curatorial 51), and Japanese prints (Curatorial 46) from LACMA.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "lacma-classification-22.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "sfmoma",
    description_ko: "미국 서부에서 손꼽히는 규모의 근현대미술관으로, 1935년 서부 최초로 근대미술을 전문으로 표방하며 문을 열었다. 추상표현주의부터 팝아트, 사진, 미디어아트까지 20세기 이후 미술을 폭넓게 다룬다. 2016년 대규모 증축을 거쳐 수직 정원을 갖춘 지금의 모습을 완성했다.",
    slug: "sfmoma",
    name: "San Francisco Museum of Modern Art (SFMOMA)",
    name_ko: "샌프란시스코 현대미술관",
    location: "San Francisco, USA",
    description: "SFMOMA is a modern and contemporary art museum in San Francisco, widely regarded as one of the largest and most significant museums of modern art in the United States.",
    latitude: 37.7857,
    longitude: -122.4011,
    country: "USA",
    region: "California",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/59/San_Francisco_Museum_of_Modern_Art_%28SFMOMA%29.jpg/640px-San_Francisco_Museum_of_Modern_Art_%28SFMOMA%29.jpg",
    permanentExhibitions: [
      {
        id: "sfmoma-collection",
        name: "Collection Highlights",
        title: "Collection Highlights",
        description: "Highlights from the SFMOMA collection, including paintings and sculptures from modern and contemporary masters.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "sfmoma-collection.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "cma",
    description_ko: "오하이오주 클리블랜드에 자리한 미술관으로, 6만여 점에 이르는 컬렉션의 질과 폭으로 높이 평가받는다. 고대 이집트와 아시아 미술부터 유럽 회화, 미국 미술까지 두루 아우르며, 입장료 없이 공개한다.",
    slug: "cma",
    name: "Cleveland Museum of Art",
    name_ko: "클리블랜드 미술관",
    location: "Cleveland, OH, USA",
    description: "The Cleveland Museum of Art is an art museum in Cleveland, Ohio, known for its quality and breadth of its collection, which includes more than 61,000 works of art.",
    latitude: 41.5089,
    longitude: -81.6116,
    country: "USA",
    region: "Ohio",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/30/Cleveland_Museum_of_Art_2016.jpg/640px-Cleveland_Museum_of_Art_2016.jpg",
    permanentExhibitions: [
      {
        id: "cma-collection",
        name: "Collection Highlights",
        title: "Collection Highlights",
        description: "Paintings and Drawings from the CMA collection, featuring works from around the world.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "cma-collection.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "philadelphia",
    description_ko: "미국에서 손꼽히는 규모의 미술관으로, 24만 점이 넘는 유럽·미국·아시아 미술을 소장한다. 영화 '록키'의 계단으로도 친숙한 신고전주의 건물에 자리하며, 마르셀 뒤샹 컬렉션으로 특히 유명하다.",
    slug: "philadelphia",
    name: "Philadelphia Museum of Art",
    name_ko: "필라델피아 미술관",
    location: "Philadelphia, USA",
    description: "The Philadelphia Museum of Art contains over 240,000 objects including major holdings of European, American and Asian origin.",
    latitude: 39.9656,
    longitude: -75.1810,
    country: "USA",
    region: "Pennsylvania",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Philadelphia_Museum_of_Art.jpg/640px-Philadelphia_Museum_of_Art.jpg",
    permanentExhibitions: [
      {
        id: "philadelphia-collection",
        name: "Collection Highlights",
        title: "Collection Highlights",
        description: "Highlights from the Philadelphia Museum of Art collection, including paintings and drawings.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "philadelphia-collection.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "high-museum",
    name_ko: "하이 미술관",
    description_ko: "미국 남동부를 대표하는 미술관으로, 애틀랜타에 자리한다. 리처드 마이어와 렌초 피아노가 설계한 백색의 건물에 미국 미술과 유럽 회화, 사진, 민속미술을 폭넓게 소장한다.",
    slug: "high-museum",
    name: "High Museum of Art",
    location: "Atlanta, USA",
    description: "The High Museum of Art in Atlanta acts as the leading art museum in the southeastern United States.",
    latitude: 33.7901,
    longitude: -84.3860,
    country: "USA",
    region: "Georgia",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/62/High_Museum_of_Art_2011.jpg/640px-High_Museum_of_Art_2011.jpg",
    permanentExhibitions: [
      {
        id: "high-museum-collection",
        name: "Collection Highlights",
        title: "Collection Highlights",
        description: "A selection of works from the High Museum of Art collection.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "high-collection.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "dia",
    description_ko: "미국에서 가장 크고 중요한 컬렉션을 갖춘 미술관 가운데 하나로, 디트로이트에 자리한다. 디에고 리베라가 자동차 공업 도시를 기린 대형 벽화 '디트로이트 인더스트리'로 특히 유명하다.",
    slug: "dia",
    name: "Detroit Institute of Arts",
    name_ko: "디트로이트 미술관",
    location: "Detroit, USA",
    description: "The Detroit Institute of Arts has one of the largest and most significant art collections in the United States.",
    latitude: 42.3594,
    longitude: -83.0645,
    country: "USA",
    region: "Michigan",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/13/Detroit_Institute_of_Arts_South_Wing.jpg/640px-Detroit_Institute_of_Arts_South_Wing.jpg",
    permanentExhibitions: [
      {
        id: "dia-collection",
        name: "Collection Highlights (Paintings)",
        title: "Collection Highlights: Paintings",
        description: "A selection of paintings from the Detroit Institute of Arts.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "dia-collection.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "masp",
    description_ko: "1947년 언론인 아시스 샤토브리앙이 세운 브라질의 대표 미술관이다. 리나 보 바르디가 설계해 거대한 붉은 기둥이 건물을 떠받치는 독특한 건축으로 유명하며, 유리판에 작품을 띄워 전시하는 방식으로도 잘 알려져 있다. 라틴아메리카 최고 수준의 유럽 회화 컬렉션을 갖추었다.",
    slug: "masp",
    name: "Museu de Arte de São Paulo",
    name_ko: "상파울루 미술관",
    location: "São Paulo, Brazil",
    description: "The Museu de Arte de São Paulo is a private nonprofit museum founded by Assis Chateaubriand in 1947.",
    latitude: -23.5615,
    longitude: -46.6559,
    country: "Brazil",
    region: "São Paulo",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/MASP_Brazil.jpg/640px-MASP_Brazil.jpg",
    permanentExhibitions: [
      {
        id: "masp-collection",
        name: "Collection Highlights",
        title: "Collection Highlights",
        description: "Paintings and Drawings from the MASP collection.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "masp-collection.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "mbam",
    description_ko: "몬트리올에서 가장 큰 미술관이자 캐나다를 대표하는 미술관 가운데 하나다. 고대 유물부터 유럽 고전 회화, 캐나다 미술, 동시대 미술과 장식미술까지 여러 전시관에 걸쳐 폭넓게 소장한다.",
    slug: "mbam",
    name: "Montreal Museum of Fine Arts",
    name_ko: "몬트리올 미술관",
    location: "Montreal, Canada",
    description: "The Montreal Museum of Fine Arts is Montreal's largest museum and is amongst the most prominent in Canada.",
    latitude: 45.4987,
    longitude: -73.5793,
    country: "Canada",
    region: "Quebec",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Montreal_Museum_of_Fine_Arts.jpg/640px-Montreal_Museum_of_Fine_Arts.jpg",
    permanentExhibitions: [
      {
        id: "mbam-collection",
        name: "Collection Highlights",
        title: "Collection Highlights",
        description: "Works including Painting, Drawing, Photography, and more from MMFA.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "mbam-collection.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "today-art-museum",
    name_ko: "투데이 미술관",
    description_ko: "2002년 베이징에 세워진 중국 최초의 비영리 민간 미술관이다. 중국 동시대 미술에 집중하며, 젊은 작가들의 실험적인 작업과 기획전을 활발히 선보이는 현대미술의 거점이다.",
    slug: "today-art-museum",
    name: "Today Art Museum",
    location: "Beijing, China",
    description: "The first non-profit, non-governmental art museum in China, dedicated to contemporary art.",
    latitude: 39.9056,
    longitude: 116.4633,
    country: "China",
    region: "Beijing",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/2/23/Today_Art_Museum2.JPG",
    permanentExhibitions: [
      {
        id: "today-art-museum-collection",
        name: "Collection Highlights",
        title: "Collection Highlights",
        description: "Highlights from the Today Art Museum collection, featuring contemporary Chinese art such as works by Fang Lijun, Yue Minjun, and Zhang Xiaogang.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "today-art-museum.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "zhejiang-art-museum",
    name_ko: "저장미술관",
    description_ko: "중국 항저우에 자리한 저장성의 주요 미술관이다. 중국화와 서예, 유화, 판화, 수채화 등 다양한 장르를 아우르며, 시후 호숫가의 풍광과 어우러진 건축으로도 사랑받는다.",
    slug: "zhejiang-art-museum",
    name: "Zhejiang Art Museum",
    location: "Hangzhou, China",
    description: "A major art museum in Hangzhou, Zhejiang, featuring Chinese painting, oil painting, prints, and watercolors.",
    latitude: 30.2458,
    longitude: 120.1550,
    country: "China",
    region: "Hangzhou",
    representativeImage: "https://www.zjam.org.cn/images/logo_2.jpg",
    permanentExhibitions: [
      {
        id: "zjam-collection",
        name: "Collection Highlights",
        title: "Collection Highlights",
        description: "Selected 2D works (Paintings, Sketches, Prints) from the Zhejiang Art Museum.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "zjam-collection.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "long-museum",
    name_ko: "롱미술관",
    description_ko: "중국의 수집가 류이첸과 왕웨이 부부가 세운 상하이의 사립 미술관이다. 서부관과 푸둥관 등 여러 분관을 두고 있으며, 중국 고미술과 혁명기 미술부터 동시대 국제 현대미술까지 폭넓게 아우르는 방대한 소장품으로 유명하다.",
    slug: "long-museum",
    name: "Long Museum",
    location: "Shanghai, China",
    description: "Private art museum in Shanghai founded by Liu Yiqian and Wang Wei.",
    latitude: 31.1578,
    longitude: 121.4646,
    country: "China",
    region: "Shanghai",
    representativeImage: "https://wsrv.nl/?url=http%3A%2F%2Fwww.thelongmuseum.org%2FUpload%2F2020123095913.jpg&w=400&q=80",
    permanentExhibitions: [
      {
        id: "long-museum-collection",
        name: "Collection Highlights",
        title: "Long Museum Collection",
        description: "Selected works from the Long Museum collection, including Revolutionary Art, Traditional Chinese Art, and Contemporary works.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "long-museum-collection.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "guangdong-museum-of-art",
    name_ko: "광둥미술관",
    description_ko: "중국 광저우에 자리한 광둥성의 대표 미술관이다. 중국 근현대미술과 광둥 지역 작가들의 작품을 폭넓게 소장하며, 광저우 트리엔날레 등 국제 현대미술 전시를 여는 거점으로 알려져 있다.",
    slug: "guangdong-museum-of-art",
    name: "Guangdong Museum of Art (GDMOA)",
    location: "Guangzhou, China",
    description: "Online Collection from Guangdong Museum of Art.",
    latitude: 23.1291,
    longitude: 113.2644,
    country: "China",
    region: "Guangzhou",
    representativeImage: "https://www.gdmoa.org/favicon.ico",
    permanentExhibitions: [
      {
        id: "gdmoa-online-collection",
        name: "Online Collection",
        title: "Online Collection (All)",
        description: "All items from https://www.gdmoa.org/Collection/Online_Collection/ via the site's published JSON pages /Collection/Online_Collection/index_N.json.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "gdmoa-online-collection-all.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "power-station-of-art",
    name_ko: "상하이 당대예술박물관",
    description_ko: "옛 발전소를 개조해 2012년 문을 연 중국 본토 최초의 국공립 현대미술관이다. 상하이 황푸강변에 자리하며 높은 굴뚝이 상징으로, 동시대 미술을 중심으로 상하이 비엔날레의 주 무대 역할을 한다.",
    slug: "power-station-of-art",
    name: "Power Station of Art",
    location: "Shanghai, China",
    description: "Contemporary art collection from the Power Station of Art (PSA), Shanghai.",
    latitude: 31.2005,
    longitude: 121.4930,
    country: "China",
    region: "Shanghai",
    representativeImage: "https://www.powerstationofart.com/favicon.svg",
    permanentExhibitions: [
      {
        id: "psa-collection-all",
        name: "Collection (All)",
        title: "PSA Collection (All)",
        description: "Full collection from Power Station of Art (PSA), Shanghai, including Paintings, Installations, Videos, and more.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "psa-collection-all.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "shanghai-museum",
    description_ko: "상하이 인민광장에 자리한 중국 고대 미술 전문 박물관이다. 청동기·도자·서화·옥기 등 분야별 전시관을 갖추었으며, 둥근 하늘과 네모난 땅을 형상화한 건물로도 유명하다. 중국 고미술 컬렉션의 깊이로 세계적 명성을 얻었다.",
    slug: "shanghai-museum",
    name: "Shanghai Museum",
    name_ko: "상하이 박물관",
    location: "Shanghai, China",
    description: "Paintings from the Shanghai Museum collection highlights database.",
    latitude: 31.2304,
    longitude: 121.4737,
    country: "China",
    region: "Shanghai",
    representativeImage: "https://www.shanghaimuseum.net/mu/site/img/favicon.ico",
    permanentExhibitions: [
      {
        id: "shanghaimuseum-paintings-all",
        name: "Collection Highlights",
        title: "Paintings (All)",
        description: "All PAINTINGS items from https://www.shanghaimuseum.net/mu/frontend/pg/en/collection/antique via official internal endpoint /mu/frontend/pg/collection/search-antique.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "shanghaimuseum-paintings-all.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "nanjing-museum",
    description_ko: "중국에서 손꼽히는 역사 깊은 종합 박물관으로, 난징에 자리한다. 옛 중앙박물원을 계승했으며, 회화·서예·도자·자수 등 중국 역대 미술과 강남 지역의 문화유산을 폭넓게 소장한다.",
    slug: "nanjing-museum",
    name: "Nanjing Museum",
    name_ko: "난징박물원",
    location: "Nanjing, China",
    description: "Paintings & Calligraphy and Embroidery from Nanjing Museum online collection list.",
    latitude: 32.0603,
    longitude: 118.7969,
    country: "China",
    region: "Nanjing",
    representativeImage: "https://www.njmuseum.org.cn/favicon.ico",
    permanentExhibitions: [
      {
        id: "njmuseum-collection-all",
        name: "Online Collection",
        title: "Paintings & Calligraphy + Embroidery",
        description: "Filtered items from https://www.njmuseum.org.cn/en/collectionList (categories: Paintings and Calligraphy, Embroidery) via official /api/collection/select.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "njmuseum-collection-all.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "national-museum-of-china",
    description_ko: "베이징 톈안먼 광장 동편에 자리한 중국 최대 규모의 국립 박물관이다. 고대 청동기와 옥기부터 회화·서예에 이르기까지 중국 문명 전반을 아우르는 140만 점 이상의 유물을 소장한다.",
    slug: "national-museum-of-china",
    name: "National Museum of China",
    name_ko: "중국국가박물관",
    location: "Beijing, China",
    description: "Selection from the National Museum of China collection catalogue.",
    latitude: 39.9042,
    longitude: 116.4074,
    country: "China",
    region: "Beijing",
    representativeImage: "https://www.chnmuseum.cn/favicon.ico",
    permanentExhibitions: [
      {
        id: "nmc-highlights-all",
        name: "Collection Highlights",
        title: "Collection Highlights (All)",
        description: "Highlights pages from the National Museum of China English site (all discovered items).",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "nmc-highlights-all.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "shenzhen-museum",
    name_ko: "선전박물관",
    description_ko: "중국 선전에 자리한 종합 박물관으로, 선전과 광둥 지역의 역사·민속·예술을 아우른다. 근현대 중국의 역사와 지역 문화유산을 폭넓게 소장·전시하는 시립 박물관이다.",
    slug: "shenzhen-museum",
    name: "Shenzhen Museum",
    location: "Shenzhen, China",
    description: "Collections from Shenzhen Museum.",
    latitude: 22.5431,
    longitude: 114.0579,
    country: "China",
    region: "Shenzhen",
    representativeImage: "https://www.shenzhenmuseum.com/favicon.ico",
    permanentExhibitions: [
      {
        id: "shenzhenmuseum-l0303-all",
        name: "Ancient Art Collections",
        title: "Ancient Art Collections (All)",
        description: "All items from Shenzhen Museum collections page (lmType=L0303).",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "shenzhenmuseum-l0303-all.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "palace-museum-intl",
    description_ko: "베이징 자금성에 자리한 고궁박물원으로, 옛 명·청 황실의 궁궐과 그 소장품을 그대로 보존해 공개한다. 회화·서예·도자·옥기 등 황실이 수 세기에 걸쳐 모은 100만 점이 넘는 유물을 소장한 세계적인 박물관이다.",
    slug: "palace-museum-intl",
    name: "The Palace Museum (International)",
    name_ko: "고궁박물원",
    location: "Beijing, China",
    description: "Selection from The Palace Museum international digital collection.",
    latitude: 39.9163,
    longitude: 116.3972,
    country: "China",
    region: "Beijing",
    representativeImage: "https://intl.dpm.org.cn/Public/static/themes/logo.png",
    permanentExhibitions: [
      {
        id: "dpm-intl-paintings",
        name: "The Collection",
        title: "Paintings (First 100)",
        description: "Paintings from the Palace Museum international collection (first 100 items).",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "dpm-intl-paintings-all.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "hkmoa",
    description_ko: "1962년 문을 연 홍콩 최초의 공립 미술관이다. 빅토리아 항을 마주한 자리에서 중국 서화와 골동, 광둥 지역 미술, 그리고 동시대 홍콩 미술까지 1만 7천여 점을 아우른다.",
    slug: "hkmoa",
    name: "Hong Kong Museum of Art",
    name_ko: "홍콩 예술관",
    location: "Hong Kong",
    description: "The Hong Kong Museum of Art is the first public art museum in the city, with a collection of over 17,000 items.",
    latitude: 22.2936,
    longitude: 114.1725,
    country: "Hong Kong",
    region: "Hong Kong",
    representativeImage: "https://hk.art.museum/hkmoa-theme/images/logo/logo-desktop-en.png",
    permanentExhibitions: [
      {
        id: "hkmoa-collection",
        name: "Collection Highlights",
        title: "Collection Highlights",
        description: "Selected works from Chinese Painting, Antiquities, China Trade Art, and Modern Hong Kong Art.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "hkmoa-collection.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "nich-tnm",
    description_ko: "1872년에 세워진 일본에서 가장 오래되고 규모가 큰 박물관이다. 우에노 공원에 자리하며, 회화·불상·도자·갑옷 등 일본과 동아시아 미술을 망라하는 방대한 컬렉션을 소장한다.",
    slug: "nich-tnm",
    name: "Tokyo National Museum (ColBase)",
    name_ko: "도쿄 국립박물관",
    location: "Tokyo, Japan",
    description: "The Tokyo National Museum collects, houses, and displays a comprehensive collection of art works and antiquities from Japan.",
    latitude: 35.7188,
    longitude: 139.7757,
    country: "Japan",
    region: "Tokyo",
    representativeImage: "https://www.tnm.jp/img/common/h_logo_en.gif",
    permanentExhibitions: [
      {
        id: "tnm-painting-collection",
        name: "Paintings & Oriental Paintings",
        title: "Paintings & Oriental Paintings",
        description: "Comprehensive collection of paintings and oriental paintings from the Tokyo National Museum (via ColBase).",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "nich-collection.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "mori-collection",
    name_ko: "모리 미술관",
    description_ko: "도쿄 롯폰기 힐스 모리 타워 꼭대기에 자리한 현대미술관이다. 도시 전망과 어우러진 높은 곳에서 아시아를 비롯한 세계의 동시대 미술을 폭넓게 선보인다.",
    slug: "mori-collection",
    name: "Mori Art Museum",
    location: "Tokyo, Japan",
    description: "Contemporary art museum located in the Roppongi Hills Mori Tower.",
    latitude: 35.6604,
    longitude: 139.7292,
    country: "Japan",
    region: "Tokyo",
    representativeImage: "https://www.mori.art.museum/assets_c/2019/05/286_aiweiwei_brainscan1-thumb-1280x853-5068.jpg",
    permanentExhibitions: [
      {
        id: "mori-collection",
        name: "Collection",
        title: "Mori Art Museum Collection",
        description: "Contemporary artworks from the Mori Art Museum collection.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "mori-collection.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "nmwa-collection",
    description_ko: "서양 미술을 전문으로 하는 일본의 대표 국립미술관이다. 실업가 마쓰카타 고지로의 컬렉션에서 비롯했으며, 르 코르뷔지에가 설계한 본관 건물은 세계유산으로 등재되었다. 모네와 로댕 등 근대 서양미술을 소장한다.",
    slug: "nmwa-collection",
    name: "National Museum of Western Art",
    name_ko: "국립서양미술관",
    location: "Tokyo, Japan",
    description: "The National Museum of Western Art is the premier public art gallery in Japan specializing in art from the Western tradition.",
    latitude: 35.7153,
    longitude: 139.7758,
    country: "Japan",
    region: "Tokyo",
    representativeImage: "https://collection.nmwa.go.jp/image_files/l/41-L.jpg",
    permanentExhibitions: [
      {
        id: "nmwa-collection",
        name: "Collection",
        title: "NMWA Collection",
        description: "Paintings and Drawings from the National Museum of Western Art.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "nmwa-collection.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "adachi-museum",
    description_ko: "정원 자체를 하나의 그림으로 가꾸어 온 것으로 유명한 시마네현의 미술관이다. 해마다 일본 최고의 정원으로 꼽히는 빼어난 일본 정원과 더불어, 요코야마 다이칸을 중심으로 한 근대 일본화 컬렉션을 소장한다.",
    slug: "adachi-museum",
    name: "Adachi Museum of Art",
    name_ko: "아다치 미술관",
    location: "Yasugi, Shimane, Japan",
    description: "Famous for its award-winning gardens and collection of modern Japanese paintings, especially by Yokoyama Taikan.",
    latitude: 35.3970,
    longitude: 133.1950,
    country: "Japan",
    region: "Yasugi",
    representativeImage: "https://www.adachi-museum.or.jp/admin/wp-content/themes/adachi_museum/assets/img/common/ogp.png",
    permanentExhibitions: [
      {
        id: "adachi-collection",
        name: "Collection",
        title: "Adachi Collection",
        description: "Masterpieces of Modern Japanese Painting, Ceramics, and Wood Carvings.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "adachi-collection.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "kanazawa-21",
    description_ko: "가나자와에 자리한 원형 유리 건물의 현대미술관이다. 사방이 트인 개방적인 구조로 유명하며, 레안드로 에를리치의 '수영장' 등 체험형 설치 작품으로 사랑받는다.",
    slug: "kanazawa-21",
    name: "21st Century Museum of Contemporary Art, Kanazawa",
    name_ko: "가나자와 21세기 미술관",
    location: "Kanazawa, Ishikawa, Japan",
    description: "A museum of contemporary art with a circular building design, famous for Leandro Erlich's 'The Swimming Pool'.",
    latitude: 36.5609,
    longitude: 136.6582,
    country: "Japan",
    region: "Kanazawa",
    representativeImage: "https://www.kanazawa21.jp/exhibit_lists/images/1384_l.jpg",
    permanentExhibitions: [
      {
        id: "kanazawa-collection",
        name: "Collection",
        title: "Kanazawa Collection",
        description: "Contemporary art collection from 1980 to the present.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "kanazawa-all.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "tobikan-collection",
    description_ko: "우에노 공원에 자리한 도쿄도의 미술관으로, '도비칸'이라는 애칭으로 불린다. 다양한 공모전과 기획전의 무대가 되어 온 곳으로, 시민과 가까운 미술 공간으로 사랑받는다.",

    slug: "tobikan-collection",
    name: "Tokyo Metropolitan Art Museum",
    name_ko: "도쿄도 미술관",
    location: "Tokyo, Japan",
    description: "The Tokyo Metropolitan Art Museum (Tobikan) features a specialized collection of sculpture and calligraphy.",
    latitude: 35.7170,
    longitude: 139.7730,
    country: "Japan",
    region: "Tokyo",
    representativeImage: "https://www.tobikan.jp/common/img/v3.logo_en_b.svg", // Reusing official logo path or similar
    permanentExhibitions: [
      {
        id: "tobikan-collection",
        name: "Collection",
        title: "Collection Highlights",
        description: "Sculptures and Calligraphic works from the Tokyo Metropolitan Art Museum's collection.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "tobikan-collection.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "mplus",
    name_ko: "엠플러스",
    description_ko: "홍콩 서구룡 문화지구에 자리한 아시아 최대 규모의 시각문화 박물관이다. 헤르초크 & 드 뫼롱이 설계한 거대한 건물에서 20세기 이후 아시아의 미술·디자인·건축·영상을 폭넓게 다룬다.",
    slug: "mplus",
    name: "M+",
    location: "Hong Kong",
    description: "Collection highlights from M+ (Hong Kong), including on-view status.",
    latitude: 22.2999,
    longitude: 114.1591,
    country: "Hong Kong",
    region: "Hong Kong",
    representativeImage: "https://www.mplus.org.hk/favicon.ico",
    permanentExhibitions: [
      {
        id: "mplus-collection-mplus",
        name: "M+ Collection (Objects with Images)",
        title: "M+ Collection (Objects with Images)",
        description: "Full M+ Collection objects that currently have images, including on-view status and classification.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "mplus-collection-mplus.json"
      },
      {
        id: "mplus-collection-sigg",
        name: "M+ Sigg Collection (Objects with Images)",
        title: "M+ Sigg Collection (Objects with Images)",
        description: "M+ Sigg Collection objects that currently have images, including on-view status and classification.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "mplus-collection-sigg.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "national-palace-museum-taipei",
    description_ko: "중국 역대 황실이 모은 미술 보물을 세계에서 가장 많이 소장한 타이베이의 박물관이다. 8천 년에 걸친 중국 미술을 아우르며, 옥으로 깎은 배추와 송·원대 회화, 청동기, 도자가 대표 소장품이다.",
    slug: "national-palace-museum-taipei",
    name: "National Palace Museum (Taipei)",
    name_ko: "국립고궁박물원",
    location: "Taipei, Taiwan",
    description: "Home to one of the world's largest collections of Chinese art treasures, spanning 8,000 years of history.",
    latitude: 25.1024,
    longitude: 121.5485,
    country: "Taiwan",
    region: "Taipei",
    representativeImage: "https://theme.npm.edu.tw/selection/att/collection/04009118/17010406.jpg",
    permanentExhibitions: [
      {
        id: "npm-selection-painting",
        name: "Painting Selections",
        title: "Masterpieces of Painting",
        description: "A curated selection of 105 painting masterpieces from the National Palace Museum collection, featuring works from Tang, Song, Yuan, Ming, and Qing dynasties.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "npm-selection-painting.json"
      }
    ],
    currentExhibitions: [],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "tfam",
    description_ko: "1983년 대만 최초로 문을 연 근현대미술 전문 미술관이다. 타이베이에 자리하며, 대만 현대미술의 흐름을 보여 주는 전시와 타이베이 비엔날레의 무대가 되어 왔다.",
    slug: "tfam",
    name: "Taipei Fine Arts Museum",
    name_ko: "타이베이 시립미술관",
    location: "Taipei, Taiwan",
    description: "Taipei Fine Arts Museum (TFAM) collection dataset.",
    latitude: 25.0723,
    longitude: 121.5241,
    country: "Taiwan",
    region: "Taipei",
    representativeImage: "https://www.tfam.museum/favicon.ico",
    permanentExhibitions: [
      {
        id: "tfam-collection-all",
        name: "Collection (All)",
        title: "TFAM Collection (All)",
        description: "Full TFAM collection dataset (all works), enriched with detail-page metadata and highlight flag.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "tfam-collection-all.json"
      }
    ],
    currentExhibitions: [],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "ntmofa",
    description_ko: "타이중에 자리한 대만의 국립미술관이다. 대만 근현대미술을 중심으로 국제 미술을 함께 소장하며, 아시아에서 손꼽히는 규모의 미술관으로 꼽힌다.",
    slug: "ntmofa",
    name: "National Taiwan Museum of Fine Arts",
    name_ko: "국립대만미술관",
    location: "Taichung, Taiwan",
    description: "National art museum with modern and contemporary Taiwanese and international collections.",
    latitude: 24.1477,
    longitude: 120.6736,
    country: "Taiwan",
    region: "Taichung",
    representativeImage: "https://ntmofa-collections.ntmofa.gov.tw/images/ntmofa-logo.png",
    permanentExhibitions: [
      {
        id: "ntmofa-collection",
        name: "Collection",
        title: "Collection",
        description: "Selection from the NTMoFA collection (Oil Painting, Watercolor, Ink Painting, Photography, Sculpture, and more).",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "ntmofa-collection.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "namoc",
    description_ko: "베이징에 자리한 중국의 국립미술관으로, 조형예술을 전문으로 하는 유일한 국가 미술관이다. 중국 근현대 회화와 조각, 민간미술 등 10만 점이 넘는 작품을 소장하며, 황금빛 전통 누각 양식의 건물이 상징이다.",
    slug: "namoc",
    name: "National Art Museum of China",
    name_ko: "중국미술관",
    location: "Beijing, China",
    description: "The National Art Museum of China (NAMOC) is the only national art museum of plastic arts in China, housing over 100,000 works.",
    latitude: 39.9242,
    longitude: 116.4093,
    country: "China",
    region: "Beijing",
    representativeImage: "https://www.namoc.cn/namoc/xhtml/images/logo.png",
    permanentExhibitions: [
      {
        id: "namoc-collection",
        name: "Collection",
        title: "NAMOC Collection",
        description: "Artworks from the National Art Museum of China collection.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "namoc-collection.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "china-art-museum",
    name_ko: "중화예술궁",
    description_ko: "상하이 푸둥에 자리한 중국 근현대미술 전문 미술관으로, '중화예술궁'이라고도 불린다. 2010년 상하이 엑스포의 중국관 건물을 그대로 활용했으며, 붉은 전통 건축 양식의 거대한 외관이 상징이다.",
    slug: "china-art-museum",
    name: "China Art Museum, Shanghai",
    location: "Shanghai, China",
    description: "The China Art Museum, also known as the China Art Palace, is a museum of modern Chinese art located in Pudong, Shanghai.",
    latitude: 31.1850,
    longitude: 121.4910,
    country: "China",
    region: "Shanghai",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/4/45/China_Art_Museum.jpg",
    permanentExhibitions: [
      {
        id: "china-art-museum-collection",
        name: "Collection Highlights",
        title: "Collection Highlights",
        description: "Highlights from the collection of the China Art Museum, Shanghai.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "china-art-museum-collection.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "tate-modern",
    description_ko: "템스강 남안의 옛 뱅크사이드 화력발전소를 개조해 2000년 문을 연 국제 현대미술관이다. 헤르초크 & 드 뫼롱이 설계했으며, 발전소의 거대한 터빈 홀은 대형 설치 작품을 위한 상징적 공간이 되었다. 20세기 이후 세계 현대미술을 아우르는 영국의 국립 컬렉션을 선보인다.",
    slug: "tate-modern",
    name: "Tate Modern",
    name_ko: "테이트 모던",
    location: "Bankside, London SE1 9TG, United Kingdom",
    description: "Britain’s national museum of international modern and contemporary art on the South Bank.",
    latitude: 51.5076,
    longitude: -0.0994,
    country: "United Kingdom",
    region: "London",
    representativeImage: "images/tate-modern-logo.svg",
    floorPlan: "",
    permanentExhibitions: [
      {
        id: "tm-perm-1",
        name: "Tate Modern Collection",
        title: "Tate Modern Collection",
        description: "Key works from the international modern collection on display.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "tate-modern-collection.json"
      },
      { id: "tm-perm-3", name: "Tate Collection", title: "Tate Collection", collectionFile: "tate-artworks.json", description: "Complete collection of artworks from Tate galleries.", startDate: "Permanent", endDate: "Permanent" }
    ],
    temporaryExhibitions: [
    ],
    pastExhibitions: [
    ],
  },
  // Tate Britain
  {
    id: "tate-britain",
    description_ko: "1500년대부터 오늘날까지 이어지는 영국 미술을 가장 폭넓게 소장한 미술관이다. 특히 윌리엄 터너가 국가에 남긴 방대한 유작을 모은 클로어 갤러리로 유명하다. 게인즈버러, 컨스터블, 라파엘 전파부터 현대 작가까지 영국 회화의 흐름을 한자리에서 볼 수 있다.",
    slug: "tate-britain",
    name: "Tate Britain",
    name_ko: "테이트 브리튼",
    location: "Millbank, London SW1P 4RG, United Kingdom",
    description: "Britain's largest museum of British art from the 1500s to the present day, housing the world's greatest collection of British art.",
    latitude: 51.4920,
    longitude: -0.1275,
    country: "United Kingdom",
    region: "London",
    representativeImage: "images/tate-britain-logo.svg",
    floorPlan: "",
    permanentExhibitions: [
      // Tate Britain Collection - 853 artworks from Tate Britain
      { id: "tbc-perm-1", name: "Tate Britain Collection", title: "Tate Britain Collection", description: "Complete collection of artworks on display at Tate Britain, featuring British art from 1500 to the present day.", startDate: "Permanent", endDate: "Permanent", collectionFile: "tate-britain-artworks.json" },
      { id: "tm-perm-3", name: "Tate Collection", title: "Tate Collection", collectionFile: "tate-artworks.json", description: "Complete collection of artworks from Tate galleries.", startDate: "Permanent", endDate: "Permanent" }
    ],
    temporaryExhibitions: [
    ],
    pastExhibitions: [
    ],
  },
  // London major museums
  {
    id: "national-gallery",
    description_ko: "런던 트래펄가 광장에 자리한 국립미술관으로, 1824년 설립 이래 13세기부터 19세기까지 서유럽 회화의 정수를 모았다. 반 에이크의 '아르놀피니 부부의 초상', 레오나르도, 베르메르, 터너의 걸작을 소장한다. 입장료 없이 누구에게나 열려 있는 점도 오랜 전통이다.",
    name: "National Gallery",
    name_ko: "내셔널 갤러리",
    slug: "national-gallery",
    location: "Trafalgar Square, London WC2N 5DN",
    description: "Houses a rich collection of European paintings from the 13th to the 19th centuries.",
    latitude: 51.508929,
    longitude: -0.128299,
    country: "United Kingdom",
    region: "London",
    representativeImage: "images/national-gallery-logo.svg",
    permanentExhibitions: [
      { id: "ng-1", name: "European Paintings", title: "European Paintings", collectionFile: "national-gallery-permanent.json", collectionFile: "national-gallery-permanent.json", collectionFile: "national-gallery-permanent.json", description: "Masterworks by Botticelli, Van Gogh, Turner and more.", startDate: "Permanent", endDate: "Permanent" }
    ],
    temporaryExhibitions: [
    ],
    pastExhibitions: [
    ],
    floorPlan: "",
    rooms: {
      "room-1": [
        { id: "ng-art-1", name: "Sunflowers", artist: "Vincent van Gogh", year: 1888, image: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/national-gallery/sunflowers.jpg", roomId: "room-1", exhibitionName: "European Paintings", exhibitionTitle: "European Paintings" }
      ]
    }
  },
  // National Portrait Gallery
  {
    id: "national-portrait-gallery",
    description_ko: "중세부터 오늘날까지의 초상만을 모은 세계 최대의 초상 미술관이다. 런던 트래펄가 광장 곁에 자리하며, 영국 역사를 만든 인물들의 초상을 회화·사진·조각으로 만날 수 있다.",
    name: "National Portrait Gallery",
    name_ko: "국립 초상화 미술관",
    slug: "npg",
    location: "St Martin's Place, London WC2H 0HE",
    description: "The world’s largest collection of portraits, from the Middle Ages to the present day.",
    latitude: 51.5094,
    longitude: -0.1281,
    country: "United Kingdom",
    region: "London",
    representativeImage: "images/npg-logo.svg",
    floorPlan: "https://www.npg.org.uk/visit/floor-plans/floor-3/",
    permanentExhibitions: [
      { id: "npg-london-collection", name: "NPG Collection", title: "National Portrait Gallery Collection", description: "The world's largest collection of portraits, featuring paintings of famous British figures from the Middle Ages to the present day.", startDate: "Permanent", endDate: "Permanent", collectionFile: "national-portrait-gallery-london-collection.json" }
    ],
    temporaryExhibitions: [
    ],
    pastExhibitions: [
    ],
  },
  {
    id: "vam",
    description_ko: "공예와 디자인을 아우르는 세계 최대의 장식미술 박물관으로, 런던 사우스켄싱턴에 자리한다. 가구·도자·패션·금속공예·조각 등 여러 세기에 걸친 인류의 디자인 유산을 방대하게 소장한다.",
    name: "Victoria and Albert Museum",
    name_ko: "빅토리아 앨버트 박물관",
    slug: "vam",
    location: "Cromwell Rd, South Kensington, London SW7 2RL",
    description: "The world’s leading museum of art, design and performance.",
    latitude: 51.496639,
    longitude: -0.172201,
    country: "United Kingdom",
    region: "London",
    permanentExhibitions: [
      {
        id: "vam-permanent",
        name: "Collection (Permanent)",
        title: "Permanent Collection",
        description: "Oil paintings, paintings, posters, and watercolours from the V&A permanent collection currently on display.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "vam-permanent-exhibitions.json"
      },
      {
        id: "vam-posters",
        name: "Poster Collection",
        title: "V&A Poster Collection",
        description: "Posters from the V&A permanent collection currently on display.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "vam-posters-display.json"
      },
    ],
    temporaryExhibitions: [
      { id: "vam-t1", name: "Design and Disability", title: "Design and Disability", description: "Both a celebration and a call to action, showcasing the radical contributions of Disabled, Deaf, and neurodivergent people and communities to design history and contemporary culture, from the 1940s to now. Free tickets available for Disabled people and a companion.", startDate: "2025-01-01", endDate: "2026-02-15", admission: "£16.00", image: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/galleries/vam/exhibitions/design-and-disability.webp" },
      { id: "vam-t2", name: "Marie Antoinette Style", title: "Marie Antoinette Style", description: "Shaped by the most fashionable queen in history. A complex fashion icon, Marie Antoinette's timeless appeal is defined by her style, youth and notoriety. Explore the lasting influence of the most fashionable (and ill-fated) queen in history – with over 250 years of design, fashion, film and art.", startDate: "2025-01-01", endDate: "2026-03-22", admission: "Weekday £23.00 / Weekend £25.00", image: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/galleries/vam/exhibitions/marie-antoinette.webp" },
      { id: "vam-t3", name: "David Bowie Centre", title: "David Bowie Centre", description: "A new permanent home for David Bowie's archive at V&A East Storehouse. A single room featuring guest-curated displays, including spaces where you can book time one-to-one with items from the archive.", startDate: "2025-01-01", endDate: "Ongoing", admission: "Free (timed ticket required, sold out)", image: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/galleries/vam/exhibitions/david-bowie.webp" },
      { id: "vam-t5", name: "Inside Aardman: Wallace & Gromit and Friends", title: "Inside Aardman", description: "Go behind the scenes of stop-motion animation and explore how Aardman's iconic characters and worlds are brought to life. In Aardman's 50th anniversary year, peek behind the scenes of your favourite stop-motion animations. Visit Wallace & Gromit, Shaun the Sheep and Morph.", startDate: "2026-02-12", endDate: "2026-12-31", admission: "£11.00", venue: "Young V&A", image: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/galleries/vam/exhibitions/aardman.webp" },
      { id: "vam-t6", name: "Schiaparelli: Fashion Becomes Art", title: "Schiaparelli", description: "The UK's first exhibition on Elsa Schiaparelli spans the 1920s to today, celebrating the innovative designer's influence. It traces the fashion house's groundbreaking origins and its evolution under current creative director Daniel Roseberry. 'In difficult times fashion is always outrageous.' – Elsa Schiaparelli", startDate: "2026-03-28", endDate: "2026-09-30", admission: "Weekday £28.00 / Weekend £30.00", image: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/galleries/vam/exhibitions/schiaparelli.webp" }
    ],
    pastExhibitions: [
    ],
    representativeImage: "images/vam-logo.svg",
    floorPlan: "",
    rooms: {
      "room-1": [
        { id: "vam-art-1", name: "Sculpture Sample", artist: "Various", year: 1900, image: "/images/exhibition3.png", roomId: "room-1", exhibitionName: "Design Collections", exhibitionTitle: "Design Collections" }
      ]
    }
  },

  // Additional UK Art Galleries
  {
    id: "tate-liverpool",
    name_ko: "테이트 리버풀",
    description_ko: "잉글랜드 북부에 자리한 테이트의 분관으로, 근현대미술 국립 컬렉션을 선보인다. 본래 리버풀의 앨버트 독에 있었으나 재단장 동안 리바 노스로 자리를 옮겨 운영 중이다.",
    slug: "tate-liverpool",
    name: "Tate Liverpool + RIBA North",
    location: "Mann Island, Liverpool L3 1BP",
    description: "Now at RIBA North while the Royal Albert Dock home is temporarily closed for redevelopment. Home to the national collection of modern and contemporary art in the North of England.",
    latitude: 53.4015,
    longitude: -2.9943,
    country: "United Kingdom",
    region: "Liverpool",
    representativeImage: "images/tate-liverpool-logo.svg",
    permanentExhibitions: [
      { id: "tm-perm-3", name: "Tate Collection", title: "Tate Collection", collectionFile: "tate-artworks.json", description: "Complete collection of artworks from Tate galleries.", startDate: "Permanent", endDate: "Permanent" }
    ],
    temporaryExhibitions: [
      { id: "tl-t1", name: "Home Ground: The Architecture of Football", title: "Home Ground", description: "Discover how football stadiums have evolved in style, scale, and design throughout the years. Curated by the Royal Institute of British Architects (RIBA), exploring the evolution of football stadium designs through photographs, archive material and architectural models.", startDate: "2025-01-01", endDate: "2026-01-25", admission: "Free", image: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/galleries/tate-liverpool/exhibitions/home-ground.webp" },
      { id: "tl-t2", name: "Stirling Prize 2025", title: "Stirling Prize 2025", description: "Discover the Stirling Prize winner and the 2025 nominees. Curated by RIBA, celebrating the best architecture in the UK. The 2025 shortlist included two homes, affordable housing, a university building, a research facility and a London landmark.", startDate: "2025-01-01", endDate: "2026-02-22", admission: "Free", image: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/galleries/tate-liverpool/exhibitions/stirling-prize.webp" },
      { id: "tl-t3", name: "Ugo Rondinone: Liverpool Mountain", title: "Liverpool Mountain", description: "Liverpool Mountain is Swiss-artist Ugo Rondinone's first public artwork in the UK. Inspired by naturally occurring Hoodoos and the art of meditative rock balancing, this 10-metre high sculpture stands within Mermaid Courtyard. Marks the 10th anniversary of Liverpool European Capital of Culture, the 20th anniversary of Liverpool Biennial and the 30th anniversary of Tate Liverpool.", startDate: "2018-10-23", endDate: "2028-09-06", admission: "Free", location: "Mermaid Courtyard, Mann Island", image: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/galleries/tate-liverpool/exhibitions/ugo-rondinone.webp" },
      { id: "tl-t4", name: "ARTIST ROOMS: Ed Ruscha", title: "Ed Ruscha", description: "From parking lots and gas stations to swimming pools and diners, explore the work of influential American artist Ed Ruscha. Inspired by his travels by car, including the journey from Oklahoma to Los Angeles, Ruscha depicts the vast open space of the US. Includes books, photographs, paintings, drawings, and lithographs, capturing the architecture, geography and image of the USA.", startDate: "2026-02-12", endDate: "2026-06-14", admission: "Free", image: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/galleries/tate-liverpool/exhibitions/ed-ruscha.webp" },
      { id: "tl-t5", name: "Building in Focus: Beneath the River Mersey", title: "Beneath the River Mersey", description: "A free display curated by RIBA exploring the Queensway Tunnel, Herbert J. Rowse's 1934 Art Deco masterpiece beneath the River Mersey. Once the world's longest road tunnel, its striking ventilation towers still shape the city's skyline today. Features photography and film from the tunnel's opening, revealing a story of bold engineering and civic ambition.", startDate: "2026-03-02", endDate: "2026-04-19", admission: "Free", image: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/galleries/tate-liverpool/exhibitions/building-in-focus.webp" },
      { id: "tl-t6", name: "Mildred's Albert Dock Art Trail", title: "Albert Dock Art Trail", description: "Help Mildred the gallery cat find artworks around the Dock. Collect your free Art Trail booklet from Tate Liverpool + RIBA North at Mann Island. Follow the map to find images of Tate artworks and create your own art along the way.", startDate: "2025-01-01", endDate: "2025-12-31", admission: "Free", image: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/galleries/tate-liverpool/exhibitions/mildred-art-trail.webp" },
      { id: "tl-t7", name: "Festive Fowl Play", title: "Festive Fowl Play", description: "Swoop into our Learning Space this winter holiday for free avian art activities! Flock together for crafty family fun, constructing multi-coloured replicas of your favourite birds.", startDate: "2025-12-20", endDate: "2026-01-04", admission: "Free", image: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/galleries/tate-liverpool/exhibitions/festive-fowl.webp" },
      { id: "tl-t8", name: "Making Waves", title: "Making Waves", description: "February half term family activities at Tate Liverpool + RIBA North.", startDate: "2026-02-14", endDate: "2026-02-23", admission: "Free", image: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/galleries/tate-liverpool/exhibitions/making-waves.webp" },
      { id: "tl-t9", name: "Branching Out", title: "Branching Out", description: "Easter family activities at Tate Liverpool + RIBA North.", startDate: "2026-04-04", endDate: "2026-04-20", admission: "Free", image: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/galleries/tate-liverpool/exhibitions/branching-out.webp" }
    ],
    pastExhibitions: [
    ]
  },
  {
    id: "tate-st-ives",
    description_ko: "대서양을 굽어보는 콘월의 해변 마을 세인트아이브스에 자리한 테이트의 분관이다. 바버라 헵워스, 패트릭 헤론 등 이곳에 모여든 작가들의 작품을 중심으로, 이 지역과 인연이 깊은 근현대미술을 선보인다.",
    slug: "tate-st-ives",
    name: "Tate St Ives",
    name_ko: "테이트 세인트아이브스",
    location: "Porthmeor Beach, St Ives, Cornwall TR26 1TG",
    description: "Overlooking the Atlantic Ocean, Tate St Ives showcases work by artists including Barbara Hepworth, Marlow Moss, Naum Gabo and Patrick Heron, whose captivating works have brought international attention to St Ives and West Cornwall.",
    latitude: 50.2115,
    longitude: -5.4796,
    country: "United Kingdom",
    region: "Cornwall",
    representativeImage: "images/tate-st-ives-logo.svg",
    permanentExhibitions: [
      { id: "tsi-perm-1", name: "Tate St Ives Collection", title: "Tate St Ives Collection", description: "Complete collection of artworks from Tate galleries.", startDate: "Permanent", endDate: "Permanent", collectionFile: "tate-st-ives-artworks.json" },
      { id: "tm-perm-3", name: "Tate Collection", title: "Tate Collection", collectionFile: "tate-artworks.json", description: "Complete collection of artworks from Tate galleries.", startDate: "Permanent", endDate: "Permanent" }
    ],
    temporaryExhibitions: [
      { id: "tsi-t1", name: "Emilija Škarnulytė", title: "Emilija Škarnulytė", description: "Take a journey across space and time in the immersive films of Emilija Škarnulytė.", detailedDescription: "Working between documentary and the imaginary, artist Emilija Škarnulytė creates films and immersive installations that explore deep time and invisible systems, as well as power structures possibly hidden within the cosmic and geological order. In her practice, Cold War military bases, neutrino observatories, decommissioned nuclear power plants, and deep-sea data storage units become relics of a lost human culture.\n\nFrom the perspective of a 'future archaeologist', Škarnulytė positions these artifacts in ways that prompt a different way of seeing and sensing the world. By exploring human-made architectures and invasive processes, she opens an altered perspective from which to question our role in society and nature, driven by processes of evolution and extinction.\n\nAs part of her filmic explorations, which often delve into ocean and river habitats, the artist assumes the shape of a hybrid figure, half-human and half-fish, swimming through abandoned submarine tunnels, hydroelectric plants, and the waters of the Amazon. For Škarnulytė, this hybrid creature embodies not only a fictive future archaeologist but also draws connections between ancient legends and prophecies to create new mythologies for our currently endangered planet.\n\nShe seamlessly blurs the boundaries between the human, the nonhuman, and the transcendental, melding scientific and mythological elements into a singular hybrid and vibrant force.", url: "https://www.tate.org.uk/whats-on/tate-st-ives/emilija-skarnulyte", startDate: "2025-12-06", endDate: "2026-04-12", pricing: "£14 | Free for Members", image: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/galleries/tate-st-ives/exhibitions/emilija-skarnulyte.webp" },
      { id: "tsi-t2", name: "Ahmet Doğu İpek: Iron Earth Copper Sky", title: "Ahmet Doğu İpek: Iron Earth Copper Sky", description: "Inspired by the natural landscape of Cornwall and the Anatolian night sky, İpek's large-scale works on paper evoke Neolithic standing stones and the ores that permeate the geology of the region.", detailedDescription: "New work developed as part of a two-month artist residency at Porthmeor Studios in St Ives.\n\n'Under a sky washed in grey and orange …the words escaped my lips unbidden: iron earth, copper sky …it seemed the most precise description of a rusting world' – Ahmet Doğu İpek\n\nInspired by the natural landscape of Cornwall and the Anatolian night sky, İpek's large-scale works on paper evoke Neolithic standing stones and the ores that permeate the geology of the region, as well as the planets Mars, Jupiter, Mercury and Venus and the sensation of a galaxy. The works are named after St Eia, the patron saint of St Ives, and the exhibition title borrows from a 1963 novel by Turkish-Kurdish writer Yaşar Kemal.\n\nAhmet Doğu İpek (b. 1983) lives and works in Istanbul. He works primarily with watercolour, ink, and charcoal on paper, using a slow and detailed process.\n\nThis exhibition is part of a collaboration between Tate St Ives and SAHA - supporting contemporary artists from Turkey.", url: "https://www.tate.org.uk/whats-on/tate-st-ives/ahmet-dogu-ipek", startDate: "2025-10-18", endDate: "2026-03-08", pricing: "Included with gallery entry | Free for Members", image: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/galleries/tate-st-ives/exhibitions/ahmet-ipek.webp" },
      { id: "tsi-t3", name: "Anna Farley: Your Space", title: "Anna Farley: Your Space", description: "Explore how art can transform your experience of space in this interactive display by Cornwall-based artist Anna Farley.", detailedDescription: "Farley is an autistic artist whose work explores her autism, UK disability culture and inclusion. She subverts the traditional culture of galleries and museums by designing experimental comfort spaces within them.\n\nFor Your Space, Farley has taken inspiration from artist Barbara Hepworth's Palais de Danse in St Ives. Hepworth transformed the former seaside dance hall into a studio and exhibition space where visitors could interact with her art and ideas. Farley has also been inspired by Hepworth's relationship to her studio, which the artist found a source of comfort and solace. Farley's studio, known as Shelter, is a circular yurt in an oak wood in Cornwall where she often retreats when feeling overwhelmed.\n\nThis project proposes an intervention in a gallery space, offering you the ability to alter the environment for your own comfort and accessibility. Based on her research and personal experiences, the artist has proposed five areas of focus: light, sound, texture, smell, and colour. These have been developed into ways to alter your surroundings for your own comfort and accessibility.", url: "https://www.tate.org.uk/visit/tate-st-ives/display/anna-farley-your-space", startDate: "2025-10-01", endDate: "2026-04-12", pricing: "Free", image: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/galleries/tate-st-ives/exhibitions/anna-farley.webp" },
      { id: "tsi-t4", name: "Aleksandra Kasuba", title: "Aleksandra Kasuba", description: "A major retrospective of Lithuanian-American artist Aleksandra Kasuba, known for her immersive textile and architectural installations exploring space, light, and form.", detailedDescription: "Tate St Ives presents the first UK museum exhibition of the work of Aleksandra Kasuba (1923–2019). Kasuba fled Lithuania after the Second World War, emigrating to the United States where she established herself as a pioneering artist.\n\nThe exhibition spans six decades of work, exploring Kasuba's artistic journey, from her early paintings and mosaics to her later sculptures and architectural designs. A common thread throughout her practice is a deep connection with nature, drawing on the forms and colours of the natural world.\n\nKasuba was a member of E.A.T (Experiments in Art and Technology), a collective of artists and engineers who worked together in the 1960s and 70s to explore new technologies and their potential for art. Her later work focused on architectural environments, often designing whole rooms and spaces that surrounded viewers with colour and light.\n\nThis exhibition celebrates Kasuba's remarkable life and legacy, presenting her pioneering vision and experimental spirit to UK audiences for the first time.", url: "https://www.tate.org.uk/whats-on/tate-st-ives/aleksandra-kasuba", startDate: "2026-05-02", endDate: "2026-10-04", image: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/galleries/tate-st-ives/exhibitions/aleksandra-kasuba.webp" },
      { id: "tsi-t5", name: "Wilhelmina Barns-Graham", title: "Wilhelmina Barns-Graham", description: "Celebrating the vibrant abstract paintings and works of Wilhelmina Barns-Graham, a key member of the St Ives School who captured the energy and light of the Cornish landscape.", detailedDescription: "This major retrospective exhibition is the first to chart the full length of Wilhelmina Barns-Graham's incredible career, covering eight decades. One of the most innovative British artists of the 20th century, Barns-Graham played a central role in the development of abstraction in the UK.\n\nBorn in St Andrews, Scotland in 1912, she studied at Edinburgh College of Art before moving to St Ives in 1940, where she became a key member of the modernist artistic community. Her work was profoundly influenced by the Cornish landscape, particularly the light and atmosphere of the coastline.\n\nFeaturing over 170 paintings, drawings, prints and archive materials, this exhibition traces her artistic development from early figurative works to her later bold abstractions. Her famous Glacier paintings, inspired by a transformative visit to the Grindelwald Glacier in Switzerland in 1949, marked a turning point in her career.\n\nThe exhibition culminates with her vibrant Scorpio Series, created in the final years of her life when she worked with renewed energy and freedom, producing some of her most celebrated paintings.", url: "https://www.tate.org.uk/whats-on/tate-st-ives/wilhelmina-barns-graham", startDate: "2026-10-24", endDate: "2027-04-11", image: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/galleries/tate-st-ives/exhibitions/wilhelmina-barns-graham.webp" }
    ],
    pastExhibitions: [
    ]
  },
  // Additional UK Art Galleries (10 more for total 20)
  {
    id: "scottish-national-gallery",
    description_ko: "에든버러 도심에 자리한 스코틀랜드의 국립미술관이다. 베르메르, 티치아노, 렘브란트, 벨라스케스의 걸작과 인상주의 회화를 소장하며, 1800년부터 1945년까지 스코틀랜드 미술을 모은 전시관도 새로 단장했다.",
    slug: "sng",
    name: "Scottish National Gallery",
    name_ko: "스코틀랜드 국립미술관",
    location: "The Mound, Edinburgh EH2 2EL, Scotland",
    description: "Immerse yourself in this breath-taking art collection. Experience paintings by internationally renowned artists such as Vermeer, Titian, Rembrandt, Velázquez and the Impressionists. Explore the newly opened Scottish galleries with the very best of Scottish art from 1800 to 1945.",
    latitude: 55.9508,
    longitude: -3.1958,
    country: "United Kingdom",
    region: "Edinburgh",
    representativeImage: "images/sng-logo.svg",
    permanentExhibitions: [
      { id: "sng-collection", name: "SNG Collection", title: "Scottish National Gallery Collection", description: "Masterpieces from the Renaissance to Post-Impressionism, including works by Botticelli, Raphael, Titian, Vermeer, Rembrandt, Monet, Degas, Cézanne, and Van Gogh.", startDate: "Permanent", endDate: "Permanent", collectionFile: "scottish-national-gallery-collection.json" }
    ],
    temporaryExhibitions: [
    ],
    pastExhibitions: []
  },
  {
    id: "royal-academy",
    description_ko: "1768년에 세워진 영국에서 가장 오래된 미술 단체로, 예술가들이 직접 운영해 온 점이 특징이다. 런던 피카딜리의 벌링턴 하우스에 자리하며, 해마다 누구나 출품할 수 있는 '여름 전시'와 수준 높은 기획전을 연다.",
    slug: "royal-academy",
    name: "Royal Academy of Arts",
    name_ko: "로열 아카데미 오브 아츠",
    location: "Burlington House, Piccadilly, London W1J 0BD",
    description: "Britain's oldest society devoted to promoting the arts, hosting world-class exhibitions since 1768.",
    latitude: 51.5094,
    longitude: -0.1397,
    country: "United Kingdom",
    region: "London",
    representativeImage: "images/royal-academy-logo.svg",
    permanentExhibitions: [
      { id: "ra-1", name: "RA Collection", title: "RA Collection", description: "Works acquired since the Academy's founding in 1768, including works by Reynolds, Constable, Turner, and contemporary Royal Academicians.", startDate: "Permanent", endDate: "Permanent", collectionFile: "royal-academy-collection.json" }
    ],
    temporaryExhibitions: [
    ],
    upcomingExhibitions: [
      { id: "ra-u1", name: "Rose Wylie", title: "Rose Wylie", description: "Major exhibition of works by the celebrated British painter.", startDate: "2026-02-28", endDate: "2026-04-19" }
    ],
    pastExhibitions: [
    ]
  },
  {
    id: "serpentine-gallery",
    name_ko: "서펜타인 갤러리",
    description_ko: "런던 하이드파크 안에 자리한 두 곳의 현대미술 갤러리다. 실험적인 기획전으로 이름 높으며, 해마다 세계적인 건축가에게 의뢰해 짓는 여름 파빌리온으로 특히 유명하다.",
    slug: "serpentine",
    name: "Serpentine Galleries",
    location: "Kensington Gardens, London W2 3XA",
    description: "Two contemporary art galleries in Hyde Park, known for cutting-edge exhibitions and the annual summer Pavilion commission.",
    latitude: 51.5050,
    longitude: -0.1750,
    country: "United Kingdom",
    region: "London",
    representativeImage: "images/serpentine-logo.svg",
    permanentExhibitions: [],
    temporaryExhibitions: [
    ],
    upcomingExhibitions: [
      { id: "serp-u1", name: "David Hockney", title: "David Hockney", description: "Serpentine presents an exhibition with David Hockney.", startDate: "2026-03-12", endDate: "2026-08-23" },
      { id: "serp-u2", name: "Cecily Brown: Picture Making", title: "Cecily Brown: Picture Making", description: "Known for vigorous brushwork, vivid colour and dynamic compositions, Cecily Brown presents paintings inspired by Serpentine's unique location in Kensington Gardens.", startDate: "2026-03-27", endDate: "2026-09-06" },
      { id: "serp-u3", name: "Amar Kanwar", title: "Amar Kanwar", description: "New Delhi-based artist and filmmaker Amar Kanwar presents lyrical films moving between documentary, travelogue and visual essay.", startDate: "2026-09-01", endDate: "2027-01-31" }
    ],
    pastExhibitions: [
    ]
  },
  {
    id: "dulwich-picture-gallery",
    name_ko: "덜위치 미술관",
    description_ko: "1811년 건축가 존 손이 설계한, 영국 최초로 미술관을 위해 지어진 건물이다. 런던 남부 덜위치에 자리하며, 렘브란트와 푸생, 루벤스 등 유럽 옛 거장의 회화를 소장한다. 자연광을 끌어들인 전시실 구성은 이후 미술관 건축의 본보기가 되었다.",
    slug: "dulwich",
    name: "Dulwich Picture Gallery",
    location: "Gallery Road, Dulwich Village, London SE21 7AD",
    description: "England's first purpose-built public art gallery, designed by Sir John Soane in 1811, featuring works by Rembrandt, Poussin, Rubens and many others.",
    latitude: 51.4458,
    longitude: -0.0857,
    country: "United Kingdom",
    region: "London",
    representativeImage: "images/dulwich-logo.svg",
    permanentExhibitions: [
      {
        id: "dpg-1",
        name: "The Collection",
        title: "The Collection",
        description: "As well as our ground-breaking temporary exhibitions, Dulwich Picture Gallery boasts a stunning collection of historic paintings featuring works by Rembrandt, Poussin, Rubens and many others.",
        startDate: "Permanent",
        endDate: "Permanent",
        image: "https://assets.dulwich-gallery.substrakt.net/images/collezione.2e16d0ba.fill-2000x800.jpg"
      , collectionFile: "dulwich-collection.json" }
    ],
    temporaryExhibitions: [
      {
        id: "dpg-anna-ancher",
        name: "Anna Ancher: Painting Light",
        title: "Anna Ancher: Painting Light",
        description: "Known for her luminous paintings, bold use of colour, and ability to capture light like no other, Ancher offers a fresh and powerful perspective on the art of the late nineteenth and early twentieth century.",
        fullDescription: "Discover the luminous paintings of Anna Ancher (1859–1935), one of Denmark's most celebrated and pioneering artists, in her first-ever UK exhibition.\n\n**An artist ahead of her time**\nThough a household name in Denmark, Ancher is little known in the UK. This landmark exhibition brings her work to British audiences for the first time, showcasing over 40 paintings from across her career — including masterpieces on loan from The Hirschsprung Collection and Skagens Museum.\n\n**Life in Skagen**\nA central figure among the Skagen Painters, Ancher grew up in the fishing village she so often depicted. Her intimate connection to the town and its people shines through in her work.\n\n**Breaking boundaries**\nAncher's success was remarkable at a time when women faced significant barriers in the art world. Defying social expectations, she built an acclaimed international career and became one of Denmark's most celebrated female artists.",
        startDate: "2025-11-04",
        endDate: "2026-03-08",
        image: "https://assets.dulwich-gallery.substrakt.net/images/Anna_Ancher_Sunlight_in_the_blue_.2e16d0ba.fill-2000x800.jpg",
        artworks: [
          { id: "aa-1", name: "Sunlight in the Blue Room", artist: "Anna Ancher", year: 1891, image: "https://assets.dulwich-gallery.substrakt.net/images/Anna_Ancher_Sunlight_in_the_blue_.2e16d0ba.fill-2000x800.jpg" },
          { id: "aa-2", name: "Interior with Red Poppies", artist: "Anna Ancher", year: 1905, image: "https://assets.dulwich-gallery.substrakt.net/images/Interior_with_Red_Poppies_1905_o.2e16d0ba.fill-1600x1000.jpg" },
          { id: "aa-3", name: "Maid in the Kitchen", artist: "Anna Ancher", year: 1883, image: "https://assets.dulwich-gallery.substrakt.net/images/Maid_in_the_Kitchen_Anna_Ancher.624fc92f.fill-1600x1000.jpg" },
          { id: "aa-4", name: "Evening Sun in the Artist's Studio", artist: "Anna Ancher", year: 1913, image: "https://assets.dulwich-gallery.substrakt.net/images/Evening_Sun_in_the_Artists_Studi.2e16d0ba.fill-1600x1000.jpg" },
          { id: "aa-5", name: "A Field Sermon", artist: "Anna Ancher", year: 1903, image: "https://assets.dulwich-gallery.substrakt.net/images/A_Field_Sermon_1903__wdRSGlQ.2e16d0ba.fill-960x600.jpg" },
          { id: "aa-6", name: "Interior. Brøndum's Annex", artist: "Anna Ancher", year: 1916, image: "https://assets.dulwich-gallery.substrakt.net/images/Interior._Brondums_Annex_1916_.2e16d0ba.fill-960x600.jpg" }
        ],
        videos: [
          "https://www.youtube.com/embed/_cCsxeuzVTs?feature=oembed",
          "https://www.youtube.com/embed/oXO93Psz-QQ?feature=oembed"
        ],
        url: "https://www.dulwichpicturegallery.org.uk/whats-on/anna-ancher-painting-light/"
      },
      {
        id: "dpg-konrad-magi",
        name: "Konrad Mägi",
        title: "Konrad Mägi",
        description: "In spring 2026, we will present a major UK debut of the Estonian artist Konrad Mägi (1878–1925).",
        fullDescription: "In spring 2026, we will present a major UK debut of the Estonian artist Konrad Mägi (1878–1925).\n\nA pioneer of modern painting, this show offers UK audiences the opportunity to encounter Mägi's dazzling, spiritually charged paintings for the first time.\n\nThe exhibition will bring together a survey of his enigmatic landscapes and captivating portraits that highlight his intensive, productive and varied career as an artist that lasted just 20 years.\n\nShown alongside Mägi's works will be a specially commissioned sculptural work by Estonian artist Kristina Õllek. Created in response to Mägi's paintings, while on a residency in the Saaremaa islands, the new commission will take inspiration from his works.",
        startDate: "2026-03-24",
        endDate: "2026-07-12",
        image: "https://assets.dulwich-gallery.substrakt.net/images/1909-Norra-maastik-III-2000x1805_McMCt9V.019893ba.fill-2000x800.jpg",
        artworks: [
          { id: "km-1", name: "Norwegian Landscape III", artist: "Konrad Mägi", year: 1909, image: "https://assets.dulwich-gallery.substrakt.net/images/1909-Norra-maastik-III-2000x1805_McMCt9V.019893ba.fill-2000x800.jpg" },
          { id: "km-2", name: "Portrait of a Norwegian Girl", artist: "Konrad Mägi", year: 1909, image: "https://assets.dulwich-gallery.substrakt.net/images/Konrad_Magi_Portrait_of_a_Norwegian_Girl_1909.width-1600.jpg" },
          { id: "km-3", name: "Saaremaa: A Study", artist: "Konrad Mägi", year: 1914, image: "https://assets.dulwich-gallery.substrakt.net/images/Konrad_Magi_Saaremaa_A_Study_1913_-_14._Court.width-1600.jpg" },
          { id: "km-4", name: "Norwegian Landscape: Bog Landscape", artist: "Konrad Mägi", year: 1909, image: "https://assets.dulwich-gallery.substrakt.net/images/Konrad_Magi_Norwegian_Landscape-_Bog_Landscap.width-1600.jpg" }
        ],
        url: "https://www.dulwichpicturegallery.org.uk/whats-on/konrad-magi/"
      },
      {
        id: "dpg-portrait-city",
        name: "Portrait of a City: A Century of American Photography",
        title: "Portrait of a City",
        description: "Step into a century of American city life through photographs that capture the people who built, inhabited, and transformed urban spaces into living, breathing communities.",
        startDate: "2026-07-28",
        endDate: "2026-10-04",
        image: "https://assets.dulwich-gallery.substrakt.net/images/Lewis_Hine_Riding_the_Ball_High_u.135c7a32.fill-2000x800.jpg",
        fullDescription: "Step into a century of American city life through photographs that capture the people who built, inhabited, and transformed urban spaces into living, breathing communities.\n\nThe exhibition explores one hundred years of American urban life through the people who lived, worked, and moved through its streets. Featuring works by 34 influential photographers from 1907 to 2012, the exhibition traces how photography evolved alongside the modern city, capturing individuals and communities shaped by and shaping their environments.\n\n**Photography and the American City**\nSet in New York, Los Angeles, Chicago, and San Francisco, the photographs reveal cities as dynamic stages for social change. From mass immigration and industrial growth to moments of counterculture and protest, photographers used urban spaces to examine identity, labour, and belonging.\n\n**Artists and Highlights**\nHighlights include works by Alfred Stieglitz, Helen Levitt, Dorothea Lange, Lewis Hine, Berenice Abbott, Walker Evans, Diane Arbus, Garry Winogrand, and Bruce Davidson.",
        artworks: [
          { id: "poc-1", name: "Riding the Ball High Up on Empire State Building", artist: "Lewis Hine", year: 1931, image: "https://assets.dulwich-gallery.substrakt.net/images/Lewis_Hine_Riding_the_Ball_High_u.135c7a32.fill-2000x800.jpg" }
        ],
        url: "https://www.dulwichpicturegallery.org.uk/whats-on/portrait-of-a-city-a-century-of-american-photography/"
      },
      {
        id: "dpg-hokusai",
        name: "Hokusai: Thirty-six views of Mt. Fuji from the Iuchi Collection",
        title: "Hokusai: Thirty-six views of Mt. Fuji",
        description: "See the complete series of one of the most celebrated image cycles in art history, inviting visitors to experience Mount Fuji as Hokusai saw it nearly two centuries ago.",
        fullDescription: "See the complete series of one of the most celebrated image cycles in art history, inviting visitors to experience Mount Fuji as Hokusai saw it nearly two centuries ago.\n\nThe exhibition brings one of the world's most iconic print series to London. Created between 1830 and 1833, the exhibition presents, for the first time in the UK, the complete set of Thirty-six Views of Mount Fuji by Katsushika Hokusai, Japan's most celebrated printmaker.\n\n**Hokusai and Mount Fuji**\nAcross the series, Hokusai depicts Mount Fuji from shifting viewpoints, seasons, and moments of everyday life, transforming Japan's most sacred mountain into a powerful presence within both landscape and human activity. These works demonstrate Hokusai's innovative approach to composition, perspective, and colour, including his pioneering use of the newly introduced Prussian blue pigment.\n\n**Highlights from the series**\nHighlights include a rare variant of Clear Day with a Southern Breeze (also known as Blue Fuji), never before seen in the UK, alongside a beautifully preserved impression of Under the Wave off Kanagawa, commonly known as The Great Wave.",
        startDate: "2026-10-20",
        endDate: "2027-01-17",
        image: "https://assets.dulwich-gallery.substrakt.net/images/hokusai_mt_fuji.ed39732b.fill-2000x800.png",
        artworks: [
          { id: "hok-1", name: "Clear Day with a Southern Breeze (Blue Fuji)", artist: "Katsushika Hokusai", year: 1831, image: "https://assets.dulwich-gallery.substrakt.net/images/hokusai_mt_fuji.ed39732b.fill-2000x800.png" }
        ],
        url: "https://www.dulwichpicturegallery.org.uk/whats-on/hokusai-thirty-six-views-of-mt-fuji-from-the-iuchi-collection/"
      }
    ],
    pastExhibitions: [
    ]
  },
  {
    id: "courtauld-gallery",
    description_ko: "인상주의와 후기인상주의 회화로 세계적 명성을 얻은 미술관으로, 실업가 새뮤얼 코톨드의 컬렉션이 토대가 되었다. 마네의 '폴리베르제르의 술집', 고흐의 '귀에 붕대를 감은 자화상', 세잔의 대작을 소장한다. 런던 서머싯하우스 안에 자리해 미술사 연구·교육 기관으로서도 중요한 역할을 한다.",
    slug: "courtauld",
    name: "The Courtauld Gallery",
    name_ko: "코톨드 갤러리",
    location: "Somerset House, Strand, London WC2R 0RN",
    description: "World-renowned collection of Impressionist and Post-Impressionist paintings housed in the elegant Somerset House.",
    latitude: 51.5115,
    longitude: -0.1178,
    country: "United Kingdom",
    region: "London",
    representativeImage: "images/courtauld-logo.svg",
    permanentExhibitions: [
      { id: "cg-1", name: "The Courtauld Collection", title: "The Courtauld Collection", description: "Manet's Bar at the Folies-Bergère, Van Gogh's Self-Portrait, Cézanne's Card Players, and many more masterpieces from the world-renowned collection of Impressionist and Post-Impressionist art.", startDate: "Permanent", endDate: "Permanent", collectionFile: "courtauld-gallery-collection.json" }
    ],
    temporaryExhibitions: [
    ],
    upcomingExhibitions: [
      { id: "cg-u1", name: "A View of One's Own: Landscapes by British Women Artists, 1760-1860", title: "A View of One's Own", description: "Showcasing early landscape watercolours by British women artists, representing a growing area of The Courtauld's Collection.", startDate: "2026-01-28", endDate: "2026-05-20" },
      { id: "cg-u2", name: "Seurat and the Sea", title: "Seurat and the Sea", description: "The first ever exhibition dedicated to the seascapes of the French artist Georges Seurat (1859-1891).", startDate: "2026-02-13", endDate: "2026-05-17" }
    ],
    pastExhibitions: [
    ]
  },
  {
    id: "manchester-art-gallery",
    description_ko: "맨체스터 도심에 자리한 미술관으로, 여러 세기에 걸친 미술과 디자인 2만 5천여 점을 소장한다. 특히 라파엘 전파의 회화 컬렉션으로 잘 알려져 있다.",
    slug: "manchester-gallery",
    name: "Manchester Art Gallery",
    name_ko: "맨체스터 미술관",
    location: "Mosley Street, Manchester M2 3JL",
    description: "Home to over 25,000 objects spanning centuries of art and design.",
    latitude: 53.4793,
    longitude: -2.2419,
    country: "United Kingdom",
    region: "Manchester",
    representativeImage: "images/manchester-gallery-logo.svg",
    permanentExhibitions: [
    ],
    temporaryExhibitions: [
    ],
    pastExhibitions: [
    ]
  },
  {
    id: "walker-art-gallery",
    name_ko: "워커 미술관",
    description_ko: "리버풀에 자리한 미술관으로, '런던 밖 최고의 컬렉션'으로 불린다. 13세기부터 오늘날까지 유럽 회화와 조각, 장식미술을 소장하며, 이탈리아·플랑드르 옛 거장과 라파엘 전파의 작품이 특히 뛰어나다.",
    slug: "walker",
    name: "Walker Art Gallery",
    location: "William Brown Street, Liverpool L3 8EL",
    description: "The Walker Art Gallery in Liverpool is home to a national collection of paintings, decorative art and sculpture from the 13th century to the present day. Originally developed for the people of the city, it now holds the best collection of historic art outside of London.",
    latitude: 53.4107,
    longitude: -2.9799,
    country: "United Kingdom",
    region: "Liverpool",
    representativeImage: "images/walker-logo.svg",
    permanentExhibitions: [
      { id: "wag-collection", name: "Walker Collection", title: "Walker Art Gallery Collection", description: "Outstanding collection of European art from the 13th to 21st century, with renowned Pre-Raphaelite and Victorian paintings.", startDate: "Permanent", endDate: "Permanent", collectionFile: "walker-art-gallery-collection.json" }
    ],
    temporaryExhibitions: [
    ],
    pastExhibitions: [
    ]
  },
  {
    id: "scottish-national-portrait-gallery",
    description_ko: "세계 최초로 초상화만을 위해 지어진 미술관으로, 에든버러에 자리한다. 스코틀랜드 역사를 빛낸 인물들의 초상을 소장하며, 별자리를 그린 천장과 화려한 벽화로 장식된 그레이트 홀이 명소다.",
    slug: "snpg",
    name: "Scottish National Portrait Gallery",
    name_ko: "스코틀랜드 국립 초상화 미술관",
    location: "1 Queen Street, Edinburgh EH2 1JD, Scotland",
    description: "The world's first purpose-built portrait gallery, housing Scotland's collection of portraits. The gallery is decorated in elaborate murals and sculptural embellishments inside and out - take time to look up at the Zodiac ceiling in the world-famous Great Hall.",
    latitude: 55.9551,
    longitude: -3.1938,
    country: "United Kingdom",
    region: "Edinburgh",
    representativeImage: "images/snpg-logo.svg",
    permanentExhibitions: [
      { id: "snpg-collection", name: "SNPG Collection", title: "Scottish National Portrait Gallery Collection", description: "Portraits of famous Scots from monarchs and poets to scientists and sports heroes, housed in the world's first purpose-built portrait gallery.", startDate: "Permanent", endDate: "Permanent", collectionFile: "scottish-national-portrait-gallery-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  // Scottish National Gallery of Modern Art
  {
    id: "scottish-national-gallery-of-modern-art",
    name_ko: "스코틀랜드 국립 현대미술관",
    description_ko: "에든버러에 자리한 스코틀랜드의 국립 현대미술관이다. 두 채의 건물에 걸쳐 20세기와 21세기를 대표하는 작가들의 작품을 소장하며, 너른 잔디밭에 펼쳐진 야외 조각과 대지미술로도 사랑받는다.",
    slug: "scottish-national-gallery-of-modern-art-modern-one",
    name: "Scottish National Gallery of Modern Art",
    location: "75 Belford Rd, Edinburgh EH4 3DR",
    description: "Take a leap forward at the Modern. You will find the many contemporary artworks on display to be playful, thought provoking and compelling. Weave your way through two exciting gallery spaces featuring works by some of the most influential artists of the 20th and 21st centuries.",
    latitude: 55.9513,
    longitude: -3.2322,
    country: "United Kingdom",
    region: "Edinburgh",
    representativeImage: "images/scottish-national-gallery-of-modern-art-modern-one-logo.svg",
    permanentExhibitions: [
      { id: "sngma-collection", name: "Modern Art Collection", title: "Scottish National Gallery of Modern Art Collection", description: "Contemporary artworks from some of the most influential artists of the 20th and 21st centuries.", startDate: "Permanent", endDate: "Permanent", collectionFile: "scottish-national-gallery-of-modern-art-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  // British Museum
  {
    id: "british-museum",
    description_ko: "1753년에 세워진 세계 최초의 국립 공공 박물관으로, 인류 200만 년의 역사와 문화를 아우른다. 로제타석, 파르테논 조각, 이집트 미라 등 세계적으로 유명한 유물을 소장하며, 해마다 600만 명이 넘는 사람이 찾는다.",
    slug: "british-museum",
    name: "British Museum",
    name_ko: "대영박물관",
    location: "Great Russell St, London WC1B 3DG",
    description: "The British Museum's remarkable collection spans over two million years of human history and culture. Over 6 million visitors every year experience the collection, including world-famous objects such as the Rosetta Stone and Egyptian mummies.",
    latitude: 51.5194,
    longitude: -0.1270,
    country: "United Kingdom",
    region: "London",
    representativeImage: "images/british-museum-logo.svg",
    permanentExhibitions: [],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "hayward-gallery",
    description_ko: "런던 사우스뱅크에 자리한 현대미술 전문 갤러리로, 브루탈리즘 건축의 상징으로 꼽힌다. 소장품 없이 기획전에 집중하는 공간으로, 동시대 작가들의 대규모 개인전을 활발히 선보인다.",
    slug: "hayward",
    name: "Hayward Gallery",
    name_ko: "헤이워드 갤러리",
    location: "Southbank Centre, Belvedere Road, London SE1 8XX",
    description: "A world-renowned contemporary art gallery and a landmark of brutalist architecture on the South Bank.",
    latitude: 51.5061,
    longitude: -0.1163,
    country: "United Kingdom",
    region: "London",
    representativeImage: "/images/Hayward_Gallery_logo.svg",
    permanentExhibitions: [
      {
        id: "hayward-gallery-collection",
        name: "The Collection",
        title: "The Collection",
        description: "Explore the Hayward Gallery's collection featuring 1045 works from renowned contemporary artists including Bridget Riley, Tracey Emin, Wolfgang Tillmans, and many more.",
        startDate: "Permanent",
        endDate: "Permanent",
        image: "https://lh3.googleusercontent.com/ci/AL18g_T8gZsPhLFd1-XxK8xnZieyiTujHC6falS97qPSj1g0FC4WWvU9rgXAfCAhfokkknXMJthN_nY=w800",
        artworks: [
          { id: "hayward-gac-1", image: "https://lh3.googleusercontent.com/ci/AL18g_T8gZsPhLFd1-XxK8xnZieyiTujHC6falS97qPSj1g0FC4WWvU9rgXAfCAhfokkknXMJthN_nY=w800", artistName: "Bridget Riley", title: "Movement in Squares", year: "1961" },
          { id: "hayward-gac-2", image: "https://lh3.googleusercontent.com/ci/AL18g_SrE9flPw1vy1U11nbHPEAGPrUIgmgMJMvVTuV4VhRlu-0mlY6citq7gOxq9YyP6bWusr5lVA=w800", artistName: "Franz Gertsch", title: "At Luciano’s House", year: "1973" },
          { id: "hayward-gac-3", image: "https://lh3.googleusercontent.com/ci/AL18g_Rh_lH-BCjrI30SZt_BKddPRl71-FYQbTxwK5vlFsqk1jKjNmR5FK3PY121EN5oe-RzvqOdsjI=w800", artistName: "Liu Xiaodong", title: "Three girls watching TV", year: "2001" },
          { id: "hayward-gac-4", image: "https://lh3.googleusercontent.com/ci/AL18g_S1fETM_BRUEM6FmQX9G7x6GTW-kp5UaWxwJawRr_Jk0UZXnd-OF2TSVkgi7UWT_7GqOIHWGCU=w800", artistName: "Tracey Emin", title: "Psyco Slut", year: "1999" },
          { id: "hayward-gac-5", image: "https://lh3.googleusercontent.com/ci/AL18g_RWNgjZHFPZ2yrpnMhSrOIo2JnABe03N3HTas3nc9TGnXcfWp7n1lFUWRDL6zthM50Dpb_Jj4A1=w800", artistName: "George Condo", title: "Nude Homeless Drinker", year: "1999" },
          { id: "hayward-gac-6", image: "https://lh3.googleusercontent.com/ci/AL18g_RkvlAMbeQk1i0V0UxtvLxQPkPOczO-JETnEtw1rmjIa16mLlQpKmTPwXjMhqnxIRc73W8k7g=w800", artistName: "Edward Ruscha", title: "Hurting the Word Radio #2", year: "1964" },
          { id: "hayward-gac-7", image: "https://lh3.googleusercontent.com/ci/AL18g_SRRktN0MvVnLTucJecJYiiE_tEOit_zX-Zf68kEFnTAUa6fE8HZWRMKCpxm1TsE4X_UNycSg=w800", artistName: "Dayanita Singh", title: "Go Away Closer", year: "2007" },
          { id: "hayward-gac-8", image: "https://lh3.googleusercontent.com/ci/AL18g_ReDmDoWUiwuXvXRHsWVxcMYfvzt2fThFbv-FJHafKL9hwSBPvgh1FiudtEmfnIqq3VZIn8cpc=w800", artistName: "Ana Mendieta", title: "Tree of Life", year: "1976" },
          { id: "hayward-gac-9", image: "https://lh3.googleusercontent.com/ci/AL18g_SFpdoJ0vZX8H3musJKpZRUef5QjILkO7sVYDte23QK6-EetoKYI4uuKtgKhV9dCQjIYb6PwS4=w800", artistName: "Annette Messager", title: "Gloves-Head", year: "2009" },
          { id: "hayward-gac-11", image: "https://lh3.googleusercontent.com/ci/AL18g_RB0-UhKAKObkRpGce9Dv9tjvK7yLZ8eb9ypCeloGG_BCEXE_NKUsIEPM2_0Fk3mcEEhIi8Yt0=w800", artistName: "Marlene Dumas", title: "The Visitor", year: "1995" },
          { id: "hayward-gac-13", image: "https://lh3.googleusercontent.com/ci/AL18g_Q1Pnu03dpN2gLnmeKBecn8JVM5yJmeiDPlQjtLTIzC5PckNjdUG5dBEC3rvm4w6DZWpCHn97o=w800", artistName: "Unknown", title: "Poster for The Epic and the Everyday: Contemporary Photographic Art, Hayward Gallery", year: null },
          { id: "hayward-gac-14", image: "https://lh3.googleusercontent.com/ci/AL18g_Q-npb2mx-JPIHjx4Z7a2-3ReiiknEm0baWYit-QFFyHzF14A49VTGSbLM46oVk1pl28_2tpQM=w800", artistName: "Paul Laffoley", title: "Thanaton III", year: "1989" },
          { id: "hayward-gac-15", image: "https://lh3.googleusercontent.com/ci/AL18g_TGClm9Rqec2vx3eLYc5pHhe49Bij2WxNzNRCnZ3OVLSAmcdQLMz7wG5C_QWNl9u421u_r-xgA=w800", artistName: "Wolfgang Tillmans", title: "Freischwimmer 155", year: "2010" },
          { id: "hayward-gac-16", image: "https://lh3.googleusercontent.com/ci/AL18g_T9PUMgYV8aYhCmsD124eJ099pVa8qsJ96BDvmZ8-3ARiy5OqR-7NrEQuk-_L67biVun6XuH_fr=w800", artistName: "Unknown", title: "Private View Card for Rhapsodies in Black: Art of the Harlem Renaissance, Hayward Gallery, 1997", year: null },
          { id: "hayward-gac-19", image: "https://lh3.googleusercontent.com/ci/AL18g_QVbduFAj3blJtnrPtCNrBLKS0yi9mmucdJVFLZiEN-KtM1iKpxrLOK-iNgq4VwvNHF-AyXGi8=w800", artistName: "Unknown", title: "Poster for The Epic and the Everyday: Contemporary Photographic Art, Hayward Gallery", year: null },
          { id: "hayward-gac-20", image: "https://lh3.googleusercontent.com/ci/AL18g_TP9AGftkaCKn860InZLTDCadv2NXh8KF4fXVc4dtV7Ki7fdr74_6gwchdFmpNslyjkcUFrCn0=w800", artistName: "Unknown", title: "Exhibition Guide for Rhapsodies in Black: Art of the Harlem Renaissance, Hayward Gallery, 1997", year: null },
          { id: "hayward-gac-21", image: "https://lh3.googleusercontent.com/ci/AL18g_RwYbLqMez9K22xu07oManOgJVa6XW-HRqJ-eOOYuKpf8J1Gg36S_n6bkvYtsqn3NensFAaHg=w800", artistName: "Unknown", title: "Annette Messager, Casino", year: "2004" },
          { id: "hayward-gac-22", image: "https://lh3.googleusercontent.com/ci/AL18g_SJVDmjInWsi48NdBvqL5gslRLNh-SPndPeeOTSJ-gypQ7AUd6v6XzXuYPwWSx7T6zXl-YUPA=w800", artistName: "Unknown", title: "Catalogue for Rhapsodies in Black: Art of the Harlem Renaissance, Hayward Gallery, 1997", year: null },
          { id: "hayward-gac-23", image: "https://lh3.googleusercontent.com/ci/AL18g_R1HiS5A9Kh9ASCooR8ErUJe0696pjLcv77TjS-kQO-DKW2OZllgG9qfv9YPNT3pKNXrA05=w800", artistName: "Lynette Yiadom-Boakye", title: "Uncle of the Garden", year: "2014" },
          { id: "hayward-gac-28", image: "https://lh3.googleusercontent.com/ci/AL18g_TlY1dC1vVHb1CyjF7xwuObwu9K5OSsPwiYtl9O_laAwS8hV0AbXJBQSI76bHmN1dVoAxpFhDg2=w800", artistName: "Unknown", title: "Exhibition Guide for MOVE: Choreographing You, Art and Dance Since the 1960s, Hayward Gallery, 2010", year: null },
          { id: "hayward-gac-29", image: "https://lh3.googleusercontent.com/ci/AL18g_TUBaND9w8S9ZE5A5pin2_kNMl6eDAv_8yIc9sIVeRU9mifmnW1FKSRrQRvR1zxbUzu29dbWg=w800", artistName: "Malcolm Morley", title: "Coronation and Beach Scene", year: "1968" },
          { id: "hayward-gac-30", image: "https://lh3.googleusercontent.com/ci/AL18g_Sc_S3rtjQ8c7CKXY21P9Q2W7n9LwZlh8g0u-GJxWCdTvm9ua_p4IUNQkpE2qh2j00857rbLA=w800", artistName: "Unknown", title: "Private View Card for Henri Matisse: 1869-1954: A Retrospective Exhibition, Hayward Gallery, 1968", year: null },
          { id: "hayward-gac-31", image: "https://lh3.googleusercontent.com/ci/AL18g_THkjhkhU31Wne0HsheIdWEjazmSK7wTNH_MuWyWWqjkjLoR1nrmOF2Zlwx-Qal7XaFbqXxm1E=w800", artistName: "Unknown", title: "Draft Poster for Outsiders: An Art Without Precedent or Tradition Symposium, Hayward Gallery", year: null },
          { id: "hayward-gac-33", image: "https://lh3.googleusercontent.com/ci/AL18g_QhwrkpwDGJwdUfq54f8A2xAu_fr0IsNEPCwGVY0FH2iAwjQY2D4a0n0tbuZQpUvCM0jXzURrQ=w800", artistName: "Samuel Fosso", title: "La Bourgeoise", year: "1997" },
          { id: "hayward-gac-35", image: "https://lh3.googleusercontent.com/ci/AL18g_TrCqm6MFedEAbc230VMvd9u3hdjlkFxziCbUXw7vSpQwV_bI5s5jI9KUKc_-0euSFn7UQK-QPZ=w800", artistName: "Unknown", title: "Exhibition Guide for Africa Remix: Contemporary Art of a Continent, Hayward Gallery, 2005", year: null },
          { id: "hayward-gac-36", image: "https://lh3.googleusercontent.com/ci/AL18g_RNyzPg53jYlXB6rABQetd2quLbWGPucGh4igwlkaROPI6dG35D3jJk7KaKx75lFeTe0fGWHA=w800", artistName: "Martin Creed", title: "Work No. 1701", year: "2013" },
          { id: "hayward-gac-41", image: "https://lh3.googleusercontent.com/ci/AL18g_QWwRvRNXiP8LFG_5CaZ1M-GsVWo7Ikwg602ZAVEFDwKWFMyZ1GEK0rwLL_oCG8BQxtTDayClA=w800", artistName: "Unknown", title: "Marketing Leaflet for The Epic and the Everyday: Contemporary Photographic Art, Hayward Gallery", year: null },
          { id: "hayward-gac-42", image: "https://lh3.googleusercontent.com/ci/AL18g_QJdrkpf6JglFTus5209itT3Mn5iQkh065ltUNxDyB_HEi1WSjq9ugOvS3LVjsfckf7Ufjrl0k=w800", artistName: "Unknown", title: "Private View Card for Art in Latin America: The Modern Era, 1820-1980, Hayward Gallery", year: "1989" },
          { id: "hayward-gac-45", image: "https://lh3.googleusercontent.com/ci/AL18g_RSqBFD8Eje9FMAFY2tPpNQe_dOJNQIeXte9wbSr551Sj-z7ZV8-_Ih4VUL-L2khpelXG0DeQ=w800", artistName: "Cyprien Gaillard", title: "Nightlife", year: "2015" },
          { id: "hayward-gac-46", image: "https://lh3.googleusercontent.com/ci/AL18g_Q7KSBlf3e-Mg8nrYsKPoi0YragBLFmOjMWQ0EQQ-rwMakOvV3w3UhRtK4qElENdJWJWwAuZ9E=w800", artistName: "photo: Luciano Romano and Ann Veronica Janssens", title: "Rose (2007), Image coutesy Galleria Alfonso Artiaco", year: "2013" },
          { id: "hayward-gac-47", image: "https://lh3.googleusercontent.com/ci/AL18g_QGkUV0p0KYEZtTvqdTzIeP2-qgzD6KXhmGAVfo8TWQ3gZVDrKiW8GrRgoqjssWfTMpRBK9vkU=w800", artistName: "Unknown", title: "Poster for Africa Remix: Contemporary Art of a Continent, Hayward Gallery, 2005", year: null },
          { id: "hayward-gac-52", image: "https://lh3.googleusercontent.com/ci/AL18g_S_VHvr_97Rfo9y6MtJmRKGMqussfrqUrLEmKK9N-OfVl1nuzw77W2zeTCx7HkhjxCfgOdeyQ=w800", artistName: "Antony Gormley", title: "Blind Light", year: "2007" },
          { id: "hayward-gac-53", image: "https://lh3.googleusercontent.com/ci/AL18g_SfArif31AttfH6JePim8gQk2-eEAD6NijJhWqB2W567zA8BkYenGWMOducXQBu1eT61thN5HVI=w800", artistName: "Unknown", title: "Exhibitions Leaflet for Rhapsodies in Black: Art of the Harlem Renaissance, Hayward Gallery, 1997", year: null },
          { id: "hayward-gac-56", image: "https://lh3.googleusercontent.com/ci/AL18g_TuWoOyNTvqkTVU3mflTGvvx-xOygVl3_10jThV4EQA3xMLWa4iXfw6Ga_Fjo-3kMuHL4Hyt5oF=w800", artistName: "Unknown", title: "Poster for Dayanita Singh Go Away Closer, Hayward Gallery, London, 2013", year: null },
          { id: "hayward-gac-59", image: "https://lh3.googleusercontent.com/ci/AL18g_TH9fjSEM74qzrYalUZIonSXa-axTxC8vYhKBUU4mF9C-jBxXwqKoMYQEiCkozmEfM0Z8VnlMSv=w800", artistName: "Unknown", title: "Exhibition Guide for Ana Mendieta: Traces, Hayward Gallery, 2013", year: null },
          { id: "hayward-gac-62", image: "https://lh3.googleusercontent.com/ci/AL18g_S-2iDSBHjFGV7Itq546C49IYAyIkXv7IbJqhKmT_SetE_eSe-AvAfP6ZK7LWVw0FY58hbGtQ=w800", artistName: "Unknown", title: "Poster for Ana Mendieta: Traces, Hayward Gallery, 2013", year: null },
          { id: "hayward-gac-65", image: "https://lh3.googleusercontent.com/ci/AL18g_TRL7giprfyPgrMR43-wgvPcGIxKT9Sm3bPFl6GqtHhy_-vlBOAWIX3Vhvs-09xkeh9anBH79k=w800", artistName: "David Shrigley", title: "I’m Dead", year: "2010" },
          { id: "hayward-gac-66", image: "https://lh3.googleusercontent.com/ci/AL18g_RNHDw746Q8kJwIWcUQu1PiRXiiaGEBdwbK8_mh8pbHwFXrWJruWx69-gjW53ETYbugCne39jQ=w800", artistName: "Unknown", title: "Jeremy Deller, Valerie's Snack Bar", year: "2008" },
          { id: "hayward-gac-67", image: "https://lh3.googleusercontent.com/ci/AL18g_RYj64IqhpPOtAgMs4-9sEeOYqQI_9osFGuddD-XP-NKAUvLsqteqnQ5gVjKMDA_z6423IF7Ls=w800", artistName: "Unknown", title: "Exhibition Guide for MOVE: Choreographing You, Art and Dance Since the 1960s, Hayward Gallery, 2010", year: null },
          { id: "hayward-gac-72", image: "https://lh3.googleusercontent.com/ci/AL18g_QeAjT2U2hgZGpHA2VEeatPT6txZiGG8DlTMie8Gav5mOIUycLa6ZpfPoKfRtCwZZVrybmJNo8=w800", artistName: "1997-06-21", title: "Press Cutting for Rhapsodies in Black: Art of the Harlem Renaissance, Hayward Gallery, 1997", year: null },
          { id: "hayward-gac-74", image: "https://lh3.googleusercontent.com/ci/AL18g_Sk8rgxnglV0PCeadLQrgG8GP7SVgqK3e5X4yIrQjv33zix6KLjPO7OLpFfeeLpAR8l7I86rA=w800", artistName: "Unknown", title: "Catalogue for Addressing the Century: 100 years of Art and Fashion, Hayward Gallery, 1998", year: null },
          { id: "hayward-gac-75", image: "https://lh3.googleusercontent.com/ci/AL18g_SsYBgZ-6BbAEX3AOlFT2tD5SJHCizv5CURK4hABEr5gubpheqVumRh5SrcEPhC5KIDQOMy20o2=w800", artistName: "Unknown", title: "Private View Card for Bridget Riley: Paintings and Drawings 1951-71, Hayward Gallery", year: null },
          { id: "hayward-gac-76", image: "https://lh3.googleusercontent.com/ci/AL18g_TJTH7FFUGxZHLHiNZ2oL6R5X_7hAShtyvFWs8Rf8gMGGc5wWC3itfqZdH0mjwuA2Hyw46wMA=w800", artistName: "Unknown", title: "Exhibition Guide for Francis Bacon: The Human Body, Hayward Gallery, 1998", year: null },
          { id: "hayward-gac-78", image: "https://lh3.googleusercontent.com/ci/AL18g_RB9HrMjEUOYyCWJp7vMdV5POgV50XXcKZx6b0_BDwx1IW_zK7KtIk3FUsljscpYPNqGSZq7A=w800", artistName: "Unknown", title: "Private View Card for Africa Remix: Contemporary Art of a Continent, Hayward Gallery, 2005", year: null },
          { id: "hayward-gac-79", image: "https://lh3.googleusercontent.com/ci/AL18g_TWgewPWK9C-vRg8xSU-iHwNYEbztjKb0xH0JmgfI7C-v7WFSFPmpyhiDguU3QAoNxSP_9K5Q=w800", artistName: "Unknown", title: "Private View Card for Francis Bacon: The Human Body, Hayward Gallery, 1998", year: null },
          { id: "hayward-gac-80", image: "https://lh3.googleusercontent.com/ci/AL18g_SYqASi7F1c1zjcriATYqKV37a2PzCPAOdLHOwDCTyOpJyqwMenk9s68dEZfrzvWCpbYqly-g=w800", artistName: "Unknown", title: "Catalogue for Doubletake: Collective Memory and Current Art, Hayward Gallery, 1992", year: null },
          { id: "hayward-gac-81", image: "https://lh3.googleusercontent.com/ci/AL18g_Sq-JG2iSsDygub6a59xouhEEyDRJRgMZ9C6wuwawkNXKSd3-ZNDywVuZSfuGsunN8fjYFtBg=w800", artistName: "Unknown", title: "Poster for Art and Power: Europe Under the Dictators 1930-1945, Hayward Gallery", year: null },
          { id: "hayward-gac-82", image: "https://lh3.googleusercontent.com/ci/AL18g_Rw35hsddtuTdcJz2WD4jXGpm00ZXNaSwYuwGxJ7JzM4N7GBzLBQ5uQtY3wkzrqwKqlc-9vR0c=w800", artistName: "Unknown", title: "Poster for Outsiders: An Art Without Precedent, or Tradition Hayward Gallery", year: null },
          { id: "hayward-gac-85", image: "https://lh3.googleusercontent.com/ci/AL18g_Qoj8UNsseXEpSnyil3HYvVOFFsIDoAmFk0z0bpyFrjwKfJQVBBxWIb87ojpFZlHrlGUVY6Td0=w800", artistName: "Unknown", title: "Installation of Tatlin's Tower: Art in Revolution: Soviet Art and Design After 1917, Hayward Gallery", year: null },
          { id: "hayward-gac-86", image: "https://lh3.googleusercontent.com/ci/AL18g_Rh-cFADrzcNrvnje9awtp8_LrYx6rP0G7HD1TvFRqNTzmtqkQPmQZeKKxFfFi1BRn-lR4uIA=w800", artistName: "Unknown", title: "Poster for Francis Bacon: The Human Body, Hayward Gallery, 1998", year: null },
          { id: "hayward-gac-88", image: "https://lh3.googleusercontent.com/ci/AL18g_T2EM-PHEPuoUo2SUkOLnlND26qxaCu7hKrUsOEoCXZy8wFZLWB0eCjQCVoljUIfBaqT6rY8hPS=w800", artistName: "Unknown", title: "Exhibition Guide for Addressing the Century: 100 years of Art and Fashion, Hayward Gallery, 1998", year: null },
          { id: "hayward-gac-91", image: "https://lh3.googleusercontent.com/ci/AL18g_SlUQPffufJ_CGLAcQELi2V1xK4ILeoh1dDc6Er0wIxqWdmFccbCV28oCKK6GVkLsV9ee2xBg=w800", artistName: "Unknown", title: "Catalogue for Undercover Surrealism: Picasso, Miró, Masson and the vision of Georges Bataille, Hayward Gallery, 2006", year: "2006" },
          { id: "hayward-gac-93", image: "https://lh3.googleusercontent.com/ci/AL18g_Ru7WnSqItTyhCwXHU0-jeHYeIOSGV_oRuWz0k-rTC1bKDsjlcDq4Na-FJjUF6qiKzBcFdfnH8=w800", artistName: "Unknown", title: "Catalogue for Dada and Surrealism Reviewed, Hayward Gallery", year: "1978" },
          { id: "hayward-gac-96", image: "https://lh3.googleusercontent.com/ci/AL18g_Rbwse967Kn5WwFv1jg_-87jac24BUqvLyAmaeVQyqvV7iaUtv5YODdJKWyY2_Km3iZL87kgg=w800", artistName: "Unknown", title: "Catalogue for Paul Klee: The Nature of Creation, Hayward Gallery, 2002", year: null },
          { id: "hayward-gac-97", image: "https://lh3.googleusercontent.com/ci/AL18g_RmD2PxJ8CFTXegg7vwTGaPKZ8P15pYCp8Ce9mgF6hj8Fcr417kkVwy122v_oR47QabpJIisBw=w800", artistName: "Unknown", title: "Exhibition Guide for Outsiders: An Art Without Precedent or Tradition, Hayward Gallery", year: null },
          { id: "hayward-gac-98", image: "https://lh3.googleusercontent.com/ci/AL18g_Rk6nYxMkY95NBpa-xdby1vacRYO-zSycfWpusUaoQLSylPkLTiQH5NxCRxV0eJRoTgaixzGA=w800", artistName: "Unknown", title: "Poster for Psycho Buildings: Artists Take On Architecture, Hayward Gallery, 2008", year: null },
          { id: "hayward-gac-99", image: "https://lh3.googleusercontent.com/ci/AL18g_Su3EZ2CExAqxy8LT2Oe3-HqAaQ2YF0AuS7zowihmpw_lsNUUcwbUQk8Bh4jYxKOMSnNyYuqA=w800", artistName: "Sam Taylor-Johnson", title: "The Leap", year: "2001" },
          { id: "hayward-gac-100", image: "https://lh3.googleusercontent.com/ci/AL18g_Qsb_-OqhfwLgUQrHh7A_sc-K0gWl8Q5HTNsM41rG7T2b-ABdhg-gZkl0grAIQtpgzjwBVOAA=w800", artistName: "Unknown", title: "Catalogue for 11 Los Angeles Artists, Hayward Gallery, 1971", year: null },
          { id: "hayward-gac-104", image: "https://lh3.googleusercontent.com/ci/AL18g_Ru86PrEVSnTKlL9m49aEIa68-yUSfhyxuOP5RAVUySmGk4kSYQy53bEZHaJVDEiWxcgwA30A=w800", artistName: "Unknown", title: "Private View Invitation for Martin Creed: What’s the point of it, Hayward Gallery, 2014", year: null },
          { id: "hayward-gac-105", image: "https://lh3.googleusercontent.com/ci/AL18g_SKaSTeMqG5h101Ldr6SYrAYhy6GjF1ZlddFFvji_kRK-Qp6zquGcyG9fOnVDXyCh1cy9RsAwEn=w800", artistName: "Unknown", title: "Diagram of Antony Gormley's Blind Light, Hayward Gallery, 2007", year: null },
          { id: "hayward-gac-108", image: "https://lh3.googleusercontent.com/ci/AL18g_Qi0sb3OJGPe6ZJ5SCda7vek_Zn7bL_52MoUdwWrtmVp3hWaxb3l3EOSJbe7uqzg9A2whavXg=w800", artistName: "Unknown", title: "Floorplan for Light Show at Sharjah Art Foundation, Sharjah (1/2)", year: "2015" },
          { id: "hayward-gac-111", image: "https://lh3.googleusercontent.com/ci/AL18g_St4YAhLzXb0RMeMTfnDIe3yHkjx4XVyQ8MpGfPVc7vgKv92tVoYxKg2qagO_bsZiIku32y-TwI=w800", artistName: "Unknown", title: "Private View Card for Art and Power: Europe Under the Dictators 1930-1945, Hayward Gallery", year: null },
          { id: "hayward-gac-113", image: "https://lh3.googleusercontent.com/ci/AL18g_RqiQ653xFSDaJw59ZdtjBpBbBG2AOV1bGxPDnCv1ituImyDj2Q9Lz-qCw0_9muwLspI0Ak_fwQ=w800", artistName: "Unknown", title: "Catalogue for Art in Latin America: The Modern Era, 1820-1980, Hayward Gallery", year: null },
          { id: "hayward-gac-115", image: "https://lh3.googleusercontent.com/ci/AL18g_Sn8AQPSo5aJT8gZQcCfLO-XLHBzLjE-_BWtiQuSh50D3-Yunq6T0MN5fk8NSKqNIKPH4-2Dp0=w800", artistName: "Pipilotti Rist", title: "I Couldn’t Agree with You More", year: "1999" },
          { id: "hayward-gac-117", image: "https://lh3.googleusercontent.com/ci/AL18g_TTY9y37mXHxL1Ro6jPfAuTITXfNkadSmWfm3PSYzXTEqnfZ0sDjjCHNh1f7u8DYfmu7t1aNQ=w800", artistName: "Unknown", title: "Private View Invitation for Tracey Emin: Love is What You Want, Hayward Gallery, 2011", year: null },
          { id: "hayward-gac-118", image: "https://lh3.googleusercontent.com/ci/AL18g_SCyZ0-t0oBBnojzGuHisfYtgmzePVxdzLsSN_Xjx1hmWNtko_SdNTqu29tiqTGdP9va52F8Kc=w800", artistName: "Unknown", title: "Catalogue for Art and Power: Europe Under the Dictators 1930-1945, Hayward Gallery", year: null },
          { id: "hayward-gac-119", image: "https://lh3.googleusercontent.com/ci/AL18g_QcQODdTm1-v6NROvuBDcdLk5aXbnn1bFpBpTuUrOTXc9ziHqpybpYZkeNzjqbHvZFElKFOpQ=w800", artistName: "Stephan Balkenhol", title: "Figure on a Buoy (1992), Stephan Balkenhol. Doubletake: Collective Memory and Current Art, Hayward Gallery, 1992. Photo: Edward Woodman", year: "1992" },
          { id: "hayward-gac-121", image: "https://lh3.googleusercontent.com/ci/AL18g_SFSOWNyzEDw04ya-rI9ZS2zNYQHxxhS6xlSN-hSKUgvYP__WA7fN6weRIezL2rnvGuNUOQ4ds=w800", artistName: "Unknown", title: "Catalogue for Africa Remix: Contemporary Art of a Continent, Hayward Gallery, 2005", year: null },
          { id: "hayward-gac-122", image: "https://lh3.googleusercontent.com/ci/AL18g_Q5l0Fe9NkiwWqyJvJTPDOEqAMifOVcDdGQguSSYLKPSzr-WEb4S2tLdWh89W6R6lIsmGK0S5Q=w800", artistName: "Unknown", title: "Private View Card for Lucian Freud, Hayward Gallery, 1974", year: null },
          { id: "hayward-gac-123", image: "https://lh3.googleusercontent.com/ci/AL18g_RvtiDa0VUUERmA1UVX5rH59UpGVkYYMfqrV7xvC-0NyuPMm7J7oQBK1XEI_BntmN9ZH5vnxmU=w800", artistName: "Unknown", title: "Poster for Ed Ruscha: 50 Years of Painting, Hayward Gallery, 2009", year: null },
          { id: "hayward-gac-124", image: "https://lh3.googleusercontent.com/ci/AL18g_THpDwgCkPl-i-1TL39UZdqMyNscelt-OAnWS2n6hSvcwfCwT78StMJMoQuS6pBByGHZqDPFw=w800", artistName: "Terry Gilliam", title: "Collage for Monolith of Filing Cabinets' for Spellbound: Art and Film, Hayward Gallery, 1996", year: "1995" },
          { id: "hayward-gac-126", image: "https://lh3.googleusercontent.com/ci/AL18g_QhF0YOHTWSZob2eH_FP8LaakXDcaAThLIhx4lbgxccbZAx5x36seiKODg00ujoZbc7rlwta38=w800", artistName: "Ugo Rondinone", title: "THANX 4 NOTHING", year: "2015" },
          { id: "hayward-gac-129", image: "https://lh3.googleusercontent.com/ci/AL18g_SJX6k2ca1qdyRleTbaLXmtBcXxQdaeAZAml882lALD0K5gXPTRIHGZuTxlaibMF2tM_bvIRCig=w800", artistName: "Unknown", title: "Upper Gallery Plan for Nam June Paik: Video Works 1963-88, Hayward Gallery", year: null },
          { id: "hayward-gac-135", image: "https://lh3.googleusercontent.com/ci/AL18g_Rd7FRKcmbP4RfcR6jcrw_TRnBFYo2LAsj3x2u9XPRZgpHBzcTnq5gMui7zFJZtJlZ6q2Pe=w800", artistName: "Unknown", title: "Exhibition Guide for Jeremy Deller: Joy in People, Hayward Gallery, 2012", year: null },
          { id: "hayward-gac-136", image: "https://lh3.googleusercontent.com/ci/AL18g_Skczq3HC6-OFF6mTANqw7bZPTcGE1uPmFLu9An4KQE0KOtdj6mUZMqULUnwqEeGEHgNHHdU6M=w800", artistName: "Unknown", title: "Exhibition Leaflet for Nam June Paik: Video Works 1963-88, Hayward Gallery", year: null },
          { id: "hayward-gac-137", image: "https://lh3.googleusercontent.com/ci/AL18g_Q9dFRdedNlDTwOZx7-Ws2GFDcAK5TksUlH4edUvvg_RXmlSyhhIWfWs2N8QNcfgyHtqjpSVqc=w800", artistName: "Unknown", title: "Poster for Anthony Caro, Hayward Gallery, 1969. Courtesy of Barford Sculptures Limited", year: null },
          { id: "hayward-gac-139", image: "https://lh3.googleusercontent.com/ci/AL18g_TZH03koNsN8TsJZLXTrA9W5SaBDgh5oFGBw1JVCdcKcX3Qj_DhX7j-jsFm16DsbqpzpPGgFQ=w800", artistName: "Unknown", title: "Poster for Spellbound: Art and Film, Hayward Gallery, 1996", year: null },
          { id: "hayward-gac-140", image: "https://lh3.googleusercontent.com/ci/AL18g_QMIdt5tkzVxCwtW9pTd6bgCxk1IA_40YoCRQCf7-TZRqL2NbAravcz7ssnexxlO1CHRfmxyA=w800", artistName: "Unknown", title: "Press notice for Falls the Shadow: Recent British and European Art, Hayward Gallery", year: null },
          { id: "hayward-gac-141", image: "https://lh3.googleusercontent.com/ci/AL18g_QIrxwr3gVwvKSfgEktGdBy09Trw4MxgvbyCHytQpj5h1dBP6GxBKpr00MqdVb5uCDuUdZFkg=w800", artistName: "Unknown", title: "Catalogue for Lucio Fontana, Hayward Gallery, 1999", year: null },
          { id: "hayward-gac-143", image: "https://lh3.googleusercontent.com/ci/AL18g_Tyh77tRTWVpp908X2T3O-wrR_U6N7URwNwaL7wTKKizeSAgh7YcRmMWrLKX2tFC1XhhiimhVw=w800", artistName: "Unknown", title: "Poster for Art in Revolution: Soviet Art and Design after 1917, Hayward Gallery", year: null },
          { id: "hayward-gac-144", image: "https://lh3.googleusercontent.com/ci/AL18g_RH7dtQRfHZYj_mBT5Loow8dQEgRW_1O5HocCVj-9M35k3xlc2EpyBrvb1BFIw9pKT7Y0Xg_jeY=w800", artistName: "Unknown", title: "Lower Gallery Plan for Nam June Paik: Video Works 1963-88, Hayward Gallery", year: null },
          { id: "hayward-gac-146", image: "https://lh3.googleusercontent.com/ci/AL18g_RKSMQ4E2dutaaY83q2EtGKITtf1simUrmXeI0vjApwAvcxc5Xf2jmuZ0tmY5rY0pDc7jcKT_8=w800", artistName: "Unknown", title: "Private View Card for British Painting '74, Hayward Gallery", year: null },
          { id: "hayward-gac-147", image: "https://lh3.googleusercontent.com/ci/AL18g_RsXgWIt2wbtYVpUB-YmBgc_IawXts2CTSyAHAZSDNE22uZD5muYkvZ3zvTJKh5yoKwc2rwuQ=w800", artistName: "Unknown", title: "Catalogue for Tracey Emin: Love is What You Want, Hayward Gallery, 2011", year: null },
          { id: "hayward-gac-148", image: "https://lh3.googleusercontent.com/ci/AL18g_Quy8aO6NHZMAQzDNoYIoW-sCOMfgIyHNO-lzr2E5aqtI-e9ktn34SJW-nrih49TECSsq3Fyok=w800", artistName: "John McNamee and The Evening News", title: "Press Cutting for Dada and Surrealism Reviewed, Hayward Gallery", year: "1978" },
          { id: "hayward-gac-149", image: "https://lh3.googleusercontent.com/ci/AL18g_RUyRHn6U-yoXjv7i5MxhsBsiOaOWNSbTc2RLbAVJrO0ojJp-gZzX0F_h_5ClktgcmRlL_F9tE=w800", artistName: "Unknown", title: "Catalogue for British Painting '74, Hayward Gallery, 1974", year: null },
          { id: "hayward-gac-150", image: "https://lh3.googleusercontent.com/ci/AL18g_Tnmr1OAUqdktABd8-iQvqLOGL3WamlJZtEIeO2pFC4JK0xDbYXFify5OmY8ekIKVGa1X2-xA=w800", artistName: "Unknown", title: "Catalogue for Tracey Emin: Love is What You Want, Hayward Gallery, 2011", year: null },
          { id: "hayward-gac-155", image: "https://lh3.googleusercontent.com/ci/AL18g_Sv6hm8724BF2FQh6cf9puRGjcadQ82UkBUltgUh-cLxaI46oD6o7cBNF4U37gJjlYdHRxgFN8h=w800", artistName: "Unknown", title: "Exhibition Guide for Dada and Surrealism Reviewed, Hayward Gallery", year: null },
          { id: "hayward-gac-165", image: "https://lh3.googleusercontent.com/ci/AL18g_To8ANhs6saH_QatTxK2Y5AzIvcjf42B0lY39sXIbfQ0tCFZybBJGDVnGq3FfMUwGDXORCYnEI=w800", artistName: "Unknown", title: "Visitors to Light Show at Sharjah Art Foundation in Chromosaturisation (1965-2013) by Carlos Cruz-Diez", year: "2015" },
          { id: "hayward-gac-170", image: "https://lh3.googleusercontent.com/ci/AL18g_TI3xJVA-E2y2kVs7Z1Bixazsr0PphE_3I4whGrXKwxxO7FFKEkT-cDkBU7MNOdiu37FPeHZm8=w800", artistName: "Unknown", title: "Catalogue for The Condition of Sculpture: A Selection of Recent Sculpture by Younger British and Foreign artists, Hayward Gallery", year: null },
          { id: "hayward-gac-171", image: "https://lh3.googleusercontent.com/ci/AL18g_TR__4PyQBKXudJbd_Bc-U2h8MMGXDXyHpg0fIMVG27xb0m_J2awI9JbY2vR-vZEtBVnu88xw=w800", artistName: "Unknown", title: "Queue for Light Show at Hayward Gallery, Southbank Centre", year: "2013" },
          { id: "hayward-gac-174", image: "https://lh3.googleusercontent.com/ci/AL18g_R2HlOiOT54orqWG7vsGmjXbi55IrDsvAFsVEIM9a3ivmTPC0JFUMsy_mvibLidXos-2PEdHh8=w800", artistName: "Unknown", title: "Press Release for Psycho Buildings: Artists Take On Architecture, Hayward Gallery, 2008", year: null },
          { id: "hayward-gac-175", image: "https://lh3.googleusercontent.com/ci/AL18g_REFpaTHVZpnO3_jeGA2DrcMYeCQ8V2ASLc-PBSMm1Afej_XXnD8_f2uOY-2B3l-4I8cuv55RrX=w800", artistName: "Unknown", title: "Exhibition Guide for Paul Klee: The Nature of Creation, Hayward Gallery, 2002", year: null },
          { id: "hayward-gac-177", image: "https://lh3.googleusercontent.com/ci/AL18g_RRBtFnRZMZWXJBc17qOaJLBwboUF--2qg5FNOAeIdNr7UCa-Rebt0gF2_nStt8KfquY5-CEA=w800", artistName: "Martin Creed", title: "Work No. 1092 MOTHERS", year: "2011" },
          { id: "hayward-gac-181", image: "https://lh3.googleusercontent.com/ci/AL18g_Ti4bpZknvEzZM4Waqw2WI5vIeX6WfZOoZVIHf-lgHpUMqqCnKbUuxBCsfY_Q5tl2lRw3pIWQ=w800", artistName: "Unknown", title: "Press Cutting for The Other Story: Afro-Asian Artists in Postwar Britain, Hayward Gallery, 1989", year: "1989" },
          { id: "hayward-gac-182", image: "https://lh3.googleusercontent.com/ci/AL18g_T9uD0MsL_Ruo4XMIJxJMyjSYzP2__v0_Z4IhMRDZ8qyzWPWXbaqVBZR4VGWOhcsTvF8ZKTILc=w800", artistName: "2015-10-01", title: "Muhammad Yusuf, 'Throwing light on light', The Gulf Today (1/2)", year: null },
          { id: "hayward-gac-188", image: "https://lh3.googleusercontent.com/ci/AL18g_SSrcVeWlZcXQC8iJuyyI5ChSuIrQmNNUR6lNDxbBDi3GZnuCRraaOSxHOeKqwvzVRr0_J8DytH=w800", artistName: "Unknown", title: "Installation of Tatlin's Tower: Art in Revolution: Soviet Art and Design After 1917, Hayward Gallery", year: null },
          { id: "hayward-gac-191", image: "https://lh3.googleusercontent.com/ci/AL18g_Tc_Ynzaq6J9ZUONXisqLraje-ttHocgNxcDZW43nI0x6qebRUOmJFHlwuAQHj6rhsakdpI8QE=w800", artistName: "Unknown", title: "Poster for Nam June Paik: Video Works 1963-88, Hayward Gallery", year: null },
          { id: "hayward-gac-193", image: "https://lh3.googleusercontent.com/ci/AL18g_TbGktU9e1WI1w6kSTNs5sB4hZTL5a8L_975UZhNlFm0P8P0Li2_XZ8RThhJ3sq61rzrSKeNGhX=w800", artistName: "Unknown", title: "Private View Invitation for Psycho Buildings: Artists Take On Architecture, Hayward Gallery, 2008", year: null },
          { id: "hayward-gac-195", image: "https://lh3.googleusercontent.com/ci/AL18g_TKfpN0FMiRV6FBUVIzFpO3htRi-5gxDVH28P7HfTV2ZM_LN7WRh9hpeU5vNSZZk_UHqrVld0M=w800", artistName: "Unknown", title: "Catalogue for Kinetics: An International Survey of Kinetic Art, Hayward Gallery, 1970", year: null },
          { id: "hayward-gac-197", image: "https://lh3.googleusercontent.com/ci/AL18g_SABQwXuRRFf9Vd3NQgh-lf2eTpAW7hVBLYKo9JR65Qul5n6Ic_wuuxIASEyGKP61czKhqgLd4=w800", artistName: "Unknown", title: "Exhibition Guide for MOVE: Choreographing You, Art and Dance Since the 1960s, Hayward Gallery, 2010", year: null },
          { id: "hayward-gac-202", image: "https://lh3.googleusercontent.com/ci/AL18g_R4wMbwKZhE2SltgkqHHTm_ryXDVb0EjhE0bppgO_aZS7NHTBmKRs65Ax4fYNT4AUYdmGBNIA=w800", artistName: "Unknown", title: "Poster for The New Art, Hayward Gallery (proof copy)", year: null },
          { id: "hayward-gac-203", image: "https://lh3.googleusercontent.com/ci/AL18g_SUT_NqXsQxSVzLkIjYuoOCvMcTY0Lo1hz91-FGOUewjTs5FbgIzJxYaJ1nQ99X-aS9aK6cfgo=w800", artistName: "Unknown", title: "Private View Card for Undercover Surrealism: Picasso, Miró, Masson and the vision of Georges Bataille, Hayward Gallery, 2006", year: null },
          { id: "hayward-gac-204", image: "https://lh3.googleusercontent.com/ci/AL18g_RBRZclwQ4V91XheKG9tpVmGedd1cFDBjQcN72vVR3HtWlSlfFpcHJZIgD-dgUxI-x9GHrtppU=w800", artistName: "Aldo Rossi", title: "Reading Room, Aldo Rossi. Doubletake: Collective Memory and Current Art, Hayward Gallery, 1992. Photo: Edward Woodman", year: "1992" },
          { id: "hayward-gac-206", image: "https://lh3.googleusercontent.com/ci/AL18g_SnxHjGfm0osv_JTrIklWp1in-uugg3Qq6mvyul9ESTRvtszE0FWSdjt-kTDQfgZV29LGBDksQ=w800", artistName: "Unknown", title: "Queues at Light Show, Musuem of Contemporary Art Australia", year: "2014" },
          { id: "hayward-gac-212", image: "https://lh3.googleusercontent.com/ci/AL18g_Qo1msfEbGSMnm5x2t5EWnsKyJYqtrvO-s3ht1HaddurDwUXMxkfeHzx_a6uxSPc0gugsYT3Q=w800", artistName: "Iván Navarro", title: "The Hayward Fence (2013), Installtion view: Light Show, Hayward Gallery, 2013. Photo: Marcus J Leith", year: "2013" },
          { id: "hayward-gac-221", image: "https://lh3.googleusercontent.com/ci/AL18g_QiFvGDBR8oaj6BU4CVaUUj-TZKqyyxVWVfNz9eBicwKQrOedA41G-roJGR2NPdI1ZMQYNOKw=w800", artistName: "Unknown", title: "Installation of Tatlin's Tower: Art in Revolution: Soviet Art and Design After 1917, Hayward Gallery", year: null },
          { id: "hayward-gac-228", image: "https://lh3.googleusercontent.com/ci/AL18g_S0eAKF8cizw5SadzFXFtg99S5YSdKwp0JInYjGMhHkTfRdP12bPnCWlbrVdb9DlOnrbDMpZg=w800", artistName: "Unknown", title: "Juliet Fraser performing in front of S=U=P=E=R=S=T=R=U=C=T=U=R=E (2010) by Cerith Wyn Evans, as part of Harmonic Series at Light Show, Hayward Gallery", year: "2013" },
          { id: "hayward-gac-229", image: "https://lh3.googleusercontent.com/ci/AL18g_Qapu1_eIPOkEsd7jgSyuvVhFYudapb-hnTh2GgwBmmk8B2FDZoBfxZByPu-vbBKVZ5pDGomg=w800", artistName: "Unknown", title: "Mimi Khalvati with Model for a timeless garden (2011) by Olafur Eliasson during Poets After Dark, Light Show, Hayward Gallery, 2013. Photo: Marcus J Leith", year: "2013" },
          { id: "hayward-gac-232", image: "https://lh3.googleusercontent.com/ci/AL18g_QU0BoWKrZNKilJ3JemSymPCzM4UpOQE43u8byom9xH8CQ0IE_jKsKf1k5nrwafyEo3v0tf2020=w800", artistName: "Penny Slinger", title: "Perspective", year: "1977" },
          { id: "hayward-gac-233", image: "https://lh3.googleusercontent.com/ci/AL18g_TftkU5Gplk-b5PGApBnx0GR_lRtpvIlHw6LrnUGgmXQiiyGnm1fPnqWCWdJynBFU-zBX59Uk0s=w800", artistName: "Unknown", title: "Installation of Tatlin's Tower: Art in Revolution: Soviet Art and Design After 1917, Hayward Gallery", year: null },
          { id: "hayward-gac-235", image: "https://lh3.googleusercontent.com/ci/AL18g_RVPPNulo6rPpa-QDf728FyEJmnzdXidguLKq0o2HvjluCi3xc0AGP6rNYuXmb5wqlowaTZPow=w800", artistName: "Unknown", title: "Talks and Events Leaflet for Gravity and Grace: The Changing Condition of Sculpture 1965-75, Hayward Gallery", year: null },
          { id: "hayward-gac-242", image: "https://lh3.googleusercontent.com/ci/AL18g_S0UmS8rMdgOntK27RW2leH9Ei8MK8quEbPvMicfhzDYc0InumNOEUOqVQ_QPl1rkT0tDqCmLo=w800", artistName: "Mimi Khalvati", title: "Model for a Timeless Garden, after Olafur Eliasson", year: "2013" },
          { id: "hayward-gac-244", image: "https://lh3.googleusercontent.com/ci/AL18g_THOPCj-Jdp1GWSCTOUWNFLXFQfe3-KwpU1Pq8gDJ3TvYh3JZsoBfSSn_XR61JSR7gqkzLKRuI=w800", artistName: "Unknown", title: "Installation of Tatlin's Tower: Art in Revolution: Soviet Art and Design After 1917, Hayward Gallery", year: null },
          { id: "hayward-gac-245", image: "https://lh3.googleusercontent.com/ci/AL18g_TaktxlvroGBoajIDbKfhvA9H7CO1ZlP6odIgQ1JSwTXkH8AhamAdm6XlosxCpb46ntm8RKgtug=w800", artistName: "Unknown", title: "Exhibition Guide for Kinetics: An International Survey of Kinetic Art, Hayward Gallery", year: null },
          { id: "hayward-gac-246", image: "https://lh3.googleusercontent.com/ci/AL18g_QCZhupgREzt_juE3Hh9GDoq4XOvJiVsDVo0NKFCJlUNzGh0QhRfLbTzCFEdtWpKsTqkacm9ZU=w800", artistName: "Unknown", title: "Press Cutting for The Other Story: Afro-Asian Artists in Postwar Britain, Hayward Gallery, 1989", year: null },
          { id: "hayward-gac-253", image: "https://lh3.googleusercontent.com/ci/AL18g_SXYRseKm87Q6PRlf25SE8D7zyb3kbBI-bw-O-BxpTZrPPggHVH-fICJGA7A3PCoipIqVnekWo=w800", artistName: "Unknown", title: "Catalogue for Spellbound: Art and Film, Hayward Gallery, 1996", year: "1996" },
          { id: "hayward-gac-256", image: "https://lh3.googleusercontent.com/ci/AL18g_SKmUGXXae1vLSiNTsf3ctcUpLSgAn-AWlIbVw2uT-usPqLnzYFBU4QK3DHDQGi3DEelgSEgMEC=w800", artistName: "Iván Navarro", title: "Preparatory sketch for The Hayward Fence", year: "2012" },
          { id: "hayward-gac-258", image: "https://lh3.googleusercontent.com/ci/AL18g_QCwSQxuBHWccTetQlXN5sK4v5ssvvJaK-qX9J3BfmBolSgjtHfy1CTra2gNjFmu3dcZldlrQ=w800", artistName: "Unknown", title: "Installation of Anthony McCall, You and I, Horizontal", year: "2013" },
          { id: "hayward-gac-262", image: "https://lh3.googleusercontent.com/ci/AL18g_TPbmoi10v2QK__ALQ7iLFnXMxeUTTMiJTkG8oKP-T-YN6pIPuUpqqsDhVmZPtnxb-7ziy6a24=w800", artistName: "Stan Douglas", title: "Luanda-Kinshasa", year: "2013" },
          { id: "hayward-gac-264", image: "https://lh3.googleusercontent.com/ci/AL18g_RqRMkw3VWfwg1o9cr1XAq_5HvIPwJfiXBgoFW4ag-23QB9GWQUDKUG95eaXamcAPv9kGaHdp0=w800", artistName: "Unknown", title: "Postcard Produced for Dada and Surrealism Reviewed, Hayward Gallery", year: null },
          { id: "hayward-gac-268", image: "https://lh3.googleusercontent.com/ci/AL18g_Rh5OTu3kPAn2jkveP8pDljs2z_7X-V91xXepRwt71c9aEdlf8cSZrg6gAsvhbdAgzpXcpdJEI=w800", artistName: "Unknown", title: "Draft Poster for Art in Latin America: The Modern Era, 1820-1980, Hayward Gallery", year: null },
          { id: "hayward-gac-270", image: "https://lh3.googleusercontent.com/ci/AL18g_Qfmwii4REj2qH_mm2AiyBcpk6vU90_TM97VY_PqHQEGhAHWNNjLkirV4GNBAjqH5iKB-gBLA=w800", artistName: "Unknown", title: "Exhibition Guide for The Other Story: Afro-Asian Artists in Postwar Britain, Hayward Gallery, 1989", year: null },
          { id: "hayward-gac-271", image: "https://lh3.googleusercontent.com/ci/AL18g_TbKga-UmAOs4R3hKN3VqQBC2qpl0eXQEIO1-SlUvswGqLQMtNuXS3cqUi2xCtCpafHS43hdA=w800", artistName: "Unknown", title: "Catalogue for Outsiders: An Art Without Precedent, or Tradition Hayward Gallery", year: null },
          { id: "hayward-gac-277", image: "https://lh3.googleusercontent.com/ci/AL18g_S7IFZ7WDMrH_wwX5EPSbKqIJUL4YaoeVpadUywkGZA7xLyXBc8Fk-EzSI4OjfBLIMvb4LMuLT2=w800", artistName: "Unknown", title: "Catalogue for Art in Revolution: Soviet Art and Design after 1917, Hayward Gallery", year: null },
          { id: "hayward-gac-280", image: "https://lh3.googleusercontent.com/ci/AL18g_TbS9GNuLZ6ITG0RSTg7ocdW8yaFbT82Ygh7CA8mV6WtohNzBIBHckRtZYQPPxYVkiQVC3iZk4=w800", artistName: "Unknown", title: "Flyer for Le Corbusier: Architect of the Century, Hayward Gallery", year: null },
          { id: "hayward-gac-283", image: "https://lh3.googleusercontent.com/ci/AL18g_SzgzM95aCZMo6MZKS_1Frg6qCcfmZR5Rg6YsKvU_7vX3Soh2fD4FfuXdhO6uJWnge5GalyHxqc=w800", artistName: "Unknown", title: "Talks and Events Leaflet for Art and Power: Europe Under the Dictators 1930-1945, Hayward Gallery", year: null },
          { id: "hayward-gac-284", image: "https://lh3.googleusercontent.com/ci/AL18g_TkRHJ8C9Q4NqkC6-cB5oXDU9pdSks9MiSgMLQxxeYm4nr4-BUIyBd-uEJmCyQZXtebVcIYbQ=w800", artistName: "Unknown", title: "Tamar Yoseloff and Vahni Capildeo performing during Poets After Dark, Light Show, Hayward Gallery. Photo: Marcus J Leith", year: null },
          { id: "hayward-gac-290", image: "https://lh3.googleusercontent.com/ci/AL18g_TswSU21UTdTFzdBFdlJ4vzdXOTrT-s-NSgIy23Vit-7bkAhclCCBTQMaLg_kKLOflkUjGBWrg=w800", artistName: "Unknown", title: "Private View Card for Addressing the Century: 100 years of Art and Fashion, Hayward Gallery, 1998", year: null },
          { id: "hayward-gac-295", image: "https://lh3.googleusercontent.com/ci/AL18g_TlyKSUVHElvZdb629nVe8zqLj2gPkdT3SziJycgwRwf5gNoipgfx_JtSpFJ70rpYs76V67Aw=w800", artistName: "Ernesto Neto", title: "heartcircleprototemple...bum!", year: "2010" },
          { id: "hayward-gac-299", image: "https://lh3.googleusercontent.com/ci/AL18g_RZtfwTUOVEV3C7bFxdm-CxpqTablDggF2qdJRjzHE_sipIRf8EcEpogHtXzdHUBnSJzw-RbKP0=w800", artistName: "Unknown", title: "Poster for Paul Klee: The Nature of Creation, Hayward Gallery, 2002", year: null },
          { id: "hayward-gac-300", image: "https://lh3.googleusercontent.com/ci/AL18g_SkfSxQK7oFf4l0VribGAkNUpcyomQ5IGdY17JwXGhLWhz-aPOVOpbzHVVgQAlmXQAUgYLhqws=w800", artistName: "Unknown", title: "Alternative design for Iván Navarro's The Hayward Fence", year: "2012" },
          { id: "hayward-gac-302", image: "https://lh3.googleusercontent.com/ci/AL18g_TkzvKCiTmukw_Vj3QXBy-1MIur20LuToho8LL0wUe4Z9rMqc_Vi7Uu3nmH7RgkeKeLjGlR7CKi=w800", artistName: "Unknown", title: "Poster for Psycho Buildings: Artists Take On Architecture, Hayward Gallery, 2008", year: null },
          { id: "hayward-gac-304", image: "https://lh3.googleusercontent.com/ci/AL18g_TcNcsLo_o4pg0vZWt-IzjZiqjn6HceUlHW9G7B33HHqlwa7bYqQmv0XAAKSb2vSfyaRiE2-sQ=w800", artistName: "Unknown", title: "Installation of Tatlin's Tower: Art in Revolution: Soviet Art and Design After 1917, Hayward Gallery", year: null },
          { id: "hayward-gac-305", image: "https://lh3.googleusercontent.com/ci/AL18g_SziG_SefUOQSagDoVixnadUnA0pRSYkxa_B63r28gFTSrM7BTvW6QAO0P18m7SQVZUYykdCUys=w800", artistName: "Unknown", title: "Exhibition Guide for Falls the Shadow: Recent British and European Art, Hayward Gallery", year: null },
          { id: "hayward-gac-306", image: "https://lh3.googleusercontent.com/ci/AL18g_QYG7paBeGQ81zKXAYe5tvPjzcpk5BBOZoNBLepUJLYYPLUovNScXcw8Iygr9wYmp6dxvIDymk=w800", artistName: "Unknown", title: "Installation of Tatlin's Tower: Art in Revolution: Soviet Art and Design After 1917, Hayward Gallery", year: null },
          { id: "hayward-gac-310", image: "https://lh3.googleusercontent.com/ci/AL18g_RKJt2ToqjjkwvahWZvg9WKNbc0ZyUcU6jz3noc0v13yyUTk2i_2WW7_SBp8GMhcrl7OqLs6A=w800", artistName: "Unknown", title: "Catalogue for How To Play the Environment Game, Hayward Gallery, 1973", year: null },
          { id: "hayward-gac-311", image: "https://lh3.googleusercontent.com/ci/AL18g_TiQeHGKvXGSTPMIezxS7YojUALytre3JDGr4KgmXaFmd2zwo9_xcY9SmWIDmAgXSgD2r2l6w=w800", artistName: "Boyd Webb", title: "Boyd Webb, Untitled (1992). Doubletake: Collective Memory and Current Art, Hayward Gallery, 1992. Photo: Edward Woodman", year: "1992" },
          { id: "hayward-gac-316", image: "https://lh3.googleusercontent.com/ci/AL18g_R3KCxVTD0EoxbsicfP33qZDI61LNbWtsr3i81FJSFBZNfoHxg4WkrkMbEyVyxOr_CNxyQ9nSc=w800", artistName: "Unknown", title: "Polaroids of Stephan Balkenhol’s Figure on a Buoy (1992), Doubletake: Collective Memory and Current Art, Hayward Gallery, 1992", year: null },
          { id: "hayward-gac-320", image: "https://lh3.googleusercontent.com/ci/AL18g_T-nabLpZ2rSxl1kyZChKP--m0lqtW-yBqsu9pYuFawsK5hjz5fPu3PqAh_AKG0e9VlUglmakGp=w800", artistName: "Unknown", title: "Fluorescent tube used in Brigitte Kowanz's Light Steps (1990/2013)", year: null },
          { id: "hayward-gac-325", image: "https://lh3.googleusercontent.com/ci/AL18g_SbeqaqgaN3cSZ62H1Fm-GCzrO1e516VBO_HizXoCayi2TwgZbNyLgW4U1oq8QdVGm2ZU9cCtc=w800", artistName: "Various", title: "Press Cutting for Hayward Annual 78, Hayward Gallery", year: "1978" },
          { id: "hayward-gac-327", image: "https://lh3.googleusercontent.com/ci/AL18g_SKQs41RrcHSUG_mqQ0j_-o3422MrVhC2stXHmV04VhQriBBVXRJSwdesoZJSm156Z2njnHgSk=w800", artistName: "Unknown", title: "Exhibition Guide for Richard Long: Walking in Circles: Hayward Gallery", year: null },
          { id: "hayward-gac-339", image: "https://lh3.googleusercontent.com/ci/AL18g_RJ52j9xhmYU9NqoXulSKGgkklHw24DSJyh6ceL7Yb6F2XIGT8E-dms8vOqYAKC0wDuZTwr3mvR=w800", artistName: "Unknown", title: "Poster for Gravity and Grace: The Changing Condition of Sculpture 1965-75, Hayward Gallery", year: null },
          { id: "hayward-gac-342", image: "https://lh3.googleusercontent.com/ci/AL18g_RVktaKRMOqXx4ZmmoTqKaabecRSZkqzJcRbsCXqjcA5odWST1tGrAC5mfYwmkmMVv1E57bh-s=w800", artistName: "Unknown", title: "Poster for Psycho Buildings: Artists Take On Architecture, Hayward Gallery, 2008", year: null },
          { id: "hayward-gac-346", image: "https://lh3.googleusercontent.com/ci/AL18g_T9WQacQagCRQ0Am-Cwuui79JDjYom1947-FpXihUxMkqGsQa02Q0BQapSIsj6R-ISgZFHVsLPn=w800", artistName: "Unknown", title: "Hand-drawn Scale Diagram of 'Montage Wall' in Dada and Surrealism Reviewed, Hayward Gallery", year: null },
          { id: "hayward-gac-360", image: "https://lh3.googleusercontent.com/ci/AL18g_TfCl2I0OfCja5y6usxx062NBbRx9hWWLAi8M7nyRGhfwvkRdHmc6vWUeKSQIkAx6FpQ3SWMgY5=w800", artistName: "1997-06-29", title: "Press Cutting for Rhapsodies in Black: Art of the Harlem Renaissance, Hayward Gallery, 1997", year: null },
          { id: "hayward-gac-362", image: "https://lh3.googleusercontent.com/ci/AL18g_QMZ1dqUCWEhKHTziFWp5YWD1DRdQDPn7oNImW0J9SIQ4urGRJ_-vS23686CWSSZ1ABuPvfPww=w800", artistName: "Unknown", title: "Alternative design for Iván Navarro's The Hayward Fence", year: null },
          { id: "hayward-gac-364", image: "https://lh3.googleusercontent.com/ci/AL18g_Ru5uMn7FR5Ymvb__woTGZRe-5YpVAoWayPcdRQ3BvemEWwSruUlFkf8Ih-4BOP9wuBAAo9wQ=w800", artistName: "Unknown", title: "Invitation to Special Preview of Light Show, Hayward Gallery", year: "2013" },
          { id: "hayward-gac-365", image: "https://lh3.googleusercontent.com/ci/AL18g_QMHMlpu0bOOP9VbqI4OYMn-J9XLUQTNSYpA0STkgxexS-n0VWkhvTHY6FEFqnF_zYuGgPQPAc_=w800", artistName: "Unknown", title: "Private View Card for 11 Los Angeles Artists, Hayward Gallery", year: null },
          { id: "hayward-gac-369", image: "https://lh3.googleusercontent.com/ci/AL18g_QoHWhTN6cZ0QOv3NlB_AYcHMRhXgoiLaqQxAl9rlyr-RatSrHgTI_OYs7Nss6zBkXE9srvCuft=w800", artistName: "Unknown", title: "Exhibition Guide for MOVE: Choreographing You, Art and Dance Since the 1960s, Hayward Gallery, 2010", year: null },
          { id: "hayward-gac-370", image: "https://lh3.googleusercontent.com/ci/AL18g_Qgzjiw77VlAdx1Ucv-VS9IrqjPbHHd8wCYMeSotAHdmmYK3tdE2FURTKu5BVR1MeRf_HeWBVdl=w800", artistName: "Unknown", title: "Technical diagram for Iván Navarro's The Hayward Fence", year: "2012" },
          { id: "hayward-gac-372", image: "https://lh3.googleusercontent.com/ci/AL18g_TEKHUKrdwcJwnSuDxCpSLNF8ShCkoNLZpT825OqMlDLrNW-0m_ectJQQowXnbvuGTvZyC1zP8=w800", artistName: "Unknown", title: "Freesheet produced for Poets After Dark, Light Show, Hayward Gallery (2/2)", year: "2013" },
          { id: "hayward-gac-380", image: "https://lh3.googleusercontent.com/ci/AL18g_SG9IkNgGa3OuC_doc1jwU1HjMy0UgIMXAp0mcIECWKZlhcjSGiZkoij6yf43JfLED3AUFeIeN_=w800", artistName: "Unknown", title: "Exhibition Guide for Antony Gormley: Blind Light, Hayward Gallery, 2007", year: null },
          { id: "hayward-gac-381", image: "https://lh3.googleusercontent.com/ci/AL18g_RZpR9t3OkYLQfftEezPpaxjmy3dFpRuHLsgy2O_gUjTjM4FTM6Yrb7bV7VNX1yMvIwmBsxrUg=w800", artistName: "Unknown", title: "Southbank Walk Guide for Doubletake: Collective Memory and Current Art, Hayward Gallery, 1992", year: null },
          { id: "hayward-gac-383", image: "https://lh3.googleusercontent.com/ci/AL18g_TbTpIO1nAGca6VbJ68HXYa-AARvj4i2pDX5gqHEKN8RE0fWac55LjNBT9ajF6wu4pUiZvYxw=w800", artistName: "Unknown", title: "Press Cutting for Richard Long: Walking in Circles, Hayward Gallery", year: "1991" },
          { id: "hayward-gac-394", image: "https://lh3.googleusercontent.com/ci/AL18g_Q_n2gfHyilZfJIy4Z_ysF-Z42Gc0D261T98KBd_FAz_HauuKorCFANDB2gbkqLcEmk-4lQ6g=w800", artistName: "Unknown", title: "Press release for Tracey Emin: Love is What You Want, Hayward Gallery, 2011\n\nPage 1", year: null },
          { id: "hayward-gac-396", image: "https://lh3.googleusercontent.com/ci/AL18g_RkLzsvcWAwGy38OQ8Ct2JgbKmqAP8DDCNafgkm2OMPQB-XjtBYmjQ97gUHPMSocjwka6eX1g=w800", artistName: "Unknown", title: "Press Cutting for Richard Long: Walking in Circles, Hayward Gallery", year: "1991" },
          { id: "hayward-gac-399", image: "https://lh3.googleusercontent.com/ci/AL18g_R2YEl4cby-8046keXbK4qr95xV5EWMwf_w3KzN1r9KcqxKw23Q5_4iIxFg7cIW2J3tuHF79Q=w800", artistName: "Unknown", title: "Notes on a Meeting with James Turrell", year: null },
          { id: "hayward-gac-406", image: "https://lh3.googleusercontent.com/ci/AL18g_RWnA4JXFcoOwthJxJ9Oao2FZ1IU02BfGfo5ASewm5KLiZsWVwiZwrJ-2ZEIbPDcH_j9FNeZxw=w800", artistName: "Unknown", title: "Nancy Holt's Holes of Light (1973) being installed in Hayward Gallery", year: "2013" },
          { id: "hayward-gac-412", image: "https://lh3.googleusercontent.com/ci/AL18g_Rtc7p2bSoSqV577ptGD4qNH9NGpk8x5lLzR--dMtGYVzl69HEnOyVQIxxrlf3CIjRFfBzJXpGh=w800", artistName: "Unknown", title: "Private View Card for Paul Klee: The Nature of Creation, Hayward Gallery, 2002", year: null },
          { id: "hayward-gac-414", image: "https://lh3.googleusercontent.com/ci/AL18g_TbKw0jB7JJLxp8fZfniV0P1ZZCws4EyeH4dh6QqO8bV-TdyC1eL4z7BeUu5uQsj2YZG6aXckrx=w800", artistName: "Unknown", title: "Nancy Holt's Holes of Light (1973) being installed in Hayward Gallery", year: null },
          { id: "hayward-gac-417", image: "https://lh3.googleusercontent.com/ci/AL18g_SMbMWTLVCwMkjKRHYRDQsBahP7MMf8A25pu3i2JLvcvau7O2kkRniDtXU8tNFQ07vKWSKeYgE=w800", artistName: "1998-02-08", title: "Press Cutting for Francis Bacon: The Human Body, Hayward Gallery, 1998", year: null },
          { id: "hayward-gac-421", image: "https://lh3.googleusercontent.com/ci/AL18g_TS0zRsGVmTa1ja8_VyXZ5KFFCHqTSvaBfTzJjzz6MvhMvkuw5pIP283eBIDGw4RfrPvxvDeFjq=w800", artistName: "Unknown", title: "Events Flyer for Martin Creed: What’s the point of it, Hayward Gallery, 2014", year: null },
          { id: "hayward-gac-422", image: "https://lh3.googleusercontent.com/ci/AL18g_QEQMhID3mW7V6wuLVfPwjpbr4EaeKnBj-4-NBxitT_Z24TGE6uPydxnGn1tVXkFzHm8k4-yw=w800", artistName: "Michael Shepherd and The Sunday Telegraph", title: "Press Cutting for Lucian Freud, Hayward Gallery, 1974", year: "1974" },
          { id: "hayward-gac-427", image: "https://lh3.googleusercontent.com/ci/AL18g_Tvq0FH_Ynl1g2C93aWU0zYvxmAm-Vmv4UlKhIqAuRqFkeHs-QYFX-wdpkeQx5iNDeKTfNa-tg=w800", artistName: "Unknown", title: "Press Cutting for Doubletake: Collective Memory and Current Art, Hayward Gallery, 1992", year: null },
          { id: "hayward-gac-430", image: "https://lh3.googleusercontent.com/ci/AL18g_Rs3fAu99EbV4LhtiraNB9i5CXf4eS3ZvekIWfec_V8_7QUK4NT9bdCKy9AwuFtPSBjfW7D=w800", artistName: "Unknown", title: "Press Cutting for Richard Long: Walking in Circles, Hayward Gallery", year: "1991" },
          { id: "hayward-gac-439", image: "https://lh3.googleusercontent.com/ci/AL18g_RwEjjFVASh-zh5IEaAKJwwE4m1CkojCX-jWepuNNmwIH3RE_evyg8bYm3M-iYvPCuUXbS6rLH9=w800", artistName: "Unknown", title: "Press Cuttings for Henri Matisse: 1869-1954: A Retrospective Exhibition, Hayward Gallery", year: "1968" },
          { id: "hayward-gac-440", image: "https://lh3.googleusercontent.com/ci/AL18g_RJRAjED3s4_h1-sVIAert4r3hIA6voZipzjp9wS5IZae5W3oYjncyIeO9ZIecgdvKp6QTIhe_D=w800", artistName: "Unknown", title: "Oliver Coates performing in Holes of Light (1973) by Nancy Holt, as part of Harmonic Series at Light Show, Hayward Gallery", year: "2013" },
          { id: "hayward-gac-446", image: "https://lh3.googleusercontent.com/ci/AL18g_T-CsiS_z7b-5fIH9Z1qmAPhVdiepWhMD0t7RF98OxL5BdSvHhAsS3uOaHoW-I4Pd42IU33hso=w800", artistName: "Unknown", title: "Catalogue for Richard Long: Walking in Circles, Hayward Gallery", year: null },
          { id: "hayward-gac-449", image: "https://lh3.googleusercontent.com/ci/AL18g_SMg727N5D7dlUnzITxdAGOkX-daNxaS1yP2RBOPN3UPORa1rE5ri_3_lFldIfOlBDOTYIRD4Y=w800", artistName: "Unknown", title: "Lower Gallery Plans for Ed Ruscha: 50 Years of Painting, Hayward Gallery, 2009", year: null },
          { id: "hayward-gac-450", image: "https://lh3.googleusercontent.com/ci/AL18g_SaNXTgaBE7mYYbkCdEqqM6ntXR7Efw7Brg-Og0gZ0ogeGkLIGMmSajIah1BibcVeB2HVNVKgc=w800", artistName: "Unknown", title: "Marketing Leaflet for Addressing the Century: 100 years of Art and Fashion, Hayward Gallery, 1998", year: null },
          { id: "hayward-gac-454", image: "https://lh3.googleusercontent.com/ci/AL18g_RPACqSMlJskag_wPOEyn8imoS8hHviYBJ0XX0qq0g7zcT7_Pp_h3nvLjv7O1JIWuyXO7m7fnrO=w800", artistName: "Unknown", title: "Press Cutting for Dada and Surrealism Reviewed, Hayward Gallery", year: "1978" },
          { id: "hayward-gac-457", image: "https://lh3.googleusercontent.com/ci/AL18g_TCeBtO-ak3gvGdZEDbOtxS3JwkJWo-GhPxTiR-eLZzz4M71fix1Q4Bi4yabwGgDgEp0Oju0QU=w800", artistName: "Unknown", title: "Sketch of Terry Gilliam’s 'Monolith of Filing Cabinets', part of Spellbound: Art and Film, Hayward Gallery, 1996", year: null },
          { id: "hayward-gac-459", image: "https://lh3.googleusercontent.com/ci/AL18g_S3yS_EM6FsqK7bQ74kDtLwyhsJQ8-0Rr7TKbtj3d4qTIVVizUCxkCYIG6cOUW8T640WCNVvFOY=w800", artistName: "Unknown", title: "SketchUp diagram for Nancy Holt's Holes of Light (1973)", year: null },
          { id: "hayward-gac-463", image: "https://lh3.googleusercontent.com/ci/AL18g_Qo41nX7Ejdta1ZimZ-fDIQe2a_RITQPsP1_rhhVMQuE3sNJI_5W6MUs5oOkldM1IipGupNinI=w800", artistName: "Unknown", title: "Exhibition Guide for Anish Kapoor, Hayward Gallery, 1998", year: null },
          { id: "hayward-gac-464", image: "https://lh3.googleusercontent.com/ci/AL18g_QhQ1dpgzn_m1Fna_qNpsdafIWfK0Rc0ypb5GUG8WhYw_I8aJ5Z1gKB_c7jYqxXds7y4D5Kzg=w800", artistName: "Ugo Rondinone", title: "THANX 4 NOTHING", year: "2015" },
          { id: "hayward-gac-472", image: "https://lh3.googleusercontent.com/ci/AL18g_StvabAc7lFQRhVExiBUP7hjoYLsSMab6rjFKWOa8Qg722L6u4Ke6HAYSv1-AVay2WY-L62SKY=w800", artistName: "Unknown", title: "Catalogue for Le Corbusier: Architect of the Century, Hayward Gallery", year: "1987" },
          { id: "hayward-gac-475", image: "https://lh3.googleusercontent.com/ci/AL18g_Tqp2b1qCAR9lgHJqdL6MeVBD8h14aGy9ADMAXA1sLpUOia_CLk0Ll6RSIUkwW4ExUtSZOWNVb7=w800", artistName: "Unknown", title: "Private View Card for Sonic Boom: The Art of Sound, Hayward Gallery, 2000", year: null },
          { id: "hayward-gac-477", image: "https://lh3.googleusercontent.com/ci/AL18g_TUI4FYFbZYdLnGafS9OMMkKiQ0VcyUwjcQ5uIA_ZJXeS9rBRUPAOm8w2bHi5nEoa19QL-nvg=w800", artistName: "Unknown", title: "Press Cuttings for Henri Matisse: 1869-1954: A Retrospective Exhibition, Hayward Gallery", year: "1968" },
          { id: "hayward-gac-487", image: "https://lh3.googleusercontent.com/ci/AL18g_TAHEZCMNea431TV4mo30PQe2Y7PDjqcyQqiZ2Q01bLVVL_Bms66bXMfthRsJxNtB9szI12Yg=w800", artistName: "Margaret Richards and Arts Review", title: "Press Cutting for Hayward Annual 78, Hayward Gallery", year: "1978" },
          { id: "hayward-gac-489", image: "https://lh3.googleusercontent.com/ci/AL18g_QWpVkG2cfC4K3p_L7UjJFEJ_QCAy1sCobbHvo_Xr2qvOk7gPSn7PrtMUVYw_ipa_rtL1V_HM5J=w800", artistName: "Unknown", title: "Gallery Plan for Le Corbusier: Architect of the Century, Hayward Gallery", year: null },
          { id: "hayward-gac-490", image: "https://lh3.googleusercontent.com/ci/AL18g_REzXGeA4w3_oaDjNBTmUhBncZsgq8u2gXxtFYAFx17-BFTP6UXur1D1n7Ua76Tz8Po17Tcnnvb=w800", artistName: "Unknown", title: "Press Release for Psycho Buildings: Artists Take On Architecture, Hayward Gallery, 2008", year: null },
          { id: "hayward-gac-491", image: "https://lh3.googleusercontent.com/ci/AL18g_QIwJEkG3myr0v2L0mhmeZenL7KNPpm3jvEvwgUEMXs2zhJRhOea7OImEz6KKBHPNV6Fq-r3A=w800", artistName: "Unknown", title: "Press Cutting for Richard Long: Walking in Circles, Hayward Gallery", year: "1991" },
          { id: "hayward-gac-500", image: "https://lh3.googleusercontent.com/ci/AL18g_RRot4q837E6OhcJ1vB-5OaHMAgTjDiviDwy68BG0Hcumq-QAenNejwCcuwqYaQrTEE0P9ipQ=w800", artistName: "Unknown", title: "Technical diagram for Iván Navarro's The Hayward Fence", year: null },
          { id: "hayward-gac-502", image: "https://lh3.googleusercontent.com/ci/AL18g_QmdAb7YatK1oTCc6ePrkxESHsRGkhMJ0R9yWj6QR3ywb8QCTBF-Go8sGoqE7kd8GwTQevj2Uw=w800", artistName: "Unknown", title: "Marketing Leaflet for Tracey Emin: Love is What You Want, Hayward Gallery, 2011", year: null },
          { id: "hayward-gac-503", image: "https://lh3.googleusercontent.com/ci/AL18g_RUZ5Sd2z3jWPMjEcWCplxZNd2FjauiJBCPABTB-Venvg11OSJ15w67emm6jCg-YYkWleyWPA=w800", artistName: "Michael Shepherd and Sunday Telegraph", title: "Press Cutting for Le Corbusier: Architect of the Century, Hayward Gallery", year: "1987" },
          { id: "hayward-gac-504", image: "https://lh3.googleusercontent.com/ci/AL18g_QHGrsNeXqTI2NY-rfcULv5G3NTkcKvVACdDfpcLQoy-beoBDxW8ozE7Q7nZUnoP1XsabdTcb4=w800", artistName: "Unknown", title: "Poster for Psycho Buildings: Artists Take On Architecture, Hayward Gallery, 2008", year: null },
          { id: "hayward-gac-505", image: "https://lh3.googleusercontent.com/ci/AL18g_RrSWB0ebirSyz6Q952DCep-6ajmxnEcM2XTKfr7-nLnPgQLo5pnByOC2H0sDoMGiwa5l-1Jt8=w800", artistName: "Terence Mullaly", title: "Press Cutting for The New Art, Hayward Gallery", year: "1972" },
          { id: "hayward-gac-506", image: "https://lh3.googleusercontent.com/ci/AL18g_St6U1no6UvcESKX5Cwoqquvw3XpgG83jahE8wo7AZCd86n3aNC6yGKCGyboNywjRI_kdwQYg=w800", artistName: "Unknown", title: "Press Release for Pipilotti Rist: Eyeball Massage, Hayward Gallery, 2011", year: null },
          { id: "hayward-gac-510", image: "https://lh3.googleusercontent.com/ci/AL18g_S6OYcyKDexyY0y14CFGonkMsMo_y_NH7P2Ch0qVzDDofwFQdua-Fnw1oUvlCfanDG3ngmn1h3z=w800", artistName: "Unknown", title: "Preliminary Outline for ‘an exhibition of Latin American art’", year: null },
          { id: "hayward-gac-511", image: "https://lh3.googleusercontent.com/ci/AL18g_Rc7qjPUJaZafLh79Gkd5UktSHDs-DXgQJI1nSHRHVQzSBnbLi0h1ErBNrPgYDyrrmAZ0EzJe8=w800", artistName: "Edward Lucie-Smith and Illustrated London News1975-06", title: "Press Cutting for The Condition of Sculpture: A Selection of Recent Sculpture by Younger British and Foreign artists, Hayward Gallery, 1975", year: null },
          { id: "hayward-gac-514", image: "https://lh3.googleusercontent.com/ci/AL18g_Tw08ADD7X-1lCQ5vkRu0gzj-hXuk9JILUyv9lfui2hLG4ejnO47OAQLf1CpLql56hN7HhAKes=w800", artistName: "Unknown", title: "Poster for James Turrell, Hayward Gallery", year: null },
          { id: "hayward-gac-519", image: "https://lh3.googleusercontent.com/ci/AL18g_TXKhahpItABcczFnW_jeIVMSZP8aa-GS2s3W7o7MkUHQCktUqqd1nErU6dJrq45Ft745qq8FG7=w800", artistName: "Unknown", title: "Exhibition Proposal for Gravity & Grace: The Changing Condition of Sculpture 1965-75, Hayward Gallery", year: null },
          { id: "hayward-gac-521", image: "https://lh3.googleusercontent.com/ci/AL18g_STqDVOaKSQ09kltvbCSkyPe5ymb3peLs8dN3ytCh8D08ui0Dl9ebwLjS4lIDu0HCHZMdSXz02N=w800", artistName: "Richard Cork1972-08-17", title: "Press Cutting for The New Art, Hayward Gallery", year: null },
          { id: "hayward-gac-523", image: "https://lh3.googleusercontent.com/ci/AL18g_Rs3jSK60nFLi8Hh-FypD3RQLoCbOiNAwaQGkAmeVfJn4XBtn5MMnWk0nGBWCf4HrD32Hy-lZxD=w800", artistName: "Unknown", title: "Test of Antony Gormley's Blind Light, Hayward Gallery, 2007", year: null },
          { id: "hayward-gac-525", image: "https://lh3.googleusercontent.com/ci/AL18g_QaS018HGsKx7BQkWyhfIGJHgOSPUZz4euCBVjQpBtXdakTXyfqlBhoE4JqUY-3djmJrbYiCaM=w800", artistName: "Unknown", title: "Poster for Unbound: Possibilities in Painting, Hayward Gallery, 1994", year: null },
          { id: "hayward-gac-526", image: "https://lh3.googleusercontent.com/ci/AL18g_SsixOnQ89WtoHfyq4yj43f2PyHMor3mdYHsvMqFVa26aK-2MZW4_xL4lDKrqAWJly37yxk_LY=w800", artistName: "Unknown", title: "SketchUp diagram for Nancy Holt's Holes of Light (1973)", year: null },
          { id: "hayward-gac-529", image: "https://lh3.googleusercontent.com/ci/AL18g_RMUniKAKAhVbne9yG_tY_DTAVgvJAlH5ibemiiNKP7TTxJuf78C5MvohtndK7dOOOOnbL-MfJd=w800", artistName: "Unknown", title: "Talks and Events Leaflet for The Epic and the Everyday: Contemporary Photographic Art, Hayward Gallery", year: null },
          { id: "hayward-gac-530", image: "https://lh3.googleusercontent.com/ci/AL18g_TiC9nD-GB6xEPFnWpTljlNhiEQtjT6g37kdwke1GEXXceZF1FYquZPHed_m14lIxdG36Sq_vA=w800", artistName: "Unknown", title: "Marketing Leaflet for The Other Story: Afro-Asian Artists in Postwar Britain, Hayward Gallery, 1989", year: null },
          { id: "hayward-gac-537", image: "https://lh3.googleusercontent.com/ci/AL18g_TALVD8bVZUAjkEJ-kLb1jYGNmDJ7OuLthJqsF3IVd2RKHMZuZBXqroy5fxIQq_pASYTQSEaQE=w800", artistName: "Unknown", title: "Le Corbusier: Architect of the Century exhibition announcement", year: null },
          { id: "hayward-gac-539", image: "https://lh3.googleusercontent.com/ci/AL18g_Tcl1SnV5Raw3NdAEqQnNJHR2VAy_8r2OJlOp2TF7HODxWWXi9F-cxUVE4_P5Xt9YgrErES1w=w800", artistName: "Unknown", title: "Poster for MOVE: Choreographing You, Art and Dance Since the 1960s, Hayward Gallery, 2010", year: null },
          { id: "hayward-gac-542", image: "https://lh3.googleusercontent.com/ci/AL18g_SEdZWp3HWovam40iC5EB9IHGwHVhOQTGZTcsesV3Yq6gpzCQq83KbLOkT7LZZTAYRc8kOMxQ=w800", artistName: "Unknown", title: "Map of Highlighted Route for London coach Tour During Le Corbusier: Architect of the Century, Hayward Gallery", year: null },
          { id: "hayward-gac-545", image: "https://lh3.googleusercontent.com/ci/AL18g_TOcBLDWn1UI2THUQ26q84u-GcbnuGcmyuNqQL76bhRk4wwkK735n-fRrHDXJh5dze80kLOfbw=w800", artistName: "Unknown", title: "Catalogue for James Turrell, Hayward Gallery, 1993", year: null },
          { id: "hayward-gac-547", image: "https://lh3.googleusercontent.com/ci/AL18g_S5XPlnjXYTfPkJKoL-oNv9PxxXJ5kvTHFr3IheK_tUGTzhigG9o-XJUUDD53wXB6penCp1SayM=w800", artistName: "Claudio Silvestrin", title: "Claudio Silvestrin’s Designs for Plinths, Lucio Fontana, Hayward Gallery, 1999", year: null },
          { id: "hayward-gac-548", image: "https://lh3.googleusercontent.com/ci/AL18g_QgdiFv9cNSJzgK0OGwO5beh8Py7vuyBAFj7Sg55RXBZBFsnsQx56yl3y8OFxcy_mNpPDJW-w=w800", artistName: "Anthony McCall", title: "You and I, Horizontal (2005),Installation view, Institut d'Art Contemporain, Villeurbanne", year: "2006" },
          { id: "hayward-gac-551", image: "https://lh3.googleusercontent.com/ci/AL18g_TYZm_2fmpCGI71QvCyk1E1dzU7o7OretNf1I9Xn56Co-fRfoabVNEMpga8vBnlthsyIESclLg=w800", artistName: "Unknown", title: "Press Cuttings for Art and Power: Europe Under the Dictators 1930-1945, Hayward Gallery", year: "1995" },
          { id: "hayward-gac-552", image: "https://lh3.googleusercontent.com/ci/AL18g_QZWE7yxIXE9JIsAh2B4ZuUNrBcYQuQKlWwpZ92Bhg5W0JLk7ItRmfDheYtYxVC7aU-vh_2Iw=w800", artistName: "Ann Veronica Janssens", title: "Rose", year: "2007" },
          { id: "hayward-gac-553", image: "https://lh3.googleusercontent.com/ci/AL18g_Tk2hRLXWI8spElko4H-plkEPKmOqLdulzdHixU-xhMJq9W2pgruLX-eiVgIMnKb_UtgqZA=w800", artistName: "Unknown", title: "Marketing Leaflet for Dayanita Singh Go Away Closer, Hayward Gallery, London, 2013", year: null },
          { id: "hayward-gac-554", image: "https://lh3.googleusercontent.com/ci/AL18g_QI0tW7mO0Fu_8fij7AiofkW4J5HDmbcy9evNjOU-F9A43qy9_XhWugtXVTZYuP8QbPQEx66BSQ=w800", artistName: "Unknown", title: "Press Cutting for Paul Klee: The Nature of Creation, Hayward Gallery, 2002", year: null },
          { id: "hayward-gac-556", image: "https://lh3.googleusercontent.com/ci/AL18g_TURfaAoVhzJJwBU4pxvOTfVRxu8pFfgl07tbwp_bWz82cnaOXqAI0UIrG_NxTEAM3rMLZog8k=w800", artistName: "Unknown", title: "Southbank Walk Guide for Doubletake: Collective Memory and Current Art, Hayward Gallery, 1992", year: null },
          { id: "hayward-gac-559", image: "https://lh3.googleusercontent.com/ci/AL18g_Q9gVZuXCvMvDieKtPCGJdMZrdljUAq7hu-RQ26RJ0cJj5dedyBh5KueRFEqVRejJ-hRU-1FA=w800", artistName: "Unknown", title: "Press Cutting for The Other Story: Afro-Asian Artists in Postwar Britain, Hayward Gallery, 1989", year: "1989" },
          { id: "hayward-gac-563", image: "https://lh3.googleusercontent.com/ci/AL18g_R-Z1TRlDYEIAHWcWW32EMoYkLfKC2wt6zaHxcbYQ4PzNEmRr3Vy-MRfwmmj242l6WcTEQnQrk7=w800", artistName: "Unknown", title: "Marketing Leaflet for Jeremy Deller: Joy in People, Hayward Gallery, 2012", year: null },
          { id: "hayward-gac-564", image: "https://lh3.googleusercontent.com/ci/AL18g_RrBykpaZQqhw9BMLwt3v_ViltKu_4Wbj2UybND6LrDs9GJdYz2D6TzUaNmY35CPGD8keaJuwE=w800", artistName: "Unknown", title: "Private View Card for Kinetics: An International Survey of Kinetic Art, Hayward Gallery", year: null },
          { id: "hayward-gac-566", image: "https://lh3.googleusercontent.com/ci/AL18g_SNI4nf0UzCYzKq6jAGRWvFdM0ZAYq563yfbx1ZDFuSXymvfTkCAq_vlTP6PHintVW_bMEcDB4=w800", artistName: "Unknown", title: "Draft Poster for The Other Story: Afro-Asian Artists in Postwar Britain, Hayward Gallery, 1989", year: null },
          { id: "hayward-gac-567", image: "https://lh3.googleusercontent.com/ci/AL18g_Sfh2xcJxRYQqrkH8J9t4p4LJTpdAOyuU2vd5S2mphnoc_9n0rYcjyRMY9lZ8a_MNy3ioYjrA=w800", artistName: "Unknown", title: "Light Show, Hayward Gallery", year: "2013" },
          { id: "hayward-gac-568", image: "https://lh3.googleusercontent.com/ci/AL18g_SNj8H39DEK6nmx-PAAPPnpQvw7Wusuh-q7Sw1YYHVvtyMWrOinhanRJwMZS2GTFd6Ns_AWiQ=w800", artistName: "Unknown", title: "Architect’s Drawing for Art and Power: Europe Under the Dictators 1930-1945, Hayward Gallery", year: null },
          { id: "hayward-gac-569", image: "https://lh3.googleusercontent.com/ci/AL18g_Sb9nYr4-P2mzX2M98np-rX9Hh_G97VgmsGKM8RhuPrY23Dk0RlK7goBuQWBsdxTVGf1JtFR0o=w800", artistName: "Unknown", title: "Private View Card for Le Corbusier: Architect of the Century, Hayward Gallery", year: null },
          { id: "hayward-gac-571", image: "https://lh3.googleusercontent.com/ci/AL18g_QlTBDtwzzJZZfs1Tsu-FWKobQ4bDjFp-NjHfL0v3FeSEDGFwqbYHJfdcIg-0cIHaQkiFL9vA0=w800", artistName: "Unknown", title: "Floorplan for Light Show at Sharjah Art Foundation, Sharjah (2/2)", year: "2015" },
          { id: "hayward-gac-573", image: "https://lh3.googleusercontent.com/ci/AL18g_QVKEIu0p6r9ave2cbvLhknijtPjj1Eqnx4FsGP3Nb6M4bR_dmeHIqBb3Vcu7ERpKSExt-H-Bc=w800", artistName: "Unknown", title: "Marketing Leaflet for Art and Power: Europe Under the Dictators 1930-1945, Hayward Gallery", year: null },
          { id: "hayward-gac-574", image: "https://lh3.googleusercontent.com/ci/AL18g_ToeiIPJjQn9dBWBPwdaiBXQO654iR-LbGGUo7BxGKvVbivmDN3BQgRaW9-4Rn_7-9oeYgf7Q=w800", artistName: "Unknown", title: "Talks and Events Leafet for Unbound: Possibilities in Painting, Hayward Gallery, 1994", year: null },
          { id: "hayward-gac-575", image: "https://lh3.googleusercontent.com/ci/AL18g_SsEQmvcJJnj2IYBksu2rotWiqSZmI-3o9OI4hJIhiegwVGN_3BXKUwfJ65NxxN56I8ccTNRA=w800", artistName: "1998-04-26", title: "Press Cutting for Anish Kapoor, Hayward Gallery, 1998", year: null },
          { id: "hayward-gac-576", image: "https://lh3.googleusercontent.com/ci/AL18g_TQYo5xqoCn2Nz_Z4oEeg7Au3khQWLT0UqrE_AtO2rxB_X3BjIWHEfaGMCObASJrHunKLZkAA=w800", artistName: "Unknown", title: "Press Release for Outsiders: An Art Without Precedent or Tradition, Hayward Gallery", year: null },
          { id: "hayward-gac-577", image: "https://lh3.googleusercontent.com/ci/AL18g_SCtZc7DNE2eg3xkZ0O739NKzQyxLqmsLxHNd5eUIm5H39GSrXaWqeE4ytitDD4Y9goF3h3MMw=w800", artistName: "Unknown", title: "Marketing Leaflet for Art in Latin America: The Modern Era, 1820-1980, Hayward Gallery", year: null },
          { id: "hayward-gac-578", image: "https://lh3.googleusercontent.com/ci/AL18g_RXFh-FDlCzelzrFeia1p34ObLs-k1qUlUYPV8KqxSp2538Ycytaj-j-TWm7XhSBcMopQ419nQ=w800", artistName: "Unknown", title: "Exhibitition Guide for Pipilotti Rist: Eyeball Massage, Hayward Gallery, 2011", year: null },
          { id: "hayward-gac-580", image: "https://lh3.googleusercontent.com/ci/AL18g_TOt5Jp0_ZRzOjPWoKTs9G5Zh4l5kMSJ_6WKBBaNLY2o74d6Lw_SwXLUtJD73fMUj-NKRN21g=w800", artistName: "Unknown", title: "Installation plan for Dayanita Singh Go Away Closer, Hayward Gallery, London, 2013", year: null },
          { id: "hayward-gac-583", image: "https://lh3.googleusercontent.com/ci/AL18g_TIPbr44jXnd3C65JHqP0yWTxV79BFjlKKk0n58xTegqTqL_ypPSK8k5GLnZs4XvHsRHv2fn5Je=w800", artistName: "Various", title: "Press Cuttings for Kinetics: An International Survey of Kinetic Art, Hayward Gallery, 1970", year: "1970" },
          { id: "hayward-gac-584", image: "https://lh3.googleusercontent.com/ci/AL18g_Skeq8J7nQl3jCUfakjYK9FsVVoUiBI7-HL52x0SSk-YNVPOLeLJITdYxAEYWdyThqDlfc7JbE=w800", artistName: "Unknown", title: "Private View Card for Richard Long: Walking in Circles, Hayward Gallery", year: null },
          { id: "hayward-gac-586", image: "https://lh3.googleusercontent.com/ci/AL18g_TLTtPyiI6hAXTjT4Af80JlSEcdwuo8aNLeUfw6nxma7Up4qjsfWzxJpVHw-E7KHFPJD9WJu3en=w800", artistName: "2002-01-06", title: "Press Cutting for Paul Klee: The Nature of Creation, Hayward Gallery, 2002", year: null },
          { id: "hayward-gac-587", image: "https://lh3.googleusercontent.com/ci/AL18g_Rhf2dfBC8f_v0RN9h377FcPy1G3YNLCAsDDcPMZHqdpF9r6EYQpj4ML5Viy03lltU6B1BxK-c=w800", artistName: "Unknown", title: "Marketing Leaflet for Gravity & Grace: The Changing Condition of Sculpture 1965-75, Hayward Gallery", year: null },
          { id: "hayward-gac-588", image: "https://lh3.googleusercontent.com/ci/AL18g_QIr3VFebU4c-q0GDd1WQgjYV7dGE6b_zReNmKNKWySzpNU6NgjsFMtkmdTzxATiQIiRdCFtCQ=w800", artistName: "Unknown", title: "Poster for Psycho Buildings: Artists Take On Architecture, Hayward Gallery, 2008", year: null },
          { id: "hayward-gac-589", image: "https://lh3.googleusercontent.com/ci/AL18g_Tik4bf1DWZbIBb4EYr-lhwO9ptixO-_O4XfCQ-TtT6kgUHZeurHa5IvuWznRqnBTYIA8Pmb69i=w800", artistName: "Unknown", title: "Invitation to Light Show opening night at Museum of Contemporary Art Australia", year: "2015" },
          { id: "hayward-gac-591", image: "https://lh3.googleusercontent.com/ci/AL18g_S4ZV57kGBjSuOVI9vpAlPqLZj85sZLSjhtPK8tH7l1ksBhF84qTJffDT28N8bHE3Xo-rKOreE=w800", artistName: "Unknown", title: "Press Release for Outsiders: An Art Without Precedent or Tradition, Hayward Gallery", year: null },
          { id: "hayward-gac-592", image: "https://lh3.googleusercontent.com/ci/AL18g_RSMCUv23Q6EjzGTbWnPSlYcJXPp8fqWlQnKUmkL6R2XMwQ2ByHEeavFHVgtet_RWUgKVsBlTtj=w800", artistName: "1998-02-14", title: "Press Cutting for Francis Bacon: The Human Body, Hayward Gallery, 1998", year: null },
          { id: "hayward-gac-593", image: "https://lh3.googleusercontent.com/ci/AL18g_QDSoNuM6S-wl5xnRkPMlDfk99QONAc5VQOdJZc9ETNJGpCZMr-eLnSVQXsyBKc-uS8RwYQKQ=w800", artistName: "Unknown", title: "Sketch Showing Potential Groupings for Paul Klee: The Nature of Creation, Hayward Gallery, 2002", year: null },
          { id: "hayward-gac-596", image: "https://lh3.googleusercontent.com/ci/AL18g_TRqg2Ad3o0j2del6Tm-aJoiHeE71ei8LthsnYW7fjwY80Ad7Nm5ABGd2nkiO_cVKJs-Qqjhw=w800", artistName: "Unknown", title: "Installation diagram for Brigitte Kowanz's Light Steps (1990/2013) in Sharjah Art Foundation", year: "2015" },
          { id: "hayward-gac-599", image: "https://lh3.googleusercontent.com/ci/AL18g_RwohwaTT9VlW60Ba8D1mPujOF-CplY5FLjSjYgGCP_IrydCDoMHiTI9bktuOuneJDVBHGu=w800", artistName: "Unknown", title: "Press Release for 'Three recreations of The Phantom of Sex Appeal' in Trafalgar Square", year: null },
          { id: "hayward-gac-601", image: "https://lh3.googleusercontent.com/ci/AL18g_QK_BNwsdb6quKwqPTUCMDvR9dgdK5myDK510MGRbpiFfJG_Ie6PBNU1OtnBpX54r-CwEigpk1q=w800", artistName: "Unknown", title: "Catalogue for Bridget Riley: Paintings and Drawings 1951-71, Hayward Gallery", year: null },
          { id: "hayward-gac-606", image: "https://lh3.googleusercontent.com/ci/AL18g_STdSEMvC2Ej2gQHW0ThANfUz54tpIeXM6lXnY5XJ0TEwURRQexfuTAK_KhJ1SjIysckEfPIQ=w800", artistName: "Michael Shepherd and What's On in London1980-05-16", title: "Press Cutting for Pier + Ocean: Construction in the Art of the Seventies, Hayward Gallery", year: null },
          { id: "hayward-gac-607", image: "https://lh3.googleusercontent.com/ci/AL18g_SUkdCFtkpoSao5rXfsRgtqYfC3ENSYGnjO3f5RjcuJOxjpSEa7jcWIbIj07d4RdtBPe0skAQ=w800", artistName: "Michael Shepherd and Sunday Telegraph1973-04-29", title: "Press Cuttings for How To Play the Environment Game, Hayward Gallery, 1973", year: null },
          { id: "hayward-gac-608", image: "https://lh3.googleusercontent.com/ci/AL18g_QLUUe_ZIPWI87nZIsMNxLhN-2wy0eYKXbiAzrxAuiHRtFjjH8EKwDJfYmU2iv8QSLtlqwnszvz=w800", artistName: "Unknown", title: "Press Cuttings for Gravity and Grace: The Changing Condition of Sculpture 1965-75, Hayward Gallery, 1993", year: null },
          { id: "hayward-gac-609", image: "https://lh3.googleusercontent.com/ci/AL18g_THHT2qWB5t-wUwn5b_JL4N2eV-_VgoHtPrPE_IwXTRBrDpx54NupRQpNb7kwy_EmDsYwJyS9o=w800", artistName: "Unknown", title: "Underground poster for Light Show, Hayward Gallery", year: "2013" },
          { id: "hayward-gac-611", image: "https://lh3.googleusercontent.com/ci/AL18g_QZ70NieiOjQEHFxLXdpcZQxrla2pHDWBiPH8yX6_Fe-Mc9soDtkehnuay-vKeZaKB1_gXpTpo=w800", artistName: "Unknown", title: "Press release for Light Show, Hayward Gallery", year: "2012" },
          { id: "hayward-gac-612", image: "https://lh3.googleusercontent.com/ci/AL18g_T_iXTSALqDAs46rjTgNRW2AHbzO7XcOE5MLVWjHjfo1x0uXRmq1eDDyx3lENE0HyBZNWrcxD-q=w800", artistName: "Unknown", title: "Press Cutting for Art in Latin America: The Modern Era, 1820-1980, Hayward Gallery", year: null },
          { id: "hayward-gac-614", image: "https://lh3.googleusercontent.com/ci/AL18g_RljoXgzNMGx_BE9lSwDyUHJunYZwdjmbEMoNPIwPYHTKV7OSj-Yn9bosWiwoishbJ3m5zv=w800", artistName: "Unknown", title: "Upper Gallery Plans for Lucio Fontana, Hayward Gallery, 1999", year: null },
          { id: "hayward-gac-615", image: "https://lh3.googleusercontent.com/ci/AL18g_TCrp_oqcoOX08KPzOUqRSKYf5OsBw4xx6UcOArDeQrToAIURgk_uCVVaaAHd-DOHS5MRtewgFr=w800", artistName: "Unknown", title: "Gallery Plans for Spellbound: Art and Film, Hayward Gallery, 1996", year: null },
          { id: "hayward-gac-617", image: "https://lh3.googleusercontent.com/ci/AL18g_Q6fp-q7r07hgXGhJj9xkG54p4eQ5s6ydSpnEcOKnolEklV0i_1V2zXYYDD5cM2V8XaAOqV8Po=w800", artistName: "Unknown", title: "Private View Card for Doubletake: Collective Memory and Current Art, Hayward Gallery, 1992", year: null },
          { id: "hayward-gac-618", image: "https://lh3.googleusercontent.com/ci/AL18g_TfbmUWLneCMJzrcXmB7OxjzXElM_m0ZlC8Q7xvpL9L3j08EGCzX2q5lR7NfM6mMzKCQOJuqg=w800", artistName: "Unknown", title: "Private View Card, James Turrell, Hayward Gallery, 1993", year: "1993" },
          { id: "hayward-gac-619", image: "https://lh3.googleusercontent.com/ci/AL18g_Q7G6XtHHJ1ZkQ0WWQrm5n1I31XGW_9PLdiwTztH0hX2ztR-1N2Px-MIXXdmWKR94OsYcJQnlY=w800", artistName: "Unknown", title: "Isometric Gallery Plan for Le Corbusier: Architect of the Century, Hayward Gallery", year: null },
          { id: "hayward-gac-620", image: "https://lh3.googleusercontent.com/ci/AL18g_TQb94-ZXGwhQKid2IkajVI_NH-YlKz0cS0my9dslN1w_YWFwBV88oSZ8SAZJToNbNK5TYnXg=w800", artistName: "Unknown", title: "Invitation to Light Show opening night at Museum of Contemporary Art Australia", year: "2015" },
          { id: "hayward-gac-621", image: "https://lh3.googleusercontent.com/ci/AL18g_Rg9mWEyU4K8SxM1sAW8gv8OHCml_tp-YLycoqZYKaop4XTl7RCPOlfexK5JQhcKCPy22m8E_YQ=w800", artistName: "Tamar Yoseloff", title: "The Formula for Night", year: "2013" },
          { id: "hayward-gac-622", image: "https://lh3.googleusercontent.com/ci/AL18g_Qx8uHyCr6J34Zj8_7TWKUnqRtLAHENkVO5boIdluFk8D698NupcJOgreF20-tmKnqOxa_-2Q=w800", artistName: "Unknown", title: "Marketing Leaflet for Dayanita Singh Go Away Closer, Hayward Gallery, London, 2013", year: null },
          { id: "hayward-gac-623", image: "https://lh3.googleusercontent.com/ci/AL18g_StTtzZo-tdJT7sM_-ODfcbjQAxAb7br1-Xof1IKadsGv2qbilLOePTuMjEBvy_2KTUjDe3FQ=w800", artistName: "Unknown", title: "Poster for The Other Story: Afro-Asian Artists in Postwar Britain, Hayward Gallery, 1989", year: null },
          { id: "hayward-gac-629", image: "https://lh3.googleusercontent.com/ci/AL18g_RzTP7RGOc52Lobn23BGrdoDJP26laUz1q7gI7oR31zYLyzzS9eCoVBYM5qXtofptcpZGpmHvOz=w800", artistName: "Unknown", title: "Vistors with Conrad Shawcross's Slow Arc inside a Cube IV (2009) at Auckland Art Gallery, New Zealand, during the closing weekend", year: "2015" },
          { id: "hayward-gac-630", image: "https://lh3.googleusercontent.com/ci/AL18g_Sl6gY2cpzcfcWxf_zlE-yLHpGv1DoyQe32fAJHbDfI7v6vur1VuCGXSxgLKWufOICtKbch3k_T=w800", artistName: "Unknown", title: "Antony Gormley, Diagram of Allotment II", year: null },
          { id: "hayward-gac-631", image: "https://lh3.googleusercontent.com/ci/AL18g_TGLWsJVnSOVKwnv6q0c_HZlteLsUguE349-LJ1uru1ej42gccE-vayuF3Nah3Ss2vAF62dy5k=w800", artistName: "Unknown", title: "Lower Gallery Plans for Lucio Fontana, Hayward Gallery, 1999", year: null },
          { id: "hayward-gac-632", image: "https://lh3.googleusercontent.com/ci/AL18g_SkOoe6s4Y7qiPZhXgJkQDo9NFQRkpH3Us_ujjRC9hTqN-PCcSQNh__o1hMAP_Bot5uiKtnGQc=w800", artistName: "Unknown", title: "Press Cutting for Dada and Surrealism Reviewed, Hayward Gallery", year: "1978" },
          { id: "hayward-gac-636", image: "https://lh3.googleusercontent.com/ci/AL18g_Q2EB-a_dydBEB5nvnQZ4MVPcL6cwfZUDc5xtQXFXDNO9DGjaIoXcXi1-Z5J_jZh5BUP7wjq8c=w800", artistName: "Jon Kessler", title: "Jon Kessler, The Millennium Machine (1992). Doubletake: Collective Memory and Current Art, Hayward Gallery, 1992. Photo: Edward Woodman", year: "1992" },
          { id: "hayward-gac-637", image: "https://lh3.googleusercontent.com/ci/AL18g_TiCFCFFQ7Rn0xlmOaljVK3lQCl_BfUNLWFErJc35UWMHlwLQbUowRqNgvTkhvTfmeLKgYUGgo=w800", artistName: "Unknown", title: "Private View Card for The Other Story: Afro-Asian Artists in Postwar Britain, Hayward Gallery, 1989", year: null },
          { id: "hayward-gac-640", image: "https://lh3.googleusercontent.com/ci/AL18g_TAiHjFPGFIrwUyQp0cHcxuJglKbLR4wG7N_gmrgRu850-w_L5WKi1LLMIPqYBZR6dSUyJyzUo=w800", artistName: "Unknown", title: "Press Release for Falls the Shadow: Recent British and European Art, Hayward Gallery", year: null },
          { id: "hayward-gac-642", image: "https://lh3.googleusercontent.com/ci/AL18g_RM4XmFE1D9kWuS47viVl19yGCxEr-ufNpvFMBsC9c9MJocJ1TSPS5RCDCjpDPzjkb3vSw6roY=w800", artistName: "Unknown", title: "Hand-drawn Scale Diagram of 'Montage Wall' in Dada and Surrealism Reviewed, Hayward Gallery", year: null },
          { id: "hayward-gac-643", image: "https://lh3.googleusercontent.com/ci/AL18g_Qz0yn8dnhVp8EwxQ5rEhaRCGmYVgR-k8D9HMDDdDRZTwluDdj8KPq-MStwadZ8V7yo-WNePuaX=w800", artistName: "Unknown", title: "Exhibition Proposal for Sonic Boom: The Art of Sound, Hayward Gallery, 2000", year: null },
          { id: "hayward-gac-644", image: "https://lh3.googleusercontent.com/ci/AL18g_Tg3h2jMJaPk9LXEG8ecNkGvLYKZCqbqVs3PxRHl5PRMJQ8pqEaVi7y79F1YGzOhpLjqL4TG3o=w800", artistName: "Unknown", title: "Floorplan for Light Show at Museum of Contemporary Art Australia", year: "2015" },
          { id: "hayward-gac-645", image: "https://lh3.googleusercontent.com/ci/AL18g_Q0El2sVZ_Irf4ysZHAUkf6JeMG8hYjmDA_GGjOm41UTW81RZVXyQ_vBMXpMtKV8_XYf13vHg=w800", artistName: "1997-06-27", title: "Press Cutting for Rhapsodies in Black: Art of the Harlem Renaissance, Hayward Gallery, 1997", year: null },
          { id: "hayward-gac-646", image: "https://lh3.googleusercontent.com/ci/AL18g_T4x8BqzZmHcLIyBdKpp36SHnth_q8xyl5yAC4gNa2zq_qeTdg8yfyN5DtkU_ZELt_BDwDpAA=w800", artistName: "Unknown", title: "Exhibition Guide for Psycho Buildings: Artists Take On Architecture, Hayward Gallery, 2008", year: null },
          { id: "hayward-gac-649", image: "https://lh3.googleusercontent.com/ci/AL18g_RMcZttofVzazqXKHt2slLLrd_zsMpaOu4Q1mCUccLE52I_tDjLBO4K9nUxFHhhJvszhTUk_b8=w800", artistName: "Unknown", title: "Exhibition Guide for Art and Power: Europe Under the Dictators 1930-1945, Hayward Gallery", year: null },
          { id: "hayward-gac-651", image: "https://lh3.googleusercontent.com/ci/AL18g_SXmPXM9DHkiE61-cXYQ6k3m5AT_Qah0l-CEV9bS-YHh5lZwa2Lz2mqe4HwQk5Vqp0kxfcSwT8=w800", artistName: "Unknown", title: "Poster for Lucio Fontana, Hayward Gallery, 1999", year: null },
          { id: "hayward-gac-653", image: "https://lh3.googleusercontent.com/ci/AL18g_ROa3inAeK_erD-MMXV2rOMh0jO7sfTmWBRbykQnLwQFqHFVaWFkhHW7TXyFL5eXXEgJyl7Ci0L=w800", artistName: "Unknown", title: "Press Release for Dayanita Singh Go Away Closer, Hayward Gallery, London, 2013", year: null },
          { id: "hayward-gac-654", image: "https://lh3.googleusercontent.com/ci/AL18g_TJYbJHE2Up2qcfcJUJGacC_W5D5W1fKry3hiSsZIl_dJcEpEJvPM5o0GgFBwP782UGcrupytI=w800", artistName: "Unknown", title: "Exhibition Proposal for Hayward Annual 78, Hayward Gallery", year: "1978" },
          { id: "hayward-gac-656", image: "https://lh3.googleusercontent.com/ci/AL18g_SWjet7Bh5G0IdrPD053102Igk9dwHKK7tWf8-rGO-k-EmMxPcpU8HNUzjZ_ghaBdyUl_duEv2a=w800", artistName: "Unknown", title: "Press Release for The Condition of Sculpture, Hayward Gallery", year: null },
          { id: "hayward-gac-657", image: "https://lh3.googleusercontent.com/ci/AL18g_QMsyRVIuMSvOXr2TZeZxKvdyx0DASWZJM_56I0w-IcKSis-6ezAPeZWeJRufJhKVZQH5LIOPM=w800", artistName: "Unknown", title: "Catalogue for Unbound Possibilities in Painting, Hayward Gallery, 1994", year: null },
          { id: "hayward-gac-658", image: "https://lh3.googleusercontent.com/ci/AL18g_QEIo6vyUqXbsfgCaZtBVs7exC4hcyQdIjyZre_FSWHODejR8m231__dLqECrtbE-wanDzVTg=w800", artistName: "Unknown", title: "Hand-drawn Scale Diagram of 'Montage Wall' in Dada and Surrealism Reviewed, Hayward Gallery", year: null },
          { id: "hayward-gac-661", image: "https://lh3.googleusercontent.com/ci/AL18g_R8_kiQMNj3-XT8XexuZT4re5S8bbOlO1Ow7VnbYeosS4y-uJgv9959sehDgsMxGBqEEcw26W8=w800", artistName: "Unknown", title: "Talks and Events Programme for Rhapsodies in Black: Art of the Harlem Renaissance, Hayward Gallery, 1997", year: null },
          { id: "hayward-gac-662", image: "https://lh3.googleusercontent.com/ci/AL18g_SJWpaQBjEbXECkdNVHvYgjLKqXp1aLBNSp0Rn0HEyqiSdXyh1RNEIS4IKxwNPweXP0-4el1zU=w800", artistName: "Unknown", title: "Poster for Addressing the Century: 100 years of Art and Fashion, Hayward Gallery, 1998", year: null },
          { id: "hayward-gac-663", image: "https://lh3.googleusercontent.com/ci/AL18g_TLjq8XqKZmC8BgthfkQBPe0jkxLs8eOW9qgkxk5ElW8OTDcB3KVC3czAPvnlcTSa65ao_9uPCg=w800", artistName: "Christopher Salvesen and The Listener", title: "Press Cutting for Anthony Caro, Hayward Gallery, 1969", year: "1969" },
          { id: "hayward-gac-664", image: "https://lh3.googleusercontent.com/ci/AL18g_SCJaAvhDNMor6Jl9Nw-U-srySqXt44LqTyzCsbCPewwD2QpXsCPIwlohNBIt0fSH7eaHgsN5Q=w800", artistName: "Unknown", title: "Hand-drawn Scale Diagram of 'Montage Wall' in Dada and Surrealism Reviewed, Hayward Gallery", year: null },
          { id: "hayward-gac-665", image: "https://lh3.googleusercontent.com/ci/AL18g_SRfCMfq0imPS92xJ9FHuNQRmGVm_BeOOvnnZNvfJwmRBwIEnDNgNSpc6skZ7i3Rqa9CcMj02c=w800", artistName: "Claudio Silvestrin", title: "Hand-drawn Layout for Gravity & Grace: The Changing Condition of Sculpture, 1965-75, Hayward Gallery", year: null },
          { id: "hayward-gac-667", image: "https://lh3.googleusercontent.com/ci/AL18g_S6AciYUZFRWUVnSyy5Jj3CfHg5qFJcWu_3E8RCDTbOLTSmX7-bzsU1Ij0DGViM41St9Gvqgtg=w800", artistName: "Unknown", title: "Press Notice for Agnes Martin: Paintings and Drawings 1957-1975, Hayward Gallery", year: null },
          { id: "hayward-gac-668", image: "https://lh3.googleusercontent.com/ci/AL18g_SpP5CipunrUQNQi0zdWKbBb4SlbZaVRyFMIGY_hia6Yn8TDewKSwZhUWETWF_B1-a47CCHRIk=w800", artistName: "Newsweek1971-04-05", title: "Press Cutting for Art in Revolution: Soviet Art and Design After 1917, Hayward Gallery, 1971", year: null },
          { id: "hayward-gac-669", image: "https://lh3.googleusercontent.com/ci/AL18g_SKscxYKuczi1UDQ0K4IcmsOIlSA9C728tyeonIlBQMKUC0UYlwXI0l1d2yzE1tHsqLAUGfodz_=w800", artistName: "Unknown", title: "Marketing Leaflet for Art and Power: Europe Under the Dictators 1930-1945, Hayward Gallery", year: null },
          { id: "hayward-gac-670", image: "https://lh3.googleusercontent.com/ci/AL18g_R6h8ZzwbSwJ8L6uCRwG56iVeN7IzZ8nTxK-JiELDVF9TcVHp5esjQ1ALnP8pjkd65UU1EqnYA=w800", artistName: "Unknown", title: "Marketing Leaflet for Richard Long: Walking in Circles, Hayward Gallery", year: null },
          { id: "hayward-gac-672", image: "https://lh3.googleusercontent.com/ci/AL18g_QkL3HwROBHLReuaFplIn6eGAbXNhmHg9W5sIcJ4hf6k0N0YRnBng7H596doqI9mcVHGjVjJJx9=w800", artistName: "Unknown", title: "Exhibition Guide for Gravity & Grace: The Changing Condition of Sculpture 1965-75, Hayward Gallery", year: "1993" },
          { id: "hayward-gac-673", image: "https://lh3.googleusercontent.com/ci/AL18g_Q_qYnYv6gAm8-gWpK_ReZ82tvTNjpBdqGhy4trtvodr3Qr8_NjvoseeHjvx7KbDcWvFLU-2jo=w800", artistName: "Unknown", title: "Hand-drawn Scale Diagram of 'Montage Wall' in Dada and Surrealism Reviewed, Hayward Gallery", year: null },
          { id: "hayward-gac-674", image: "https://lh3.googleusercontent.com/ci/AL18g_R8mUDEoZidBdH5ZMfl_nhKyGbQkBTC3CXjv1h_ueYI-SdgvIEyRlmM6sqh0y2lLWvN7oDVf73b=w800", artistName: "2015-10-01", title: "Muhammad Yusuf, 'Throwing light on light', The Gulf Today (2/2)", year: null },
          { id: "hayward-gac-675", image: "https://lh3.googleusercontent.com/ci/AL18g_RiCjO01o35n5HMZjqHc2dYpNqC4SD6GL02AoLeWNgKHrK8Hg1X9qLhM1OxRD_CGeRe1WbJPP0=w800", artistName: "Unknown", title: "Technical Diagram for V Matrix Structure, Nam June Paik: Video Works 1963-88, Hayward Gallery", year: null },
          { id: "hayward-gac-676", image: "https://lh3.googleusercontent.com/ci/AL18g_RzzVSWU6_Pj2aI-u6Q2q2b2IeHuo7RXzp5RsiG2jwBYZHQv9_Hkjsb_3T6R4A6oTlUxJxK8es=w800", artistName: "Unknown", title: "Gallery Layout for Paul Klee: The Nature of Creation, Hayward Gallery, 2002", year: null },
          { id: "hayward-gac-677", image: "https://lh3.googleusercontent.com/ci/AL18g_QIRvM7ICvhAqwkZSfkEK5D8LsmS7681OV5z1t_P9i8X4ShKfUAVKd2uSpFmeGoCXx2F3pt5T0L=w800", artistName: "Unknown", title: "Press Release for Henri Matisse: 1869-1954: A Retrospective Exhibition, Hayward Gallery, 1968", year: null },
          { id: "hayward-gac-678", image: "https://lh3.googleusercontent.com/ci/AL18g_T2eweC93peZJ5Pt_ojSHCIuW68kykqIcFP3ae189NRL1pXtGSVYIuZRMTR_7r-0O-cCvddeETL=w800", artistName: "Unknown", title: "Children's Map for Richard Long: Walking in Circles, Hayward Gallery", year: null },
          { id: "hayward-gac-679", image: "https://lh3.googleusercontent.com/ci/AL18g_Q23otAl6AY-iTdcJz5bk1kEdyW4BiSRy0tWIC-Wf3uucmDs914i8nnrE94EqW9DWaoAhVBGH8=w800", artistName: "Unknown", title: "Private View Card for Pier + Ocean: Construction in the Art of the Seventies (Holland)", year: null },
          { id: "hayward-gac-680", image: "https://lh3.googleusercontent.com/ci/AL18g_Rh9RFhTfm11kMD4vcXkWtkR5LEmv5898G6O-ind-9Wh7L0YusGimUkanlqy2fCddEMDPUHboQ=w800", artistName: "Unknown", title: "Press Cuttings on Spellbound: Art and Film, Hayward Gallery, 1996", year: "1996" },
          { id: "hayward-gac-681", image: "https://lh3.googleusercontent.com/ci/AL18g_TiyaCHeDEP4HFkXaZwaMzxp7USKUceiBZ4d01dBnWViDflld_VQUcr8-ii6z_oYpJfZfchZA=w800", artistName: "Unknown", title: "Press Cuttings for Gravity and Grace: The Changing Condition of Sculpture 1965-75, Hayward Gallery, 1993", year: "1993" },
          { id: "hayward-gac-682", image: "https://lh3.googleusercontent.com/ci/AL18g_Q5p8QBi5KDLt_9TGo9dKJpeQcl9z_Fgzax8m3uqbiSuR8RQ5CBKtyQWD-ccjAfW9AqQKYoCg=w800", artistName: "Bryan Robertson and The Spectator", title: "Press Cutting for Anthony Caro, Hayward Gallery, 1969", year: "1969" },
          { id: "hayward-gac-684", image: "https://lh3.googleusercontent.com/ci/AL18g_SqzoYB2AVYhUfz0U63XBOxkIweXfwlheeqY-gMFhR_jUtdMMde-O4Q-1gYzh8cTs_sCssnK5Cs=w800", artistName: "Unknown", title: "Marketing Leaflet for Lucio Fontana, Hayward Gallery, 1999", year: null },
          { id: "hayward-gac-685", image: "https://lh3.googleusercontent.com/ci/AL18g_SiQoaM80xVpKzdqFQpoT5ygVjzcrqshfhW6bIAZ4TJtzF6jPoHUMkpi2WSAU_AMUFzKxzRauY=w800", artistName: "Unknown", title: "Designs for Dada and Surrealism Reviewed 'lapel buttons' by Kitty and Edward Wright, Hayward Gallery", year: null },
          { id: "hayward-gac-686", image: "https://lh3.googleusercontent.com/ci/AL18g_SnaSxf0VtKFbPqrjUq6R6EphChZm60egoGFd--jnDfTp1DlYW4x1JD5yvu9aN4rgO9lQhvSnw=w800", artistName: "Unknown", title: "Hand-drawn Scale Diagram of 'Montage Wall' in Dada and Surrealism Reviewed, Hayward Gallery", year: null },
          { id: "hayward-gac-687", image: "https://lh3.googleusercontent.com/ci/AL18g_QoMsgzhPWPww2tF4VtCQDmE7fuZcIFsOA3-1v9hKntqW94CRNx7ueQMEmThPHS_Y1OD52elDE=w800", artistName: "Unknown", title: "Exhibition Guide for Lucio Fontana, Hayward Gallery, 1999", year: null },
          { id: "hayward-gac-689", image: "https://lh3.googleusercontent.com/ci/AL18g_Q8wQc3sfyM-1ra7yEo202SNjyzQVODh7ptLOyyi7F5VJrRvCv5FvQKt5IX6P6RDF5Pb5unEQ=w800", artistName: "Unknown", title: "Hand-drawn Scale Diagram of 'Montage Wall' in Dada and Surrealism Reviewed, Hayward Gallery", year: null },
          { id: "hayward-gac-690", image: "https://lh3.googleusercontent.com/ci/AL18g_RCHhkrTIvJobvZIATS3tp2-7ChAZ_VJ9k0ArmEe1pxtF73T9Nv4ZcEYDMsqCQikyTBN3RDeLg=w800", artistName: "Unknown", title: "Architect’s Drawing for Art and Power: Europe Under the Dictators 1930-1945, Hayward Gallery", year: null },
          { id: "hayward-gac-691", image: "https://lh3.googleusercontent.com/ci/AL18g_SgMlKr6adhOe0MWBrQ4QZ3e4ZriB-siUEPZqLs5Qi6J8__9E2LnpQOaXuxQuTgEzQCf3VvRw=w800", artistName: "Unknown", title: "Hand-drawn Scale Diagram of 'Montage Wall' in Dada and Surrealism Reviewed, Hayward Gallery", year: null },
          { id: "hayward-gac-692", image: "https://lh3.googleusercontent.com/ci/AL18g_QC5gGYyrfSdjFUOSiKxTxqDL2qQyVoSkpyS5ebL82skopEvWCQXUr7ig5io59dTGpzUCeAt8RN=w800", artistName: "Unknown", title: "Press Cuttings for James Turrell, Hayward Gallery, 1993", year: "1993" },
          { id: "hayward-gac-693", image: "https://lh3.googleusercontent.com/ci/AL18g_SZ4G48Ey7PeeeBGey95P79R4BAjQRiV5-lnNaUeJs_3-X30l-aeSi3qJsA2gwBFW0W7j4AE3A=w800", artistName: "Unknown", title: "Report from the Arts Council on Newton Harrison's Portable Fish Farm", year: null },
          { id: "hayward-gac-694", image: "https://lh3.googleusercontent.com/ci/AL18g_QyeCYZurkIjwxdJJ_X0qKWRqssJo3D-SwEnaRmJwcyR2_ndfO-eC0QDOw75OVMJMx3SJ2ENLo=w800", artistName: "Unknown", title: "Press Release for Psycho Buildings: Artists Take On Architecture, Hayward Gallery, 2008", year: null },
          { id: "hayward-gac-696", image: "https://lh3.googleusercontent.com/ci/AL18g_THc_So-6mo_Vy30kaH55F6Vv0XeZAXnAMAw7KkkU1-DRub9XQLc_X7SVlLPsuKCfU1P1i1rA=w800", artistName: "Unknown", title: "Marketing Leaflet for Dada and Surrealism Reviewed, Hayward Gallery", year: null },
          { id: "hayward-gac-697", image: "https://lh3.googleusercontent.com/ci/AL18g_Qe8Ovx7Oz1CnjKUYL9RKeS66M5FT9F3ao9FUU4kWrmZZZJwF1Jvh57z4u6q5G1OXnLgu87QdY=w800", artistName: "Unknown", title: "Invitation to View the Lissitzky Proun Room", year: null },
          { id: "hayward-gac-698", image: "https://lh3.googleusercontent.com/ci/AL18g_SqzQD0GrcIXhUAWsulSzMaOWCnMeeyUYZnf2ateCoGltdSN0V6qMNnS-rwkeOtPNeTj49_br8=w800", artistName: "Unknown", title: "Press Cuttings for James Turrell, Hayward Gallery, 1993", year: "1993" },
          { id: "hayward-gac-699", image: "https://lh3.googleusercontent.com/ci/AL18g_SaBJ48wrkt0cut6dICmPnpmWCy_gcSO_r2sxcg2hWHmC_-2KPQqoBXVrMyCQFD85px5MYD2J8t=w800", artistName: "Unknown", title: "Private View Card for Hayward Annual 78, Hayward Gallery", year: "1978" },
          { id: "hayward-gac-700", image: "https://lh3.googleusercontent.com/ci/AL18g_TJqJUh7a4O1l5D0jzT4I5IhlshiYjsn4iwyZxT9rFNYiMUbxOUCkfp1hrPPz0OLHLvgRYis_A=w800", artistName: "Unknown", title: "Lower Gallery Plans for Sonic Boom: The Art of Sound, Hayward Gallery, 2000", year: null },
          { id: "hayward-gac-701", image: "https://lh3.googleusercontent.com/ci/AL18g_R5_pBW5XyS0lMjZ6rjDJqJAiKwNa0PYwbbYFC6PWur9SwO9M_l6FAQzc0lpzWVQzeoroi4Lh8=w800", artistName: "Michael Shepherd and Telegraph1972-08-27", title: "Press Cutting for The New Art, Hayward Gallery", year: null },
          { id: "hayward-gac-703", image: "https://lh3.googleusercontent.com/ci/AL18g_RZTWOqM1epsalFFCAhTICCUDhrMH0V6LUZolYUCr-fSEIZLbfOWTsGXaMPBiZw6NEhc46HxS0=w800", artistName: "Unknown", title: "Poster for Le Corbusier Weekend Symposium, Le Corbusier: Architect of the Century, Hayward Gallery", year: null },
          { id: "hayward-gac-704", image: "https://lh3.googleusercontent.com/ci/AL18g_Ri0YnIposmnH_OGr9AsOpDGF2oqSWlOAnmsZFBpJ6XdzYyALLLXIPY588gSPmZSITj7-yukgo=w800", artistName: "Unknown", title: "Exhibition Guide for Doubletake: Collective Memory and Current Art, Hayward Gallery, 1992", year: null },
          { id: "hayward-gac-707", image: "https://lh3.googleusercontent.com/ci/AL18g_SHWm7QIB-c88OCnJAGGn3f0Trgn4nbLeO0tL1EfoHEvoTVXWSlO_que5bOn7tMAIyvbXI8jpPl=w800", artistName: "Unknown", title: "Internal Memo about 'International Contemporary Exhibition'", year: null },
          { id: "hayward-gac-708", image: "https://lh3.googleusercontent.com/ci/AL18g_R5pIK1_uuNDEiIaqy2NMkmSc53PBk0XC2P3EkjTmnO5bZo3oBkP4MUab0T-2Ym0RSuhGsDGJc=w800", artistName: "Unknown", title: "Exhibition Guide for MOVE: Choreographing You, Art and Dance Since the 1960s, Hayward Gallery, 2010", year: null },
          { id: "hayward-gac-709", image: "https://lh3.googleusercontent.com/ci/AL18g_RE9eGBQt_PZST_4EE5yQYHhd531bfD8X8ojeAfhtO7YrJbR0GMLg1G4FC9UU6JHUG2zauxtkc=w800", artistName: "Unknown", title: "Exhibition Guide for MOVE: Choreographing You, Art and Dance Since the 1960s, Hayward Gallery, 2010", year: null },
          { id: "hayward-gac-710", image: "https://lh3.googleusercontent.com/ci/AL18g_Qv1ErU_nBHFK33wVrbOSafxiKcejQbL8DWpfb4XI-G-Bhif5gqTo3azirTl3x_WKFeq2wJC34H=w800", artistName: "Unknown", title: "Exhibition Guide for MOVE: Choreographing You, Art and Dance Since the 1960s, Hayward Gallery, 2010", year: null },
          { id: "hayward-gac-711", image: "https://lh3.googleusercontent.com/ci/AL18g_SjhOAj1vMA56gLcpARlqr6657LPN5blbhJd1CmICfd28lz_91CAYw-uJ2GDIsEBWxCvrASxb75=w800", artistName: "Unknown", title: "Private View Card for Unbound: Possibilities in Painting, Hayward Gallery, 1994", year: null },
          { id: "hayward-gac-712", image: "https://lh3.googleusercontent.com/ci/AL18g_SF2MB9yoLPEQAlSpmlq9TyDE-VVPNdVulAbLR-fEcZ8lB3uxN5dPuVLYHKL8UDS9GGk7Zru8o=w800", artistName: "Unknown", title: "Marketing Leaflet for Paul Klee: The Nature of Creation, Hayward Gallery, 2002", year: null },
          { id: "hayward-gac-713", image: "https://lh3.googleusercontent.com/ci/AL18g_Sp5P5F2XWvGRkh3GyoR1apa3ElZTZ0KsFkixqL19d86w6WFo1D2YZQAGKjn1YYxvze41-uymE=w800", artistName: "David van de Kop", title: "Sketch of David van de Kop's work for The Condition of Sculpture, Hayward Gallery", year: null },
          { id: "hayward-gac-714", image: "https://lh3.googleusercontent.com/ci/AL18g_Re9tX02CiAYL4noGJbzNH7mNjMMx1s23usbWimegVJnf8AZcfc9NMuAxmF4aRB73DVnP1dRw=w800", artistName: "Unknown", title: "Poster for Unbound: Possibilities in Painting, Hayward Gallery, 1994", year: null },
          { id: "hayward-gac-716", image: "https://lh3.googleusercontent.com/ci/AL18g_SnWy5iM33UF-6JiKfCLwr8OEDsUe-dURtDiUv2U0mjqv0ffUqqTQ0F7ozy_9oqwkqoF9RbVYb8=w800", artistName: "Unknown", title: "Marketing Leaflet for James Turrell, Hayward Gallery, 1993", year: null },
          { id: "hayward-gac-717", image: "https://lh3.googleusercontent.com/ci/AL18g_SD8F1NoFZFY-I1GdaQfJUzbd1CcmhQzAJVVto-OxJL7xz5p_nWLWwpmpBOne_43Q9N48yc7Xex=w800", artistName: "Unknown", title: "Hand-drawn Scale Diagram of 'Montage Wall' in Dada and Surrealism Reviewed, Hayward Gallery", year: null },
          { id: "hayward-gac-718", image: "https://lh3.googleusercontent.com/ci/AL18g_RpaBggl0DK6VMkbiJwTqx5O8EXTqm5UpgBKBSMrwOkZ5yjzyoUjgR_K1kWkiU2iiCKPKYarNk=w800", artistName: "Unknown", title: "Drawing of Anish Kapoor's Descent into Limbo (1992) for Anish Kapoor, Hayward Gallery, 1998", year: "1992" },
          { id: "hayward-gac-719", image: "https://lh3.googleusercontent.com/ci/AL18g_QsFTvgrNw3lE0nJ-_sr-hqaTleouZwoC3YmN6mLg6iB6IrdqcTPxo6sz47TI9NIE5gY66FVQ=w800", artistName: "Unknown", title: "Hand-drawn Scale Diagram of 'Montage Wall' in Dada and Surrealism Reviewed, Hayward Gallery", year: null },
          { id: "hayward-gac-720", image: "https://lh3.googleusercontent.com/ci/AL18g_RFOXLfbeV0-NlHik2YGL5-ZHpHmGMbDengzSZeKlM-xAasnUEPBMUS38OzIoL4yCICdHWQDQ=w800", artistName: "John McEwan and The Spectator1977-03-12", title: "Press Cutting for Agnes Martin: Paintings and Drawings 1957-1975, Hayward Gallery", year: null },
          { id: "hayward-gac-721", image: "https://lh3.googleusercontent.com/ci/AL18g_QKVRVgqb3ihkW0jSo51qupANVhwpocge8PyTH-z5FSmpbkKVVzNj6OyvAhOij-mlLwg1-_t72T=w800", artistName: "Unknown", title: "Echoes of Le Corbusier Leaflet, Le Corbusier: Architect of the Century, Hayward Gallery", year: null },
          { id: "hayward-gac-722", image: "https://lh3.googleusercontent.com/ci/AL18g_Rfg0W1R4jVCWxameDmMi_ig_DYwBCxgavm7WLoxPqRQfejpGfy9zwZbx91rPEad7uKwp6FYw=w800", artistName: "Unknown", title: "Marketing Leaflet for Tracey Emin: Love is What You Want, Hayward Gallery, 2011", year: null },
          { id: "hayward-gac-723", image: "https://lh3.googleusercontent.com/ci/AL18g_QW87D4qXgG4VBbDD-NDUnQGHYLIPpLbskGMG3cLDFRzp8pSsQGvPrALb-W1MGd0ZjSCzdsIA=w800", artistName: "Unknown", title: "Private View Card for How To Play the Environment Game, Hayward Gallery, 1973", year: null },
          { id: "hayward-gac-724", image: "https://lh3.googleusercontent.com/ci/AL18g_SgWF0QGDkpRAm6c3ftXCohTjWp1iy-u5JwrkDQGumv3uBzM3xxZlHLyLQk8R9Rhl6wXkjlkA=w800", artistName: "Unknown", title: "Press Cutting for Art in Latin America: The Modern Era, 1820-1980, Hayward Gallery", year: null },
          { id: "hayward-gac-725", image: "https://lh3.googleusercontent.com/ci/AL18g_R_eHhf7bRQmNFksejEJn0gUL7sLHEDihubkq5TQX4L9--vdh7FN2cinVhlNaA3pTx0RRX3Oy8=w800", artistName: "Anthony Lewis and International Herald Tribune1971-02-27", title: "Press Cutting for Art in Revolution: Soviet Art and Design After 1917, Hayward Gallery, 1971", year: null },
          { id: "hayward-gac-726", image: "https://lh3.googleusercontent.com/ci/AL18g_Qpwhil1etIo4zK9LCSBRNpUFZExXtktTkr8KO-5z6-gPCKxWqstDs9V3yTgVdQX0CEU-OF=w800", artistName: "Unknown", title: "Hand-drawn Scale Diagram of 'Montage Wall' in Dada and Surrealism Reviewed, Hayward Gallery", year: null },
          { id: "hayward-gac-727", image: "https://lh3.googleusercontent.com/ci/AL18g_Qv5z69tl_2aBjDmrQ3OmHG1jKfgOn70s9NJTeXmczZ6qDv8gOjE5BIK2TRWiQBu8EgQDTkug=w800", artistName: "Unknown", title: "Notes from a Meeting held on 17 September 1985", year: null },
          { id: "hayward-gac-728", image: "https://lh3.googleusercontent.com/ci/AL18g_QMfZPMNev6eurrt9-RB15hB4JqEzQDxZzignikuU0bygP9HwNbjLu48X2CLnpSJ7eym0O2Nw=w800", artistName: "Unknown", title: "Isometric Plan of Gallery 1 for Lucio Fontana, Hayward Gallery, 1999", year: null },
          { id: "hayward-gac-729", image: "https://lh3.googleusercontent.com/ci/AL18g_S_dhOUO_exVgPPcxNjg7Vo-3e4cfcMpWcTXjFKO0nJ1TvUz7Knk9hbh8EUxQ0Rssbh31emnQ=w800", artistName: "Unknown", title: "Hand-drawn Gallery Plan for Le Corbusier: Architect of the Century, Hayward Gallery", year: null },
          { id: "hayward-gac-731", image: "https://lh3.googleusercontent.com/ci/AL18g_Q2n-sB6GZ5RRxgmaSCIGO5zvEoZyaVSFbQDO40afc6UdHn6tvx7xxZaoS1425TshE-Lk942dQ=w800", artistName: "Unknown", title: "Hand-drawn Scale Diagram of 'Montage Wall' in Dada and Surrealism Reviewed, Hayward Gallery", year: null },
          { id: "hayward-gac-732", image: "https://lh3.googleusercontent.com/ci/AL18g_T3sKPrKvqJDmGCzxpN7uQ0yc9TKKyzTWwLbKB5cqQEDajenN1Y5Xe3oAqgIyzVgDiHfrvxQw=w800", artistName: "Unknown", title: "Floorplan for Light Show at Auckland Art Gallery, New Zealand (2/2)", year: "2014" },
          { id: "hayward-gac-733", image: "https://lh3.googleusercontent.com/ci/AL18g_RYPCCC20mMN9Q7s-8ga80tDzeJLfkcSJi4JfLk2b7UJmmMopOj1105ulCR0mXNGDxqQklfmxiE=w800", artistName: "Michael Shepherd and The Telegraph1977-03-06", title: "Press Cutting for Agnes Martin: Paintings and Drawings 1957-1975, Hayward Gallery", year: null },
          { id: "hayward-gac-734", image: "https://lh3.googleusercontent.com/ci/AL18g_Qq7M5lQ19Jwd8NC6Yj_4YWgnUKMuA6fjasojfqyckH2qCGUTPFlQL4P_au6uaXTRvibw3XQG8=w800", artistName: "Unknown", title: "Catalogue for Falls the Shadow: Recent British and European Art, Hayward Gallery", year: null },
          { id: "hayward-gac-735", image: "https://lh3.googleusercontent.com/ci/AL18g_SyzoLU7vVBmZ4vdSky3blxkglK_u3Ar1ZON-ePg_dlpOtsq_NiHnTBlbACEWca90mWM1wAP1k=w800", artistName: "Edward Mullins and The Sunday Telegraph", title: "Press Cutting for Anthony Caro, Hayward Gallery, 1969", year: "1969" },
          { id: "hayward-gac-736", image: "https://lh3.googleusercontent.com/ci/AL18g_T_9NhFhKlPeTfw2oiW-t6d5S6iPDTqYCs-0EKu6Uqq2WqGljQ4Y-74DOskF0zYAyuZGU9ij1mw=w800", artistName: "Unknown", title: "Sketch of Peter Greenaway's 'In the Dark', part of Spellbound: Art and Film, Hayward Gallery, 1996", year: null },
          { id: "hayward-gac-737", image: "https://lh3.googleusercontent.com/ci/AL18g_RoeyyyRifwkWMWm6j3DyFhhxGGl2A1NGIGz3LNHVxqYmfRFjFGWFWLhW1-hz4YB1XILhYF2h0=w800", artistName: "Unknown", title: "Internal Memo regarding Nam June Paik: Video Works 1963-88, Hayward Gallery", year: null },
          { id: "hayward-gac-738", image: "https://lh3.googleusercontent.com/ci/AL18g_RFYuqi66IwKjQRyJ3quNnBzbDzS2tVHILPzYWfXZThKOgr0pBR0pRulP5M_gQw_kblg_hDBQ=w800", artistName: "Unknown", title: "Upper Gallery Plans for Kinetics: An International Survey of Kinetic Art, Hayward Gallery", year: null },
          { id: "hayward-gac-739", image: "https://lh3.googleusercontent.com/ci/AL18g_Tw8dHigEklBSMLPP4MYz1UJa008jTDKBaupu14MCuLOp7T5gPUrmYLPUf8yCkN5FULdPquXVg=w800", artistName: "Unknown", title: "Technical diagram for Iván Navarro's The Hayward Fence", year: "2012" },
          { id: "hayward-gac-740", image: "https://lh3.googleusercontent.com/ci/AL18g_Tnnb_rdasidbkPbgRZOQtDDjqeqNJza__eglrKFOjE4-MnnwwmF94H7TjaNY2fHBZUhDRGf5U=w800", artistName: "Unknown", title: "Hand-drawn Scale Diagram of 'Montage Wall' in Dada and Surrealism Reviewed, Hayward Gallery", year: null },
          { id: "hayward-gac-742", image: "https://lh3.googleusercontent.com/ci/AL18g_TPq1f9JD_s3__3etVr35eNFQmLWeA_wAQc5TvmteQ457VC-RrtHE3Atm6EUtW8Tnv_7pu1qJ0=w800", artistName: "John McEwan and The Spectator", title: "Press Cuttings on Hayward Annual 77, Hayward Gallery", year: "1977" },
          { id: "hayward-gac-743", image: "https://lh3.googleusercontent.com/ci/AL18g_THITRgLJQlFJNfCTjOiORXSy2MWMSKvw4xLjt8oqW0EtEpSenE9uhu69FmO4tqGY20DUeY1w=w800", artistName: "Unknown", title: "Press Cutting for The Other Story: Afro-Asian Artists in Postwar Britain, Hayward Gallery, 1989", year: "1989" },
          { id: "hayward-gac-744", image: "https://lh3.googleusercontent.com/ci/AL18g_SuH4F4cqgDi9krGs6Ywr4OdiwUguOrHB5HeZm7S8L2Wjujfw9X4_coVa1SvnRPkeABwQS8W9Y=w800", artistName: "Unknown", title: "Press Release for 11 Los Angeles Artists, Hayward Gallery", year: null },
          { id: "hayward-gac-745", image: "https://lh3.googleusercontent.com/ci/AL18g_TZf7GCxjbALgnwyXxHhThnubxVWUIEP-zV_XGDPvbc1LjLOSv0QZHSj-iaTk7ufnJJscRPHg=w800", artistName: "Unknown", title: "Private View Card for Outsiders: An Art Without Precedent or Tradition, Hayward Gallery", year: null },
          { id: "hayward-gac-746", image: "https://lh3.googleusercontent.com/ci/AL18g_SXH8HSx8QhKgPnZQ8BHs-obbbbjv12tw6KAgXDyyzgAEZk_qa8-DVncmxfV3f-ZTb574XmXA=w800", artistName: "Unknown", title: "Press Cuttings for Gravity and Grace: The Changing Condition of Sculpture 1965-75, Hayward Gallery, 1993", year: "1993" },
          { id: "hayward-gac-747", image: "https://lh3.googleusercontent.com/ci/AL18g_RLNhyui9qgtGLBrZosdddA_IuSfa_p5mAi8GI78V00c-rCVIC9qXTF0zU0D12Pm5zniFub0_pE=w800", artistName: "Unknown", title: "Sketch of Outsiders: An Art Without Precedent or Tradition Catalogue", year: null },
          { id: "hayward-gac-748", image: "https://lh3.googleusercontent.com/ci/AL18g_SGkjxkhcLLviep4-FoSQP2MBO_rspaoVFpFwo7VOFEEOchtNIRwsZOKdT00py5F-_tuhKY2RE=w800", artistName: "Unknown", title: "Marketing Leaflet for Jeremy Deller: Joy in People, Hayward Gallery, 2012", year: null },
          { id: "hayward-gac-749", image: "https://lh3.googleusercontent.com/ci/AL18g_SUZhmAneSDsE5CdA89zBPN7M7K9bps64tz0t2HPfecEyeFhpkykBCiBlUYVlt7CsU8pUNo0bAG=w800", artistName: "Unknown", title: "Typography for Dada and Surrealism Reviewed, Hayward Gallery", year: null },
          { id: "hayward-gac-751", image: "https://lh3.googleusercontent.com/ci/AL18g_S-yp4RGOmeUxAXw9SKL3SJ40nylCgNfrw4dSwyDTVwEo4zp7C-Sr2w2Px7CwABprXFXXbILnFk=w800", artistName: "Unknown", title: "Sketch of Terry Gilliam’s 'Monolith of Filing Cabinets', part of Spellbound: Art and Film, Hayward Gallery, 1996", year: null },
          { id: "hayward-gac-752", image: "https://lh3.googleusercontent.com/ci/AL18g_RIa51U1asZ0uzpTuhprMa3raZPW522DhnbrBzzviC5a49Dlu1RkdKCnkrZ6hBzjYjTV1Qu4jQ=w800", artistName: "Unknown", title: "Exhibition Guide for Art and Power: Europe Under the Dictators 1930-1945, Hayward Gallery", year: null },
          { id: "hayward-gac-753", image: "https://lh3.googleusercontent.com/ci/AL18g_R52LKMhFA8WUSOkRkEJoA7OLlgGs6yjtnEOzyLkU18fH45AC91dnel3HRch0GC1lDMM9IFPcxG=w800", artistName: "Unknown", title: "Press Cutting for Anish Kapoor, Hayward Gallery, 1998", year: null },
          { id: "hayward-gac-754", image: "https://lh3.googleusercontent.com/ci/AL18g_RA-k-nqYb6HrIf-DjKFD1Ap5_lC9jRjQwgfAe0vcN5-kmYpsqC2kFsypYtGrRHJ1QgPr58u1LA=w800", artistName: "Unknown", title: "Installation diagram for ***", year: "2008" },
          { id: "hayward-gac-756", image: "https://lh3.googleusercontent.com/ci/AL18g_TxUXmsfAv6lJU4JpAvDuC1SwAn5OY2uzGqbxfqdwB6v74D5lIO88K3OHI0XADYCfc5IBjpBsA9=w800", artistName: "Unknown", title: "Exhibition Guide for Tracey Emin: Love is What You Want, Hayward Gallery, 2011", year: null },
          { id: "hayward-gac-757", image: "https://lh3.googleusercontent.com/ci/AL18g_REQnXQg0x4HIlTxrGwBB9a6wAtoYda5Cts3fTnQLxViDWBN6b64k_7dh9pXGVAY0-u5I09QxbM=w800", artistName: "Unknown", title: "Talks and Events leaflet for Paul Klee: The Nature of Creation, Hayward Gallery, 2002", year: null },
          { id: "hayward-gac-758", image: "https://lh3.googleusercontent.com/ci/AL18g_QKJPBbckPPlJv45OLQh9LVQIVQ959uNgxCyLPwr84ZN5vEwUykf-gLc5mHY2Y8lgx87tHJMhJD=w800", artistName: "Unknown", title: "Upper Gallery Plan for The Other Story: Afro-Asian Artists in Postwar Britain, Hayward Gallery, 1989", year: null },
          { id: "hayward-gac-760", image: "https://lh3.googleusercontent.com/ci/AL18g_S5fwzVvdp9BOvZI0Q6JsA2W9OpdxNCyNN9SB9bU2IwYz0n2lctT7zFTOhw9z5XYiVO414FDTK_=w800", artistName: "Unknown", title: "Exhibition Guide for Ed Ruscha: 50 Years of Painting, Hayward Gallery, 2009", year: null },
          { id: "hayward-gac-761", image: "https://lh3.googleusercontent.com/ci/AL18g_SAPForvfU-VhSrAQYB8jc_FIMsri1Z4EwX6HPKFtIqPqtyZGi2-nRbaUnxZO4DUJsUvllvgQ=w800", artistName: "Unknown", title: "Press Release for The Other Story: Afro-Asian Artists in Postwar Britain, Hayward Gallery, 1989", year: null },
          { id: "hayward-gac-763", image: "https://lh3.googleusercontent.com/ci/AL18g_RwBPoc2Q16PrXg3XcfE5OK5C0XfNZhV3lDr1isNcVUaLk0I6u7S9f-jIImVkyU1XdfsQN_3Vg=w800", artistName: "Anthony McCall", title: "Sketch for You and I, Horizontal (2005), 4 October 2012", year: "2013" },
          { id: "hayward-gac-764", image: "https://lh3.googleusercontent.com/ci/AL18g_TTmDGNxjFHoVZcE8sjbGScTUfTRkEbwwfYRVUSdG4RBSmpqHfGl7C8376tcx-LAWUSD_CDoA=w800", artistName: "Unknown", title: "Press Cutting for The Other Story: Afro-Asian Artists in Postwar Britain, Hayward Gallery, 1989", year: "1989" },
          { id: "hayward-gac-765", image: "https://lh3.googleusercontent.com/ci/AL18g_SCrnZDo_qSGMQKxDG0XB3YTwEFIYyIngVxgM-5U2m5NNYjaadFIyedWJBTNguN_iOiv8U3rAE=w800", artistName: "Unknown", title: "Exhibition Plans for Gravity & Grace: The Changing Condition of Sculpture1965-75, Hayward Gallery", year: null },
          { id: "hayward-gac-766", image: "https://lh3.googleusercontent.com/ci/AL18g_SGK0IVJbO37Si2Dxtk1-k3BG4Q5hLQf-Yg_vJVprcd5Ezmz4TPpEGC9PQUbCiqbzhXCUlTRpLw=w800", artistName: "Unknown", title: "Lower Gallery Plans for Kinetics: An International Survey of Kinetic Art, Hayward Gallery", year: null },
          { id: "hayward-gac-767", image: "https://lh3.googleusercontent.com/ci/AL18g_RukQiVnsXYsx-2u2q5df8qJ8ce8F-n0JA2BKTbmcAIbP1aBH026A9OFk-gLKTFL9A2BLpPKng=w800", artistName: "Unknown", title: "Exhibition Design for Addressing the Century: 100 years of Art and Fashion, Hayward Gallery, 1998", year: null },
          { id: "hayward-gac-768", image: "https://lh3.googleusercontent.com/ci/AL18g_Sp3cGYPpFC18HtCbr6q6UfRJBczFwCLygEvZ9NY0kBDIvSJcYRVsKjM3-sNMNRRUhEMuUZIUA=w800", artistName: "Unknown", title: "Design for Jean Dubuffet quote used in Outsiders: An Art Without Precedent or Tradition, Hayward Gallery", year: null },
          { id: "hayward-gac-773", image: "https://lh3.googleusercontent.com/ci/AL18g_Q8lN-Hwv1KkPmwSiVPWt-2K6AU56N-bNG04zw2EOzBt74_c2ga9pvKI8tqkRH1GZpCd3NLiAA=w800", artistName: "Unknown", title: "Catalogue for Spellbound: Art and Film, Hayward Gallery", year: null },
          { id: "hayward-gac-774", image: "https://lh3.googleusercontent.com/ci/AL18g_SkAE_ywmZQdN3nGxcDqVTgqSBY5fsMY8AtTS0nqf9a59QISNK8xTvaPC3MuEef6zJ5VeAfigqn=w800", artistName: "Unknown", title: "Notes from a Meeting held by Jon Thompson, Barry Barker, Andrew Dempsey, Susan Ferleger Brades", year: null },
          { id: "hayward-gac-776", image: "https://lh3.googleusercontent.com/ci/AL18g_S0Q4M3BuPhjyfHcF7LMlrS6nimDdouc5wKKPjQyGaGcWycEp5kFgQraFvm2t0f7R6pD_PV9eQ=w800", artistName: "Unknown", title: "Upper Gallery Plans for Sonic Boom: The Art of Sound, Hayward Gallery, 2000", year: null },
          { id: "hayward-gac-777", image: "https://lh3.googleusercontent.com/ci/AL18g_RfJXSe_ceaJU-3nnMFrDy1L_JmoKioLxjSSJ67jKXZEH6qJ82OsvDi8wIPgcaqqEfda0dYCw=w800", artistName: "Unknown", title: "Installation Note for British Painting '74, Hayward Gallery, 1974", year: null },
          { id: "hayward-gac-778", image: "https://lh3.googleusercontent.com/ci/AL18g_Q12lyeCXdp5wqqwv5lxvw3TWc_-dBdtsDkwIeNP_ohVmcNsQAcMOfmL-m0kUP5PvxtZP9fTPQ=w800", artistName: "Unknown", title: "Hand-drawn Scale Diagram of 'Montage Wall' in Dada and Surrealism Reviewed, Hayward Gallery", year: null },
          { id: "hayward-gac-779", image: "https://lh3.googleusercontent.com/ci/AL18g_RS3rjTL75IK4xA5PtGDttDeMNCaA14FFa1yzheXdszC0tjfbq4bdDTc86FcMJ7qRxZoHCEedc=w800", artistName: "Kunsthalle Bern", title: "Private View Card for Bridget Riley: Paintings and Drawings 1951-71, Kunsthalle Bern", year: "1971" },
          { id: "hayward-gac-780", image: "https://lh3.googleusercontent.com/ci/AL18g_TlEAlBNzvYfgz507N369bd4Ibdj9dadpwASuUDxZLWnphIuwA1tPqx8HYmwYk4Sb0RW_DiSg=w800", artistName: "Unknown", title: "Lower Gallery Plan for Anish Kapoor, Hayward Gallery, 1998", year: null },
          { id: "hayward-gac-781", image: "https://lh3.googleusercontent.com/ci/AL18g_RoD9nOTV5exLAD7qD5BixZ0rMH2_aqQkZlUfFp9MWLZpFA2GX2-hCTWzyTbxC9UBIhbiUI79Y=w800", artistName: "Unknown", title: "Press Release Announcing Iannis Xenakis, Composer, Performing in Relation to Le Corbusier: Architect of the Century", year: null },
          { id: "hayward-gac-782", image: "https://lh3.googleusercontent.com/ci/AL18g_RSM08DpayOqG3pqRRy8pNOGc_-qGeX7EDJ3HrvF-RRf8Q7IO7MX45ms8sgKYvfL628IOnpTXc=w800", artistName: "Unknown", title: "Sketch of Terry Gilliam's Monolith of Filing Cabinets' for Spellbound: Art and Film, Hayward Gallery, 1996", year: null },
          { id: "hayward-gac-783", image: "https://lh3.googleusercontent.com/ci/AL18g_RDfG4jfC8NfPkn9VDPIvPCx-MqxAQ92AGpw8viWbubnrYWfSFmjQ1duwU6B4AWf5Jrrd9KYg=w800", artistName: "Unknown", title: "Talks and Events Leaflet for Anish Kapoor, Hayward Gallery, 1998", year: "1998" },
          { id: "hayward-gac-784", image: "https://lh3.googleusercontent.com/ci/AL18g_SSoW69r-unizUYUcpO-xnELnjvDctLUGAYGpJ3ojVEGFjpdFh2V0WCtOFrL09kjOURK_WmKQ=w800", artistName: "Unknown", title: "Statement from Arts Council on 11 Los Angeles Artists, Hayward Gallery", year: null },
          { id: "hayward-gac-785", image: "https://lh3.googleusercontent.com/ci/AL18g_SLqCvzs31BDTAYyT2DfDd4ARpZJmuRKjef-ka3pYjAPJfY1a9V9JtfS7KpLeSALKlTCTaP=w800", artistName: "Unknown", title: "Notes of a Meeting at the Tate Gallery for Le Corbusier: Architect of the Century, Hayward Gallery", year: null },
          { id: "hayward-gac-786", image: "https://lh3.googleusercontent.com/ci/AL18g_Q3vqJnwRD7Puy_oH9vyXNhJelDzbivrHLaLaXyq3sTttXd2hIwqzmQQwoCcSiO_6Glb-qWdIeU=w800", artistName: "Unknown", title: "Upper and Lower Gallery Plans for Hayward Annual 77, Part 2, Hayward Gallery", year: null },
          { id: "hayward-gac-787", image: "https://lh3.googleusercontent.com/ci/AL18g_TMGsXiG_o_CCmmB4KNv17KZ6lBp0i4JB28O858o5jM23OFK4di32kn7Ess9WbRja06KAfnBQM=w800", artistName: "Unknown", title: "Exhibition Guide for Art in Latin America: The Modern Era, 1820-1980, Hayward Gallery", year: null },
          { id: "hayward-gac-788", image: "https://lh3.googleusercontent.com/ci/AL18g_QSwlhl7wk-TS_QjP5kc0jRWhRXk2CKWJL8fKLbPAPWcQS1TnEbkNh31ntB38PBXi10-ugSFgc=w800", artistName: "Unknown", title: "Newspaper Advertisement for Henri Matisse: 1869-1954: A  Retrospective Exhibition, Hayward Gallery, 1968", year: null },
          { id: "hayward-gac-790", image: "https://lh3.googleusercontent.com/ci/AL18g_S8wZrvEhqQWJ0ixvoeS46RMeGxSU5rTYUZx__fKEPqSZewdtIFDp3o648_VaPFYjY9c9TmonQ=w800", artistName: "Unknown", title: "Press Release for Dayanita Singh Go Away Closer, Hayward Gallery, London, 2013", year: null },
          { id: "hayward-gac-791", image: "https://lh3.googleusercontent.com/ci/AL18g_TxPuDbbKafG51MfvxYI9jJOBdTo2xGOumzCy_3iByt-j7qRB-bt1O_BYgipcf9zxuWdwd71_c=w800", artistName: "Unknown", title: "Draft Posters for Doubletake: Collective Memory and Current Art, Hayward Gallery, 1992", year: null },
          { id: "hayward-gac-792", image: "https://lh3.googleusercontent.com/ci/AL18g_SILNrKy3M_gMu-8URoS8UTW6AXKIWLQaQoK3GAstHHWjyed8xewrhgBsCmD9GuRFVLFU-JXQ=w800", artistName: "Unknown", title: "Strike plan for Light Show, Hayward Gallery", year: "2012" },
          { id: "hayward-gac-793", image: "https://lh3.googleusercontent.com/ci/AL18g_QO7nSzGu60aEW5nRPXPzrH-EDcith_j2YdIBLuBrkl1-u8AyAvvRVKswQaNTGgAY7SZHKbqsk=w800", artistName: "Unknown", title: "Notes from a Public Meeting on Hayward Annual 77, Hayward Gallery", year: null },
          { id: "hayward-gac-794", image: "https://lh3.googleusercontent.com/ci/AL18g_Q3FJ7VPNYGgkHOTaiFDtZ8Y8MFmiTVHBmmoTJkPkDxAplkOXnLOjJ8Dlep_eyeQ_xSOK9APQ=w800", artistName: "2015-09-21", title: "Anna Seaman, 'Let there be light', The National", year: null },
          { id: "hayward-gac-796", image: "https://lh3.googleusercontent.com/ci/AL18g_S7UMzMq29fh1pFASJJWP2xjYAngZGX0zeUiqWJLoLc-zM6fBKd1Axe5mwoo7lmBXKFV7-b=w800", artistName: "Unknown", title: "Exhibition Guide for MOVE: Choreographing You, Art and Dance Since the 1960s, Hayward Gallery, 2010", year: null },
          { id: "hayward-gac-797", image: "https://lh3.googleusercontent.com/ci/AL18g_Rgd97tBINK64uMKlOBwLO93pb4riqwVTAIhesRZszciIbbe1Ly6GbaSwbUP97G5C5mENWUHlo=w800", artistName: "Unknown", title: "Hand-drawn Title Graphics for Gravity & Grace: The Changing Condition of Sculpture 1965-75, Hayward Gallery", year: null },
          { id: "hayward-gac-798", image: "https://lh3.googleusercontent.com/ci/AL18g_SMC3ZY080UuDuzYfOAYId3pxKWfm1Gr9c9V3UP8mrhN4k7awl5E_oyQCgpE2FLK_P2FSu3_3Y=w800", artistName: "Unknown", title: "Catalogue for Sonic Boom: The Art of Sound, Hayward Gallery, 2000", year: null },
          { id: "hayward-gac-799", image: "https://lh3.googleusercontent.com/ci/AL18g_RJwZrCKgWO_XVLyae_nu36upfPhq2faJSqszsymIW0T5760zjQFEETq-FzYjTM43rQ8tYzhg4=w800", artistName: "Various", title: "Press Cuttings for How To Play the Environment Game, Hayward Gallery, 1973", year: "1973" },
          { id: "hayward-gac-802", image: "https://lh3.googleusercontent.com/ci/AL18g_T3hhhieeYJzfZlOG7P0Dj19hz3egI2bmS_59gGwam6PpdrTCa66wobka-8_Ln02YEzMZvrblk=w800", artistName: "Unknown", title: "Hand-drawn Scale Diagram of 'Montage Wall' in Dada and Surrealism Reviewed, Hayward Gallery", year: null },
          { id: "hayward-gac-803", image: "https://lh3.googleusercontent.com/ci/AL18g_TTUEIuegWlzq_kilZ759nfvJ-FT7tQRAd6fYRAdpDyVb0ss-1u6raF2SPXB_rcDk75Jd6wvQe4=w800", artistName: "Unknown", title: "Exhibition Guide for James Turrell, Hayward Gallery, 1993", year: null },
          { id: "hayward-gac-804", image: "https://lh3.googleusercontent.com/ci/AL18g_T1LKwWxNrlUMb-3PWc90Xb71rcc1OKdqzA-pDlNW7qdC3qrsOXeVzbygMLnAzxtrttBVUKp4ci=w800", artistName: "Unknown", title: "Press Release for Psycho Buildings, Hayward Gallery, 2009", year: null },
          { id: "hayward-gac-805", image: "https://lh3.googleusercontent.com/ci/AL18g_Q7TofSUQ3GjIgGoeLMDrHcJJxpscAQUCDeRGXjMM19KrU-xH_XnUON2N4CqgO8fGBIw8argLE=w800", artistName: "Unknown", title: "Upper and Lower Gallery Plans for Hayward Annual 77 Part 1, Hayward Gallery", year: null },
          { id: "hayward-gac-806", image: "https://lh3.googleusercontent.com/ci/AL18g_TjYI-CqcbxQmxQXBXaNybZx7VI-pQFCiT9KGBcyXcwinhQfsaXQ47nap6B5AJrFXP9ZMwXMtw=w800", artistName: "1979-02-12", title: "Press Cutting for Outsiders: An Art Without Precedent or Tradition, Hayward Gallery", year: null },
          { id: "hayward-gac-807", image: "https://lh3.googleusercontent.com/ci/AL18g_QTS4K0EM5p1P6vlAQ73QQ1CZKh07h2-xRQ4yc8_WkS7FZY7lrShmgOZ8SX5chDR89wgPz7COk=w800", artistName: "Unknown", title: "Exhibition Guide for MOVE: Choreographing You, Art and Dance Since the 1960s, Hayward Gallery, 2010", year: null },
          { id: "hayward-gac-808", image: "https://lh3.googleusercontent.com/ci/AL18g_S_agSCVQXo7hJBnc66z-hwGEXL4Fp18rB25X7vooH2GQUlksF2TXIeMVct4VE1ZNz_-SFHGQ=w800", artistName: "Richard Cork and Evening Standard1980-05-28", title: "Press Cutting for Pier + Ocean: Construction in the Art of the Seventies, Hayward Gallery", year: null },
          { id: "hayward-gac-809", image: "https://lh3.googleusercontent.com/ci/AL18g_SbugHxHgf_mQNfxNEQQ-Vbe8SYCHReYJeaabU4j8B0sswjm91dKp_bmE3deqirHbsPU4OxCLQ=w800", artistName: "John McEwan and The Spectator", title: "Press Cuttings on Hayward Annual 77, Hayward Gallery", year: "1977" },
          { id: "hayward-gac-810", image: "https://lh3.googleusercontent.com/ci/AL18g_STrWkf-aNA9xhMH5QRPON-79GHQNO-SJqrxeqqpsv5gMFfZWCS-76U3yGbANubVeAOi9Mrdqs=w800", artistName: "Unknown", title: "Report for Exhibitions Sub-committee", year: null },
          { id: "hayward-gac-811", image: "https://lh3.googleusercontent.com/ci/AL18g_TeXN_ozkVJnxXA4e6nKuVQd6IuBxYrHWaxArC3LLAxBPCGjZxGGHVb1lJXbdNKG2Gv3_gxkig=w800", artistName: "Unknown", title: "Marketing Leaflet for Ed Ruscha: 50 Years of Painting, Hayward Gallery, 2009", year: null },
          { id: "hayward-gac-812", image: "https://lh3.googleusercontent.com/ci/AL18g_S3ZhbH3rrXRoxa4ZGKCcJK5VRjSp3fpwXkuCZwojGhOR6sqWD_d0YeV0SPIoigNNFE2f5-Mw=w800", artistName: "Unknown", title: "Catalogue for The Other Story: Afro-Asian Artists in Postwar Britain, Hayward Gallery, 1989", year: null },
          { id: "hayward-gac-813", image: "https://lh3.googleusercontent.com/ci/AL18g_SSzWKWKOLj9Muk0DgIoAakDON6LJKrKcaMQ6aVbQ8z4o7ucHGjGW1GsEBfmTkqUxn6c3XeQhk=w800", artistName: "Unknown", title: "Catalogue for The Epic and the Everyday: Contemporary Photographic Art, Hayward Gallery", year: null },
          { id: "hayward-gac-814", image: "https://lh3.googleusercontent.com/ci/AL18g_Q5Z19yHnGZNeGc65otQl6Lm3LpEUji5ll_ihUFo5yVbP-o4NVRIrnGZFywh6pXYuVxU0uSgtU=w800", artistName: "Unknown", title: "Catalogue for The Epic and the Everyday: Contemporary Photographic Art, Hayward Gallery", year: null },
          { id: "hayward-gac-815", image: "https://lh3.googleusercontent.com/ci/AL18g_Rf4Tkl9C_zncV6701H_I1UuSYqQzUP5WZjS8lhNUEOrrU7MGVyGZXYYMllbz3B6fxd6zJ05w=w800", artistName: "Unknown", title: "Drawing of Tatlin's Tower for Art in Revolution: Soviet Art and Design After 1917, Hayward Gallery", year: null },
          { id: "hayward-gac-816", image: "https://lh3.googleusercontent.com/ci/AL18g_Qdd_dEoXU7m2Wfa-QEK7cOTVFi_et6vr3qSw-BYfyeVqncCXsSvmXyMvRMcWZvnaJZVaHomg=w800", artistName: "Unknown", title: "Gallery Plans for Doubletake: Collective Memory and Current Art, Hayward Gallery, 1992", year: null },
          { id: "hayward-gac-817", image: "https://lh3.googleusercontent.com/ci/AL18g_TyRtaBT-_PWw_WkKEendtmrTNGYRNZOBy02rgt8vMutoOsu5njaD08NVKjKVBu2rzmEXTHIA=w800", artistName: "Unknown", title: "Press Release for James Turrell, Hayward Gallery, 1993", year: null },
          { id: "hayward-gac-818", image: "https://lh3.googleusercontent.com/ci/AL18g_S8RPj7BuVMESq-2i6nrDwMqY73v-OhIm6xhlRx8dTOIJzstbRc3Q0T9KZfwOWywjrkL4k5yg=w800", artistName: "Unknown", title: "Gallery Plans for The Epic and the Everyday: Contemporary Photographic Art, Hayward Gallery, 1994", year: null },
          { id: "hayward-gac-819", image: "https://lh3.googleusercontent.com/ci/AL18g_RMqEAyA0icdIIDUesyH4xD3zVof8OtECOHOvcLCsXeXc1gFbA2DRQC71mxCB6bL7-OxlvI8Y0=w800", artistName: "Unknown", title: "Translated note from the Ministry of Culture of the USSR to Hayward Gallery", year: null },
          { id: "hayward-gac-820", image: "https://lh3.googleusercontent.com/ci/AL18g_Sy6JSdz-_Fp5S9Uw7KKO0QPiAt-y4b-W9W3QFjvpYV507gO7jq0onjtzja90I7wdmF-0He2A=w800", artistName: "Unknown", title: "Upper Gallery Plans for Ed Ruscha: 50 Years of Painting, Hayward Gallery, 2009", year: null },
          { id: "hayward-gac-821", image: "https://lh3.googleusercontent.com/ci/AL18g_TLyP-qAotsJXuizzlaf1L6WLFdmCS8PhFLWFcIfF1NHHMCm5qd-HzvYXLAyyEDEBnLIJY9iw=w800", artistName: "Unknown", title: "Poster for 'Open Space' Event, Hayward Annual 78, Hayward Gallery", year: "1978" },
          { id: "hayward-gac-822", image: "https://lh3.googleusercontent.com/ci/AL18g_QV_SGCSCT83K8ZaeB6wdioIIXPE808TxEO6sSSOnHA5V6QOTWpVCO_5FZK2QFi6v1YF_9xoQ=w800", artistName: "Unknown", title: "Catalogue for Gravity and Grace: The Changing Condition of Sculpture 1965-75, Hayward Gallery", year: null },
          { id: "hayward-gac-823", image: "https://lh3.googleusercontent.com/ci/AL18g_Q7Q-X_Dn2CDXynwS_HhGR2r5km0SerzeNAkYlzV6GoAFUdFBm4utoP1XOUwxEOLlaIVUMXDw=w800", artistName: "John Spurling and New Statesman1980-05-06", title: "Press Cutting for Pier + Ocean: Construction in the Art of the Seventies, Hayward Gallery", year: null },
          { id: "hayward-gac-824", image: "https://lh3.googleusercontent.com/ci/AL18g_S6K6StnyNvwsHU01cffhqIUtoSt8vcIfyKDiwo-6mCYUel957oohJJHOHOev-8x6uPqZbuKO0=w800", artistName: "Unknown", title: "Lower Gallery Dance Areas in MOVE: Choreographing You, Art and Dance Since the 1960s, Hayward Gallery, 2010", year: null },
          { id: "hayward-gac-825", image: "https://lh3.googleusercontent.com/ci/AL18g_SWmZb5eWtGl_oVZ42y_q7L32QndGG7NUCrWlQjKp8RI3FiUVJang9d0WueOT92WqAwTRZR0Yw=w800", artistName: "Unknown", title: "Events leaflet for Light Show, Hayward Gallery", year: null },
          { id: "hayward-gac-826", image: "https://lh3.googleusercontent.com/ci/AL18g_Q27-JyE7Ee7wOeqPejwQtiSuyX-37G-8YjZ0ZuABMAEKDT2jUe77OuSplu-tihwxAiW5IfGA=w800", artistName: "Unknown", title: "Lower Gallery Plans for The Epic and the Everyday: Contemporary Photographic Art, Hayward Gallery", year: null },
          { id: "hayward-gac-827", image: "https://lh3.googleusercontent.com/ci/AL18g_Tj-Po9NWldzRYofKe__Sd_h6CJxHgaoOz4p_4LAoTCCqXXiJFNDvDGwr_G5m14FO4kACiN7jiN=w800", artistName: "Unknown", title: "Press Statement on 11 Los Angeles Artists ‘Catfish Controversy’", year: null },
          { id: "hayward-gac-828", image: "https://lh3.googleusercontent.com/ci/AL18g_SUL_gMNcuNz-Bw5FHt--0NTzo0iVbcQql0D-1rczh4FnSTxs9Bpofv4H2vRGLMkFsmvscLAfZz=w800", artistName: "Camilla Gray1968-02-22", title: "Exhibition Proposal for a 'Russian Constructivist Exhibition'", year: null },
          { id: "hayward-gac-829", image: "https://lh3.googleusercontent.com/ci/AL18g_ROxbVJbyxklaG7soIgFpZB6Sc62EM0Fpxllu1gRkfut12SBs-c_CH7S0FgiuFzzXYdyQR08g=w800", artistName: "Unknown", title: "Invitation to ‘sunset and wine’ evenings in James Turrell’s Air Mass, Hayward Gallery", year: null },
          { id: "hayward-gac-830", image: "https://lh3.googleusercontent.com/ci/AL18g_QY_4LFSB6hkeaMyhnKLx2uQV9FONPoVpO7vbtifd4zTWcmZ13uBJn3nAPrajbIyu7FGy9MkNY=w800", artistName: "Unknown", title: "Short Exhibition Outline for Paul Klee: The Nature of Creation, 2002", year: null },
          { id: "hayward-gac-831", image: "https://lh3.googleusercontent.com/ci/AL18g_TePe7HG48eNAyrZ8JDYjQsZ3CqxEKt9-X4RH5u8XU53mKmk_-cKqEezRsKolswyhKTwOfuqx8=w800", artistName: "Unknown", title: "Hand-drawn Sketch of Marketing Leaflet for Dada and Surrealism Reviewed, Hayward Gallery", year: null },
          { id: "hayward-gac-832", image: "https://lh3.googleusercontent.com/ci/AL18g_QxSTE1v_zZCVZ3PFrpAA6Fdvw5m1npBM9JIzjHgR8Lq34gIWIZDUJPvUBK0tHlB08R3YLAdQ=w800", artistName: "Unknown", title: "Gallery Talks Programme for Lucio Fontana, Hayward Gallery, 1999", year: null },
          { id: "hayward-gac-833", image: "https://lh3.googleusercontent.com/ci/AL18g_TsK0GkuI7C1_uJAudwRl2wXKNkkYgNBa5Bj1wIiiiQIqiU3-94xRzL_fA458o5IizKRA267W8=w800", artistName: "Unknown", title: "Lower Gallery Plans for Art and Power: Europe Under the Dictators 1930-1945, Hayward Gallery", year: null },
          { id: "hayward-gac-834", image: "https://lh3.googleusercontent.com/ci/AL18g_Rp3oL6sMX3drIYM1-er83JP_pPW1bQw9DzMa6wRy27w2oIWh-PHlWC12SGUKIRnNN5omo8Bgw=w800", artistName: "Unknown", title: "Press Statement on 11 Los Angeles Artists ‘Catfish Controversy’", year: null },
          { id: "hayward-gac-835", image: "https://lh3.googleusercontent.com/ci/AL18g_SoslOLXdanLwjtsCcPmIQAO-pbRnNQonvfpdopI1_YmibLwcpSts4qBbRz9kT5ayawda8D2u8=w800", artistName: "Unknown", title: "Provisional Gallery Layout for Unbound: Possibilities in Painting, Hayward Gallery, 1994", year: null },
          { id: "hayward-gac-836", image: "https://lh3.googleusercontent.com/ci/AL18g_QPMrOSY4HhcOuUjxLMFy8Ln_0f2c6k4gKGB4vUMnLk3F-rGXYHG1voAvyo61LvbXsER9t1Y1w=w800", artistName: "Unknown", title: "Flyer for 'Playing the Environment Game' film, Hayward Gallery, 1973", year: null },
          { id: "hayward-gac-839", image: "https://lh3.googleusercontent.com/ci/AL18g_RnBgWIsHM-w1IXrfRdwh54xTOKBxheLW9RsT_3-jjw5nRIOAQD5GxQUoohKlSFBshdGbpYZg=w800", artistName: "Unknown", title: "Events leaflet for Light Show, Hayward Gallery", year: null },
          { id: "hayward-gac-840", image: "https://lh3.googleusercontent.com/ci/AL18g_Rj-toq3LCe4poVKNFUs42L10VPNT149x9VOlwn9udXTRdS40Fn0cs90YHm4uAmLt1EOYTN=w800", artistName: "Unknown", title: "Hand-drawn Floorplan for Outsiders: An Art Without Precedent or Tradition, Hayward Gallery", year: null },
          { id: "hayward-gac-841", image: "https://lh3.googleusercontent.com/ci/AL18g_QwXtDrW1WPZpfQMSUuGSjB23x0-pnLqPToKevYTSySdxLps5RX6E0JvzE4JzMXOFt_5gEe0Bw=w800", artistName: "Various", title: "Press Cuttings for 11 Los Angeles Artists, Hayward Gallery, 1971", year: "1971" },
          { id: "hayward-gac-842", image: "https://lh3.googleusercontent.com/ci/AL18g_Q0A0Z_cr84iBDuDPPUmHbbEOfsIpgUI_xyWNJFNZYUZFPIV1Z2LWZdqHfAX0K25HNtUAvRHFk=w800", artistName: "Unknown", title: "Conceptual Plan for Paul Klee: The Nature of Creation, Hayward Gallery, 2002", year: null },
          { id: "hayward-gac-843", image: "https://lh3.googleusercontent.com/ci/AL18g_RS8x8oK-ZInAJGlekXes1lFJjjJwimiPUfRw8cHcrtVW69uDmn623CXFZKSPGVYEJpCEsmNcg=w800", artistName: "Unknown", title: "Talks and Events Leaflet for Dada and Surrealism Reviewed, Hayward Gallery", year: null },
          { id: "hayward-gac-845", image: "https://lh3.googleusercontent.com/ci/AL18g_TGhzGiXv8lBMStEUd7BqoIaznu0l26gdrRRp5PtsTeT3iHYYbfnZ21ous8rnjPosqYC0y2=w800", artistName: "Unknown", title: "Private View Card for Nam June Paik: Video Works 1963-88, Hayward Gallery", year: null },
          { id: "hayward-gac-846", image: "https://lh3.googleusercontent.com/ci/AL18g_TecgzgOsne6bwS9pbEq9DmbbLn5JpAuWzkhc48a33PD4wNsRahH9cNiv_pq35Z1Hsjwnqsz-0=w800", artistName: "Various", title: "Press Cuttings for 11 Los Angeles Artists, Hayward Gallery, 1971", year: "1971" },
          { id: "hayward-gac-847", image: "https://lh3.googleusercontent.com/ci/AL18g_Smy8yVzSkKYDdlrt1Ndjy5P-b3hqkw9PLMY9kB-kFJFmmRWchgYWhZ9k7kna6Xpkm2gepDQmM=w800", artistName: "Unknown", title: "Poster for Light Show, Sharjah Art Foundation, United Arab Emirates", year: "2015" },
          { id: "hayward-gac-848", image: "https://lh3.googleusercontent.com/ci/AL18g_QOP845TTqZblEvKRhtylgLj4tJ9AiGtPrrJLODoNoBQnCKyyUgliwmD8Lch8ZDaoRUjAqZhKQ=w800", artistName: "Unknown", title: "Art Panel Sub-Committee Minutes", year: null },
          { id: "hayward-gac-849", image: "https://lh3.googleusercontent.com/ci/AL18g_Qod4r4drX13rq5aeEwTnXENn60PLoe4-B6cVNWjDYk0lK1lH9SearE-RUNWf90wyzpLKLEG1Jf=w800", artistName: "Unknown", title: "Talks and Events Poster for Dada and Surrealism Reviewed, Hayward Gallery", year: null },
          { id: "hayward-gac-850", image: "https://lh3.googleusercontent.com/ci/AL18g_SSM1WTrGt0pInijNbapaXs9Xne6-cTcpJ2vLXDjWXNMWGMV6wG3fFW2TnDDUUR-wqqDmRyM8LH=w800", artistName: "Unknown", title: "Upper Gallery Dance Areas in MOVE: Choreographing You, Art and Dance Since the 1960s, Hayward Gallery, 2010", year: null },
          { id: "hayward-gac-852", image: "https://lh3.googleusercontent.com/ci/AL18g_SptoySQrqe7AON1Vkdms7DsdvXlAajPbe7dfCeKRFJKfGwGgtH5C3mP3LhIjqTuCCeO5An_ZpR=w800", artistName: "Unknown", title: "Press Release for Press View of  Nam June Paik: Video Works 1963-88, Hayward Gallery", year: null },
          { id: "hayward-gac-853", image: "https://lh3.googleusercontent.com/ci/AL18g_Q8emstdp1JdaH_2zm7mBRUOCgK7aMbf_sI6981yFcgG0JgYEhnfl7xGQEkJLPRxSu7JSi-_hRa=w800", artistName: "Unknown", title: "Notes on Pier + Ocean: Construction in the Art of the Seventies, Hayward Gallery", year: null },
          { id: "hayward-gac-854", image: "https://lh3.googleusercontent.com/ci/AL18g_QwC_acSKXPYykre02nxzs4SRBFWGhtDZqmEdrXT7BRJteqZBmu9lcOoBkoCWkRXNqeLutlFeo=w800", artistName: "Unknown", title: "Installation Plans for Fall the Shadow: Recent British and European Art, Hayward Gallery", year: null },
          { id: "hayward-gac-855", image: "https://lh3.googleusercontent.com/ci/AL18g_SzZzJVENkAcoX-gnWsoWYXEpJhxPs8bHE3IZiWQhLGh-mgGD6NW5Ebn48lnAUBJCTv9mLHymA=w800", artistName: "Unknown", title: "Draft Gallery Plans for Dada and Surrealism Reviewed, Hayward Gallery, 1978", year: null },
          { id: "hayward-gac-856", image: "https://lh3.googleusercontent.com/ci/AL18g_SKvJubhfzI5hEvJnT0A1QLe4PBngT_meCTspX8XYZrsNPv22s8gKXscB4WWKIgVLC26l4jcc8=w800", artistName: "Unknown", title: "Lower Gallery Plans for Addressing the Century: 100 years of Art and Fashion, Hayward Gallery, 1998", year: null },
          { id: "hayward-gac-857", image: "https://lh3.googleusercontent.com/ci/AL18g_SPqCGB1D5-it97mJZoem0C-yQqUpy8cdhLYUMcYc4SKl2kxkX1SHCZvASbbdsBQ8XCGhD4oas=w800", artistName: "Unknown", title: "Installation Plan for Antony Gormley: Blind Light, Hayward Gallery, 2007", year: null },
          { id: "hayward-gac-858", image: "https://lh3.googleusercontent.com/ci/AL18g_T0jz3GWWcu8_IrVDZ0J0KYMwa5seh-DdiniXEF1EYi6CqPxVOEXWoppth2RCgTc3lXWntyPg=w800", artistName: "Unknown", title: "Catalogue for Sonic Boom: The Art of Sound, Hayward Gallery, 2000", year: "2000" },
          { id: "hayward-gac-859", image: "https://lh3.googleusercontent.com/ci/AL18g_TI40dQVP_Fqjbd6rns76z8HRYwDNUDGxU5zySnIpgYL8efHW7VSZBzlySeYYHMFS1B14BtcA=w800", artistName: "Unknown", title: "Logo for Dada and Surrealism Reviewed, Hayward Gallery", year: null },
          { id: "hayward-gac-860", image: "https://lh3.googleusercontent.com/ci/AL18g_T2NIhY40nim1ziDS-HjOs9SiqPYHQ-wyopc6JXBlkFh_0ZyqPj806AsXzX2w9DEOzu177s3q8=w800", artistName: "Unknown", title: "Private View Card for Hayward Annual 77, Hayward Gallery", year: null },
          { id: "hayward-gac-861", image: "https://lh3.googleusercontent.com/ci/AL18g_Rk7EJcqFFd9Ex0ARAJThCzglpMEbG3iG7e1_k8lt3n0tWAY503sm-QF0hWwGxZlGNLd0iZn4py=w800", artistName: "Unknown", title: "Press Release for ‘An Evening with Architect Zaha Hadid’, part of Addressing the Century: 100 years of Art and Fashion, Hayward Gallery, 1998", year: null },
          { id: "hayward-gac-862", image: "https://lh3.googleusercontent.com/ci/AL18g_SnQ3n5eturntEZ09wEMBJ71gyIs8kANhXRPem3VFh4bblOxKCbVxIFwZyqIlxO4IAAqDAitesf=w800", artistName: "Unknown", title: "Artists and Artworks Featured in The New Art, Hayward Gallery", year: null },
          { id: "hayward-gac-863", image: "https://lh3.googleusercontent.com/ci/AL18g_Q_IuPERHTX8PemFFvKYhYonvnfLGBQHzn9MS-LsyNZnI7DuDZsQi0FhKXlFveRL1CsosB1_td3=w800", artistName: "Unknown", title: "Installation Plan for Pipilotti Rist: Eyeball Massage, Hayward Gallery, 2011", year: null },
          { id: "hayward-gac-864", image: "https://lh3.googleusercontent.com/ci/AL18g_R0AVD6rE9V9KVycfqq5HHZryXcPqjXtrqeybrpI1lD9m524vzW9ue0wyii9aveyHqMoT1fqg=w800", artistName: "Unknown", title: "Upper Gallery Plans for Art and Power: Europe Under the Dictators 1930-1945, Hayward Gallery", year: null },
          { id: "hayward-gac-865", image: "https://lh3.googleusercontent.com/ci/AL18g_Ru72vO4d3CTd3BIUNVCTcztwgPwZvebXtMMJZ0jWl9MYgDeEpAyiDp8baOfzc-B5uME7-ObQ=w800", artistName: "Unknown", title: "Private View Card for Dada and Surrealism Reviewed, Hayward Gallery", year: null },
          { id: "hayward-gac-868", image: "https://lh3.googleusercontent.com/ci/AL18g_TmFtGJENgVtel47TIFn0w7NobG_DsCGVFVYGYM_hWrLshVd2bczdgW5x37tFLZBevZz_6v1g=w800", artistName: "Unknown", title: "Press Release for Pipilotti Rist: Eyeball Massage, Hayward Gallery, 2011", year: null },
          { id: "hayward-gac-869", image: "https://lh3.googleusercontent.com/ci/AL18g_TF4L7lRyCLKJIAVUiBVfbaXlnDJdgt6aHARUFCrZyaIyZ4GjrfCKV4PHiOmCNSRRKsK7tLz3g=w800", artistName: "Unknown", title: "Press Release for Press View of Le Corbusier: Architect of the Century, Hayward Gallery", year: null },
          { id: "hayward-gac-870", image: "https://lh3.googleusercontent.com/ci/AL18g_TxFWtJGYDtm4TiQLwGweIHEz5Tp0OqdKaYYrILvDUpmOAkpjIDI6ijxKWMXNbe7OpJvdSeJg=w800", artistName: "Unknown", title: "Exhibition Proposal for The Other Story: Afro-Asian Artists in Postwar Britain, Hayward Gallery, 1989", year: null },
          { id: "hayward-gac-871", image: "https://lh3.googleusercontent.com/ci/AL18g_SAximlN4_zqwRzoNYcLzewDTezPIMkIVEF8SrzyRonypu18lRD2t9Hzcy4ji172kacfM2LnVGs=w800", artistName: "Unknown", title: "Exhibition Introduction for Pier + Ocean: Construction in the Art of the Seventies, Hayward Gallery", year: null },
          { id: "hayward-gac-872", image: "https://lh3.googleusercontent.com/ci/AL18g_RIUTtBBNrn3Mcifba-hLht9cEzSRHAod1AvvhdHAfYvmh5w3SO65AaaVdPw3RBJDHI2Y1aOw=w800", artistName: "Unknown", title: "Press Statement on 11 Los Angeles Artists ‘Catfish Controversy’, Hayward Gallery", year: null },
          { id: "hayward-gac-873", image: "https://lh3.googleusercontent.com/ci/AL18g_T22OIpmihBsAMqcZxPMEiVcSTfQxLqQWJnc20TSovxWQ7RalJ-qe7w8Yl0An32_2wAMyxpei0s=w800", artistName: "Unknown", title: "Press Release for Art in Revolution: Soviet Art and Design After 1917, Hayward Gallery", year: null },
          { id: "hayward-gac-874", image: "https://lh3.googleusercontent.com/ci/AL18g_SBUcgcuY8d3IQa5YMAx7rzTKSo0lVrjDAMVM7i96jlOsaHaqde33Q3ZKYI1anJBJvpOCir8foN=w800", artistName: "Unknown", title: "Private View Card for Art in Revolution: Soviet Art and Design after 1917, Hayward Gallery", year: null },
          { id: "hayward-gac-875", image: "https://lh3.googleusercontent.com/ci/AL18g_TnQPFRk5Ulkh5SSS3EGmWDNFCsQl7XlGmGs2HNlGRyGR-_fYbqUfUGgvqlFMejJEmk-1yF9Yc=w800", artistName: "Unknown", title: "Press Statement on Outsiders: An Art Without Precedent or Tradition, Hayward Gallery", year: null },
          { id: "hayward-gac-876", image: "https://lh3.googleusercontent.com/ci/AL18g_RBzEf9Dr3LiAN6IhVp6JbyTLkVVUXqt6x4aN1dzbGXMCDpQRw1gBcw7PJfjQNQqQRXQkZ_pfyJ=w800", artistName: "Unknown", title: "Draft Press Release for Lucio Fontana, Hayward Gallery, 1999", year: null },
          { id: "hayward-gac-877", image: "https://lh3.googleusercontent.com/ci/AL18g_RyDTMf36LJ4rxWq6E_BNu95bMr4B-JFfPp6xjluqgFcbg5Meac3_wZ5o6iR04n9nLv4ILGPa7e=w800", artistName: "Unknown", title: "Inventory of Items in Peter Greenaway’s 'In the Dark', part of Spellbound: Art and Film, Hayward Gallery, 1996", year: null },
          { id: "hayward-gac-878", image: "https://lh3.googleusercontent.com/ci/AL18g_Su54QhfERC3p-zGX7IHCL2a6DZk-P4xxqWocfVTyFY7WJF5Le5ccL9u3Lh7_N5fTIhO1HXlBA=w800", artistName: "Unknown", title: "Extended Exhibition Statement for British Painting '74", year: null },
          { id: "hayward-gac-879", image: "https://lh3.googleusercontent.com/ci/AL18g_R-EDHtMza-cvjF8UwH3BiKCtUw5LXK9mO7EjLsASZb63uiRbhPuWrG7kYpv35NDUgmVv63psBT=w800", artistName: "Unknown", title: "Flyer for Accompanying Lecture, Nam June Paik: Video Works 1963-88, Hayward Gallery", year: null },
          { id: "hayward-gac-880", image: "https://lh3.googleusercontent.com/ci/AL18g_TcR8vLjq-8ItTgngACfpnij1stUWa6cIYI1DKgOodU1k6tzjrjPo6wKz41YjV-HH_kopl7z0D5=w800", artistName: "Unknown", title: "Internal Memo about the Fragility of Agnes Martin's Works", year: null },
          { id: "hayward-gac-882", image: "https://lh3.googleusercontent.com/ci/AL18g_RcocP0DRk_dTTeeg1b5paQsy1CDefxqbXtXfzBbrT8tR2CXOLOfV_l_moGzVFwLzaFdGHToQ=w800", artistName: "Unknown", title: "Lower Gallery Plan for MOVE: Choreographing You, Art and Dance Since the 1960s, Hayward Gallery, 2010", year: null },
          { id: "hayward-gac-883", image: "https://lh3.googleusercontent.com/ci/AL18g_T_-v5JhnTKj4eP-6Z9dAncTIPfBrpoQiMk_D2TGkYIlW8t4AsOzJ2nx6ryA0hnk1PXCXWKhos=w800", artistName: "Unknown", title: "Catalogue for Hayward Annual 78, Hayward Gallery", year: "1978" },
          { id: "hayward-gac-885", image: "https://lh3.googleusercontent.com/ci/AL18g_SrwUFWBEEmZvXZfT8-CqEerJEq-mOXECditeYxX_zHNYyR7jcuCSvg9ZKB6rgBy9OaA325Ig=w800", artistName: "Unknown", title: "Press Release for Pipilotti Rist: Eyeball Massage, Hayward Gallery, 2011", year: null },
          { id: "hayward-gac-888", image: "https://lh3.googleusercontent.com/ci/AL18g_QihKdlkx27uRDugXeNnh_iXBVlplq2RJS4nf05Qe2qBW5v3maDLWDX3xLH3LIJKyfz9aZE8g=w800", artistName: "Unknown", title: "Introductory Panel for Gravity & Grace: The Changing Condition of Sculpture 1965-75, Hayward Gallery", year: null },
          { id: "hayward-gac-889", image: "https://lh3.googleusercontent.com/ci/AL18g_QOC_hwzrDZ1E_XNd37UnCrXhknA3iP8KRekGGkZSLEc3Z3soHFt31FLraew-Piao-918k0Aw=w800", artistName: "Unknown", title: "Preparatory sketch for Nancy Holt's Holes of Light (1973)", year: "2013" },
          { id: "hayward-gac-891", image: "https://lh3.googleusercontent.com/ci/AL18g_R9Eo7t5XDpxspYs3JFYg_CMdWroqtN-s0Wdza3qqRFr6MxMHK5SSeQwI4nUcPkQQjXQ9SHgQ=w800", artistName: "Unknown", title: "Internal Memo about Hayward Gallery's 'Women's Exhibition'", year: "1978" },
          { id: "hayward-gac-892", image: "https://lh3.googleusercontent.com/ci/AL18g_SHlH2M5_69aF8xHI-aLHFumU8Fy3JsuhUYrWD5569-73S8t3faWZDnQU4rpez6UBRciyTa9P54=w800", artistName: "London, United Kingdom", title: "Flyer for 'Open Space' Event During Hayward Annual 78, Hayward Gallery", year: "1978" },
          { id: "hayward-gac-893", image: "https://lh3.googleusercontent.com/ci/AL18g_SqcE-pGz6MfQexFbHHXbbB8VgwZvf5W0LxdAFj1X2UhPQGvf5yXuImfkoCdSd7o-ixc2n44w=w800", artistName: "Unknown", title: "Press Release for interactive element of How To Play the Environment Game, Hayward Gallery, 1973", year: null },
          { id: "hayward-gac-894", image: "https://lh3.googleusercontent.com/ci/AL18g_TA9n4f-_DZymij9qwBZDlIi9tBOVrqGanmSEec-nCYKwqLBPfLAc2ZqsM_IHtNFOc_Ywg8MA=w800", artistName: "Unknown", title: "Upper Gallery Plan for MOVE: Choreographing You, Art and Dance Since the 1960s, Hayward Gallery, 2010", year: null },
          { id: "hayward-gac-895", image: "https://lh3.googleusercontent.com/ci/AL18g_RE9MgpSJ4WF_0qI4kfGnnOsWUxxP1fVJEMZvyDSPxvpmjGGCgJ7Afizc-Dft1ZuPsYVgBXLw=w800", artistName: "Unknown", title: "Press Release Regarding Exhibition Closure, Le Corbusier: Architect of the Century, Hayward Gallery", year: null },
          { id: "hayward-gac-896", image: "https://lh3.googleusercontent.com/ci/AL18g_RbM4Hs6-H-X7S7uVNkUZO_3oaz_iI_7hqyH4WuSyMrKS6txmBopWaeBOzGK-nb_Q_paMo5MxQ=w800", artistName: "Unknown", title: "Schools Leaflet for Dada and Surrealism Reviewed, Hayward Gallery", year: null },
          { id: "hayward-gac-897", image: "https://lh3.googleusercontent.com/ci/AL18g_QM_-rtm2HCzo3pLW6YURSzLjuLqa5jpjtB7yehxsMW89XkEoMc8fl4fh6hhD-IIp4N6AJ_Mfw=w800", artistName: "Camilla Gray", title: "Exhibition Proposal for Art in Revolution: Soviet Art and Design After 1917, Hayward Gallery", year: "1965" },
          { id: "hayward-gac-898", image: "https://lh3.googleusercontent.com/ci/AL18g_QpkFrVnuDz5_S7tMWPqfVkSfUhgLtIvSXKYAG08rI9KE41KLmvDy2_VW24BjnjC9r3yx1Jl3o=w800", artistName: "Various", title: "Press Cuttings for 11 Los Angeles Artists, Hayward Gallery, 1971", year: "1971" },
          { id: "hayward-gac-899", image: "https://lh3.googleusercontent.com/ci/AL18g_QcBs4n6IeKac8fYnf2ZTSW3h9DFEBqZlVebm89kDYZHQMf-a1b047665G9abXrc_ywjj--RoG8=w800", artistName: "Unknown", title: "Hand-drawn Gallery Plans for Hayward Annual 78, Hayward Gallery", year: "1978" },
          { id: "hayward-gac-900", image: "https://lh3.googleusercontent.com/ci/AL18g_RUM_yuZGBcPWze-0E3FMaeBcTVX9a5c3qWWFmqDQez2B7TZQ29GHd3fz2ZLiXYgue5CUeq9tUa=w800", artistName: "1998-05-12", title: "Catalogue for Anish Kapoor, Hayward Gallery, 1998", year: null },
          { id: "hayward-gac-901", image: "https://lh3.googleusercontent.com/ci/AL18g_T6yXqpmwetg_ZYCe7A2NpwWBAME1jt_NoJsyzL1DvjozRGkhhR7ya2EgljdmOPpJMissvTbQ=w800", artistName: "Unknown", title: "Exhibition Outline for Anish Kapoor, Hayward Gallery, 1998", year: null },
          { id: "hayward-gac-902", image: "https://lh3.googleusercontent.com/ci/AL18g_TIyWwqX0nfdkkMxGzUPH_FtThVOtqKZfUsLyH1XBduiPshBVpYeb2BrJz8AjJ-Jtd9fidu-uFk=w800", artistName: "Unknown", title: "Press Release for touring version of How To Play the Environment Game, Hayward Gallery, 1973", year: null },
          { id: "hayward-gac-903", image: "https://lh3.googleusercontent.com/ci/AL18g_RT4s0GAAck_hyB4cRuj4rY6xyOu7M-8mVwVT2GZOOOpkcVijTj4oKhI9mxQ0XJyx-ZE88ibQ=w800", artistName: "Various", title: "Press Cuttings for Kinetics: An International Survey of Kinetic Art, Hayward Gallery, 1970", year: "1970" },
          { id: "hayward-gac-904", image: "https://lh3.googleusercontent.com/ci/AL18g_QFG3-Ww0Rl9mNVhdwrvA3iha6CktOt3CXww4iuaJCQ8Ke_Xd3MY_y9MiB6Iwt3cWDhLHWBID0=w800", artistName: "Various", title: "Press Cuttings for British Painting '74, Hayward Gallery, 1974", year: "1974" },
          { id: "hayward-gac-905", image: "https://lh3.googleusercontent.com/ci/AL18g_SAuARpIf5_L52zUKFXQU_HM9aR1mUgU-jMsMfGgf0o6SCPO05iRv4cwmWbaqtzjjh7-SdLdw=w800", artistName: "Unknown", title: "Exhibition Guide for How To Play the Environment Game, Hayward Gallery, 1973", year: null },
          { id: "hayward-gac-906", image: "https://lh3.googleusercontent.com/ci/AL18g_ROoLwt_smjvqO_NCutK5CM90UurFwJBGW62jLmWoZcWUQr1eQMNWcWyVWUUokpelFTURu0dA=w800", artistName: "Unknown", title: "Installation Plan for Ana Mendieta: Traces, Hayward Gallery, 2013", year: null },
          { id: "hayward-gac-907", image: "https://lh3.googleusercontent.com/ci/AL18g_TlmFYHN1mzDaS_ookyoPU-rHihFNLs6nWLnT_xQCwWrmPGy7t_7VflrXd7IjYJped3IrcZPm4o=w800", artistName: "Unknown", title: "Exhibition Guide for Martin Creed: What’s the point of it, Hayward Gallery, 2014", year: null },
          { id: "hayward-gac-908", image: "https://lh3.googleusercontent.com/ci/AL18g_Q3GV2Qo7wwvYvMA06c2EUoVyMrWSmBvtfVj21P9cIkGz75U7uIZ1DfD4DNAVM6cOexhu56bpY=w800", artistName: "Unknown", title: "Press Release for Dayanita Singh Go Away Closer, Hayward Gallery, London, 2013", year: null },
          { id: "hayward-gac-909", image: "https://lh3.googleusercontent.com/ci/AL18g_SpUMmlNNj5pfgkNn8c2Ad2XKdMqZI8PsRvr_Vo82d_LCu2u8r5pLAhs9Pc_z7OBdUCUGLtuQ=w800", artistName: "Unknown", title: "Installation Plan for Africa Remix: Contemporary Art of a Continent, Hayward Gallery, 2005", year: null },
          { id: "hayward-gac-911", image: "https://lh3.googleusercontent.com/ci/AL18g_S4YTK077cjMkwrjWR4cXOk0hW8Y_t31xxFR3msa3DugBONwkiQdt95rHfedcTVW_bx6EeT77o=w800", artistName: "Unknown", title: "Gallery Plans for Addressing the Century: 100 years of Art and Fashion, Hayward Gallery, 1998", year: null },
          { id: "hayward-gac-912", image: "https://lh3.googleusercontent.com/ci/AL18g_TbWK4vR-6ctt7qpFY3XgUefVMxV9z7gSEBtgY9lZ-Djlz8Xg0qmDD3b8o_ibVe3xqgXhkoZQ=w800", artistName: "Unknown", title: "Press Release for The New Art, Hayward Gallery", year: null },
          { id: "hayward-gac-914", image: "https://lh3.googleusercontent.com/ci/AL18g_Sj3r_LMQG_3TLVZBh7EwdLulfMnM30Pcm1eq8OeFwwrQ-AB34-UKP1VQdPDllQL3YebSApxwla=w800", artistName: "Unknown", title: "Exhibition Guide for Unbound: Possibilities in Painting, Hayward Gallery, 1994", year: null },
          { id: "hayward-gac-915", image: "https://lh3.googleusercontent.com/ci/AL18g_RUf5wcN24fb7u9AfAOUrbK-nATP8XO01rNMfaQGUZwyzQROOa_kcZjtEjY9emCgPtEKdeVWg=w800", artistName: "Unknown", title: "Introduction to British Painting '74, Hayward Gallery, 1974", year: null },
          { id: "hayward-gac-916", image: "https://lh3.googleusercontent.com/ci/AL18g_QhAYOMbocgM7vj4Dp9ya4fNIDklDf7xH-3hUVx2nX4tY-a2gGAYQ-u4QGQ8yd-Ei4Uo-R6ULet=w800", artistName: "Unknown", title: "Press Cuttings for The Epic and the Everyday: Contemporary Photographic Art, Hayward Gallery", year: "1994" },
          { id: "hayward-gac-917", image: "https://lh3.googleusercontent.com/ci/AL18g_QM5kkr7frDLhZ_-AHZs0u-2z2cSkMNvlEuxO6jWZHV4w0U0DYYRPKDgW8eiR7EKJLJHR1pTQ=w800", artistName: "Unknown", title: "Freesheet produced for Poets After Dark, Light Show, Hayward Gallery (1/2)", year: "2013" },
          { id: "hayward-gac-918", image: "https://lh3.googleusercontent.com/ci/AL18g_QwLvwlw1XuGf-RCsUGjRvP55GWsgrEp5eY9_Z2rqlVQ_ma8W5QWRX-HDL-RNWA_Y3aZPLhv6DB=w800", artistName: "Michael Brawne1970-08", title: "Design Notes for Art in Revolution: Soviet Art and Design After 1917, Hayward Gallery", year: null },
          { id: "hayward-gac-919", image: "https://lh3.googleusercontent.com/ci/AL18g_QqbHUgbTC96D-5NUJObB0Ues6qilv3Lho13L7Xt71hyD8dYzBYnWZukVL2RsHRgmsCnIJ0-ds=w800", artistName: "Unknown", title: "Hand-drawn Exhibition Layout for Unbound: Possibilities in Painting, Hayward Gallery, 1994", year: null },
          { id: "hayward-gac-920", image: "https://lh3.googleusercontent.com/ci/AL18g_SR8SNJ6J3KImHQDeB96SsfoS-RBTCz9oEuZ8vwUeqoslOcVsyIYEF6edsycsHvfWf55NOBfPI=w800", artistName: "Unknown", title: "Hand-drawn Floorplan for Outsiders: An Art Without Precedent or Tradition,Hayward Gallery", year: null },
          { id: "hayward-gac-921", image: "https://lh3.googleusercontent.com/ci/AL18g_Rl7bbFOuWypwxJeviDvdflwPdUWEQAXZZjZCJJPN4231e1M4-CUlfQigkAWpPMyywke4D_4XY=w800", artistName: "Unknown", title: "Statement on the opening of the Hayward Gallery", year: null },
          { id: "hayward-gac-922", image: "https://lh3.googleusercontent.com/ci/AL18g_R0CbEJbooppjt3Z1rWlxj_qFJdr-1lMroYNJlAFtiSCTOYNFpOWx3oCW-pmZDegFG-O0Cl0Vdj=w800", artistName: "Unknown", title: "Freesheet for Ana Mendieta: Traces, Hayward Gallery, 2013", year: null },
          { id: "hayward-gac-923", image: "https://lh3.googleusercontent.com/ci/AL18g_R4Iq6ArwyEwWmANDh9NkrYwb-nuuRlgo8cgEDBhTVX3k9YRqaKirQ3wlBqCefF3FZkPdEqSO_9=w800", artistName: "Unknown", title: "Notes from Meeting with Jon Thompson", year: null },
          { id: "hayward-gac-924", image: "https://lh3.googleusercontent.com/ci/AL18g_QU_Gg4FDTxQJDjW_pAus3meitnYNkOOZIQ-gGtvlau6hfYwTlfLR_2yxWn6fr1vIU7zMhhjRyi=w800", artistName: "Unknown", title: "Exhibition Proposal for How To Play the Environment Game, Hayward Gallery", year: null },
          { id: "hayward-gac-925", image: "https://lh3.googleusercontent.com/ci/AL18g_QAKfLjVQLqX40LTGvPXUQ1RNfslf69Xdl7wQ7ZqY1J3v09lBIkdZAmfTAqDCrzeC0ZPZcsEVM=w800", artistName: "Unknown", title: "Catalogue for The New Art, Hayward Gallery", year: null },
          { id: "hayward-gac-926", image: "https://lh3.googleusercontent.com/ci/AL18g_SEG8O34RWsB5mcsnB-YgoE1D0IgJQ8PuEWZQAAMzeUw1mZzyigo_uQ5rSDMSQtPrHEHi7Aod8=w800", artistName: "Unknown", title: "Press Release for Doubletake: Collective Memory and Current Art, Hayward Gallery, 1992", year: null },
          { id: "hayward-gac-927", image: "https://lh3.googleusercontent.com/ci/AL18g_QyYaIrnEr4-WId7xk2u0eIXFJ0A7jW7Rp1MmNhYTKvOjaP0tpZXfwVrCie7Tkw7GLZXY_PwW8=w800", artistName: "Unknown", title: "Educational Activities for Fall the Shadow: Recent British and European Art, Hayward Gallery", year: null },
          { id: "hayward-gac-928", image: "https://lh3.googleusercontent.com/ci/AL18g_Se7PqReyapOo_GSBH0Cyn0dHOIkV8hagb3qmipjrIwhx00zVNGVaKoOG-3FjLU2TYQamEpIXmV=w800", artistName: "Unknown", title: "Sponsorship Final Report, Le Corbusier: Architect of the Century, Hayward Gallery", year: null },
          { id: "hayward-gac-929", image: "https://lh3.googleusercontent.com/ci/AL18g_SThiKqdP4Taa0GqhMKhOys2J2HibVo31hyIdW72bsmqwNZ_i86pZbFpmsb7GlxR2IGNcd2SRvO=w800", artistName: "Unknown", title: "Hayward Annual 1986 Intentions and Guidelines", year: null },
          { id: "hayward-gac-930", image: "https://lh3.googleusercontent.com/ci/AL18g_Sxwak6vKvywnF6JMNEjucNMN0J548S4-7n1pPdH6H712UgM93Rw0eZQFJVm1zv6BaqbKpWfnwL=w800", artistName: "Unknown", title: "Fanny Adams's 'Honours List', Gravity & Grace: The Changing Condition of Sculpture 1965-75, Hayward Gallery", year: null },
          { id: "hayward-gac-931", image: "https://lh3.googleusercontent.com/ci/AL18g_RCtf5rQpJ9Ph1zJL5UlKw7oANeBykTvnskn2M5wQoCK6uxha1HFjqzii54ZSzmbVpfgSSCkwg=w800", artistName: "Unknown", title: "Project Outline for The Epic and the Everyday: Contemporary Photographic Art", year: null },
          { id: "hayward-gac-932", image: "https://lh3.googleusercontent.com/ci/AL18g_RD5XgcyDhThiPrbD8AW3dzMH63Ji4TdhZ2lBr2zuEAvXANpY6NXeU_jrEVr7kIRq41SCkKQA=w800", artistName: "Unknown", title: "Installation Meeting Agenda for Le Corbusier: Architect of the Century, Hayward Gallery", year: null },
          { id: "hayward-gac-934", image: "https://lh3.googleusercontent.com/ci/AL18g_TNaxYFoarjcuurjtpmFQVh3iIwX5NtnS6V9fBqlWB0v484KlAXGp_1e0Uew-OxwAFiKQuPOv8-=w800", artistName: "Unknown", title: "Catalogue Summary and Contributors Rationale, Le Corbusier: Architect of the Century, Hayward Gallery", year: null },
          { id: "hayward-gac-935", image: "https://lh3.googleusercontent.com/ci/AL18g_SmlVfQfvP8B_NkdB6y7y-IE7VrWbnurA8XHefWChzq6KNDQ-RTfxztn85EkPTudYvxdaGvUvg=w800", artistName: "Unknown", title: "Gallery Plan for Martin Creed: What’s the point of it, Hayward Gallery, 2014", year: null },
          { id: "hayward-gac-936", image: "https://lh3.googleusercontent.com/ci/AL18g_R7FYuDzhckcamit9BQi5sHds87I66dS_RRNzWWaL9a_HuQjRRij5nW13K1N13mfNCikf-hblWD=w800", artistName: "Unknown", title: "Brief for Gallery Stewards about Terry Gilliam’s 'Monolith of Filing Cabinets' in Spellbound: Art and Film, Hayward Gallery, 1996", year: null },
          { id: "hayward-gac-937", image: "https://lh3.googleusercontent.com/ci/AL18g_QNqvsArXwhoWBYJ-09upLGLxmfh2yCpaPPpOY5eIHX3JQH06OrIX2VhSLsfGUnKjRcmq0de8o=w800", artistName: "Unknown", title: "Early Exhibition Proposal for Art and Power: Europe Under the Dictators 1930-1945, Hayward Gallery", year: null },
          { id: "hayward-gac-938", image: "https://lh3.googleusercontent.com/ci/AL18g_QMtOAfiwsBq5e-nDL3Uk7FJopAvGFtagXTG9TS2MhvKasKbl00DIyojQc-SzRELdJPQsQ5Hw=w800", artistName: "Unknown", title: "Poster for Richard Long: Walking in Circles, Hayward Gallery", year: null },
          { id: "hayward-gac-939", image: "https://lh3.googleusercontent.com/ci/AL18g_T8xIcIoQ5_dUZQyOGJVb_Y8pIAa-vnluWCHSv5SDfri-yELza5JZ2uICKqA2pBQctJgkJ78w=w800", artistName: "Unknown", title: "Internal Memorandum about Stephan Balkenhol’s figure in the Thames, Doubletake: Collective Memory and Current Art, Hayward Gallery, 1992", year: null },
          { id: "hayward-gac-941", image: "https://lh3.googleusercontent.com/ci/AL18g_SGB1IFkYB3MssuVnH1QB1ahJl1cofN_L0okMQlJd9VCJheb4lBw4ft1lPL_8U5EOCjX2608j8=w800", artistName: "Unknown", title: "Conference Programme for Rhapsodies in Black: Art of the Harlem Renaissance, Hayward Gallery, 1997", year: null },
          { id: "hayward-gac-943", image: "https://lh3.googleusercontent.com/ci/AL18g_RNGw1xT0bulAYbX7vybeBzy0NBtKTuys9XRpTBW4QBFQImep9fFz-ofm21lwNfteYH8O8akpo=w800", artistName: "Unknown", title: "Hand-drawn Layout for Gravity & Grace: The Changing Condition of Sculpture 1965-75, Hayward Gallery", year: null },
          { id: "hayward-gac-944", image: "https://lh3.googleusercontent.com/ci/AL18g_Q86bF1LaziLlTMJPhV_SX0qIZNuBtfuZqTTv3RcROLR45FCh6Jc5fXNJr4ae3P0Zik_dn31aI=w800", artistName: "Unknown", title: "Press Release for Pier + Ocean: Construction in the Art of the Seventies, Hayward Gallery", year: null },
          { id: "hayward-gac-945", image: "https://lh3.googleusercontent.com/ci/AL18g_TnBsjwgaNcZ14StNPY4ONmvTdh972LafcMDwLwJoq9HK55th5yj8JayQEhF7UYanlZ4IW4k_Pj=w800", artistName: "Unknown", title: "Arts Advisory Group report on Richard Long: Walking in Circles, Hayward Gallery", year: null },
          { id: "hayward-gac-946", image: "https://lh3.googleusercontent.com/ci/AL18g_QhsAIXqRommO9n1zVlQPQnEbLg7BfYA9lsFVKb0V78O1PvF-wNxJMRgHY2dmSONDkSPwd0og=w800", artistName: "Unknown", title: "Advert for Falls the Shadow, Hayward Gallery", year: null },
          { id: "hayward-gac-947", image: "https://lh3.googleusercontent.com/ci/AL18g_QRvUZXswqr6cWpVOt2rfj8zDxE3ws0dkRd0iZVlVVkY3CRl-Z7OqpmXKIbYqtUodw-yq-F9Ys=w800", artistName: "Unknown", title: "Exhibition Guide for The Epic and the Everyday: Contemporary Photographic Art, Hayward Gallery", year: null },
          { id: "hayward-gac-948", image: "https://lh3.googleusercontent.com/ci/AL18g_SUdsYdtGCCqthEAMubudFYKmBw_mVwBQY5AA5-i7akKySBPZVzUedZbcZ0VcJbxcri79eV=w800", artistName: "Unknown", title: "Preliminary Installation Plans for Art in Latin America: The Modern Era, 1820-1980, Hayward Gallery", year: null },
          { id: "hayward-gac-949", image: "https://lh3.googleusercontent.com/ci/AL18g_TOi1X3dFC4d1sQZzBd0AM73PMVf8NUhLv-snQs4lKlmhAvLH011Y-1S-UCw1laatORmBIx-2w=w800", artistName: "Unknown", title: "Hand-written List of Possible Titles for Francis Bacon: The Human Body, Hayward Gallery, 1998", year: null },
          { id: "hayward-gac-950", image: "https://lh3.googleusercontent.com/ci/AL18g_RhTC8hK5XOewd_FwqEzixJEcCJBs5bPmGuNNwfwuE2lYsxUaYZ2aFH1f3v8d-LC0DwFOmzZHxQ=w800", artistName: "Unknown", title: "Summary of the Dada and Surrealism 'Audience to an Audience' survey", year: null },
          { id: "hayward-gac-951", image: "https://lh3.googleusercontent.com/ci/AL18g_Qqz9D47Tvv4BJ97iMCgJZfHBdx_KyHyAdeJt_EiCWZa42kNjvhlGKC_on0iZTQSr9cahdfCUU=w800", artistName: "Unknown", title: "Press Announcement for Sonic Boom: The Art of Sound, Hayward Gallery, 2000", year: null },
          { id: "hayward-gac-954", image: "https://lh3.googleusercontent.com/ci/AL18g_T0asE9EB1OyWz62Aq5DI2KzAf2wjev4GMptlGfn3qTZ4G6uOOVIyLQIyfkRqjxGTDJtWgUgcM0=w800", artistName: "Unknown", title: "Exhibition Proposal for a 'History of Black Artists in Britain'", year: null },
          { id: "hayward-gac-955", image: "https://lh3.googleusercontent.com/ci/AL18g_SDDfNpPCA7MTlxYdqH8H9TkYJMC0EppfyyE22aY1zUZNA_sMBrKg8JPR_6i-XaQ-7p05PRVQ=w800", artistName: "Unknown", title: "Final Exhibition Outline for Addressing the Century: 100 years of Art and Fashion, Hayward Gallery, 1998", year: null },
          { id: "hayward-gac-956", image: "https://lh3.googleusercontent.com/ci/AL18g_T6hfO0iBE4WYUKTNQNy_rg3fX8mgaj2HGZqIWSGBxiFhQTAD5Ac1N42l2mWmihlPV3U7iGfhI=w800", artistName: "Unknown", title: "Press Release for Hayward Annual 77, Hayward Gallery", year: null },
          { id: "hayward-gac-958", image: "https://lh3.googleusercontent.com/ci/AL18g_SVkmSaSHmDqsYcMzakQay-WBBpqSfzRatQfKwRXOSu9PPVWg7RnpRxxtimXYSE7YVFW5WGHR8=w800", artistName: "Unknown", title: "Draft Press Release for Outsiders: Art Without Precedent or Tradition, Hayward Gallery", year: null },
          { id: "hayward-gac-959", image: "https://lh3.googleusercontent.com/ci/AL18g_TeWYvCrWlfzS4_oJ0ND3UlUr-fF90xS89SOiFdReh9pNYbwOshoGFz0fYbRt2QBtwPueI6lsuo=w800", artistName: "Unknown", title: "Project Summary for Unbound: Possibilities in Painting, Hayward Gallery, 1994", year: null },
          { id: "hayward-gac-962", image: "https://lh3.googleusercontent.com/ci/AL18g_T4t7y4XNl5WOE1die7xxYPRCh9pNpC0ZP9ZBqgbSEwilkeqjD4lPXtR0szBAxc5Lu11rvBvg=w800", artistName: "Unknown", title: "Proposals for an Exhibition of Photographic Art", year: null },
          { id: "hayward-gac-963", image: "https://lh3.googleusercontent.com/ci/AL18g_TCH9Z40WXdj1uLRVhXe7Mn4Z_anRXorb2OfFEDn3r5fXIP6LncxHatiYKPcZOipzPyw6DDwa8=w800", artistName: "Unknown", title: "Press Release for Pier + Ocean: Construction in the Art of the Seventies, Hayward Gallery", year: null },
          { id: "hayward-gac-964", image: "https://lh3.googleusercontent.com/ci/AL18g_TwYSL8MhVbbT5ZeLbtpvebcUnyTedpw3_J1kMF4EPr2FLyqpF5RCSuUUbe6irKqcAr-upsZ-0=w800", artistName: "Unknown", title: "Press Release for Art and Power: Europe Under the Dictators 1930-1945, Hayward Gallery", year: null },
          { id: "hayward-gac-965", image: "https://lh3.googleusercontent.com/ci/AL18g_TqUCW8TtBBAXRVO6mXhyZwSsBwPq_7wo59xZwv_SmPBgu0vijH69Ie3hD44HxBnmcemSOLCt4=w800", artistName: "Unknown", title: "Early Exhibition Proposal for How To Play the Environment Game, Hayward Gallery, 1973", year: null },
          { id: "hayward-gac-966", image: "https://lh3.googleusercontent.com/ci/AL18g_S4rv1KQtHzCYp84ckmzckPOW6kzUO_0JKWycI1hWjpBjaJlPDgYxz-EPHNhU0iT8uUVyramSA=w800", artistName: "Unknown", title: "Press Release for Dada and Surrealism Reviewed, Hayward Gallery", year: null },
          { id: "hayward-gac-968", image: "https://lh3.googleusercontent.com/ci/AL18g_T62AftbGw3cMPi4e8l0oIvX-Qc9x31abKHKk1yRpmRO5AHOWABKS7n6tff0HjFQpzlK_IJ93w=w800", artistName: "Unknown", title: "Notes on the Official Opening of the Hayward Gallery's Inaugural Exhibition", year: null },
          { id: "hayward-gac-970", image: "https://lh3.googleusercontent.com/ci/AL18g_S4HbwLuzBwmPWOF5Z06SOaLy1xysz26Sm8sWzrZ99fVtnNXoLpHPL5y5-Q1cWk7MsWaBpoWpNO=w800", artistName: "Unknown", title: "Exhibition Guide for The New Art, Hayward Gallery", year: null },
          { id: "hayward-gac-971", image: "https://lh3.googleusercontent.com/ci/AL18g_Rex4SKA9sDRq9WzrjeB5clVjzUyHc-Me5Rmisc-tcRwdat-76ViPym2-mi4JsJUh8qfr8zDg=w800", artistName: "Unknown", title: "Hand-written List of Possible Titles for Francis Bacon: The Human Body, Hayward Gallery, 1998", year: null },
          { id: "hayward-gac-972", image: "https://lh3.googleusercontent.com/ci/AL18g_QYUSOmpx4nkfXc-nJrHz9vj2LFE4KI2Za_gshKXEuE9yeULSN__3ZNXNaWPhfQlT0DZbSI1Qc=w800", artistName: "Unknown", title: "Internal memo announcing The New Art, Hayward Gallery", year: null },
          { id: "hayward-gac-973", image: "https://lh3.googleusercontent.com/ci/AL18g_Sw1GhXoIwV9BuKe-kjtPgQSeFhkTQw2HaByrlyTFAI_VbkQdnEvNIAXNaa5iaEdpSzBrEUGLM=w800", artistName: "Unknown", title: "Poster for Anish Kapoor, Hayward Gallery, 1998", year: null },
          { id: "hayward-gac-974", image: "https://lh3.googleusercontent.com/ci/AL18g_TS0sxQs4t6b_pNi9zBcQMWPYQwIRgqsuFtv1H2v_5_0oGi3-hZNgNM7FBeS9vS0T2LMJ_z3I9m=w800", artistName: "Unknown", title: "Notes from a Visit to Richard Long", year: null },
          { id: "hayward-gac-975", image: "https://lh3.googleusercontent.com/ci/AL18g_SfeUs_Q70t0gIs56__h8Gei7VepYL5VfbSchSOIoG7aAmrbMw-e1QLaS2Mly1RqoLqrgCpuOw=w800", artistName: "Unknown", title: "Exhibition Guide for MOVE: Choreographing You, Art and Dance Since the 1960s, Hayward Gallery, 2010", year: null },
          { id: "hayward-gac-976", image: "https://lh3.googleusercontent.com/ci/AL18g_Qs8zLt8h3_I8uwmkkmpRhXxEyy2aWVFS_y_ECh0QulvRBzMIbof7oFZHzSOooKlJzg4IDbgQ=w800", artistName: "Unknown", title: "Catalogue for Agnes Martin: Paintings and Drawings 1957-1975, Hayward Gallery, 1977", year: null },
          { id: "hayward-gac-977", image: "https://lh3.googleusercontent.com/ci/AL18g_RnNSX0UL4Pa8-mDZTK-izt1x2Siy6UrUfWnYJjrx96fQnCyCukzNgBtBqv4zQLHVU9Ai6PxwfC=w800", artistName: "Unknown", title: "Early Exhibition Outline for Art in Latin America: The Modern Era, 1820-1980, Hayward Gallery", year: null },
          { id: "hayward-gac-980", image: "https://lh3.googleusercontent.com/ci/AL18g_TLolfrV9RpXgW-rBSac7EyXN0YfS6dGrAJ2I_w2s4ocyEq1ux-b0SDvW04_DiHurRPfPqc6g=w800", artistName: "Unknown", title: "Internal Memo about Unbound: Possibilities in Painting, Hayward Gallery, 1994", year: null },
          { id: "hayward-gac-981", image: "https://lh3.googleusercontent.com/ci/AL18g_QhnsrLtUHKcsBFN8eHmNsJ9NttLFX9s22m8Cm8GCmu0kfprRHWazEz-rwj5XwK6Vm74Gr9=w800", artistName: "Unknown", title: "Exhibition Guide for MOVE: Choreographing You, Art and Dance Since the 1960s, Hayward Gallery, 2010", year: null },
          { id: "hayward-gac-982", image: "https://lh3.googleusercontent.com/ci/AL18g_SCyXwZdDD3YSlh1bebTQLjsDasIux9Mflk2f5e3GaFsO7UzxlFq_0ws4M23QUOmawk8Q_0sw=w800", artistName: "Unknown", title: "Music for Fontana Leaflet", year: null },
          { id: "hayward-gac-984", image: "https://lh3.googleusercontent.com/ci/AL18g_TpmvxPrzsqKAmr_I-OfAPj8Tv4_mYk4yD2PtywtpXbampF_0FSpi79aeLR4KfvLViZbiwUTg=w800", artistName: "Unknown", title: "Catalogue for Hayward Annual 78, Hayward Gallery", year: null },
          { id: "hayward-gac-985", image: "https://lh3.googleusercontent.com/ci/AL18g_TRC6vn-y5M2tI79DNsHeNRGD2QvFkGb-4U513tNgU0MI5zgd5N3ENfJ9_myfWn3QsqUCTHDR0=w800", artistName: "Unknown", title: "Early Exhibition Proposal for Rhapsodies in Black: Art of the Harlem Renaissance, Hayward Gallery, 1997", year: null },
          { id: "hayward-gac-986", image: "https://lh3.googleusercontent.com/ci/AL18g_Rgtzq9LKrVEkEJ3s9TbsPUMlp6jfZo6tkrJGUX0x1wOY4UcDK7N_Dovv-H4gFGUJ2NRYped54=w800", artistName: "Unknown", title: "Gallery Plans for The Epic and the Everyday: Contemporary Photographic Art, Hayward Gallery", year: null },
          { id: "hayward-gac-987", image: "https://lh3.googleusercontent.com/ci/AL18g_Q2MSSN3XHB-X2ImDPleQ84gfCeAC1mq-C0OVXeeMI3cg6xh87lDl7C8xUyrSpVadVrucpSLTg=w800", artistName: "Unknown", title: "Full-length Press Release for Spellbound: Art and Film, Hayward Gallery, 1996", year: null },
          { id: "hayward-gac-988", image: "https://lh3.googleusercontent.com/ci/AL18g_TUMqk_HgI144OiOlFSon1S8mNbC5ieM8pNZGdCJyoHUr3zu2wIgyMfTYNPDvoGb_bT5uDo9tA=w800", artistName: "Unknown", title: "Notes on Exhibition Graphics, Art in Revolution: Soviet Art and Design After 1917, Hayward Gallery", year: null },
          { id: "hayward-gac-989", image: "https://lh3.googleusercontent.com/ci/AL18g_SlLP8uNSgPZqQ92EiO_RTIodnkCXDMY8WnUReFw9qKxGXQR4QBT4Eo3GhKXaiboYj170DLgIc=w800", artistName: "Unknown", title: "Early Exhibition Proposal for The Other Story: Afro-Asian Artists in Postwar Britain, Hayward Gallery, 1989", year: null },
          { id: "hayward-gac-990", image: "https://lh3.googleusercontent.com/ci/AL18g_S6sa3K3bc7SlshzfBn39U9yrGI25QACJ9Gvo3zgxAMF8gKRkqR8E_eVIw-1ISS8tT8_GrITjM=w800", artistName: "Unknown", title: "Introductory Panel for Sonic Boom: The Art of Sound, Hayward Gallery, 2000", year: null },
          { id: "hayward-gac-991", image: "https://lh3.googleusercontent.com/ci/AL18g_SlrSwHxxjLIccSp4vPuq1ttEM8E1makanADJxAcAmubcBuuoxyPh1YFp0e3iDIHntSOAnMUg=w800", artistName: "Unknown", title: "Exhibition Guide for MOVE: Choreographing You, Art and Dance Since the 1960s, Hayward Gallery, 2010", year: null },
          { id: "hayward-gac-992", image: "https://lh3.googleusercontent.com/ci/AL18g_RgIKLBhhyFUqPWnKey1tMIRLTXHkWNn3MHM-02ggW6DqJthqphSQ1iW6jdOqYfmZjXSElOK9Kn=w800", artistName: "Unknown", title: "Internal Correspondence regarding Art and Power: Europe Under the Dictators 1930-1945, Hayward Gallery", year: null },
          { id: "hayward-gac-994", image: "https://lh3.googleusercontent.com/ci/AL18g_Snw_EnJw_YVLnvoT-N8vtufZf-L_xGJgUCTrK2FuGrPG9x9eZ2SiYxpsrrcrQPmIrM16MNd9ry=w800", artistName: "Unknown", title: "Exhibition Guide for MOVE: Choreographing You, Art and Dance Since the 1960s, Hayward Gallery, 2010", year: null },
          { id: "hayward-gac-996", image: "https://lh3.googleusercontent.com/ci/AL18g_RuoR_VLufvUIbxVVqLvXeoreMPh82Fbcy4p32iSjn0uv8foz8rdO66jkQh6eX4wxIWJE6txsU=w800", artistName: "Unknown", title: "Press Release for Hayward Annual 78, Hayward Gallery", year: "1978" },
          { id: "hayward-gac-998", image: "https://lh3.googleusercontent.com/ci/AL18g_QFQMDDcCyHnHD4B6LkCw4tS2Py8gLMCycjs_SeCkfXs1nKtviGxWQwrZaw5HhNHRLj6wc0nBkf=w800", artistName: "Unknown", title: "Early Exhibition Outline for Addressing the Century: 100 years of Art and Fashion, Hayward Gallery, 1998", year: null },
          { id: "hayward-gac-999", image: "https://lh3.googleusercontent.com/ci/AL18g_SxMHmv2dczKVMW_q7ycNCJgHwsFs_jMNI1K4f9_e9oBAUhys0xM0vbJhoN196LNmnddOQuvQ=w800", artistName: "Unknown", title: "Prelimary Installation Plan for Richard Long: Walking in Circles, Hayward Gallery", year: null },
          { id: "hayward-gac-1000", image: "https://lh3.googleusercontent.com/ci/AL18g_RUTigK8OvoiSv-qqqt6xIbwhf61nnjExxOnCjxSuZInEkgQ33px5RoGNe_XQrdBsBbD8NWDtY=w800", artistName: "Unknown", title: "Education Programme for Doubletake: Collective Memory and Current Art, Hayward Gallery, 1992", year: null },
          { id: "hayward-gac-1002", image: "https://lh3.googleusercontent.com/ci/AL18g_SHwBzY9hz8ov4HBoXHmqGF3AwCtL_zfvZMK5jrBaUVeCAg2rc92xrOtfqcp_A5X7tvBr6B-A=w800", artistName: "Unknown", title: "Notes from a Meeting at the Arts Council on The Other Story: Afro-Asian Artists in Postwar Britain, Hayward Gallery, 1989", year: null },
          { id: "hayward-gac-1004", image: "https://lh3.googleusercontent.com/ci/AL18g_TT-dw0tCIr9aq5USLTAC4nsrysfg_w_rM52IhS6vo3qehs5R0jcllpWakFqf5WTTxSAwv-Wuw=w800", artistName: "Unknown", title: "Children's Guide for Martin Creed: What’s the point of it, Hayward Gallery, 2014", year: null },
          { id: "hayward-gac-1005", image: "https://lh3.googleusercontent.com/ci/AL18g_SNmhdPzUPYGn2PnBebNeYclT2VogHrkWS4G-509Q5yG4MCgwrOQVihzIuYgJSavfe7qdsV6Qg=w800", artistName: "Unknown", title: "Press Release for Rhapsodies in Black: Art of the Harlem Renaissance, Hayward Gallery, 1997", year: null },
          { id: "hayward-gac-1006", image: "https://lh3.googleusercontent.com/ci/AL18g_TeT3IRf7F23CR8jtWR5MzjTHMKFQWOzdsytfWIn0POb78FiiUBzaWoioAt2GRIdQUPfilwAgQ=w800", artistName: "Unknown", title: "Early Exhibition Proposal for Gravity & Grace: The Changing Condition of Sculpture 1965-75, Hayward Gallery", year: null },
          { id: "hayward-gac-1007", image: "https://lh3.googleusercontent.com/ci/AL18g_S64-iydsMqNtwOTJE1_D-sB-x7aInFAEXQde2BopIdVy7-fV7Gq7uEPSw08zB__E8nC9YCd7A=w800", artistName: "Unknown", title: "Invitation to Special Preview of Light Show, Hayward Gallery", year: "2013" },
          { id: "hayward-gac-1008", image: "https://lh3.googleusercontent.com/ci/AL18g_TZHxJC1lk-KnzONCvOi3D6vIMd8BopXU4pgWF1KbLmxVQLqMAddwqMLR9Zw17alM67XlLLtrg=w800", artistName: "Joanna Drew", title: "Foreword to Catalogue for Agnes Martin: Paintings and Drawings 1957-1975, Hayward Gallery", year: "1977" },
          { id: "hayward-gac-1010", image: "https://lh3.googleusercontent.com/ci/AL18g_Sf9HD5meEUAHbks3erLHEbUpF1J2Z9q9DjUS-eg1cb031HDNTa4Vzr62IREjB-UW1ggUN9OwY=w800", artistName: "Unknown", title: "Exhibition Summary for Art in Revolution: Soviet Art and Design After 1917, Hayward Gallery", year: null },
          { id: "hayward-gac-1011", image: "https://lh3.googleusercontent.com/ci/AL18g_T0hpOvpDBKH8fBG8qa7a-LcmsoRWQQvXsSyjb2sU6GR_yYTilYEQPNm0D71DkcS-FVgr6upXU=w800", artistName: "Unknown", title: "Press release for Light Show, Hayward Gallery (3/3)", year: "2012" },
          { id: "hayward-gac-1012", image: "https://lh3.googleusercontent.com/ci/AL18g_Q5IhZGjrwkJCGOMR-PP_sbG8cqgcckpIlsjBHytaDvJImyQi0qLMEnraXImeaUScSBBioAuvEz=w800", artistName: "Unknown", title: "Press Release for Ed Ruscha: 50 Years of Painting, Hayward Gallery, 2009", year: null },
          { id: "hayward-gac-1013", image: "https://lh3.googleusercontent.com/ci/AL18g_QbjLOcWQZ7WpV8CO6Z6lby9Wrz8SFRcs4lSlBntxZ33cAJsVGGZcp0EKCCPYdfm8f3loJVqHU=w800", artistName: "Unknown", title: "Exhibition Guide for MOVE: Choreographing You, Art and Dance Since the 1960s, Hayward Gallery, 2010", year: null },
          { id: "hayward-gac-1014", image: "https://lh3.googleusercontent.com/ci/AL18g_TBYREzx5MIXs0wM2ZUqCPhzWaYXunwhd72YNt6aC0FSGUmHgCDCawKiyhWqtlGTsnHQEGfzgk=w800", artistName: "Unknown", title: "Press Release for Art in Latin America: The Modern Era, 1820-1980, Hayward Gallery", year: null },
          { id: "hayward-gac-1016", image: "https://lh3.googleusercontent.com/ci/AL18g_To1aRYabMpYA50Vyk2q_0BxFsl2ECkbtFE0B8ov-hJoRJzrzMOvmCjTL6x_nURHYnAO08CaWg=w800", artistName: "Unknown", title: "Notes from a Meeting with Richard Long", year: null },
          { id: "hayward-gac-1017", image: "https://lh3.googleusercontent.com/ci/AL18g_TeVDRD-S0BEp8IYedWeo5C5v6ctN6Fsk0xtKACKiDMDSJujIeTGJlDCOYYDljCqz3HhMKbDmPZ=w800", artistName: "Unknown", title: "Press Release for Spellbound: Art and Film, Hayward Gallery, 1996", year: null },
          { id: "hayward-gac-1018", image: "https://lh3.googleusercontent.com/ci/AL18g_Ta2Ek5y3l_Rr7q6dX-tf1tppPnn2fKBY6mGLZ3XXQfqmslqeRlsZyU9SaArlw4qET-d1xnP8B4=w800", artistName: "Unknown", title: "Exhibition Proposal for Outsiders: An Art Without Precedent or Tradition, Hayward Gallery", year: null },
          { id: "hayward-gac-1019", image: "https://lh3.googleusercontent.com/ci/AL18g_Qn6eltW23gddp-w6_apXM7AXBUYwn7j1ASVmpKPg7gAwOO-5MmNVDFEeKJo7PZgtb9Oq2ZP3I=w800", artistName: "Unknown", title: "Press Release for Gravity & Grace: The Changing Condition of Sculpture 1965-75, Hayward Gallery", year: null },
          { id: "hayward-gac-1021", image: "https://lh3.googleusercontent.com/ci/AL18g_Ts6JFRe_36BU7JSGNmvBgPsFrHIp68OklobBnnZMzta-HhYuEfVUoLY5CO4-QULXX9pxBQyUI=w800", artistName: "Unknown", title: "Extract from the Independent Evaluation of Dada and Surrealism Reviewed, Hayward Gallery", year: null },
          { id: "hayward-gac-1022", image: "https://lh3.googleusercontent.com/ci/AL18g_TEfwVAcZMUCy0q-lmfNbOSnmnmHQUYfSFp2L3WXR5lTZ45KQMxpPjGX943aurre6ypFMB-7w=w800", artistName: "Unknown", title: "Notes from a Meeting at the Arts Council on The Other Story: Afro-Asian Artists in Postwar Britain, Hayward Gallery, 1989", year: null },
          { id: "hayward-gac-1024", image: "https://lh3.googleusercontent.com/ci/AL18g_TYV1KX0Nn8reQEKJ3Tl3oUwd8_lZYjRzmBbb22aZulbCyv4FqkjjQa1PLItFDsk-_EX5vZkQ=w800", artistName: "Unknown", title: "Poster for Agnes Martin: Paintings and Drawings 1957-1975, Hayward Gallery, 1977", year: null },
          { id: "hayward-gac-1025", image: "https://lh3.googleusercontent.com/ci/AL18g_RzzwtcoQ2BhFXyBZIaJeZ7RLKEhptqbEOp_Jn7D5N-y0WJ0cn-uEtrFS3CVYMza-39OeI63cA=w800", artistName: "Unknown", title: "Draft Press Release for Outsiders: Art Without Precedent or Tradition, Hayward Gallery", year: null },
          { id: "hayward-gac-1027", image: "https://lh3.googleusercontent.com/ci/AL18g_SsqSsxgciz53xCrmy2Nh8Fw_GotEUfaR6sp085TnvW6KgdEg-l7OECFAO7WUylXgQQBcjaFc8=w800", artistName: "Unknown", title: "Exhibition Guide for MOVE: Choreographing You, Art and Dance Since the 1960s, Hayward Gallery, 2010", year: null },
          { id: "hayward-gac-1028", image: "https://lh3.googleusercontent.com/ci/AL18g_TM2EF4NjWQzgonxbJ3BGk-jsuDKXY3w87O8zfMQhlIyX83E9kvzIRM52zRocJg1o1xilKyTnU=w800", artistName: "Unknown", title: "Press Release for Hayward Annual 77, Hayward Gallery", year: null },
          { id: "hayward-gac-1029", image: "https://lh3.googleusercontent.com/ci/AL18g_Q7q-evltV1BbQk5mhHzY6RulWVY91akEtr9vH5qGVdGgwL3dvw2EhHpb2isGVQME3o8x5zNnSd=w800", artistName: "Unknown", title: "Invitation to Art and Power International Symposium", year: null },
          { id: "hayward-gac-1030", image: "https://lh3.googleusercontent.com/ci/AL18g_T4vt1NdIgzoaJrVc9YRamwkvNI_nY-I85FdSoxpyqbrrtQ0dPKIU1U6xdMWoDTU_k3_1rfUro=w800", artistName: "Unknown", title: "Private View Card for Art in Latin America: The Modern Era, 1820-1980, Hayward Gallery", year: null },
          { id: "hayward-gac-1031", image: "https://lh3.googleusercontent.com/ci/AL18g_QT2q4clIpS-7Y7xxYz0CAaNwZACF2im2YZBm_5E9shXu8bnq56dIlcdjWFoQI5jKpvVYyjUrOx=w800", artistName: "Unknown", title: "Exhibition Outline for Pier + Ocean: Construction in the Art of the Seventies, Hayward Gallery", year: null },
          { id: "hayward-gac-1032", image: "https://lh3.googleusercontent.com/ci/AL18g_TTvY3xToB9aFo6ozaP4DpkmDOshBIUhQSDrV_YNup1UyFRboGqGyAVn0beDWN9zDPNMOm9gw=w800", artistName: "Unknown", title: "Exhibition Guide for MOVE: Choreographing You, Art and Dance Since the 1960s, Hayward Gallery, 2010", year: null },
          { id: "hayward-gac-1033", image: "https://lh3.googleusercontent.com/ci/AL18g_TbKcBQ_-MGmLQISJk3TmG8cDQBNwMxtdcydvDtUuWNhVApeNrTriAB-RauvYN_J6H8lzs-eYwd=w800", artistName: "Unknown", title: "Press release for Light Show, Hayward Gallery (1/3)", year: null },
          { id: "hayward-gac-1034", image: "https://lh3.googleusercontent.com/ci/AL18g_T24wTOtdjmT9hkBRoWAwAoaxIs_0i_gf9LICvtJERCj_xTiaRX4I2N3Ud-scO7kTVcTxCf0g=w800", artistName: "Unknown", title: "Extract from Directorate Meeting about 11 Los Angeles Artists ‘Catfish Controversy’, Hayward Gallery", year: null },
          { id: "hayward-gac-1035", image: "https://lh3.googleusercontent.com/ci/AL18g_R-nSsMtDdiXw05uE47BVdu_STjcKNKLYCRS9UPVDI0Vs-xjboXQZ6MBTMzW0EmNXDwwkcDdK4P=w800", artistName: "Unknown", title: "Internal Memo, Art and Power: Europe Under the Dictators 1930-1945, Hayward Gallery", year: null },
          { id: "hayward-gac-1036", image: "https://lh3.googleusercontent.com/ci/AL18g_S923HVPD6c899C7kznbq2BfTvXe62gPps3Q8FyMORzti6aN25Q8WyNzqhsPx5VKH3_r8_Iny-D=w800", artistName: "Unknown", title: "Events Panel for Psycho Buildings: Artists Take On Architecture, Hayward Gallery, 2008", year: null },
          { id: "hayward-gac-1037", image: "https://lh3.googleusercontent.com/ci/AL18g_QZuxXYrmxt7wCjha3MbedIkEvOkXLw2R9wfFKbqaiFEKZs7q28v1FYTF6ssyg6Oi9ivJ9tLzn4=w800", artistName: "Unknown", title: "Exhibition Guide for MOVE: Choreographing You, Art and Dance Since the 1960s, Hayward Gallery, 2010", year: null },
          { id: "hayward-gac-1039", image: "https://lh3.googleusercontent.com/ci/AL18g_Tr70GW5Wnxg3ZgAB2vW4unMJ5QqgiYc-rycScZ4p6-nRZGYSeAQh3G5TlG6f8INe5xN333Gw=w800", artistName: "Unknown", title: "Private View Invitation for Tracey Emin: Love is What You Want, Hayward Gallery, 2011", year: null },
          { id: "hayward-gac-1041", image: "https://lh3.googleusercontent.com/ci/AL18g_RJMq--qjqPba_gcSGHBo5XBdbfqU-Knj1JUMsM5VoHAOGGmAwf8PDhRVvj7aIRECzHxO75EIg=w800", artistName: "Unknown", title: "Press Cuttings for Unbound: Possibilities in Painting, Hayward Gallery, 1994", year: "1994" },
          { id: "hayward-gac-1043", image: "https://lh3.googleusercontent.com/ci/AL18g_SjkoaBfr7iBZAqw-IqUjyFGgbO15-rn7ulf8MP7w5kKt-lVmviJcuOUrcVBlVGzlt2CRxMyw=w800", artistName: "Unknown", title: "Short Exhibition Statement for British Painting '74", year: null },
          { id: "hayward-gac-1044", image: "https://lh3.googleusercontent.com/ci/AL18g_RxNnlG8isLNJqetRw0h1M-Wv37Bfflj3Dgp5AMUYCahsDG1f2_fDuRamHfvwagh7G-Iby5igSx=w800", artistName: "Unknown", title: "Works List for  Pier + Ocean: Construction in the Art of the Seventies, Hayward Gallery", year: null },
          { id: "hayward-gac-1045", image: "https://lh3.googleusercontent.com/ci/AL18g_T7LH3FUfLuWUFGYn_Bw4qR5usULzNC4lm9A9b5IdbSY2sQHW6wBYkQK0-sAfNJUggUPcpT8Q=w800", artistName: "Unknown", title: "Invitation to a Party for Kinetics: An International Survey of Kinetic Art, Hayward Gallery", year: null },
          { id: "hayward-gac-1046", image: "https://lh3.googleusercontent.com/ci/AL18g_QZh26ZsS3PaZ2ObgsESCFbmhp5axnLKvSWy3J5zzuhSlzkyc6GxMoAa-9HRxv4nvPBgaM3DJ4j=w800", artistName: "Unknown", title: "Press Release for Ana Mendieta: Traces, Hayward Gallery, 2013", year: null },
          { id: "hayward-gac-1047", image: "https://lh3.googleusercontent.com/ci/AL18g_SuXmSv3NHpkviREIh327hPmMDplL95Ej8ifenA4rsxqvTytdbhtIllOpoIaeXlp1RkK1dW99U=w800", artistName: "Unknown", title: "Press Release for Richard Long: Walking in Circles, Hayward Gallery", year: null },
          { id: "hayward-gac-1048", image: "https://lh3.googleusercontent.com/ci/AL18g_Tisrd0xu1ZX83CT7H_S-3K7oaAFoKK6hzz3fYyS08n7-mwTR0-jUvszQpgxWV7XdT_GobzcFA=w800", artistName: "Unknown", title: "Press Release for Anish Kapoor, Hayward Gallery, 1998", year: null },
          { id: "hayward-gac-1049", image: "https://lh3.googleusercontent.com/ci/AL18g_TqUGyAlCJyenSR1S8oKaf3tjaUHAXJZc-HzWa5hrmkWt1RRNvPJ8fyLBi1zvttXADNeFwDLTik=w800", artistName: "Unknown", title: "Marketing Leaflet for Anish Kapoor, Hayward Gallery, 1998", year: "1998" },
          { id: "hayward-gac-1050", image: "https://lh3.googleusercontent.com/ci/AL18g_TXdfO7FDcx7XRAa5FETL5R3mvQ9eIQHEdCGhRdxGUgQuq6HEQ83t4LbeGQ9D3EyERgMXz7eXQ=w800", artistName: "Unknown", title: "Exhibition Guide for MOVE: Choreographing You, Art and Dance Since the 1960s, Hayward Gallery, 2010", year: null },
          { id: "hayward-gac-1051", image: "https://lh3.googleusercontent.com/ci/AL18g_THDqUaKAz38Wp7T41QOPPz-I1oYXn7sF6OZVWYukYH2hWpLsQY4xA7a_fC79eFq2DUcfCG5ovD=w800", artistName: "Unknown", title: "Draft Proposal for Art and Power: Europe Under the Dictators 1930-1945, Hayward Gallery", year: null },
          { id: "hayward-gac-1052", image: "https://lh3.googleusercontent.com/ci/AL18g_RYFBsjelY0yzVUS5fMoKFxaV_DUpzOIdr62fv7m7rFz8eFgdlWcsniv6i6nAXOrtG-CEY9g-6v=w800", artistName: "Unknown", title: "Press Release for Dada and Surrealism Reviewed, Hayward Gallery", year: null },
          { id: "hayward-gac-1053", image: "https://lh3.googleusercontent.com/ci/AL18g_R-VjSVbCzBgA18dj69ax448Jtfa3mMPecIkVaQyi4sq1jaMbFW-e8hBzmeTPHU41aH5HlrH-k=w800", artistName: "Unknown", title: "News Release for a Selection of Hayward Gallery’s Upcoming Shows, including Spellbound: Art and Film", year: null },
          { id: "hayward-gac-1054", image: "https://lh3.googleusercontent.com/ci/AL18g_TFESNe3x3Qmi2x1_oP6BnHWeq7QUfeAjFKWl7s_aQ9M4zX5IPsbw5aeOCmklvjWWCHNKvnvA=w800", artistName: "Unknown", title: "Exhibition Guide for MOVE: Choreographing You, Art and Dance Since the 1960s, Hayward Gallery, 2010", year: null },
          { id: "hayward-gac-1056", image: "https://lh3.googleusercontent.com/ci/AL18g_Sv5N1zz_Tg-NifvkUUaU_5Ae4xaMA_lnrM2DilHiEbdQs2Q9tN2Xnw09r71eRm7Ks3bSWlK7-R=w800", artistName: "Unknown", title: "Details of International Symposium for Gravity & Grace: The Changing Condition of Sculpture 1965-75, Hayward Gallery", year: null },
          { id: "hayward-gac-1057", image: "https://lh3.googleusercontent.com/ci/AL18g_SWT4MESS-8mf346QRjqJ03XLa8IjEIN65LuOZ8ST8mEOL-Rv7YVb-UWgE2BMuaUDaKERCC-lw=w800", artistName: "Unknown", title: "Public Meeting on the Hayward Annual 77", year: null },
          { id: "hayward-gac-1058", image: "https://lh3.googleusercontent.com/ci/AL18g_QzXCSDaVQeMpXAhjuy5TlRtWkh9UyDAFH1kWo-5tXCtnRJ6x2_6Xbz_LjHV1GKJbhdv8qcnr4=w800", artistName: "Kunsthalle Dusseldorf", title: "Private View Card for Bridget Riley: Paintings and Drawings 1951-71, Kunsthalle Dusseldorf", year: "1971" },
          { id: "hayward-gac-1059", image: "https://lh3.googleusercontent.com/ci/AL18g_SJ-mPwlPO_lQqY12aXU-Sw8wB97eMSsaWce5owbQkDkVyXsnXfFQSmQALXD5k3otKBRwdOyQ=w800", artistName: "Unknown", title: "Exhibition Guide for MOVE: Choreographing You, Art and Dance Since the 1960s, Hayward Gallery, 2010", year: null },
          { id: "hayward-gac-1060", image: "https://lh3.googleusercontent.com/ci/AL18g_RlcllpTzNt5p88Z70wx_W21I91HHUhjOmAPcmp4qHOhlmK2DocFhPzw2j5F5Ei2d_rS8ohZA=w800", artistName: "Unknown", title: "Education Programme for Richard Long: Walking in Circles, Hayward Gallery", year: null },
          { id: "hayward-gac-1061", image: "https://lh3.googleusercontent.com/ci/AL18g_Ttvx9kJfRbdHFSns7qWG0heuKRBtksJfzuCB8qP6wY8TSLqKfVI48IIzTnFucherilMOR-=w800", artistName: "Unknown", title: "Internal memo relating to The New Art, Hayward Gallery, 17 August – 24 September 1972", year: null },
          { id: "hayward-gac-1062", image: "https://lh3.googleusercontent.com/ci/AL18g_RNCKs726K_97uGiQPuqbc_OkBaOZ6889lq8HMCOziU-qfuDgP2eeQqcFg6jeelvF6WOAJ1yw=w800", artistName: "Unknown", title: "Press Update Regarding Francis Bacon: The Human Body, Hayward Gallery, 1998", year: null },
          { id: "hayward-gac-1064", image: "https://lh3.googleusercontent.com/ci/AL18g_SPbYbY4NtwqZXa4Era0XxCijWqzAATCeQWeFF8WrTm3uB110PaYRmVJSuEwTA6y2UeTOqpwTNI=w800", artistName: "Unknown", title: "Short Exhibition Outline for Addressing the Century: 100 years of Art and Fashion, Hayward Gallery, 1998", year: null },
          { id: "hayward-gac-1067", image: "https://lh3.googleusercontent.com/ci/AL18g_Rah48PjKGi2aSzkOk7civSzqr7bkAEtq1lhAG8br9c2jSwwwUtiq60dfZs4k_YpkCjAP5Tqjc=w800", artistName: "Unknown", title: "Exhibition Guide for MOVE: Choreographing You, Art and Dance Since the 1960s, Hayward Gallery, 2010", year: null },
          { id: "hayward-gac-1068", image: "https://lh3.googleusercontent.com/ci/AL18g_Qojs7roZDWh0xXZXQaBjb8TMLr2dMTwDJghSEuWWlY4jOyYpl_ldKtWrQvjdmTVm_cfIHuug9t=w800", artistName: "Unknown", title: "Notes from a Committee Meeting on Hayward Annual 78, Hayward Gallery", year: "1978" },
          { id: "hayward-gac-1069", image: "https://lh3.googleusercontent.com/ci/AL18g_Q9zxPSZLqcWY4UZA4GfaihbHnQ0VqTvvhnqMLG47vLULrhgagT5HgNVSf0ldOTqKSLxXtBCNA=w800", artistName: "Unknown", title: "Exhibition Guide for Psycho Buildings: Artists Take On Architecture, Hayward Gallery, 2008", year: null },
          { id: "hayward-gac-1071", image: "https://lh3.googleusercontent.com/ci/AL18g_RXVzNxV_ssOEXxQs4NLv0Hm4KbPeh70w44kV50aQObnELG7zumBYvCwWYKHclBiWfozdg127c=w800", artistName: "Unknown", title: "Press Release for Francis Bacon: The Human Body, Hayward Gallery, 1998", year: null },
          { id: "hayward-gac-1072", image: "https://lh3.googleusercontent.com/ci/AL18g_SE4HG921Gm76MtcJRTrOOucT6smdxy78tlumAdgZn8pWWk9eD702izQj97kczBXbyE-3xM2GU=w800", artistName: "Unknown", title: "Exhibition Guide for MOVE: Choreographing You, Art and Dance Since the 1960s, Hayward Gallery, 2010", year: null },
          { id: "hayward-gac-1073", image: "https://lh3.googleusercontent.com/ci/AL18g_Qlkrf81wultzPHN_QdWiSNgMKoSTeJqEv4bnBB5CnB9Pld3kUuqXrRDm_q04I_gzhh5aikYF-t=w800", artistName: "Unknown", title: "Exhibition Guide for MOVE: Choreographing You, Art and Dance Since the 1960s, Hayward Gallery, 2010", year: null },
          { id: "hayward-gac-1075", image: "https://lh3.googleusercontent.com/ci/AL18g_RWR8Ah95zFKuzdF-MB-tN7W7XKPSDeqmxteESFoBAOyCn2WC03qLjmhiu9V1b41wAFtwi84AI=w800", artistName: "Unknown", title: "British Poster Design Award for Kinetics: An International Survey of Kinetic Art, Hayward Gallery", year: null },
          { id: "hayward-gac-1077", image: "https://lh3.googleusercontent.com/ci/AL18g_RRn1p-ApORqZ1-67XCowKOoTTt704NydQRcR033eJUD_98tA4ycBHb_HWwUBXLXFec7-y2dRcT=w800", artistName: "Unknown", title: "Wall List for Richard Long: Walking in Circles, Hayward Gallery", year: null },
          { id: "hayward-gac-1079", image: "https://lh3.googleusercontent.com/ci/AL18g_QMhWxWrZYnFIUIv20A1dZblsunUdTlBsoe_ddPyRq5n9f4rLp3TWWbddZMhpl5fx0psZgS1uQ=w800", artistName: "Unknown", title: "Early Exhibition Proposal, Doubletake: Collective Memory and Current Art, Hayward Gallery, 1992", year: null },
          { id: "hayward-gac-1080", image: "https://lh3.googleusercontent.com/ci/AL18g_QS2weBxk-TVDfp8jRV_4YlKYo6r5M7UNKXYd4QxNuSwmb83Yv8xT5rKLK1QTSj5BGn3l75XN8=w800", artistName: "Unknown", title: "Invitation to Press View of Spellbound: Art and Film, Hayward Gallery, 1996", year: null },
          { id: "hayward-gac-1082", image: "https://lh3.googleusercontent.com/ci/AL18g_TnDwdQTo_oAb77z_FkYOAJ9lgRHFH6rHai4AObL25Deol7l3PyIcD5cyKRkadqJEvtjcQr8Q=w800", artistName: "Unknown", title: "Private View Card for Anthony Caro, Hayward Gallery", year: null },
          { id: "hayward-gac-1083", image: "https://lh3.googleusercontent.com/ci/AL18g_Ttpyaow-KeSBDnK1ol73sdJi_s4GitdJjM7GI1RUVrb-Ul0B4Td9n2aMkry_opFT10Y8TUAigu=w800", artistName: "Unknown", title: "Private View Invitation for Psycho Buildings: Artists Take On Architecture, Hayward Gallery, 2008", year: null },
          { id: "hayward-gac-1084", image: "https://lh3.googleusercontent.com/ci/AL18g_SsOIYOZkxXVu7sQOU7Syl0Kz4GTNWuAmsDjsa4fd29I3SlSFpM7Bmyq-JlwXgwgou9hnWcQJY=w800", artistName: "Unknown", title: "Press Release for Ed Ruscha: 50 Years of Painting, Hayward Gallery, 2009", year: null },
          { id: "hayward-gac-1085", image: "https://lh3.googleusercontent.com/ci/AL18g_TtPnjH-NsTLBnKrapHBHIGUNBZEYxkvJ0pNKSRCnBO9J87mFhKPQ3ocstOZW5F7mFmscS4hMc=w800", artistName: "Unknown", title: "Private View Card and Envelope for Gravity & Grace: The Changing Condition of Sculpture 1965-75, Hayward Gallery", year: null },
          { id: "hayward-gac-1086", image: "https://lh3.googleusercontent.com/ci/AL18g_S3ow5EXHbNZTFc2fhgpdF7SCFbY5RO3tHvHmVoIKbIy3sxKZ0oRc3zIj9cAomoVQz1ZkBs=w800", artistName: "Unknown", title: "Season Ticket to Richard Long: Walking in Circles, Hayward Gallery", year: null },
          { id: "hayward-gac-1087", image: "https://lh3.googleusercontent.com/ci/AL18g_QVAse42ZieRRFz7D5cs2l0FDU2ImehPxbMfmJhf2w4BVmFckokNJn5mjMEcne5kS0zMmKlKg=w800", artistName: "Stephan Balkenhol", title: "Diagrams for Stephan Balkenhol’s sculpture in the Thames, Doubletake: Collective Memory and Current Art, Hayward Gallery, 1992", year: null },
          { id: "hayward-gac-1088", image: "https://lh3.googleusercontent.com/ci/AL18g_TSgG9GyqGPUQqY6inlTU_9L9VaaysHd9vowyVE7Oub_NRMraVtQFFSlJ3cV09xKt3ogKjeU7k=w800", artistName: "Unknown", title: "Press Release for Ana Mendieta: Traces, Hayward Gallery, 2013", year: null },
          { id: "hayward-gac-1089", image: "https://lh3.googleusercontent.com/ci/AL18g_SAWy_qTgXjJh6BB-2JrB9tcSHCXmxJwRvPwjw3xoCcTwN-b1B7XdYhVGMoUqAAHZCo01F7EsA=w800", artistName: "Unknown", title: "Invitation to Light Show opening night at Auckland Art Gallery, New Zealand", year: "2014" },
          { id: "hayward-gac-1090", image: "https://lh3.googleusercontent.com/ci/AL18g_RTy7rx3DQIrhj0LGegRsOlMrafxwqTTb-CuOnDeo0KKtP_U88HJRFZMDPwc3F2AEi1SuV_Uw=w800", artistName: "Unknown", title: "Invitation for discussion with Theo Crosby about How To Play the Environment Game, Hayward Gallery, 1973", year: null },
          { id: "hayward-gac-1091", image: "https://lh3.googleusercontent.com/ci/AL18g_QQmYjjB8wkp5p2lipRUWCSf7erWdbDHhO73r9RpsnivA8uUC4SqKDeyQVcPlavt6vSX-PKBGa7=w800", artistName: "Brigitte Kowanz", title: "Light Steps (1990/2013), Installation view, Galerie Zumtobel, Vienna.", year: "1990" }
        ]
      }
    ],
    temporaryExhibitions: [
      // No current exhibitions
    ],
    upcomingExhibitions: [
      // No upcoming exhibitions
    ],
    pastExhibitions: [
      { id: "hayward-65720", name: "Yoshitomo Nara", title: "Yoshitomo Nara", description: "Dive into the captivating, creative world of Yoshitomo Nara in the largest European retrospective of one of Japan's most celebrated artists.\n\nFeaturing more than 150 works in drawing, printmaking, painting, sculpture, installation and ceramics, this comprehensive exhibition offers audiences the opportunity to immerse themselves in Nara's personal and creative worlds.\n\nCelebrated across the globe for his powerful portraits with eyes that gaze back at the viewer, and his drawings that engage with daily experiences, Nara is also known for his wood, fibreglass and ceramic sculptures as well as his installations of little houses.\n\nNara's work explores themes of resistance, rebellion, isolation, freedom and spirituality. This thematic exhibition reveals enduring influences on the artist's work, particularly nature and its mythology, the peace movement, the significance of home, and his interest in punk and rock music and popular culture.\n\nBorn in 1959 in Japan's Aomori prefecture, Yoshitomo Nara completed the Master of Fine Arts programme at the Aichi University of the Arts in 1987. Nara subsequently moved to Germany in 1988 and began his enrolment at the Kunstakademie Düsseldorf. After residing in Cologne, he returned to Japan in 2000.\n\nHe has exhibited in numerous museums and galleries in Europe, the United States, Japan, and Asia since the late 1990s.\n\nThis is an expanded version of the touring exhibition from the Guggenheim, Bilbao, and Museum Frieder Burda, Baden-Baden, featuring additional work, including early sculptures and new paintings.", detailedDescription: "Dive into the captivating, creative world of Yoshitomo Nara in the largest European retrospective of one of Japan's most celebrated artists.\n\nFeaturing more than 150 works in drawing, printmaking, painting, sculpture, installation and ceramics, this comprehensive exhibition offers audiences the opportunity to immerse themselves in Nara's personal and creative worlds.\n\nCelebrated across the globe for his powerful portraits with eyes that gaze back at the viewer, and his drawings that engage with daily experiences, Nara is also known for his wood, fibreglass and ceramic sculptures as well as his installations of little houses.\n\nNara's work explores themes of resistance, rebellion, isolation, freedom and spirituality. This thematic exhibition reveals enduring influences on the artist's work, particularly nature and its mythology, the peace movement, the significance of home, and his interest in punk and rock music and popular culture.\n\nBorn in 1959 in Japan's Aomori prefecture, Yoshitomo Nara completed the Master of Fine Arts programme at the Aichi University of the Arts in 1987. Nara subsequently moved to Germany in 1988 and began his enrolment at the Kunstakademie Düsseldorf. After residing in Cologne, he returned to Japan in 2000.\n\nHe has exhibited in numerous museums and galleries in Europe, the United States, Japan, and Asia since the late 1990s.\n\nThis is an expanded version of the touring exhibition from the Guggenheim, Bilbao, and Museum Frieder Burda, Baden-Baden, featuring additional work, including early sculptures and new paintings.", coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/hayward-gallery/hayward-65720/image-0.webp", url: "https://www.newexhibitions.com/e/65720", startDate: "2025-06-10", endDate: "2025-08-31" },
      { id: "hayward-66729", name: "Ghazaleh Avarzamani and Ali Ahadi: Freudian Typo", title: "Ghazaleh Avarzamani and Ali Ahadi: Freudian Typo", description: "In the HENI Project Space, Hayward Gallery\n\nExplore a multi-layered exhibition of new work collectively created by two Iranian-Canadian artists, featuring image-based works, sculpture, video and found objects.\n\nPunning and playful, Freudian Typo invites visitors to consider how the English language, entangled with the vocabulary of corporate finance, debt and development, underpins the globally precarious state of land, bodies and truth.\n\nThe exhibition draws on English nursery rhymes like &lsquo;The Old Woman and Her Pig' and &lsquo;This Is the House That Jack Built' – narratives marked by monetary exchange, debt and catastrophe. In these fables, the artists trace the roots of ongoing cycles of dispossession, accumulation, and re-possession.\n\nAt the exhibition's centre, a hyper-realistic sculpture of Palmerston, the former resident Chief Mouser cat of the British Foreign and Commonwealth Office, regards an electronic motorway sign upon which is displayed the phrase &lsquo;Truth and Reconsolidation'.\n\nAli Ahadi is an artist and scholar based in Vancouver, Canada. His practice spans site-specific installations, sculpture, photo and video-based works, writing and translation. He has exhibited in a body of solo and group exhibitions at Griffin Art Projects, Ag Galerie, Tehran's 8th Sculpture Biennial, Milan Image Art, Grunt Gallery, Morris and Helen Belkin Art Gallery, and Richmond Art Gallery, to name a few. He holds a PhD and MFA from the University of British Columbia where he currently teaches.\n\nGhazaleh Avarzamani is a London-based artist who works primarily in sculpture and installation. She has an MFA from Central Saint Martins, London. She has exhibited at the Aga Khan Museum, Toronto, MOCA Toronto, Dhaka Art Summit and Frieze Sculpture Park among many others, and her work is held in collections including the Art Gallery of Ontario, Rockefeller Center, Arsenal Contemporary, MOCA Toronto, TD Art Collection, Google and Red Mansion.\n\nFREE- no booking required", detailedDescription: "In the HENI Project Space, Hayward Gallery\n\nExplore a multi-layered exhibition of new work collectively created by two Iranian-Canadian artists, featuring image-based works, sculpture, video and found objects.\n\nPunning and playful, Freudian Typo invites visitors to consider how the English language, entangled with the vocabulary of corporate finance, debt and development, underpins the globally precarious state of land, bodies and truth.\n\nThe exhibition draws on English nursery rhymes like &lsquo;The Old Woman and Her Pig' and &lsquo;This Is the House That Jack Built' – narratives marked by monetary exchange, debt and catastrophe. In these fables, the artists trace the roots of ongoing cycles of dispossession, accumulation, and re-possession.\n\nAt the exhibition's centre, a hyper-realistic sculpture of Palmerston, the former resident Chief Mouser cat of the British Foreign and Commonwealth Office, regards an electronic motorway sign upon which is displayed the phrase &lsquo;Truth and Reconsolidation'.\n\nAli Ahadi is an artist and scholar based in Vancouver, Canada. His practice spans site-specific installations, sculpture, photo and video-based works, writing and translation. He has exhibited in a body of solo and group exhibitions at Griffin Art Projects, Ag Galerie, Tehran's 8th Sculpture Biennial, Milan Image Art, Grunt Gallery, Morris and Helen Belkin Art Gallery, and Richmond Art Gallery, to name a few. He holds a PhD and MFA from the University of British Columbia where he currently teaches.\n\nGhazaleh Avarzamani is a London-based artist who works primarily in sculpture and installation. She has an MFA from Central Saint Martins, London. She has exhibited at the Aga Khan Museum, Toronto, MOCA Toronto, Dhaka Art Summit and Frieze Sculpture Park among many others, and her work is held in collections including the Art Gallery of Ontario, Rockefeller Center, Arsenal Contemporary, MOCA Toronto, TD Art Collection, Google and Red Mansion.\n\nFREE- no booking required", coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/hayward-gallery/hayward-66729/image-0.webp", url: "https://www.newexhibitions.com/e/66729", startDate: "2025-06-10", endDate: "2025-08-31" },
      { id: "hayward-64916", name: "Linder: Danger Came Smiling", title: "Linder: Danger Came Smiling", description: "Linder's first London retrospective showcases 50 years of the pioneering feminist artist's work, dissecting our fascination with the body and its representation.\n\nFrom the early photomontages made while she was part of the punk scene of 1970s Manchester, to new work in digital montage shown for the first time, the exhibition presents the breadth of Linder's artistic output across montage, photography, performance and sculpture.\n\nThe body and its photographic representation, from early glamour photography to digital deep fakes, is central to Linder's approach to image-making.\n\nOften working with a medical grade scalpel, she draws on the creative and violent power of the cut in her forensic examination of our shifting attitudes to aspirational lifestyles, sex, food and fashion.\n\nAn adapted version of Linder: Danger Came Smiling, curated by Hayward Gallery Touring, tours nationally to Inverleith House, Royal Botanic Gardens, Edinburgh; Glynn Vivian Art Gallery, Swansea; and Grundy Art Gallery, Blackpool in 2025 – 2026.", detailedDescription: "Linder's first London retrospective showcases 50 years of the pioneering feminist artist's work, dissecting our fascination with the body and its representation.\n\nFrom the early photomontages made while she was part of the punk scene of 1970s Manchester, to new work in digital montage shown for the first time, the exhibition presents the breadth of Linder's artistic output across montage, photography, performance and sculpture.\n\nThe body and its photographic representation, from early glamour photography to digital deep fakes, is central to Linder's approach to image-making.\n\nOften working with a medical grade scalpel, she draws on the creative and violent power of the cut in her forensic examination of our shifting attitudes to aspirational lifestyles, sex, food and fashion.\n\nAn adapted version of Linder: Danger Came Smiling, curated by Hayward Gallery Touring, tours nationally to Inverleith House, Royal Botanic Gardens, Edinburgh; Glynn Vivian Art Gallery, Swansea; and Grundy Art Gallery, Blackpool in 2025 – 2026.", coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/hayward-gallery/hayward-64916/image-0.webp", url: "https://www.newexhibitions.com/e/64916", startDate: "2025-02-11", endDate: "2025-05-05" },
      { id: "hayward-64917", name: "Mickalene Thomas: All About Love", title: "Mickalene Thomas: All About Love", description: "Mickalene Thomas' vibrant, large-scale portraits of Black women at rest reclaim space and representation in art history, celebrating love and radical repose.\n\nAll About Love presents two decades of work by the internationally celebrated artist and pioneering portraitist Mickalene Thomas (born 1971, USA).\n\nThomas is renowned for her large-scale paintings of Black women radically luxuriating and in repose, adorned with vivid patterns and ravishing, brilliant rhinestones, as well as her innovative use of collage techniques.\n\nThomas's depictions of women from her circle of friends, family, lovers and models are loving, celebratory and glamorous, with her alluring and self-assured muses exuding comfort and pleasure.\n\nReferences to the history of European painting abound in Thomas's work (including to Jean-Auguste-Dominique Ingres, &Eacute;douard Manet, Claude Monet and Pablo Picasso). Her subjects confidently claim space within this male-dominated art history from which Black and LGBTQI+ people have largely been excluded.\n\nFeaturing paintings, photographs, collages and installations, All About Love transforms the Hayward Gallery with bespoke wallpapers, textiles and furnishings nostalgically evoking the artist's 1970s childhood.\n\nThomas's art is steeped in contemporary feminist literature and the exhibition title pays loving homage to the late American author and activist Bell Hooks.\n\nMickalene Thomas: All About Love is co-organized with The Broad, Los Angeles and Les Abattoirs, Toulouse and in partnership with the Barnes Foundation, Philadelphia.", detailedDescription: "Mickalene Thomas' vibrant, large-scale portraits of Black women at rest reclaim space and representation in art history, celebrating love and radical repose.\n\nAll About Love presents two decades of work by the internationally celebrated artist and pioneering portraitist Mickalene Thomas (born 1971, USA).\n\nThomas is renowned for her large-scale paintings of Black women radically luxuriating and in repose, adorned with vivid patterns and ravishing, brilliant rhinestones, as well as her innovative use of collage techniques.\n\nThomas's depictions of women from her circle of friends, family, lovers and models are loving, celebratory and glamorous, with her alluring and self-assured muses exuding comfort and pleasure.\n\nReferences to the history of European painting abound in Thomas's work (including to Jean-Auguste-Dominique Ingres, &Eacute;douard Manet, Claude Monet and Pablo Picasso). Her subjects confidently claim space within this male-dominated art history from which Black and LGBTQI+ people have largely been excluded.\n\nFeaturing paintings, photographs, collages and installations, All About Love transforms the Hayward Gallery with bespoke wallpapers, textiles and furnishings nostalgically evoking the artist's 1970s childhood.\n\nThomas's art is steeped in contemporary feminist literature and the exhibition title pays loving homage to the late American author and activist Bell Hooks.\n\nMickalene Thomas: All About Love is co-organized with The Broad, Los Angeles and Les Abattoirs, Toulouse and in partnership with the Barnes Foundation, Philadelphia.", coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/hayward-gallery/hayward-64917/image-0.webp", url: "https://www.newexhibitions.com/e/64917", startDate: "2025-02-11", endDate: "2025-05-05" },
      { id: "hayward-64275", name: "Tavares Strachan: There Is Light Somewhere", title: "Tavares Strachan: There Is Light Somewhere", description: "Unsung trailblazers and lost cultural connections are vividly commemorated in artworks that reveal hidden stories whilst also illuminating histories of bias.\n\nThis is the first mid-career survey dedicated to the work of New York-based, Bahamian artist Tavares Strachan (born in 1979).\n\nThe exhibition showcases the remarkably inventive ways in which Strachan has celebrated unsung explorers and cultural trailblazers, inviting audiences to engage with overlooked characters whose stories represent and illuminate histories hidden by bias.\n\nFeaturing monumental new sculptural commissions alongside striking large-scale collages, neon works, bronze and ceramic sculptures, and mixed-media installations, the exhibition takes visitors on a journey of discovery and recovery that is simultaneously playful and impactful.\n\nStrachan's vividly realised stories of erasure and remembrance shine a light not only on histories of colonialism and racism, but also on the universal desire for a sense of belonging.", detailedDescription: "Unsung trailblazers and lost cultural connections are vividly commemorated in artworks that reveal hidden stories whilst also illuminating histories of bias.\n\nThis is the first mid-career survey dedicated to the work of New York-based, Bahamian artist Tavares Strachan (born in 1979).\n\nThe exhibition showcases the remarkably inventive ways in which Strachan has celebrated unsung explorers and cultural trailblazers, inviting audiences to engage with overlooked characters whose stories represent and illuminate histories hidden by bias.\n\nFeaturing monumental new sculptural commissions alongside striking large-scale collages, neon works, bronze and ceramic sculptures, and mixed-media installations, the exhibition takes visitors on a journey of discovery and recovery that is simultaneously playful and impactful.\n\nStrachan's vividly realised stories of erasure and remembrance shine a light not only on histories of colonialism and racism, but also on the universal desire for a sense of belonging.", coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/hayward-gallery/hayward-64275/image-0.webp", url: "https://www.newexhibitions.com/e/64275", startDate: "2024-06-18", endDate: "2024-09-01" },
      { id: "hayward-62951", name: "The Life of Forms", title: "The Life of Forms", description: "Spanning over 50 years of contemporary art, this exhibition highlights ways in which artists draw on familiar experiences of movement, flux and organic growth.\n\nInspired by sources ranging from a dancer's gesture to the breaking of a wave, from a flow of molten metal to the interlacing of a spider's web, the artworks in this exhibition conjure fluid and shifting realms of experience.\n\nUndulating, drooping, erupting, cascading and promiscuously proliferating, these sculptures invite a tactile gaze, and trigger physical responses. In an era when our encounters are increasingly digitised and disembodied, these artworks call to mind the pleasures of gesture and movement, the poetics of gravity and the experience of sensation itself.\n\nPalpably dynamic, they proclaim that nothing in the world stays the same, that everything is moving, seething, changing and transforming.\n\nThe exhibition features work by 21 international artists: Ruth Asawa, Nairy Baghramian, Phyllida Barlow, Lynda Benglis, Michel Blazy, Paloma Bosqu&ecirc;, Olaf Brzeski, Choi Jeong Hwa, Tara Donovan, DRIFT, Eva F&agrave;bregas, Holly Hendry, EJ Hill, Marguerite Humeau, Jean-Luc Moul&egrave;ne, Senga Nengudi, Ernesto Neto, Martin Puryear, Matthew Ronay, Teresa Solar Abboud, and Franz West.", detailedDescription: "Spanning over 50 years of contemporary art, this exhibition highlights ways in which artists draw on familiar experiences of movement, flux and organic growth.\n\nInspired by sources ranging from a dancer's gesture to the breaking of a wave, from a flow of molten metal to the interlacing of a spider's web, the artworks in this exhibition conjure fluid and shifting realms of experience.\n\nUndulating, drooping, erupting, cascading and promiscuously proliferating, these sculptures invite a tactile gaze, and trigger physical responses. In an era when our encounters are increasingly digitised and disembodied, these artworks call to mind the pleasures of gesture and movement, the poetics of gravity and the experience of sensation itself.\n\nPalpably dynamic, they proclaim that nothing in the world stays the same, that everything is moving, seething, changing and transforming.\n\nThe exhibition features work by 21 international artists: Ruth Asawa, Nairy Baghramian, Phyllida Barlow, Lynda Benglis, Michel Blazy, Paloma Bosqu&ecirc;, Olaf Brzeski, Choi Jeong Hwa, Tara Donovan, DRIFT, Eva F&agrave;bregas, Holly Hendry, EJ Hill, Marguerite Humeau, Jean-Luc Moul&egrave;ne, Senga Nengudi, Ernesto Neto, Martin Puryear, Matthew Ronay, Teresa Solar Abboud, and Franz West.", coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/hayward-gallery/hayward-62951/image-0.webp", url: "https://www.newexhibitions.com/e/62951", startDate: "2024-02-07", endDate: "2024-05-06" },
      { id: "hayward-61497", name: "Dear Earth: Art and Hope in a Time of Crisis", title: "Dear Earth: Art and Hope in a Time of Crisis", description: "This pioneering group show of artistic responses to the climate emergency explores themes of care, hope, interdependence, emotional and spiritual connection, and activism.\n\nDear Earth: Art and Hope in a Time of Crisis is inspired by artist Otobong Nkanga's suggestion that &lsquo;caring is a form of resistance'.\n\nThe exhibition highlights the ways in which artists are helping to reframe and deepen our psychological and spiritual responses to the climate crisis, hoping to inspire joy and empathy as well as promoting a sense of political and social activism.\n\nThe 14 artists explore the interdependence of ecologies and ecosystems, as well as our emotional connection with nature.\n\nFeaturing engaging and impactful works in a diverse range of media, including public artworks outside the gallery space, this exhibition includes artists Ackroyd & Harvey, Andrea Bowers, Imani Jacqueline Brown, Agnes Denes, Cristina Iglesias, Aluaiy Kaumakan, Jenny Kendler, Richard Mosse, Otobong Nkanga, Cornelia Parker, Himali Singh Soin, Hito Steyerl, Daiara Tukano and Grounded Ecotherapy.\n\nDear Earth: Art and Hope in a Time of Crisis is generously supported by Simon Morris and Annalisa Burello.", detailedDescription: "This pioneering group show of artistic responses to the climate emergency explores themes of care, hope, interdependence, emotional and spiritual connection, and activism.\n\nDear Earth: Art and Hope in a Time of Crisis is inspired by artist Otobong Nkanga's suggestion that &lsquo;caring is a form of resistance'.\n\nThe exhibition highlights the ways in which artists are helping to reframe and deepen our psychological and spiritual responses to the climate crisis, hoping to inspire joy and empathy as well as promoting a sense of political and social activism.\n\nThe 14 artists explore the interdependence of ecologies and ecosystems, as well as our emotional connection with nature.\n\nFeaturing engaging and impactful works in a diverse range of media, including public artworks outside the gallery space, this exhibition includes artists Ackroyd & Harvey, Andrea Bowers, Imani Jacqueline Brown, Agnes Denes, Cristina Iglesias, Aluaiy Kaumakan, Jenny Kendler, Richard Mosse, Otobong Nkanga, Cornelia Parker, Himali Singh Soin, Hito Steyerl, Daiara Tukano and Grounded Ecotherapy.\n\nDear Earth: Art and Hope in a Time of Crisis is generously supported by Simon Morris and Annalisa Burello.", coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/hayward-gallery/hayward-61497/image-0.webp", url: "https://www.newexhibitions.com/e/61497", startDate: "2023-06-21", endDate: "2023-09-03" },
      { id: "hayward-60467", name: "Mike Nelson: Extinction Beckons", title: "Mike Nelson: Extinction Beckons", description: "The first major survey of work by internationally acclaimed British artist Mike Nelson features his psychologically charged and atmospheric installations. \n\nNelson's installations take the viewer on enthralling journeys into fictive worlds that eerily echo our own.\n\nConstructed with materials scavenged from salvage yards, junk shops, auctions and flea markets, the immersive installations have a startling life-like quality.\n\nWeaving references to science fiction, failed political movements, dark histories and countercultures, they touch on alternative ways of living and thinking: lost belief systems, interrupted histories and cultures that resist inclusion in an increasingly homogenised and globalised world.\n\nUtterly transforming the spaces of the Hayward Gallery, the exhibition features sculptural works and new versions of key large-scale installations, many of which are shown here for the first time since their original presentations.\n\nNelson represented Great Britain at the 54th Venice Biennale in 2011 and has shown in leading galleries around the world. He has also been featured in numerous international exhibitions, including the 13th Biennale of Sydney, the 8th Istanbul Biennial and the 13th Lyon Biennale.", detailedDescription: "The first major survey of work by internationally acclaimed British artist Mike Nelson features his psychologically charged and atmospheric installations. \n\nNelson's installations take the viewer on enthralling journeys into fictive worlds that eerily echo our own.\n\nConstructed with materials scavenged from salvage yards, junk shops, auctions and flea markets, the immersive installations have a startling life-like quality.\n\nWeaving references to science fiction, failed political movements, dark histories and countercultures, they touch on alternative ways of living and thinking: lost belief systems, interrupted histories and cultures that resist inclusion in an increasingly homogenised and globalised world.\n\nUtterly transforming the spaces of the Hayward Gallery, the exhibition features sculptural works and new versions of key large-scale installations, many of which are shown here for the first time since their original presentations.\n\nNelson represented Great Britain at the 54th Venice Biennale in 2011 and has shown in leading galleries around the world. He has also been featured in numerous international exhibitions, including the 13th Biennale of Sydney, the 8th Istanbul Biennial and the 13th Lyon Biennale.", coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/hayward-gallery/hayward-60467/image-0.webp", url: "https://www.newexhibitions.com/e/60467", startDate: "2023-02-22", endDate: "2023-05-07" },
      { id: "hayward-60035", name: "Koestler Arts: Freedom", title: "Koestler Arts: Freedom", description: "Koestler Arts marks the 60th anniversary of the Koestler Awards with an ambitious exhibition of art by people in the UK's criminal justice system, curated by Ai Weiwei.\n\nThe Koestler Awards is an annual programme encouraging people from the UK's criminal justice system to change their lives through the arts.\n\nThe vision for this year's exhibition is inspired by Ai Weiwei's visit to the Koestler Arts building, which currently holds over 6,500 artworks entered into this year's awards.\n\nTaken aback by the quantity of artworks and the range of categories on display, the artist's concept evolved to be as inclusive as possible and to let the artwork show how humanity responds when put in extreme circumstances.\n\nThis year, the exhibition space is being transformed physically to realise this vision, helping to preserve the environment within which the artworks are made.\n\nThe aim is to not &lsquo;translate' the work but to retain the wholeness of it. Ai Weiwei explains this idea with an analogy: he wants to present the forest, not just a branch that comes from it.\n\nDuring his curation period, the artist also visited HM Prison Wormwood Scrubs, which is situated next to the Koestler Arts Centre.\n\nHaving visited many prisons around the world, as well as experiencing his own restriction of freedom during a period of secret detention and constant surveillance in China, this additional visit to HMP Wormwood Scrubs helped to strengthen and confirm the vision for the exhibition.", detailedDescription: "Koestler Arts marks the 60th anniversary of the Koestler Awards with an ambitious exhibition of art by people in the UK's criminal justice system, curated by Ai Weiwei.\n\nThe Koestler Awards is an annual programme encouraging people from the UK's criminal justice system to change their lives through the arts.\n\nThe vision for this year's exhibition is inspired by Ai Weiwei's visit to the Koestler Arts building, which currently holds over 6,500 artworks entered into this year's awards.\n\nTaken aback by the quantity of artworks and the range of categories on display, the artist's concept evolved to be as inclusive as possible and to let the artwork show how humanity responds when put in extreme circumstances.\n\nThis year, the exhibition space is being transformed physically to realise this vision, helping to preserve the environment within which the artworks are made.\n\nThe aim is to not &lsquo;translate' the work but to retain the wholeness of it. Ai Weiwei explains this idea with an analogy: he wants to present the forest, not just a branch that comes from it.\n\nDuring his curation period, the artist also visited HM Prison Wormwood Scrubs, which is situated next to the Koestler Arts Centre.\n\nHaving visited many prisons around the world, as well as experiencing his own restriction of freedom during a period of secret detention and constant surveillance in China, this additional visit to HMP Wormwood Scrubs helped to strengthen and confirm the vision for the exhibition.", coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/hayward-gallery/hayward-60035/image-0.webp", url: "https://www.newexhibitions.com/e/60035", startDate: "2022-10-27", endDate: "2022-12-18" },
      { id: "hayward-59323", name: "In the Black Fantastic", title: "In the Black Fantastic", description: "Myth, science fiction, spiritual traditions and the legacy of Afrofuturism are all sampled, reimagined and recontextualised in In the Black Fantastic.\n\nEncompassing painting, photography, video, sculpture and mixed-media installations, the exhibition creates immersive aesthetic experiences that bring the viewer into a new environment somewhere between the real world and a multiplicity of imagined ones.\n\nWhile some artists disrupt our understanding of the past, others invite us to imagine fantastical futures. In this exhibition, fantasy becomes a zone of creative and cultural liberation and a means of addressing racism and social injustice by conjuring new ways of being in the world.\n\nIn the Black Fantastic is curated by Ekow Eshun and features the artists Nick Cave, Sedrick Chisom, Ellen Gallagher, Hew Locke, Wangechi Mutu, Rashaad Newsome, Chris Ofili, Tabita Rezaire, Cauleen Smith, Lina Iris Viktor and Kara Walker.", detailedDescription: "Myth, science fiction, spiritual traditions and the legacy of Afrofuturism are all sampled, reimagined and recontextualised in In the Black Fantastic.\n\nEncompassing painting, photography, video, sculpture and mixed-media installations, the exhibition creates immersive aesthetic experiences that bring the viewer into a new environment somewhere between the real world and a multiplicity of imagined ones.\n\nWhile some artists disrupt our understanding of the past, others invite us to imagine fantastical futures. In this exhibition, fantasy becomes a zone of creative and cultural liberation and a means of addressing racism and social injustice by conjuring new ways of being in the world.\n\nIn the Black Fantastic is curated by Ekow Eshun and features the artists Nick Cave, Sedrick Chisom, Ellen Gallagher, Hew Locke, Wangechi Mutu, Rashaad Newsome, Chris Ofili, Tabita Rezaire, Cauleen Smith, Lina Iris Viktor and Kara Walker.", coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/hayward-gallery/hayward-59323/image-0.webp", url: "https://www.newexhibitions.com/e/59323", startDate: "2022-06-29", endDate: "2022-09-18" },
      { id: "hayward-58472", name: "Louise Bourgeois: The Woven Child", title: "Louise Bourgeois: The Woven Child", description: "In the last two decades of her career, Bourgeois began to incorporate clothes from all stages of her life into her art.\n\nThis developed into a varied body of work – from monumental installations, to figurative sculptures and abstract collages – incorporating textiles such as bed linen, handkerchiefs, tapestry, and needlepoint.\n\nBourgeois's fabric works mine the themes of identity and sexuality, trauma and memory, guilt and reparation that are central to her long and storied career.\n\n&lsquo;I have always had a fascination with the magic power of the needle. The needle is used to repair the damage. It's a claim to forgiveness.'\n\nLouise Bourgeois: The Woven Child sums up this wonderfully inventive and compelling final chapter in this extraordinary artist's work.\n\nStandard entry &pound;15* Concessions available * Excludes &pound;3 booking fee.", detailedDescription: "In the last two decades of her career, Bourgeois began to incorporate clothes from all stages of her life into her art.\n\nThis developed into a varied body of work – from monumental installations, to figurative sculptures and abstract collages – incorporating textiles such as bed linen, handkerchiefs, tapestry, and needlepoint.\n\nBourgeois's fabric works mine the themes of identity and sexuality, trauma and memory, guilt and reparation that are central to her long and storied career.\n\n&lsquo;I have always had a fascination with the magic power of the needle. The needle is used to repair the damage. It's a claim to forgiveness.'\n\nLouise Bourgeois: The Woven Child sums up this wonderfully inventive and compelling final chapter in this extraordinary artist's work.\n\nStandard entry &pound;15* Concessions available * Excludes &pound;3 booking fee.", coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/hayward-gallery/hayward-58472/image-0.webp", url: "https://www.newexhibitions.com/e/58472", startDate: "2022-02-09", endDate: "2022-05-15" },
      { id: "hayward-59237", name: "Anthea Hamilton Commission", title: "Anthea Hamilton Commission", description: "Running day and night on a six-metre LED screen outside the Hayward Gallery, Anthea Hamilton's new film maps still and moving images onto the 24-hour cycle of a clock.\n\nThe film features a found photograph from the early 1980s intercut with new footage of four performers, each with their own distinctive discipline and style.\n\nThe movement sequences draw on a wide repertoire of images from popular culture and Hamilton's own work, including her previous collaborations with the performers.\n\nThis major new film commission has been conceived in response to the Hayward Gallery's architecture and locality.\n\nAnthea Hamilton was born in 1978 in London where she lives and works.\n\nThis commissioned sculpture by Anthea Hamilton is generously supported by the Hayward Gallery Commissioning Committee, with additional support from Thomas Dane Gallery, Candida and Zak Gertler, and kaufmann repetto, Milan / New York.\n\nDirector: Anthea Hamilton\n\nPerformers: Jasmine Chiu, Jordan Johnhope, Duane Nasis and Bakani Pick-Up\n\nProducer: Ese Onojeruo\n\nProduction assistant: Marla Kellard-Jones\n\nDirector of photography: Shamica Ruddock\n\nSecond camera: Miles Williams\n\nEditor: Spike Silverton\n\nLighting designer: Joshua Harriette\n\nMake-up artist: Tina Khatri\n\nStills photographer: Miles Perry\n\nLocation: open 24-hours, Hayward Gallery Terrace", detailedDescription: "Running day and night on a six-metre LED screen outside the Hayward Gallery, Anthea Hamilton's new film maps still and moving images onto the 24-hour cycle of a clock.\n\nThe film features a found photograph from the early 1980s intercut with new footage of four performers, each with their own distinctive discipline and style.\n\nThe movement sequences draw on a wide repertoire of images from popular culture and Hamilton's own work, including her previous collaborations with the performers.\n\nThis major new film commission has been conceived in response to the Hayward Gallery's architecture and locality.\n\nAnthea Hamilton was born in 1978 in London where she lives and works.\n\nThis commissioned sculpture by Anthea Hamilton is generously supported by the Hayward Gallery Commissioning Committee, with additional support from Thomas Dane Gallery, Candida and Zak Gertler, and kaufmann repetto, Milan / New York.\n\nDirector: Anthea Hamilton\n\nPerformers: Jasmine Chiu, Jordan Johnhope, Duane Nasis and Bakani Pick-Up\n\nProducer: Ese Onojeruo\n\nProduction assistant: Marla Kellard-Jones\n\nDirector of photography: Shamica Ruddock\n\nSecond camera: Miles Williams\n\nEditor: Spike Silverton\n\nLighting designer: Joshua Harriette\n\nMake-up artist: Tina Khatri\n\nStills photographer: Miles Perry\n\nLocation: open 24-hours, Hayward Gallery Terrace", coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/hayward-gallery/hayward-59237/image-0.webp", url: "https://www.newexhibitions.com/e/59237", startDate: "2022-03-12", endDate: "2022-04-24" },
      { id: "hayward-58251", name: "Mixing It Up: Painting Today", title: "Mixing It Up: Painting Today", description: "Mixing It Up brings together 31 contemporary painters who exploit the unique characteristics of their medium to create fresh, compelling works of art that speak to this moment.\n\n★★★★ 'absorbing and dynamic' The Observer ★★★★★ 'painting's not just alive, it's as essential as it's ever been' Time Out\n\nApproaching painting as a platform for speculative thinking and unexpected conversations, the artists in this exhibition make works that oscillate between observation and invention, depiction and allegory, illusion and materiality.\n\nInstead of trying to craft iconic images, they treat the canvas as a site of assemblage where references converge from diverse territories including music, design, advertising, vernacular and documentary photography, viral memes, fashion and cinema, as well as art history.\n\nResonantly ambiguous, their paintings invite viewers to recruit their own imaginations in working out different ways to interpret them, while often questioning how their social reception might shift among different audiences.\n\nInstead of seeming like the most conservative and traditional art form, this kind of painting is arguably the most conceptually adventurous. It draws on the power of the medium to both transfix us and to undo our ingrained ways of seeing and thinking.\n\nFeaturing three generations of artists who live and work here, Mixing It Up highlights the UK's emergence as a vital international centre of contemporary painting.\n\nReflecting the international character of the painting scene in this country, the participating artists come from a diverse range of backgrounds and nationalities: over a third of the participating artists were born in other places, including countries in Africa, Asia, South America and North America.\n\n★★★★ 'a big, punchy, entertaining show with an unstoppably upbeat vibe' The independent \n\nMixing It Up: Painting Today features 31 artists: Tasha Amini, Hurvin Anderson, Alvaro Barrington, Lydia Blakeley, Gabriella Boyd, Lisa Brice, Gareth Cadwallader, Caroline Coon, Somaya Critchlow, Peter Doig, Jad&eacute; Fadojutimi, Denzil Forrester, Louise Giovanelli, Andrew Pierre Hart, Lubaina Himid, Kudzanai-Violet Hwami, Merlin James, Rachel Jones, Allison Katz, Matthew Krishanu, Graham Little, Oscar Murillo, Mohammed Sami, Samara Scott, Daniel Sinsel, Caragh Thuring, Sophie von Hellermann, Jonathan Wateridge, Rose Wylie, Issy Wood and Vivien Zhang.", detailedDescription: "Mixing It Up brings together 31 contemporary painters who exploit the unique characteristics of their medium to create fresh, compelling works of art that speak to this moment.\n\n★★★★ 'absorbing and dynamic' The Observer ★★★★★ 'painting's not just alive, it's as essential as it's ever been' Time Out\n\nApproaching painting as a platform for speculative thinking and unexpected conversations, the artists in this exhibition make works that oscillate between observation and invention, depiction and allegory, illusion and materiality.\n\nInstead of trying to craft iconic images, they treat the canvas as a site of assemblage where references converge from diverse territories including music, design, advertising, vernacular and documentary photography, viral memes, fashion and cinema, as well as art history.\n\nResonantly ambiguous, their paintings invite viewers to recruit their own imaginations in working out different ways to interpret them, while often questioning how their social reception might shift among different audiences.\n\nInstead of seeming like the most conservative and traditional art form, this kind of painting is arguably the most conceptually adventurous. It draws on the power of the medium to both transfix us and to undo our ingrained ways of seeing and thinking.\n\nFeaturing three generations of artists who live and work here, Mixing It Up highlights the UK's emergence as a vital international centre of contemporary painting.\n\nReflecting the international character of the painting scene in this country, the participating artists come from a diverse range of backgrounds and nationalities: over a third of the participating artists were born in other places, including countries in Africa, Asia, South America and North America.\n\n★★★★ 'a big, punchy, entertaining show with an unstoppably upbeat vibe' The independent \n\nMixing It Up: Painting Today features 31 artists: Tasha Amini, Hurvin Anderson, Alvaro Barrington, Lydia Blakeley, Gabriella Boyd, Lisa Brice, Gareth Cadwallader, Caroline Coon, Somaya Critchlow, Peter Doig, Jad&eacute; Fadojutimi, Denzil Forrester, Louise Giovanelli, Andrew Pierre Hart, Lubaina Himid, Kudzanai-Violet Hwami, Merlin James, Rachel Jones, Allison Katz, Matthew Krishanu, Graham Little, Oscar Murillo, Mohammed Sami, Samara Scott, Daniel Sinsel, Caragh Thuring, Sophie von Hellermann, Jonathan Wateridge, Rose Wylie, Issy Wood and Vivien Zhang.", coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/hayward-gallery/hayward-58251/image-0.webp", url: "https://www.newexhibitions.com/e/58251", startDate: "2021-09-09", endDate: "2021-12-12" },
      { id: "hayward-58252", name: "Gerhard Richter: Drawings, 1999 – 2021", title: "Gerhard Richter: Drawings, 1999 – 2021", description: "Including several new series of experimental drawings, this exhibition – Richter's first presentation in a major London gallery in a decade – brings together more than 60 works on paper made between 1999 and 2021.\n\nAlongside drawings in pencil and charcoal, and a series of over-painted photographs, a set of rarely-seen painterly works created using coloured inks are featured in the show.\n\nIn these works, the fluidity and unpredictability of the pools of ink, in some cases reaching right to the edges of the paper, are counterbalanced by structures of linear graphite markings.\n\nInks and watercolour have played an important role in the development of Richter's paintings.\n\nHis earliest known works, a series of monotypes titled Elbe made in 1957, were the result of experimentation with the fluid nature of ink on paper.\n\nGerhard Richter (b. 1932 in Dresden) is regarded as one of the most important and influential painters working today.\n\nHis pioneering painting practice over the past six decades has gained him wide international acclaim and numerous prestigious awards, including the Golden Lion of the 47th Venice Biennale.\n\nRichter's paintings have been exhibited extensively across the globe, with recent solo exhibitions at institutions including the Met Breuer, New York (2020); Museum Ludwig, Cologne (2017); and Queensland Art Gallery, Brisbane, Australia (2017).\n\nGerhard Richter: Drawings, 1999-2021 is organised in conjunction with HENI.", detailedDescription: "Including several new series of experimental drawings, this exhibition – Richter's first presentation in a major London gallery in a decade – brings together more than 60 works on paper made between 1999 and 2021.\n\nAlongside drawings in pencil and charcoal, and a series of over-painted photographs, a set of rarely-seen painterly works created using coloured inks are featured in the show.\n\nIn these works, the fluidity and unpredictability of the pools of ink, in some cases reaching right to the edges of the paper, are counterbalanced by structures of linear graphite markings.\n\nInks and watercolour have played an important role in the development of Richter's paintings.\n\nHis earliest known works, a series of monotypes titled Elbe made in 1957, were the result of experimentation with the fluid nature of ink on paper.\n\nGerhard Richter (b. 1932 in Dresden) is regarded as one of the most important and influential painters working today.\n\nHis pioneering painting practice over the past six decades has gained him wide international acclaim and numerous prestigious awards, including the Golden Lion of the 47th Venice Biennale.\n\nRichter's paintings have been exhibited extensively across the globe, with recent solo exhibitions at institutions including the Met Breuer, New York (2020); Museum Ludwig, Cologne (2017); and Queensland Art Gallery, Brisbane, Australia (2017).\n\nGerhard Richter: Drawings, 1999-2021 is organised in conjunction with HENI.", coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/hayward-gallery/hayward-58252/image-0.webp", url: "https://www.newexhibitions.com/e/58252", startDate: "2021-09-09", endDate: "2021-12-12" },
      { id: "hayward-25038", name: "Among the trees", title: "Among the trees", description: "In meditative works across different media, they explore how trees &#8211; with lifespans much longer than our own &#8211; challenge how we think about time, and consider how intimately entangled they are with human affairs. \nThey invite us to appreciate their soaring scale, in art works such as a monumental sculpture cast from a 2,000-year-old olive tree by Ugo Rondinone, a cinematic portrait of a 30-metre-high spruce tree by Eija-Liisa Ahtila, and a vast forest of trees constructed entirely from cardboard by Eva Jospin.\nAmong the Trees transports us around the world &#8211; from Colombian rainforests and remote Japanese islands to olive orchards in Israel and a 9,550-year-old spruce in Sweden.\nAt a time when the destruction of the world&#8217;s forests is accelerating at a record pace, see the natural world through new eyes, on a walk through the woods, real and imagined.\n\nFeatured artists:\nRobert Adams, Eija-Liisa Ahtila, Yto Barrada, Johanna Calle, Gillian Carnegie, Tacita Dean, Peter Doig, Jimmie Durham, Kirsten Everberg, Simryn Gill, Rodney Graham, Shi Guowei, Hugh Hayden, Eva Jospin, Kazuo Kadonaga, William Kentridge, Toba Khedoori, Luisa Lambri, Myoung Ho Lee, Zoe Leonard, Robert Longo, Sally Mann, Steve McQueen, Jean-Luc Mylayne, Mariele Neudecker, Virginia Overton, Roxy Paine, Giuseppe Penone, Abel Rodríguez, Ugo Rondinone, George Shaw, Robert Smithson, Jennifer Steinkamp, Thomas Struth, Rachel Sussman, Pascale Marthine Tayou, Jeff Wall.\nThe exhibition is kindly supported by the Swiss Arts Council Pro Helvetia.", detailedDescription: "In meditative works across different media, they explore how trees &#8211; with lifespans much longer than our own &#8211; challenge how we think about time, and consider how intimately entangled they are with human affairs. \nThey invite us to appreciate their soaring scale, in art works such as a monumental sculpture cast from a 2,000-year-old olive tree by Ugo Rondinone, a cinematic portrait of a 30-metre-high spruce tree by Eija-Liisa Ahtila, and a vast forest of trees constructed entirely from cardboard by Eva Jospin.\nAmong the Trees transports us around the world &#8211; from Colombian rainforests and remote Japanese islands to olive orchards in Israel and a 9,550-year-old spruce in Sweden.\nAt a time when the destruction of the world&#8217;s forests is accelerating at a record pace, see the natural world through new eyes, on a walk through the woods, real and imagined.\n\nFeatured artists:\nRobert Adams, Eija-Liisa Ahtila, Yto Barrada, Johanna Calle, Gillian Carnegie, Tacita Dean, Peter Doig, Jimmie Durham, Kirsten Everberg, Simryn Gill, Rodney Graham, Shi Guowei, Hugh Hayden, Eva Jospin, Kazuo Kadonaga, William Kentridge, Toba Khedoori, Luisa Lambri, Myoung Ho Lee, Zoe Leonard, Robert Longo, Sally Mann, Steve McQueen, Jean-Luc Mylayne, Mariele Neudecker, Virginia Overton, Roxy Paine, Giuseppe Penone, Abel Rodríguez, Ugo Rondinone, George Shaw, Robert Smithson, Jennifer Steinkamp, Thomas Struth, Rachel Sussman, Pascale Marthine Tayou, Jeff Wall.\nThe exhibition is kindly supported by the Swiss Arts Council Pro Helvetia.", coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/hayward-gallery/hayward-25038/image-0.webp", url: "https://www.newexhibitions.com/e/25038", startDate: "2020-08-01", endDate: "2020-10-31" },
      { id: "hayward-25040", name: "Nevin Alada&#287; : Fanfare", title: "Nevin Alada&#287; : Fanfare", description: "HENI Project Space presents a free exhibition of playful, musical works by Nevin Alada&#287;.\n\nThe exhibition &#8211; Alada&#287;&#8217;s first solo show in the UK &#8211; brings together a group of recent artworks that explore sound, rhythm and music.", detailedDescription: "HENI Project Space presents a free exhibition of playful, musical works by Nevin Alada&#287;.\n\nThe exhibition &#8211; Alada&#287;&#8217;s first solo show in the UK &#8211; brings together a group of recent artworks that explore sound, rhythm and music.", coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/hayward-gallery/hayward-25040/image-0.webp", url: "https://www.newexhibitions.com/e/25040", startDate: "2020-02-12", endDate: "2020-04-13" },
      { id: "hayward-25043", name: "Kiss My Genders", title: "Kiss My Genders", description: "In summer 2019 Hayward Gallery will open Kiss My Genders, a group exhibition celebrating more than 30 international artists whose work explores and engages with gender fluidity, as well as non-binary, trans and intersex identities.\n\nKiss My Genders features works from the late 1960s and early 1970s through to the present moment, and focuses on artists who draw on their own experiences to create content and forms that challenge accepted or stable definitions of gender.\n\nWorking across painting, immersive installations, sculpture, text, photography and film, many of these artists treat the body as a sculpture, and in doing so open up new possibilities for gender, beauty and representations of the human form.", detailedDescription: "In summer 2019 Hayward Gallery will open Kiss My Genders, a group exhibition celebrating more than 30 international artists whose work explores and engages with gender fluidity, as well as non-binary, trans and intersex identities.\n\nKiss My Genders features works from the late 1960s and early 1970s through to the present moment, and focuses on artists who draw on their own experiences to create content and forms that challenge accepted or stable definitions of gender.\n\nWorking across painting, immersive installations, sculpture, text, photography and film, many of these artists treat the body as a sculpture, and in doing so open up new possibilities for gender, beauty and representations of the human form.", coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/hayward-gallery/hayward-25043/image-0.webp", url: "https://www.newexhibitions.com/e/25043", startDate: "2019-06-12", endDate: "2019-09-08" },
      { id: "hayward-25047", name: "Emmanuelle Lainé", title: "Emmanuelle Lainé", coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/hayward-gallery/hayward-25047/image-0.webp", url: "https://www.newexhibitions.com/e/25047", startDate: "2018-10-25", endDate: "2018-12-24" },
      { id: "hayward-25050", name: "Lee Bul", title: "Lee Bul", description: "Lee Bul transforms Hayward Gallery into a spectacular dream-like landscape featuring monstrous bodies, futuristic cyborgs, glittering mirrored environments and an exquisitely surreal monumental foil Zeppelin.", detailedDescription: "Lee Bul transforms Hayward Gallery into a spectacular dream-like landscape featuring monstrous bodies, futuristic cyborgs, glittering mirrored environments and an exquisitely surreal monumental foil Zeppelin.", coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/hayward-gallery/hayward-25050/image-0.webp", url: "https://www.newexhibitions.com/e/25050", startDate: "2018-05-30", endDate: "2018-08-19" },
      { id: "hayward-25051", name: "Andreas Gursky", title: "Andreas Gursky", description: "Hayward Gallery reopens in January 2018 with the first major UK retrospective of the work of acclaimed German photographer Andreas Gursky.\n\nGursky, known for his large-scale, often spectacular pictures that portray emblematic sites and scenes of the global economy and contemporary life, is widely regarded as one of the most significant photographers of our time.", detailedDescription: "Hayward Gallery reopens in January 2018 with the first major UK retrospective of the work of acclaimed German photographer Andreas Gursky.\n\nGursky, known for his large-scale, often spectacular pictures that portray emblematic sites and scenes of the global economy and contemporary life, is widely regarded as one of the most significant photographers of our time.", coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/hayward-gallery/hayward-25051/image-0.webp", url: "https://www.newexhibitions.com/e/25051", startDate: "2018-01-25", endDate: "2018-04-22" },
      { id: "hayward-25055", name: "Carsten Holler : Decision", title: "Carsten Holler : Decision", description: "Carsten Höller: Decision is the artist's first major survey show in the UK.\n\nThe exhibition, which sprawls across Hayward Gallery and erupts beyond its roof and walls, explores perception and decision making.\n\nThe exhibition confronts visitors with a series of choices involving mirrors, disconcerting doubles and mysterious objects, in a world where nothing is quite as it seems.", detailedDescription: "Carsten Höller: Decision is the artist's first major survey show in the UK.\n\nThe exhibition, which sprawls across Hayward Gallery and erupts beyond its roof and walls, explores perception and decision making.\n\nThe exhibition confronts visitors with a series of choices involving mirrors, disconcerting doubles and mysterious objects, in a world where nothing is quite as it seems.", coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/hayward-gallery/hayward-25055/image-0.webp", url: "https://www.newexhibitions.com/e/25055", startDate: "2015-06-10", endDate: "2015-09-06" },
      { id: "hayward-25053", name: "Echoes & Reverberations", title: "Echoes & Reverberations", description: "Through objects, performances and videos, this group exhibition explores performative approaches to aural culture and oral history. From Jumana Emil Abboud&#8217;s weaving of Palestinian folk-tales into everyday life to Joe Namy&#8217;s interest in forms of collective sound and music, the artists in the exhibition employ different strategies to conjure and challenge cultural memory.", detailedDescription: "Through objects, performances and videos, this group exhibition explores performative approaches to aural culture and oral history. From Jumana Emil Abboud&#8217;s weaving of Palestinian folk-tales into everyday life to Joe Namy&#8217;s interest in forms of collective sound and music, the artists in the exhibition employ different strategies to conjure and challenge cultural memory.", coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/hayward-gallery/hayward-25053/image-0.webp", url: "https://www.newexhibitions.com/e/25053", startDate: "2015-06-23", endDate: "2015-08-16" },
      { id: "hayward-25056", name: "History is Now : 7 artists take on Britain", title: "History is Now : 7 artists take on Britain", description: "For History is Now, seven artists have been invited to each curate a section of the exhibition which brings together artworks and objects relating to historical moments of their own choosing. Participating artists are: Richard Wentworth, John Akomfrah, Jane and Louise Wilson, Hannah Starkey, Roger Hiorns and Simon Fujiwara.\nHistory Is Now is accompanied by a public programme, and is a part of Southbank Centre's Changing Britain 1945&#8211;2015 festival, which runs from 30 January to 9 May 2015. Visit our website for more information.", detailedDescription: "For History is Now, seven artists have been invited to each curate a section of the exhibition which brings together artworks and objects relating to historical moments of their own choosing. Participating artists are: Richard Wentworth, John Akomfrah, Jane and Louise Wilson, Hannah Starkey, Roger Hiorns and Simon Fujiwara.\nHistory Is Now is accompanied by a public programme, and is a part of Southbank Centre's Changing Britain 1945&#8211;2015 festival, which runs from 30 January to 9 May 2015. Visit our website for more information.", coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/hayward-gallery/hayward-25056/image-0.webp", url: "https://www.newexhibitions.com/e/25056", startDate: "2015-02-10", endDate: "2015-04-26" },
      { id: "hayward-25059", name: "Martin Creed : What's the point of it?", title: "Martin Creed : What's the point of it?", description: "Martin Creed: What's the point of it? is the first major retrospective of Creed's ingenious and often highly provocative work. Since the beginning of his career, when he made small objects that could be placed anywhere, Creed has made work that questions the very nature of art and challenges taboos. His work takes on a multitude of forms&#8212;from sculpture, paintings, neons, films and installations, to music and performance&#8212;appearing both in the art gallery and in broader public circulation. At once rigorous and humorous, his art continually surprises, disrupts and overturns our expectations. It reflects on the unease we face in making choices, the comfort we find in repetition, the desire to control, and the inevitable losses of control that shape existence.", detailedDescription: "Martin Creed: What's the point of it? is the first major retrospective of Creed's ingenious and often highly provocative work. Since the beginning of his career, when he made small objects that could be placed anywhere, Creed has made work that questions the very nature of art and challenges taboos. His work takes on a multitude of forms&#8212;from sculpture, paintings, neons, films and installations, to music and performance&#8212;appearing both in the art gallery and in broader public circulation. At once rigorous and humorous, his art continually surprises, disrupts and overturns our expectations. It reflects on the unease we face in making choices, the comfort we find in repetition, the desire to control, and the inevitable losses of control that shape existence.", coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/hayward-gallery/hayward-25059/image-0.webp", url: "https://www.newexhibitions.com/e/25059", startDate: "2014-01-29", endDate: "2014-04-27" },
      { id: "hayward-25060", name: "Dayanita Singh : Go Away Closer", title: "Dayanita Singh : Go Away Closer", coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/hayward-gallery/hayward-25060/image-0.webp", url: "https://www.newexhibitions.com/e/25060", startDate: "2013-10-08", endDate: "2013-12-15" },
      { id: "hayward-25061", name: "Ana Mendieta : Traces", title: "Ana Mendieta : Traces", description: "Using her own body, together with elemental materials such as blood, fire, earth and water, Ana Mendieta creates visceral performances and ephemeral &#8216;earth-body&#8217; sculptures that combine ritual with metaphors about life, death, rebirth and spiritual transformation. &#8216;I wanted my images to have power, to be magic,&#8217; she said. &#8216;I decided that for the images to have magic qualities I had to work directly with nature.&#8217;", detailedDescription: "Using her own body, together with elemental materials such as blood, fire, earth and water, Ana Mendieta creates visceral performances and ephemeral &#8216;earth-body&#8217; sculptures that combine ritual with metaphors about life, death, rebirth and spiritual transformation. &#8216;I wanted my images to have power, to be magic,&#8217; she said. &#8216;I decided that for the images to have magic qualities I had to work directly with nature.&#8217;", coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/hayward-gallery/hayward-25061/image-0.webp", url: "https://www.newexhibitions.com/e/25061", startDate: "2013-09-24", endDate: "2013-12-15" },
      { id: "hayward-25064", name: "Light Show", title: "Light Show", description: "Light Show explores the experiential and phenomenal nature of light, bringing together sculptures and installations that use light in different ways. The exhibition showcases artworks created since the 1960s in which light is used to sculpt and shape space, often operating at the edges of perception.", detailedDescription: "Light Show explores the experiential and phenomenal nature of light, bringing together sculptures and installations that use light in different ways. The exhibition showcases artworks created since the 1960s in which light is used to sculpt and shape space, often operating at the edges of perception.", coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/hayward-gallery/hayward-25064/image-0.webp", url: "https://www.newexhibitions.com/e/25064", startDate: "2013-01-30", endDate: "2013-05-06" },
      { id: "hayward-25122", name: "John McCracken: 'IV' (1985) and 'Neon' (1989)", title: "John McCracken: 'IV' (1985) and 'Neon' (1989)", description: "The first in a series of exhibitions presenting sculptures from the past that have made sculpture in the present possible, launching with two works from the 1980s by the American artist John McCracken (1934&#8211;2011). McCracken's sculptures ask a fundamental question: 'how do things sit in space?' Condensing the possibilities of sculpture into single obstructive objects, these are handmade to smooth perfection, utilising the basic languages of sculpture: scale, colour, height, width, and breadth.", detailedDescription: "The first in a series of exhibitions presenting sculptures from the past that have made sculpture in the present possible, launching with two works from the 1980s by the American artist John McCracken (1934&#8211;2011). McCracken's sculptures ask a fundamental question: 'how do things sit in space?' Condensing the possibilities of sculpture into single obstructive objects, these are handmade to smooth perfection, utilising the basic languages of sculpture: scale, colour, height, width, and breadth.", coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/hayward-gallery/hayward-25122/image-0.webp", url: "https://www.newexhibitions.com/e/25122", startDate: "2012-02-29", endDate: "2012-05-13" },
      { id: "hayward-25077", name: "The Royal Family : Hayward Gallery Project Space", title: "The Royal Family : Hayward Gallery Project Space", description: "Royal Family focuses on contemporary artists' representations of the House of Windsor ahead of the royal wedding. It presents works in a range of media that examine the individual family members, as well as the signs and signifiers, of the celebrated and peculiar institution of the British royal family. Artists featured in the exhibition include Adam Dant, Hans Peter Feldman, Alison Jackson, Alan Kane, Lars Laumann, Otto Muehl, Tony Oursler, Francis Upritchard.", detailedDescription: "Royal Family focuses on contemporary artists' representations of the House of Windsor ahead of the royal wedding. It presents works in a range of media that examine the individual family members, as well as the signs and signifiers, of the celebrated and peculiar institution of the British royal family. Artists featured in the exhibition include Adam Dant, Hans Peter Feldman, Alison Jackson, Alan Kane, Lars Laumann, Otto Muehl, Tony Oursler, Francis Upritchard.", coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/hayward-gallery/hayward-25077/image-0.webp", url: "https://www.newexhibitions.com/e/25077", startDate: "2011-03-12", endDate: "2011-05-02" },
      { id: "hayward-25080", name: "Jess Flood-Paddock : Gangsta's Paradise", title: "Jess Flood-Paddock : Gangsta's Paradise", description: "Hayward Gallery Project Space", detailedDescription: "Hayward Gallery Project Space", coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/hayward-gallery/hayward-25080/image-0.webp", url: "https://www.newexhibitions.com/e/25080", startDate: "2010-08-04", endDate: "2010-09-19" },
      { id: "hayward-25085", name: "Martin Sastre", title: "Martin Sastre", description: "Video art in Hayward Gallery Project Space.", detailedDescription: "Video art in Hayward Gallery Project Space.", coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/hayward-gallery/hayward-25085/image-0.webp", url: "https://www.newexhibitions.com/e/25085", startDate: "2009-09-08", endDate: "2009-09-30" },
      { id: "hayward-25089", name: "Walking in My Mind", title: "Walking in My Mind", description: "Explores the inner working of the artist's imagination through dramatic, large-scale installation art. Charles Avery, Thomas Hirschhorn, Yayoi Kusama, Bo Christian Larsson, Mark Manders, Yoshitomo Nara, Jason Rhoades, Pipilotti Rist, Chiharu Shiota and Keith Tyson.", detailedDescription: "Explores the inner working of the artist's imagination through dramatic, large-scale installation art. Charles Avery, Thomas Hirschhorn, Yayoi Kusama, Bo Christian Larsson, Mark Manders, Yoshitomo Nara, Jason Rhoades, Pipilotti Rist, Chiharu Shiota and Keith Tyson.", coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/hayward-gallery/hayward-25089/image-0.webp", url: "https://www.newexhibitions.com/e/25089", startDate: "2009-06-23", endDate: "2009-09-06" },
      { id: "hayward-25092", name: "Annette Messager : The Messengers", title: "Annette Messager : The Messengers", description: "Retrospective. This exhibition presents a panoramic survey from the intimate and conceptually driven pieces Messager made in the early 1970s to the very large sculptural installations of the past 15 years, in which movement plays an increasingly important role.", detailedDescription: "Retrospective. This exhibition presents a panoramic survey from the intimate and conceptually driven pieces Messager made in the early 1970s to the very large sculptural installations of the past 15 years, in which movement plays an increasingly important role.", coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/hayward-gallery/hayward-25092/image-0.webp", url: "https://www.newexhibitions.com/e/25092", startDate: "2009-03-04", endDate: "2009-05-25" },
      { id: "hayward-25093", name: "Mark Wallinger Curates : The Russian Linesman", title: "Mark Wallinger Curates : The Russian Linesman", coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/hayward-gallery/hayward-25093/image-0.webp", url: "https://www.newexhibitions.com/e/25093", startDate: "2009-02-18", endDate: "2009-05-04" },
      { id: "hayward-25095", name: "Robin Rhode: Who Saw Who", title: "Robin Rhode: Who Saw Who", description: "A major new talent on the international art scene, Robin Rhode has a reputation for brilliantly inventive performances, photographs, video animations and drawings. Rhode's art uses the barest of means to comment on urban poverty and the politics of leisure.", detailedDescription: "A major new talent on the international art scene, Robin Rhode has a reputation for brilliantly inventive performances, photographs, video animations and drawings. Rhode's art uses the barest of means to comment on urban poverty and the politics of leisure.", coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/hayward-gallery/hayward-25095/image-0.webp", url: "https://www.newexhibitions.com/e/25095", startDate: "2008-09-23", endDate: "2008-12-07" },
      { id: "hayward-25096", name: "Psycho Buildings : Artists take on Architecture", title: "Psycho Buildings : Artists take on Architecture", description: "The work of artists who create habitat-like structures and architectural environments that are mental and perceptual spaces as much as physical ones. Artists include: Los Carpinteros, Mike Nelson, Ernesto Neto, Do-Ho Suh and Rachel Whiteread.", detailedDescription: "The work of artists who create habitat-like structures and architectural environments that are mental and perceptual spaces as much as physical ones. Artists include: Los Carpinteros, Mike Nelson, Ernesto Neto, Do-Ho Suh and Rachel Whiteread.", coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/hayward-gallery/hayward-25096/image-0.webp", url: "https://www.newexhibitions.com/e/25096", startDate: "2008-05-28", endDate: "2008-08-25" },
      { id: "hayward-25107", name: "Rebecca Horn: Bodylandscapes", title: "Rebecca Horn: Bodylandscapes", coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/hayward-gallery/hayward-25107/image-0.webp", url: "https://www.newexhibitions.com/e/25107", startDate: "2005-05-26", endDate: "2005-08-29" },
      { id: "hayward-64913", name: "Haegue Yang: Leap Year", title: "Haegue Yang: Leap Year", description: "A world of inventive, immersive and multisensory installations and sculptures that weave connections between disparate histories, cultures and traditions.\n\nHaegue Yang's work spans a vast range of media – from paper collage to performative sculpture and immense sensorial installations.\n\nEqually as wide-ranging, her inspiration draws on diverse histories and customs, including East Asian traditions and folklore, modernism, contemporary art history and nature.\n\nYang uses a variety of crafts, techniques and materials in her work, tapping into the cultural connotations they carry. Her works often feature a variety of household and industrial objects, including drying racks, light bulbs, metal-plated bells, nylon pom-poms, hand-knitted yarn and hanji (Korean paper).\n\nLeap Year is the first major survey of the internationally celebrated artist in the UK. It presents a comprehensive study of Yang's work from the early 2000s to today, highlighting how her artworks resonate on a personal and sensory level while also speaking to social, political and spiritual ideas.\n\nThe exhibition features key works from some of her most notable series, including Light Sculptures and Sonic Sculptures, complemented by three new major commissions and a number of new productions.\n\nThese works bring together a wide spectrum of visual and sensory experiences through the mediums of installation, sculpture, collage, text, video, wallpaper, sound.\n\nYang (born 1971, Seoul) lives and works in both Berlin and Seoul. Her multisensory environments encourage perception beyond the visual, creating immersive experiences that highlight issues such as labour, migration, and displacement.\n\nShe has had recent solo exhibitions at Helsinki Art Museum (2024); National Gallery of Australia, Canberra (2023); S.M.A.K., Ghent (2023); and Pinacoteca de S&atilde;o Paulo (2023).\n\nTickets\n\nStandard entry from &pound;19 / Members free. Concessions available for full-time students, Lambeth residents, under-30s and recipients of Universal or Pension Credit, Tue – Fri & after 5pm on Sat.", detailedDescription: "A world of inventive, immersive and multisensory installations and sculptures that weave connections between disparate histories, cultures and traditions.\n\nHaegue Yang's work spans a vast range of media – from paper collage to performative sculpture and immense sensorial installations.\n\nEqually as wide-ranging, her inspiration draws on diverse histories and customs, including East Asian traditions and folklore, modernism, contemporary art history and nature.\n\nYang uses a variety of crafts, techniques and materials in her work, tapping into the cultural connotations they carry. Her works often feature a variety of household and industrial objects, including drying racks, light bulbs, metal-plated bells, nylon pom-poms, hand-knitted yarn and hanji (Korean paper).\n\nLeap Year is the first major survey of the internationally celebrated artist in the UK. It presents a comprehensive study of Yang's work from the early 2000s to today, highlighting how her artworks resonate on a personal and sensory level while also speaking to social, political and spiritual ideas.\n\nThe exhibition features key works from some of her most notable series, including Light Sculptures and Sonic Sculptures, complemented by three new major commissions and a number of new productions.\n\nThese works bring together a wide spectrum of visual and sensory experiences through the mediums of installation, sculpture, collage, text, video, wallpaper, sound.\n\nYang (born 1971, Seoul) lives and works in both Berlin and Seoul. Her multisensory environments encourage perception beyond the visual, creating immersive experiences that highlight issues such as labour, migration, and displacement.\n\nShe has had recent solo exhibitions at Helsinki Art Museum (2024); National Gallery of Australia, Canberra (2023); S.M.A.K., Ghent (2023); and Pinacoteca de S&atilde;o Paulo (2023).\n\nTickets\n\nStandard entry from &pound;19 / Members free. Concessions available for full-time students, Lambeth residents, under-30s and recipients of Universal or Pension Credit, Tue – Fri & after 5pm on Sat.", coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/hayward-gallery/hayward-64913/image-0.webp", url: "https://www.newexhibitions.com/e/64913" },
      { id: "hayward-64914", name: "Huang Po-Chih: Waves", title: "Huang Po-Chih: Waves", description: "Taiwanese artist Huang Po-Chih uses the personal narratives of workers to investigate globalised trade, with a focus on the textile industry in East Asia.\n\nDrawing upon his family heritage – particularly his mother's experiences as a garment worker in Taoyuan, Taiwan – Huang engages with the personal narratives of individuals involved in the textile industry across China, Hong Kong, South Korea and Taiwan.\n\nThe exhibition features new video and text-based work as part of a presentation of installation, photography and sculpture. Stories and anecdotes from the 1960s to the present day take place against a backdrop of migration and trade, and Huang addresses the role that his own artistic production plays within this system of global capitalism.\n\nThroughout the work, narratives and themes circulate like the waves and ocean currents that transport people and materials via trade routes in the region and beyond. This sense of fluidity also serves as a metaphor for the turbulent conditions faced by the generally low-paid workers in the East Asian textile industry.\n\nNominated for the HUGO BOSS Asia Art Award in 2015, and recipient of the Prudential Eye Awards in 2016, Po-Chih's work has been widely shown internationally. Huang Po-Chih: Waves is the artist's first solo exhibition in the UK.\n\nPresented with support from the RC Foundation, Taiwan (R.O.C.). Additional support provided by the Ministry of Culture, Taiwan (R.O.C.)\n\nStandard entry Free – no ticket required", detailedDescription: "Taiwanese artist Huang Po-Chih uses the personal narratives of workers to investigate globalised trade, with a focus on the textile industry in East Asia.\n\nDrawing upon his family heritage – particularly his mother's experiences as a garment worker in Taoyuan, Taiwan – Huang engages with the personal narratives of individuals involved in the textile industry across China, Hong Kong, South Korea and Taiwan.\n\nThe exhibition features new video and text-based work as part of a presentation of installation, photography and sculpture. Stories and anecdotes from the 1960s to the present day take place against a backdrop of migration and trade, and Huang addresses the role that his own artistic production plays within this system of global capitalism.\n\nThroughout the work, narratives and themes circulate like the waves and ocean currents that transport people and materials via trade routes in the region and beyond. This sense of fluidity also serves as a metaphor for the turbulent conditions faced by the generally low-paid workers in the East Asian textile industry.\n\nNominated for the HUGO BOSS Asia Art Award in 2015, and recipient of the Prudential Eye Awards in 2016, Po-Chih's work has been widely shown internationally. Huang Po-Chih: Waves is the artist's first solo exhibition in the UK.\n\nPresented with support from the RC Foundation, Taiwan (R.O.C.). Additional support provided by the Ministry of Culture, Taiwan (R.O.C.)\n\nStandard entry Free – no ticket required", coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/hayward-gallery/hayward-64914/image-0.webp", url: "https://www.newexhibitions.com/e/64914" },
      { id: "hayward-62389", name: "Hiroshi Sugimoto", title: "Hiroshi Sugimoto", description: "The largest retrospective to date of Hiroshi Sugimoto, an artist renowned for creating some of the most alluringly enigmatic photographs of our time.\n\nOver the past 50 years, Sugimoto has created pictures which are meticulously crafted, deeply thought-provoking and quietly subversive. \n\nFeaturing key works from all of the artist's major photographic series, this retrospective highlights Sugimoto's philosophical yet playful inquiry into our understanding of time and memory, and photography's ability to both document and invent. \n\nThe exhibition also includes lesser-known works that reveal the artist's interest in the history of photography, as well as in mathematics and optical sciences. \n\nOften employing a large-format wooden camera and mixing his own darkroom chemicals, Sugimoto has repeatedly re-explored ideas and practices from 19th century photography while capturing subjects including dioramas, wax figures and architecture. His work has stretched and rearranged concepts of time, space and light that are integral to the medium.\n\nBorn and raised in Tokyo, Japan, Hiroshi Sugimoto divides his time between Tokyo and New York City. Over the past five decades, his photographs have received international acclaim and have been presented in major institutions across the globe. \n\nWhile best known as a photographer, Sugimoto has more recently added architecture, sculpture and set design to his multidisciplinary practice. \n\nHis work is represented in major public collections including the Metropolitan Museum of Art, New York; Centre Pompidou, Paris; Museum of Modern Art, New York; and National Gallery, London.\n\nHiroshi Sugimoto is generously supported by the Exhibition Supporters' Group: Fraenkel Gallery, Marian Goodman Gallery, Gallery Koyanagi, the Rory and Elizabeth Brooks Foundation, Beth and Michele Colocci, Suling C Mead, Manizeh and Danny Rimer, Maria and Malek Sukkar, Michael G and C Jane Wilson and those who wish to remain anonymous. \n\nAdditional support has been provided by the Japan Foundation and the Daiwa Anglo-Japanese Foundation. \n\nThe exhibition catalogue is kindly supported by Joe and Marie Donnelly and the Great Britain Sasakawa Foundation.", detailedDescription: "The largest retrospective to date of Hiroshi Sugimoto, an artist renowned for creating some of the most alluringly enigmatic photographs of our time.\n\nOver the past 50 years, Sugimoto has created pictures which are meticulously crafted, deeply thought-provoking and quietly subversive. \n\nFeaturing key works from all of the artist's major photographic series, this retrospective highlights Sugimoto's philosophical yet playful inquiry into our understanding of time and memory, and photography's ability to both document and invent. \n\nThe exhibition also includes lesser-known works that reveal the artist's interest in the history of photography, as well as in mathematics and optical sciences. \n\nOften employing a large-format wooden camera and mixing his own darkroom chemicals, Sugimoto has repeatedly re-explored ideas and practices from 19th century photography while capturing subjects including dioramas, wax figures and architecture. His work has stretched and rearranged concepts of time, space and light that are integral to the medium.\n\nBorn and raised in Tokyo, Japan, Hiroshi Sugimoto divides his time between Tokyo and New York City. Over the past five decades, his photographs have received international acclaim and have been presented in major institutions across the globe. \n\nWhile best known as a photographer, Sugimoto has more recently added architecture, sculpture and set design to his multidisciplinary practice. \n\nHis work is represented in major public collections including the Metropolitan Museum of Art, New York; Centre Pompidou, Paris; Museum of Modern Art, New York; and National Gallery, London.\n\nHiroshi Sugimoto is generously supported by the Exhibition Supporters' Group: Fraenkel Gallery, Marian Goodman Gallery, Gallery Koyanagi, the Rory and Elizabeth Brooks Foundation, Beth and Michele Colocci, Suling C Mead, Manizeh and Danny Rimer, Maria and Malek Sukkar, Michael G and C Jane Wilson and those who wish to remain anonymous. \n\nAdditional support has been provided by the Japan Foundation and the Daiwa Anglo-Japanese Foundation. \n\nThe exhibition catalogue is kindly supported by Joe and Marie Donnelly and the Great Britain Sasakawa Foundation.", coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/hayward-gallery/hayward-62389/image-0.webp", url: "https://www.newexhibitions.com/e/62389" },
      { id: "hayward-59920", name: "Strange Clay: Ceramics in Contemporary Art", title: "Strange Clay: Ceramics in Contemporary Art", description: "Strange Clay: Ceramics in Contemporary Art is the first large-scale group exhibition in the UK exploring how contemporary artists have used clay in unexpected ways.\n\nFeaturing 23 international artists working across recent decades, the exhibition examines the plasticity and the possibilities of ceramics.\n\nThe artworks on show encompass fantastical creatures and uncanny representations of the everyday, as well as ranging from small abstract works to large-scale installations that take the medium beyond the kiln.\n\nStrange Clay does not present a comprehensive survey of artists who work with ceramics today – instead the exhibition explores the possibilities of thinking through making.\n\nThe artworks vary in scale, finish and technique, and address topics that range from architecture, to social justice, the body, the domestic and the organic.\n\nWhile contributing to the broadening dialogue between art and craft, this exhibition provides a closer look at this tactile medium.\n\nThe exhibition features works by Aaron Angell, Salvatore Arancio, Leilah Babirye, Jonathan Baldock, Lubna Chowdhary, Edmund de Waal, Emma Hart, Liu Jianhua, Rachel Kneebone, Serena Korda, Klara Kristalova, Beate Kuhn, Takuro Kuwata, Lindsey Mendick, Ron Nagle, Magdalene Odundo, Woody De Othello, Grayson Perry, Shahpour Pouyan, Ken Price, Brie Ruais, Betty Woodman and David Zink Yi.\n\nThe exhibition is accompanied by a fully illustrated catalogue, co-published by Hayward Publishing and Hatje Cantz.", detailedDescription: "Strange Clay: Ceramics in Contemporary Art is the first large-scale group exhibition in the UK exploring how contemporary artists have used clay in unexpected ways.\n\nFeaturing 23 international artists working across recent decades, the exhibition examines the plasticity and the possibilities of ceramics.\n\nThe artworks on show encompass fantastical creatures and uncanny representations of the everyday, as well as ranging from small abstract works to large-scale installations that take the medium beyond the kiln.\n\nStrange Clay does not present a comprehensive survey of artists who work with ceramics today – instead the exhibition explores the possibilities of thinking through making.\n\nThe artworks vary in scale, finish and technique, and address topics that range from architecture, to social justice, the body, the domestic and the organic.\n\nWhile contributing to the broadening dialogue between art and craft, this exhibition provides a closer look at this tactile medium.\n\nThe exhibition features works by Aaron Angell, Salvatore Arancio, Leilah Babirye, Jonathan Baldock, Lubna Chowdhary, Edmund de Waal, Emma Hart, Liu Jianhua, Rachel Kneebone, Serena Korda, Klara Kristalova, Beate Kuhn, Takuro Kuwata, Lindsey Mendick, Ron Nagle, Magdalene Odundo, Woody De Othello, Grayson Perry, Shahpour Pouyan, Ken Price, Brie Ruais, Betty Woodman and David Zink Yi.\n\nThe exhibition is accompanied by a fully illustrated catalogue, co-published by Hayward Publishing and Hatje Cantz.", coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/hayward-gallery/hayward-59920/image-0.webp", url: "https://www.newexhibitions.com/e/59920" },
      { id: "hayward-25041", name: "Joo Yeon Park : Library of the Unword", title: "Joo Yeon Park : Library of the Unword", description: "Joo Yeon Park&#8217;s 'Library of the Unword' commemorates the 30th anniversary of Samuel Beckett&#8217;s death. The exhibition includes an installation O (22800) in response to Beckett&#8217;s 1935 collection of poems Echo's Bones and Other Precipitates (1935). The work comprises 126 framed mirrors and writings/drawings that consist of circles on Korean manuscript paper. The exhibition also features archival items on Beckett from the National Poetry Library collection, including audio, images, press cuttings and a rare copy of his poetry collection.", detailedDescription: "Joo Yeon Park&#8217;s 'Library of the Unword' commemorates the 30th anniversary of Samuel Beckett&#8217;s death. The exhibition includes an installation O (22800) in response to Beckett&#8217;s 1935 collection of poems Echo's Bones and Other Precipitates (1935). The work comprises 126 framed mirrors and writings/drawings that consist of circles on Korean manuscript paper. The exhibition also features archival items on Beckett from the National Poetry Library collection, including audio, images, press cuttings and a rare copy of his poetry collection.", coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/hayward-gallery/hayward-25041/image-0.webp", url: "https://www.newexhibitions.com/e/25041" },
      { id: "hayward-25042", name: "Bridget Riley", title: "Bridget Riley", description: "Spanning 70 years of Bridget&#8217;s career, the exhibition includes rarely seen cartoons and sketches from her early days as an art student right up to site-specific wall paintings for the Hayward Gallery. This will be the third time Riley has exhibited her work in a solo show at Hayward Gallery, marking her longstanding relationship with the space. The exhibition will also show Riley&#8217;s only 3-D work, Continuum, and a rarely seen &#8216;70s work, Flag.", detailedDescription: "Spanning 70 years of Bridget&#8217;s career, the exhibition includes rarely seen cartoons and sketches from her early days as an art student right up to site-specific wall paintings for the Hayward Gallery. This will be the third time Riley has exhibited her work in a solo show at Hayward Gallery, marking her longstanding relationship with the space. The exhibition will also show Riley&#8217;s only 3-D work, Continuum, and a rarely seen &#8216;70s work, Flag.", coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/hayward-gallery/hayward-25042/image-0.webp", url: "https://www.newexhibitions.com/e/25042" },
      { id: "hayward-25057", name: "MIRRORCITY : London artists on fiction and reality", title: "MIRRORCITY : London artists on fiction and reality", description: "\"Cities, like dreams, are made of desires and fears, even if the thread of their discourse is secret, their rules are absurd, their perspectives deceitful, and everything conceals something else.\"\n&#8211;Italo Calvino\nMIRRORCITY features recent work and new commissions by key emerging and established artists working in London who all seek to address the dilemmas, realities and consequences of living in our digital age. \nArtists in the exhibition are Mohammed Qasim Ashfaq, Michael Dean, Tim Etchells, Anne Hardy, Susan Hiller, LuckyPDF, Lloyd Corporation, Helen Marten, Ursula Mayer, Emma McNally, Karen Mirza and Brad Butler, Katrina Palmer, Pil and Galia Kollectiv, Laure Prouvost, Aura Satz, Hannah Sawtell, Lindsay Seers, Tai Shani, Daniel Sinsel, John Stezaker, Volumes Project, Lynette Yiadom-Boakye and James Bridle.", detailedDescription: "\"Cities, like dreams, are made of desires and fears, even if the thread of their discourse is secret, their rules are absurd, their perspectives deceitful, and everything conceals something else.\"\n&#8211;Italo Calvino\nMIRRORCITY features recent work and new commissions by key emerging and established artists working in London who all seek to address the dilemmas, realities and consequences of living in our digital age. \nArtists in the exhibition are Mohammed Qasim Ashfaq, Michael Dean, Tim Etchells, Anne Hardy, Susan Hiller, LuckyPDF, Lloyd Corporation, Helen Marten, Ursula Mayer, Emma McNally, Karen Mirza and Brad Butler, Katrina Palmer, Pil and Galia Kollectiv, Laure Prouvost, Aura Satz, Hannah Sawtell, Lindsay Seers, Tai Shani, Daniel Sinsel, John Stezaker, Volumes Project, Lynette Yiadom-Boakye and James Bridle.", coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/hayward-gallery/hayward-25057/image-0.webp", url: "https://www.newexhibitions.com/e/25057" },
      { id: "hayward-25081", name: "Move : Choreographing You", title: "Move : Choreographing You", description: "Move: Choreographing You invites the visitor to become a participant - and in some cases a dancer - in installations and sculptures by internationally renowned visual artists and choreographers. \nExploring how dance has been a driving force in the development of contemporary art since the 1960s, the exhibition presents a series of sculptural works, set pieces and installations, which can be activated by the public and by a group of resident dancers in the gallery.\n\nFeatured artists include Tania Bruguera, Boris Charmatz, William Forsythe, Isaac Julien, Mike Kelley, La Ribot, Robert Morris, Bruce Nauman, Tino Sehgal, Yvonne Rainer, Simone Forti and Trisha Brown.\n\nMove: Choreographing You is supported by the German Federal Cultural Foundation and Louis Vuitton.", detailedDescription: "Move: Choreographing You invites the visitor to become a participant - and in some cases a dancer - in installations and sculptures by internationally renowned visual artists and choreographers. \nExploring how dance has been a driving force in the development of contemporary art since the 1960s, the exhibition presents a series of sculptural works, set pieces and installations, which can be activated by the public and by a group of resident dancers in the gallery.\n\nFeatured artists include Tania Bruguera, Boris Charmatz, William Forsythe, Isaac Julien, Mike Kelley, La Ribot, Robert Morris, Bruce Nauman, Tino Sehgal, Yvonne Rainer, Simone Forti and Trisha Brown.\n\nMove: Choreographing You is supported by the German Federal Cultural Foundation and Louis Vuitton.", coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/hayward-gallery/hayward-25081/image-0.webp", url: "https://www.newexhibitions.com/e/25081" },
      { id: "hayward-25086", name: "Ed Ruscha : Fifty Years of Painting", title: "Ed Ruscha : Fifty Years of Painting", description: "First major UK retrospective to focus exclusively on the paintings of the Los Angeles-based artist, one of the most influential and pioneering American artists of the past half century.", detailedDescription: "First major UK retrospective to focus exclusively on the paintings of the Los Angeles-based artist, one of the most influential and pioneering American artists of the past half century.", coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/hayward-gallery/hayward-25086/image-0.webp", url: "https://www.newexhibitions.com/e/25086" },
      { id: "hayward-25094", name: "Andy Warhol : Other Voices, Other Rooms", title: "Andy Warhol : Other Voices, Other Rooms", description: "The Hayward presents a fresh perspective on Warhol, presenting Warhol&#8217;s films, screen-tests, videos and television programmes, which combined with extraordinary archive material, seminal paintings and installations, illuminates his creative process.", detailedDescription: "The Hayward presents a fresh perspective on Warhol, presenting Warhol&#8217;s films, screen-tests, videos and television programmes, which combined with extraordinary archive material, seminal paintings and installations, illuminates his creative process.", coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/hayward-gallery/hayward-25094/image-0.webp", url: "https://www.newexhibitions.com/e/25094" }
    ]
  },

  // ===== FRANCE =====
  // Paris - Major Museums
  {
    id: "musee-du-louvre",
    description_ko: "옛 프랑스 왕궁을 개조해 1793년 문을 연 세계 최대 규모의 미술관이다. 레오나르도 다 빈치의 '모나리자', '밀로의 비너스', '사모트라케의 니케'를 비롯해 고대 오리엔트부터 19세기 중반까지 인류 미술의 정수를 아우른다. 유리 피라미드 입구는 박물관의 상징으로 자리 잡았다.",
    name: "Musée du Louvre",
    name_ko: "루브르 박물관",
    slug: "louvre",
    city: "Paris",
    country: "France",
    latitude: 48.8606,
    longitude: 2.3376,
    description: "세계 최대의 회화관. '모나리자'를 포함한 서양 고전 회화의 절대 성지.",
    representativeImage: "images/louvre-logo.svg",
    permanentExhibitions: [
      { id: "louvre-painting-collection", name: "Painting Collection", title: "Musée du Louvre Painting Collection", description: "Over 10,000 paintings from the world's largest art museum, featuring masterpieces from the Renaissance to the 19th century including the Mona Lisa, Winged Victory, and Venus de Milo.", startDate: "Permanent", endDate: "Permanent" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "musee-dorsay",
    description_ko: "1900년 보자르 양식으로 지어진 기차역을 미술관으로 되살려 1986년 개관했다. 1848년부터 1914년까지의 미술에 집중하며, 모네·르누아르·드가의 인상주의와 고흐·세잔·고갱의 후기인상주의 걸작을 한자리에서 만날 수 있다. 거대한 역사의 유리 천장 아래 펼쳐지는 전시 공간 자체가 명물이다.",
    slug: "musee-dorsay",
    name: "Musée d'Orsay",
    name_ko: "오르세 미술관",
    location: "1 Rue de la Légion d'Honneur, 75007 Paris, France",
    city: "Paris",
    country: "France",
    region: "Paris",
    latitude: 48.8600,
    longitude: 2.3266,
    description: "19세기 인상주의 회화의 중심. 고흐, 모네, 르누아르의 마스터피스 집결지.",
    representativeImage: "images/musee-dorsay-logo.svg",
    floorPlan: "",
    permanentExhibitions: [
      { id: "orsay-collection", name: "Orsay Collection", title: "Musée d'Orsay Permanent Collection", description: "Masterpieces of Impressionism and Post-Impressionism including works by Monet, Van Gogh, Renoir, Degas, Cézanne, and more.", startDate: "Permanent", endDate: "Permanent" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "centre-pompidou",
    description_ko: "배관과 철골 구조를 건물 밖으로 드러낸 파격적인 하이테크 건축으로 1977년 문을 연 유럽 최대의 현대미술관이다. 렌초 피아노와 리처드 로저스가 설계했으며, 국립근대미술관의 방대한 20·21세기 컬렉션을 품고 있다. 마티스·칸딘스키·뒤샹부터 동시대 작가까지 근현대미술의 흐름을 폭넓게 보여 준다.",
    name: "Centre Pompidou",
    name_ko: "조르주 퐁피두 센터",
    city: "Paris",
    country: "France",
    latitude: 48.8607,
    longitude: 2.3522,
    description: "유럽 최대 현대 미술 갤러리. 20세기 평면 예술의 흐름을 주도하는 영향력.",
    representativeImage: "images/centre-pompidou-logo.svg",
    permanentExhibitions: [
      { id: "pompidou-cinema-collection", name: "Cinema Collection", title: "Centre Pompidou Cinema Collection", description: "Experimental cinema, video art, and film installations from the Centre Pompidou collection.", startDate: "Permanent", endDate: "Permanent", collectionFile: "pompidou-cinema-collection.json" },
      { id: "pompidou-painting-collection", name: "Painting Collection", title: "Centre Pompidou Painting Collection", description: "Modern and contemporary paintings from the Centre Pompidou collection, featuring masterworks from Picasso, Matisse, Kandinsky, and more.", startDate: "Permanent", endDate: "Permanent", collectionFile: "pompidou-painting-collection.json" },
      { id: "pompidou-drawing-collection", name: "Drawing Collection", title: "Centre Pompidou Drawing Collection", description: "Works on paper from the Cabinet d'art graphique, featuring drawings, sketches, and graphic works.", startDate: "Permanent", endDate: "Permanent", collectionFile: "pompidou-drawing-collection.json" },
      { id: "pompidou-newmedia-collection", name: "New Media Collection", title: "Centre Pompidou New Media Collection", description: "Digital art, interactive installations, and new media works from the collection.", startDate: "Permanent", endDate: "Permanent", collectionFile: "pompidou-newmedia-collection.json" },
      { id: "pompidou-design-collection", name: "Design Collection", title: "Centre Pompidou Design Collection", description: "Graphic design, posters, typography and industrial design from the Centre Pompidou collection.", startDate: "Permanent", endDate: "Permanent", collectionFile: "pompidou-design-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "musee-de-lorangerie",
    description_ko: "클로드 모네가 직접 전시 공간 구성에 참여한 타원형 전시실에 '수련' 연작 여덟 폭이 파노라마처럼 둘러쳐져 있다. 튈르리 정원 한편에 자리한 이곳은 모네가 프랑스에 헌정한 이 대작을 위해 다시 설계되었다. 지하에는 르누아르·세잔·모딜리아니를 아우르는 발터-기욤 컬렉션이 이어진다.",
    slug: "musee-de-lorangerie",
    name: "Musée de l'Orangerie",
    name_ko: "오랑주리 미술관",
    location: "Jardin des Tuileries, 75001 Paris, France",
    city: "Paris",
    country: "France",
    region: "Paris",
    latitude: 48.8638,
    longitude: 2.3225,
    description: "모네의 '수련' 연작을 위해 설계된, 가장 '갤러리다운' 미학적 공간.",
    representativeImage: "images/musee-de-lorangerie-logo.svg",
    floorPlan: "",
    permanentExhibitions: [
      { id: "orangerie-collection", name: "Orangerie Collection", title: "Musée de l'Orangerie Permanent Collection", description: "Monet's Water Lilies and the Jean Walter and Paul Guillaume collection of Impressionist and Post-Impressionist masterpieces.", startDate: "Permanent", endDate: "Permanent", collectionFile: "orangerie-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "petit-palais",
    name: "Petit Palais",
    name_ko: "프티 팔레",
    city: "Paris",
    country: "France",
    latitude: 48.8660,
    longitude: 2.3140,
    description: "파리 시립 미술관. 중세부터 20세기까지의 방대한 유화 및 판화 컬렉션.",
    representativeImage: "images/petit-palais-logo.png",
    permanentExhibitions: [
      { id: "petit-palais-collection", name: "Permanent Collection", title: "Petit Palais - Musée des Beaux-Arts de la Ville de Paris", description: "고대부터 아르누보까지, 회화·드로잉·판화 컬렉션 400점. 쿠르베, 르누아르, 들라크루아 등 프랑스 미술의 정수.", startDate: "Permanent", endDate: "Permanent" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "musee-picasso-paris",
    name_ko: "피카소 미술관",
    description_ko: "17세기 귀족 저택 오텔 살레에 자리한, 파블로 피카소 단일 작가로는 세계에서 가장 체계적인 컬렉션을 갖춘 미술관이다. 화가의 유족이 상속세를 대신해 국가에 기증한 작품을 토대로, 청색 시대부터 입체주의와 만년에 이르기까지 회화·조각·드로잉·판화를 두루 소장한다.",
    name: "Musée Picasso Paris",
    city: "Paris",
    country: "France",
    latitude: 48.8598,
    longitude: 2.3623,
    description: "피카소의 회화, 드로잉, 판화를 세계에서 가장 체계적으로 소장한 곳.",
    representativeImage: "images/musee-picasso-paris-logo.png",
    permanentExhibitions: [
      { id: "picasso-paris-collection", name: "The Collection", title: "Musée Picasso Paris - The Collection", description: "드로잉 1,492점, 회화 306점, 조각 340점, 판화 1,349점을 포함한 피카소 미술관 전체 컬렉션.", startDate: "Permanent", endDate: "Permanent", collectionFile: "picasso-paris-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "bourse-de-commerce-pinault-collection",
    name_ko: "부르스 드 코메르스 — 피노 컬렉션",
    name: "Bourse de Commerce - Pinault Collection",
    city: "Paris",
    country: "France",
    latitude: 48.8626,
    longitude: 2.3429,
    description: "케링 그룹 회장의 개인 컬렉션. 동시대 평면 예술의 가장 힙한 트렌드.",
    representativeImage: "images/bourse-de-commerce-pinault-collection-logo.svg",
    floorPlan: "",
    permanentExhibitions: [
      { id: "pinault-collection", name: "Pinault Collection", title: "Pinault Collection Artworks", description: "François Pinault's world-renowned contemporary art collection featuring works by leading artists of our time.", startDate: "Permanent", endDate: "Permanent" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "musee-dart-moderne-de-paris",
    name: "Musée d'Art Moderne de Paris",
    name_ko: "파리시립현대미술관",
    city: "Paris",
    country: "France",
    latitude: 48.8647,
    longitude: 2.2972,
    description: "듀피의 '전기의 요정' 등 거대 벽화와 20세기 주요 현대 회화 소장.",
    representativeImage: "images/musee-dart-moderne-de-paris-logo.svg",
    permanentExhibitions: [
      { id: "mam-collection", name: "La Collection", title: "MAM Paris — La Collection", description: "Paintings, photography, and contemporary works from the Musée d'Art Moderne de Paris collection.", startDate: "Permanent", endDate: "Permanent", collectionFile: "mam-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "musee-marmottan-monet",
    name: "Musée Marmottan Monet",
    name_ko: "마르모탕 모네 미술관",
    city: "Paris",
    country: "France",
    latitude: 48.8587,
    longitude: 2.2666,
    description: "모네의 '인상, 일출' 소장처. 인상주의 연구의 핵심적인 갤러리.",
    representativeImage: "images/musee-marmottan-monet-logo.svg",
    permanentExhibitions: [
      { id: "marmottan-collection", name: "Collection", title: "Musée Marmottan Monet Collection", description: "Home to Monet's 'Impression, Sunrise' and masterpieces by Berthe Morisot and other Impressionists.", startDate: "Permanent", endDate: "Permanent" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "musee-jacquemart-andre",
    name_ko: "자크마르 앙드레 미술관",
    name: "Musée Jacquemart-André",
    slug: "jacquemart-andre",
    city: "Paris",
    country: "France",
    latitude: 48.8753,
    longitude: 2.3109,
    description: "개인 저택형 갤러리. 이탈리아 르네상스 및 프랑스 고전 회화의 정수.",
    representativeImage: "images/jacquemart-andre-logo.svg",
    permanentExhibitions: [
      { id: "jacquemart-collection", name: "Must-See Works", title: "Musée Jacquemart-André Must-See Works", description: "Masterpieces by Botticelli, Rembrandt, Fragonard, and other masters in an elegant 19th-century mansion.", startDate: "Permanent", endDate: "Permanent" , collectionFile: "jacquemart-andre-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "jeu-de-paume",
    name: "Jeu de Paume",
    name_ko: "주드폼",
    city: "Paris",
    country: "France",
    latitude: 48.8658,
    longitude: 2.3234,
    description: "프랑스 사진 갤러리의 상징. 현대 사진과 영상 예술의 최고 권위.",
    representativeImage: "images/jeu-de-paume-logo.svg",
    exhibitions: []
  },
  {
    id: "maison-europeenne-de-la-photographie",
    name_ko: "유럽 사진 미술관",
    slug: "maison-europeenne-de-la-photographie",
    name: "Maison Européenne de la Photographie",
    location: "5/7 rue de Fourcy, 75004 Paris, France",
    city: "Paris",
    country: "France",
    region: "Paris",
    latitude: 48.8541,
    longitude: 2.3590,
    description: "현대 사진 예술에 집중된 세계적인 수준의 전문 갤러리.",
    representativeImage: "images/maison-europeenne-de-la-photographie-logo.svg",
    floorPlan: "",
    permanentExhibitions: [
      { id: "mep-photography", name: "The Collection", title: "MEP: The Collection", description: "Photography and video works from legendary artists including Brassaï, Robert Frank, Nan Goldin, Irving Penn, William Klein, Erwin Wurm, and contemporary artists.", startDate: "Permanent", endDate: "Permanent", collectionFile: "mep-photography-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "palais-de-tokyo",
    name: "Palais de Tokyo",
    name_ko: "팔레 드 도쿄",
    city: "Paris",
    country: "France",
    latitude: 48.8640,
    longitude: 2.2970,
    description: "파리의 전위적인 현대 미술 공간. 실험적인 기획전과 설치 예술의 중심지.",
    representativeImage: "images/palais-de-tokyo-logo.svg",
    permanentExhibitions: [],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },

  // France - Regional Museums
  {
    id: "palais-des-beaux-arts-de-lille",
    name_ko: "릴 미술관",
    name: "Palais des Beaux-Arts de Lille",
    city: "Lille",
    country: "France",
    latitude: 50.6305,
    longitude: 3.0614,
    description: "루브르 다음으로 큰 회화 컬렉션을 보유한 프랑스 북부의 자존심.",
    representativeImage: "images/palais-des-beaux-arts-de-lille-logo.svg",
    permanentExhibitions: [
      { id: "lille-pba-collection", name: "Collection", title: "Palais des Beaux-Arts de Lille Collection", description: "16세기부터 20세기까지의 회화, 조각, 도자기, 드로잉을 아우르는 종합 컬렉션.", startDate: "Permanent", endDate: "Permanent", collectionFile: "lille-pba-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "musee-des-beaux-arts-de-rouen",
    name: "Musée des Beaux-Arts de Rouen",
    name_ko: "루앙 미술관",
    city: "Rouen",
    country: "France",
    latitude: 49.4434,
    longitude: 1.0960,
    description: "'인상주의의 수도' 루앙의 핵심 갤러리. 모네의 '루앙 대성당' 시리즈 보유.",
    representativeImage: "images/musee-des-beaux-arts-de-rouen-logo.svg",
    permanentExhibitions: [
      { id: "rouen-mba-collection", name: "Collection", title: "Musée des Beaux-Arts de Rouen Collection", description: "인상주의, 풍경화, 바로크, 초상화 등 르네상스부터 20세기까지의 유럽 미술 컬렉션.", startDate: "Permanent", endDate: "Permanent", collectionFile: "rouen-mba-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "musee-des-beaux-arts-de-lyon",
    name: "Musée des Beaux-Arts de Lyon",
    name_ko: "리옹 미술관",
    city: "Lyon",
    country: "France",
    latitude: 45.7672,
    longitude: 4.8335,
    description: "'작은 루브르'라 불릴 만큼 시대별 회화의 밀도가 높은 갤러리.",
    representativeImage: "images/musee-des-beaux-arts-de-lyon-logo.svg",
    permanentExhibitions: [
      { id: "lyon-collection", name: "Painting & Graphic Design Collection", title: "Musée des Beaux-Arts de Lyon Collection", description: "15세기부터 현대까지의 회화와 그래픽 디자인 컬렉션 538점.", startDate: "Permanent", endDate: "Permanent" , collectionFile: "mba-lyon-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "musee-conde",
    name: "Musée Condé",
    name_ko: "콩데 미술관",
    city: "Chantilly",
    country: "France",
    latitude: 49.1941,
    longitude: 2.4867,
    description: "라파엘로 등 루브르에 견줄만한 올드 마스터들의 유화가 즐비한 곳.",
    representativeImage: "images/musee-conde-logo.svg",
    permanentExhibitions: [
      { id: "conde-paintings", name: "The Collection", title: "Musée Condé - The Collection", description: "프랑스에서 루브르 다음으로 중요한 올드 마스터 회화 및 드로잉 컬렉션. 라파엘로, 푸생, 앵그르 등 걸작 소장.", startDate: "Permanent", endDate: "Permanent", collectionFile: "musee-conde-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "musee-toulouse-lautrec",
    name: "Musée Toulouse-Lautrec",
    name_ko: "툴루즈로트레크 미술관",
    city: "Albi",
    country: "France",
    latitude: 43.9286,
    longitude: 2.1441,
    description: "로트레크의 독창적인 포스터와 유화를 세계에서 가장 많이 보유.",
    representativeImage: "images/musee-toulouse-lautrec-logo.svg",
    permanentExhibitions: [
      { id: "toulouse-lautrec-collection", name: "Collection", title: "Musée Toulouse-Lautrec Collection", description: "앙리 드 툴루즈-로트레크의 회화, 드로잉, 포스터 212점.", startDate: "Permanent", endDate: "Permanent", collectionFile: "toulouse-lautrec-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "musee-de-grenoble",
    name: "Musée de Grenoble",
    name_ko: "그르노블 미술관",
    city: "Grenoble",
    country: "France",
    latitude: 45.1949,
    longitude: 5.7317,
    description: "프랑스 최초로 현대 미술을 수집한 곳으로, 2D 현대 예술의 보고.",
    representativeImage: "images/musee-de-grenoble-logo.svg",
    permanentExhibitions: [
      { id: "grenoble-collection", name: "The Collection", title: "Musée de Grenoble - The Collection", description: "회화 컬렉션", startDate: "Permanent", endDate: "Permanent", collectionFile: "musee-grenoble-collection.json" },
      ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "musee-granet",
    name_ko: "그라네 미술관",
    name: "Musée Granet",
    city: "Aix-en-Provence",
    country: "France",
    latitude: 43.5265,
    longitude: 5.4481,
    description: "세잔의 고향에서 만나는 인상주의 및 피카소, 자코메티의 평면 작품들.",
    representativeImage: "images/musee-granet-logo.svg",
    permanentExhibitions: [
      { id: "granet-collection", name: "Collection", title: "Musée Granet Collection", description: "세잔부터 자코메티까지, 14세기-20세기 회화와 조각 30점.", startDate: "Permanent", endDate: "Permanent" , collectionFile: "musee-granet-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "mamcs-strasbourg",
    name: "Musée d'Art Moderne et Contemporain de Strasbourg",
    name_ko: "스트라스부르 근현대미술관",
    city: "Strasbourg",
    country: "France",
    latitude: 48.5836,
    longitude: 7.7542,
    description: "라인강 유역 현대 예술의 중심. 그래픽 디자인과 회화 전시가 강점.",
    representativeImage: "images/mamcs-strasbourg-logo.svg",
    permanentExhibitions: [
      { id: "mamcs-strasbourg-collection", name: "전체 컬렉션", title: "MAMCS 스트라스부르 전체 컬렉션", description: "드로잉·회화·그래픽 디자인을 포함한 전체 컬렉션 6,097점.", startDate: "Permanent", endDate: "Permanent", collectionFile: "mamcs-strasbourg-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "musee-des-beaux-arts-de-bordeaux",
    name_ko: "보르도 미술관",
    name: "Musée des Beaux-Arts de Bordeaux",
    city: "Bordeaux",
    country: "France",
    latitude: 44.8372,
    longitude: -0.5801,
    description: "15세기부터 현대까지, 남서부 프랑스를 대표하는 고전 회화 갤러리.",
    representativeImage: "images/bordeaux-mba-logo.svg",
    permanentExhibitions: [
      { id: "bordeaux-collection", name: "The Collection", title: "Musée des Beaux-Arts de Bordeaux - The Collection", description: "르네상스부터 현대까지의 회화 2,296점 및 드로잉 3,302점 전체 컬렉션.", startDate: "Permanent", endDate: "Permanent", collectionFile: "bordeaux-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "musee-rodin",
    name: "Musée Rodin",
    name_ko: "로댕 미술관",
    city: "Paris",
    country: "France",
    latitude: 48.8554,
    longitude: 2.3160,
    description: "오귀스트 로댕의 조각과 드로잉을 소장한 세계적인 조각 박물관. 생각하는 사람, 키스 등 명작 소장.",
    representativeImage: "images/musee-rodin-logo.svg",
    permanentExhibitions: [
      { id: "rodin-collection", name: "The Collection", title: "Musée Rodin - The Collection", description: "회화 224점, 조각, 판화 1,188점을 포함한 로댕 미술관 전체 컬렉션.", startDate: "Permanent", endDate: "Permanent", collectionFile: "rodin-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "fondation-louis-vuitton",
    name: "Fondation Louis Vuitton",
    name_ko: "루이비통 파운데이션",
    city: "Paris",
    country: "France",
    latitude: 48.8766,
    longitude: 2.2644,
    description: "프랑크 게리가 설계한 현대건축의 걸작. 현대미술 컬렉션과 기획전시의 명소.",
    representativeImage: "images/fondation-louis-vuitton-logo.svg",
    permanentExhibitions: [
      { id: "flv-collection", name: "Collection", title: "Fondation Louis Vuitton Collection", description: "현대미술 컬렉션 213점.", startDate: "Permanent", endDate: "Permanent", collectionFile: "flv-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  // MAD Paris (Musée des Arts Décoratifs)
  {
    id: "mad-paris",
    slug: "mad-paris",
    name: "Musée des Arts Décoratifs",
    name_ko: "파리 장식미술관",
    city: "Paris",
    country: "France",
    location: "107 Rue de Rivoli, 75001 Paris, France",
    latitude: 48.8627,
    longitude: 2.3330,
    description: "세계 최대의 장식예술 컬렉션을 소장한 파리의 명소. 15세기부터 현대까지의 가구, 도자기, 보석, 패션, 그래픽 디자인 등 다양한 분야의 작품을 전시.",
    representativeImage: "images/mad-paris-logo.svg",
    permanentExhibitions: [
      { id: "mad-collection", name: "Les collections", title: "Arts décoratifs et design", description: "15세기부터 21세기까지의 장식예술과 디자인 컬렉션 10,863점.", startDate: "Permanent", endDate: "Permanent", collectionFile: "mad-paris-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  // Musée Carnavalet - Histoire de Paris
  {
    id: "carnavalet",
    slug: "carnavalet",
    name: "Musée Carnavalet - Histoire de Paris",
    name_ko: "카르나발레 박물관",
    city: "Paris",
    country: "France",
    location: "16 Rue des Francs Bourgeois, 75003 Paris, France",
    latitude: 48.8576,
    longitude: 2.3622,
    description: "파리의 역사를 담은 미술관. 고대부터 현대까지 파리의 변천사를 조각, 회화, 사진, 가구 등 60만 점 이상의 소장품으로 전시.",
    representativeImage: "images/carnavalet-logo.svg",
    permanentExhibitions: [
      { id: "carnavalet-the-collection", name: "The Collection", title: "Carnavalet - La Collection", description: "파리 역사를 담은 회화 및 판화 컬렉션 1,747점. 필수 작품 55점 포함.", startDate: "Permanent", endDate: "Permanent", collectionFile: "carnavalet-the-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  // Musée de l'Armée - Invalides
  {
    id: "musee-armee",
    name_ko: "앵발리드 군사 박물관",
    slug: "musee-armee",
    name: "Musée de l'Armée - Invalides",
    city: "Paris",
    country: "France",
    location: "129 Rue de Grenelle, 75007 Paris, France",
    latitude: 48.8551,
    longitude: 2.3120,
    description: "프랑스 군사 역사 박물관. 앵발리드(Hôtel des Invalides) 내에 위치하며, 고대부터 현대까지의 무기, 갑옷, 회화, 사진, 드로잉 등 50만 점 이상의 소장품을 보유.",
    representativeImage: "images/musee-armee-logo.svg",
    permanentExhibitions: [
      { id: "musee-armee-collection", name: "The Collection", title: "Musée de l'Armée Collection", description: "회화, 사진, 드로잉 등 1,476점의 군사 역사 소장품.", startDate: "Permanent", endDate: "Permanent", collectionFile: "musee-armee-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  // Château de Versailles
  {
    id: "chateau-de-versailles",
    name: "Château de Versailles",
    name_ko: "베르사유궁",
    city: "Versailles",
    country: "France",
    latitude: 48.8049,
    longitude: 2.1204,
    description: "프랑스 절대왕정의 상징인 베르사유 궁전. 17세기 루이 14세가 건설한 화려한 궁전으로, 바로크와 고전주의 양식의 회화, 조각, 장식 예술품을 소장.",
    representativeImage: "images/versailles-logo.svg",
    permanentExhibitions: [
      { id: "versailles-collection", name: "Paintings & Drawings", title: "베르사유 회화 및 드로잉 컬렉션", description: "루이 14세부터 나폴레옹 시대까지의 왕실 회화 및 드로잉 컬렉션.", startDate: "Permanent", endDate: "Permanent", collectionFile: "versailles-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  // Musée Guimet (Musée national des arts asiatiques)
  {
    id: "musee-guimet",
    description_ko: "아시아 미술을 전문으로 하는 프랑스 국립박물관으로, 유럽에서 손꼽히는 동양 미술 컬렉션을 갖추었다. 중국·일본·한국·인도·동남아시아의 고대부터 근대까지 미술품 6만여 점을 소장한다. 간다라 불상과 크메르 조각 등 불교미술 컬렉션이 특히 뛰어나다.",
    name: "Musée Guimet",
    name_ko: "국립 기메 동양 박물관",
    city: "Paris",
    country: "France",
    latitude: 48.8649,
    longitude: 2.2933,
    description: "아시아 예술 전문 국립 박물관. 중국, 일본, 한국, 인도, 동남아시아 등 아시아 전역의 고대부터 현대까지 예술품 6만여 점을 소장.",
    representativeImage: "images/musee-guimet-logo.svg",
    permanentExhibitions: [
      { id: "guimet-collection", name: "Asian Art Collection", title: "귀메 아시아 예술 컬렉션", description: "중국, 일본, 한국, 인도 등 아시아 전역의 회화 및 드로잉 컬렉션.", startDate: "Permanent", endDate: "Permanent", collectionFile: "musee-guimet-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  // Médiathèque du Patrimoine et de la Photographie (MPP)
  {
    id: "macval",
    name_ko: "문화유산·사진 미디어테크",
    name: "Médiathèque du Patrimoine et de la Photographie",
    city: "Charenton-le-Pont",
    country: "France",
    latitude: 48.8211,
    longitude: 2.4133,
    description: "프랑스 문화부 산하 문화유산 및 사진 미디어테크. 프랑스 국가 사진 아카이브와 문화유산 자료를 보관하는 기관.",
    representativeImage: "images/macval-logo.svg",
    permanentExhibitions: [
      { id: "macval-collection", name: "Photography Collection", title: "MPP 사진 컬렉션", description: "프랑스 국가 사진 아카이브 컬렉션.", startDate: "Permanent", endDate: "Permanent", collectionFile: "macval-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  // Mucem - Musée des civilisations de l'Europe et de la Méditerranée
  {
    id: "mucem",
    name: "Mucem",
    name_ko: "유럽지중해문명박물관",
    city: "Marseille",
    country: "France",
    latitude: 43.2965,
    longitude: 5.3610,
    description: "유럽과 지중해 문명 박물관. 마르세유의 랜드마크로, 지중해 문화권의 역사와 문명을 전시하는 국립 박물관.",
    representativeImage: "images/mucem-logo.svg",
    permanentExhibitions: [
      { id: "mucem-collection", name: "The Collection", title: "Mucem - The Collection", description: "회화, 판화, 드로잉을 포함한 전체 컬렉션 3,943점.", startDate: "Permanent", endDate: "Permanent", collectionFile: "mucem-collection.json" },    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  // Musée Fabre - Montpellier
  {
    id: "musee-fabre",
    name: "Musée Fabre",
    name_ko: "파브르 미술관",
    city: "Montpellier",
    country: "France",
    latitude: 43.6114,
    longitude: 3.8801,
    description: "몽펠리에 파브르 미술관. 17세기부터 현대까지의 유럽 회화와 조각 컬렉션을 소장한 프랑스 주요 미술관.",
    representativeImage: "images/musee-fabre-logo.svg",
    permanentExhibitions: [],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  // Musée national Marc Chagall - Nice
  {
    id: "musee-chagall",
    name_ko: "마르크 샤갈 국립미술관",
    name: "Musée national Marc Chagall",
    city: "Nice",
    country: "France",
    latitude: 43.7102,
    longitude: 7.2620,
    description: "니스의 마르크 샤갈 국립미술관. 샤갈의 성경 연작을 중심으로 한 세계 최대 샤갈 컬렉션을 소장.",
    representativeImage: "images/musee-chagall-logo.svg",
    permanentExhibitions: [
      { id: "chagall-collection", name: "Collection", title: "Musée Chagall 컬렉션", description: "마르크 샤갈의 회화, 드로잉, 판화 컬렉션 3,302점.", startDate: "Permanent", endDate: "Permanent", collectionFile: "musee-chagall-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  // La Piscine - Roubaix
  {
    id: "la-piscine",
    name_ko: "라 피신 미술관",
    name: "La Piscine - Musée d'Art et d'Industrie André Diligent",
    city: "Roubaix",
    country: "France",
    latitude: 50.6920,
    longitude: 3.1722,
    description: "루베의 옛 수영장을 개조한 독특한 미술관. 19-20세기 프랑스 회화, 조각, 장식미술 컬렉션.",
    representativeImage: "images/la-piscine-logo.svg",
    permanentExhibitions: [
      { id: "piscine-collection", name: "Collection", title: "La Piscine 회화 컬렉션", description: "19-20세기 프랑스 회화 컬렉션.", startDate: "Permanent", endDate: "Permanent", collectionFile: "la-piscine-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  // The Wallace Collection - London
  {
    id: "wallace-collection",
    name_ko: "월리스 컬렉션",
    description_ko: "런던 하트퍼드 하우스에 자리한, 세계에서 손꼽히는 미술·장식미술 컬렉션이다. 한 가문이 대를 이어 모은 수집품을 그대로 공개하며, 프라고나르의 '그네'를 비롯해 티치아노, 벨라스케스, 렘브란트, 할스의 회화와 18세기 프랑스 가구를 소장한다.",
    name: "The Wallace Collection",
    city: "London",
    country: "United Kingdom",
    latitude: 51.5173,
    longitude: -0.1528,
    description: "One of the finest collections of fine and decorative arts in the world, displayed at Hertford House. Highlights include paintings by Titian, Velázquez, Rubens, Hals, and Fragonard.",
    representativeImage: "images/wallace-collection-logo.svg",
    permanentExhibitions: [
      { id: "wallace-permanent", name: "Permanent Collection", title: "Wallace Collection Permanent Display", description: "Paintings, sculpture, arms and armour, and decorative arts displayed in period room settings.", startDate: "Permanent", endDate: "Permanent", collectionFile: "wallace-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  // Sir John Soane's Museum - London
  {
    id: "soane-museum",
    name_ko: "존 손 경 박물관",
    description_ko: "건축가 존 손이 살던 집을 1837년 그가 남긴 모습 그대로 보존한, 세계에서 가장 독특한 집 박물관 가운데 하나다. 런던 도심에 자리하며, 거울과 채광으로 가득 찬 미로 같은 공간에 호가스, 터너, 카날레토의 회화와 고대 유물이 빼곡히 들어차 있다.",
    name: "Sir John Soane's Museum",
    city: "London",
    country: "United Kingdom",
    latitude: 51.5175,
    longitude: -0.1177,
    description: "One of the world's most extraordinary house museums, preserved exactly as architect Sir John Soane left it in 1837, featuring paintings by Hogarth, Turner, and Canaletto.",
    representativeImage: "images/soane-museum-logo.svg",
    permanentExhibitions: [
      { id: "soane-paintings", name: "Paintings Collection", title: "Paintings and Framed Works", description: "Over 400 paintings, watercolours and prints including Hogarth's A Rake's Progress and The Election series.", startDate: "Permanent", endDate: "Permanent", collectionFile: "soane-paintings.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  // Vatican Museums - Vatican City
  {
    id: "vatican-museums",
    description_ko: "역대 교황들이 수 세기에 걸쳐 모아 온 인류 최고 수준의 미술 컬렉션이다. 미켈란젤로가 천장화와 제단 벽화를 그린 시스티나 예배당, 라파엘로가 장식한 '서명의 방'이 정점을 이룬다. 고대 그리스·로마 조각부터 르네상스 회화까지, 관람 동선만 7킬로미터에 이른다.",
    name: "Vatican Museums",
    name_ko: "바티칸 미술관",
    city: "Vatican City",
    country: "Italy",
    latitude: 41.9065,
    longitude: 12.4536,
    description: "One of the world's greatest art collections, including the Sistine Chapel, Raphael Rooms, and masterpieces of classical antiquity.",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Musei_vaticani%2C_braccio_nuovo%2C_01.JPG/1280px-Musei_vaticani%2C_braccio_nuovo%2C_01.JPG",
    permanentExhibitions: [
      { id: "vatican-collection", name: "Permanent Collection", title: "Vatican Museums Collection", description: "Masterpieces from the Vatican's extensive art collection including classical sculpture, Renaissance paintings, and more.", startDate: "Permanent", endDate: "Permanent", collectionFile: "vatican-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  // National Museum Wales - Cardiff
  {
    id: "museum-wales",
    description_ko: "웨일스의 국립박물관으로, 카디프에 자리한다. 모네와 르누아르 등 인상주의 회화 컬렉션과 웨일스 미술, 그리고 이 지역의 산업과 자연사를 아우르는 폭넓은 소장품을 갖추었다.",
    name: "National Museum Wales",
    name_ko: "카디프 국립박물관",
    city: "Cardiff",
    country: "United Kingdom",
    region: "Wales",
    latitude: 51.4816,
    longitude: -3.1791,
    description: "The national museum of Wales featuring world-class art collections including Impressionist works, Welsh art, and extensive industrial heritage collections.",
    representativeImage: "images/museum-wales-logo.svg",
    permanentExhibitions: [
      { id: "museum-wales-paintings", name: "The collection", title: "National Museum Wales – Paintings, Drawings & Watercolours", description: "Selected paintings, drawings, and watercolours from the National Museum Wales art collection, covering Welsh and international artists.", startDate: "Permanent", endDate: "Permanent", collectionFile: "museum-wales-paintings.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  // Uffizi Galleries - Florence
  {
    id: "uffizi",
    name_ko: "우피치 미술관",
    description_ko: "피렌체를 다스린 메디치 가문의 컬렉션을 토대로 한 르네상스 회화의 보고다. 보티첼리의 '비너스의 탄생'과 '봄', 레오나르도·미켈란젤로·라파엘로·카라바조의 걸작이 시대순으로 펼쳐진다. 본래 행정 관청으로 지어진 건물 자체가 16세기 건축의 명작이다.",
    name: "Uffizi Galleries",
    city: "Florence",
    country: "Italy",
    latitude: 43.7687,
    longitude: 11.2551,
    description: "One of the most famous art museums in the world, home to masterpieces by Botticelli, Michelangelo, Leonardo, Raphael, Caravaggio and more.",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Galleria_degli_Uffizi_court.jpg/1280px-Galleria_degli_Uffizi_court.jpg",
    permanentExhibitions: [
      { id: "uffizi-gallery-collection", name: "Uffizi Collection", title: "Uffizi Gallery Collection", description: "508 masterpieces including works by Botticelli, Michelangelo, Raphael, Leonardo, and Caravaggio.", startDate: "Permanent", endDate: "Permanent", collectionFile: "uffizi-gallery-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  // Pitti Palace - Florence
  {
    id: "pitti-palace",
    description_ko: "피렌체 아르노강 남쪽에 자리한 르네상스 궁전으로, 메디치 가문의 거처였다. 라파엘로와 티치아노의 회화가 빼곡한 팔라티나 미술관을 비롯해 여러 전시관을 품고 있으며, 뒤편으로 보볼리 정원이 펼쳐진다.",
    name: "Pitti Palace",
    name_ko: "피티궁",
    city: "Florence",
    country: "Italy",
    latitude: 43.7651,
    longitude: 11.2500,
    description: "Renaissance palace housing multiple museums including the Palatine Gallery with works by Raphael, Titian, Rubens, and the Gallery of Modern Art.",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b9/Palazzo_Pitti_Facade.jpg/1280px-Palazzo_Pitti_Facade.jpg",
    permanentExhibitions: [
      { id: "pitti-palace-collection", name: "Pitti Collection", title: "Pitti Palace Collection", description: "428 artworks from the Palatine Gallery, Gallery of Modern Art, and Royal Apartments including works by Raphael, Titian, and Rubens.", startDate: "Permanent", endDate: "Permanent", collectionFile: "pitti-palace-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  // Galleria dell'Accademia - Florence
  {
    id: "accademia-firenze",
    description_ko: "미켈란젤로의 '다비드' 원작을 소장한 곳으로 세계적으로 유명한 피렌체의 미술관이다. '다비드'를 비롯한 미켈란젤로의 미완성 조각 '노예' 연작과 더불어 피렌체 황금기의 회화, 옛 악기 컬렉션을 함께 선보인다.",
    name: "Galleria dell'Accademia",
    name_ko: "아카데미아 미술관",
    city: "Florence",
    country: "Italy",
    latitude: 43.7769,
    longitude: 11.2588,
    description: "Home to Michelangelo's David and an important collection of paintings, sculptures, and historical musical instruments.",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/63/%27David%27_by_Michelangelo_Fir_JBU002.jpg/800px-%27David%27_by_Michelangelo_Fir_JBU002.jpg",
    permanentExhibitions: [
      { id: "accademia-collection", name: "Florence Collection", title: "Galleria dell'Accademia di Firenze", description: "Michelangelo's David, paintings, sculptures, and the Museum of Musical Instruments.", startDate: "Permanent", endDate: "Permanent", collectionFile: "accademia-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  // Galleria Borghese - Rome
  {
    id: "galleria-borghese",
    description_ko: "로마의 빌라 보르게세 정원 안에 자리한, 로마에서 손꼽히는 미술 컬렉션이다. 베르니니의 역동적인 조각과 카라바조의 회화를 비롯해 라파엘로, 티치아노의 걸작을 소장하며, 추기경 시피오네 보르게세의 수집에서 비롯했다.",
    name: "Galleria Borghese",
    name_ko: "보르게세 미술관",
    city: "Rome",
    country: "Italy",
    latitude: 41.9145,
    longitude: 12.4921,
    description: "One of Rome's finest art collections housed in the magnificent Villa Borghese. Features masterpieces by Bernini, Caravaggio, Raphael, and Titian.",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Galleria_Borghese_facade.jpg/1280px-Galleria_Borghese_facade.jpg",
    permanentExhibitions: [
      { id: "borghese-paintings", name: "Paintings Collection", title: "Galleria Borghese Paintings", description: "562 paintings including masterpieces by Caravaggio, Raphael, Titian, and more.", startDate: "Permanent", endDate: "Permanent", collectionFile: "galleria-borghese-collection.json" },
      { id: "borghese-arte-antica", name: "Ancient Art Collection", title: "Galleria Borghese Arte Antica", description: "291 ancient Roman sculptures, mosaics, and reliefs.", startDate: "Permanent", endDate: "Permanent", collectionFile: "borghese-arte-antica-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  // Gallerie dell'Accademia di Venezia - Venice
  {
    id: "accademia-venice",
    description_ko: "세계에서 가장 풍부한 베네치아 회화 컬렉션을 갖춘 미술관이다. 14세기부터 18세기까지 벨리니, 조르조네, 티치아노, 틴토레토, 베로네세 등 베네치아 화파의 걸작이 서른일곱 개의 전시실에 펼쳐진다.",
    name: "Gallerie dell'Accademia di Venezia",
    name_ko: "아카데미아 미술관",
    city: "Venice",
    country: "Italy",
    latitude: 45.4314,
    longitude: 12.3282,
    description: "The largest collection of Venetian paintings in the world, housed in the Santa Maria della Carità complex with 37 halls of masterpieces from the 14th to 18th century.",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/85/Accademia_%28Venice%29.jpg/1280px-Accademia_%28Venice%29.jpg",
    permanentExhibitions: [
      { id: "gallerie-accademia-venice-collection", name: "Venice Collection", title: "Gallerie dell'Accademia di Venezia", description: "Masterpieces by Giorgione, Bellini, Titian, Veronese, Tintoretto, Carpaccio, and drawings by Leonardo da Vinci.", startDate: "Permanent", endDate: "Permanent", collectionFile: "gallerie-accademia-venice-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  // Peggy Guggenheim Collection - Venice
  {
    id: "guggenheim-venice",
    description_ko: "미술 수집가 페기 구겐하임이 베네치아 대운하변 저택에 살며 모은 20세기 전반의 미술을 그대로 공개한 곳이다. 피카소, 폴록, 에른스트, 마그리트 등 입체주의·초현실주의·추상미술의 명작을 소장한다. 이탈리아에서 손꼽히는 근대미술 컬렉션으로 평가받는다.",
    name: "Peggy Guggenheim Collection",
    name_ko: "페기 구겐하임 컬렉션",
    city: "Venice",
    country: "Italy",
    latitude: 45.4311,
    longitude: 12.3316,
    description: "One of the most important museums in Italy for European and American art of the first half of the 20th century, housed in the Palazzo Venier dei Leoni on the Grand Canal.",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d0/Peggy_Guggenheim_Collection%2C_Venice.jpg/1280px-Peggy_Guggenheim_Collection%2C_Venice.jpg",
    permanentExhibitions: [
      { id: "guggenheim-venice-collection", name: "Peggy Guggenheim Collection", title: "Modern Art Collection", description: "613 works of modern art including pieces by Picasso, Pollock, Dalí, Ernst, and Magritte.", startDate: "Permanent", endDate: "Permanent", collectionFile: "guggenheim-venice-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  // Pinacoteca di Brera - Milan
  {
    id: "pinacoteca-brera",
    description_ko: "밀라노 브레라 궁전에 자리한 이탈리아의 대표 회화관이다. 라파엘로의 '동정녀의 결혼', 만테냐의 '죽은 그리스도', 피에로 델라 프란체스카의 제단화 등 이탈리아 르네상스 회화의 걸작을 소장한다.",
    name: "Pinacoteca di Brera",
    name_ko: "피나코테카 디 브레라",
    city: "Milan",
    country: "Italy",
    latitude: 45.4719,
    longitude: 9.1876,
    description: "One of Italy's most important art galleries, housing an exceptional collection of Italian Renaissance paintings including works by Raphael, Mantegna, Bellini, and Caravaggio.",
    representativeImage: "https://pinacotecabrera.org/wp-content/uploads/2024/11/Adler-Autoritratto.jpg",
    permanentExhibitions: [
      { id: "brera-collection", name: "Brera Collection", title: "Pinacoteca di Brera Collection", description: "619 masterpieces of Italian art from the 14th to 20th century, including works by Raphael, Mantegna, Caravaggio, and Bellini.", startDate: "Permanent", endDate: "Permanent", collectionFile: "pinacoteca-brera-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  // Galleria Doria Pamphilj - Rome
  {
    id: "doria-pamphilj",
    description_ko: "로마 도심의 도리아 팜필리 궁전에 자리한, 로마 최대의 개인 컬렉션 가운데 하나다. 카라바조, 벨라스케스, 라파엘로, 티치아노의 걸작을 소장하며, 특히 벨라스케스가 그린 '교황 인노첸시오 10세의 초상'으로 유명하다.",
    name: "Galleria Doria Pamphilj",
    name_ko: "도리아 팜필리 미술관",
    city: "Rome",
    country: "Italy",
    latitude: 41.8979,
    longitude: 12.4823,
    description: "One of the largest private collections in Rome, housed in Palazzo Doria Pamphilj with masterpieces by Caravaggio, Velázquez, Raphael, Titian, and Bernini.",
    representativeImage: "https://www.doriapamphilj.it/wp-content/uploads/2019/01/palazzo-doria-pamphilj-velazquez-ritratto-innocenzo-x-big.jpg",
    permanentExhibitions: [
      { id: "doria-pamphilj-collection", name: "Masterpieces Collection", title: "Galleria Doria Pamphilj Masterpieces", description: "The finest works from the Doria Pamphilj private collection including Velázquez's Portrait of Pope Innocent X and Caravaggio's masterpieces.", startDate: "Permanent", endDate: "Permanent", collectionFile: "doria-pamphilj-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  // Museo Egizio - Turin
  {
    id: "museo-egizio",
    description_ko: "토리노에 자리한, 세계에서 가장 오래된 고대 이집트 전문 박물관이다. 카이로에 이어 세계에서 두 번째로 큰 이집트 유물 컬렉션을 갖추었으며, 파라오 조각과 파피루스, 미라 등 방대한 유물을 소장한다.",
    name: "Museo Egizio",
    name_ko: "이지오 박물관",
    city: "Turin",
    country: "Italy",
    latitude: 45.0687,
    longitude: 7.6842,
    description: "The oldest museum in the world dedicated to Egyptian civilization and the second largest Egyptian collection after Cairo. Features the world's most important collection of Egyptian antiquities outside Egypt.",
    representativeImage: "https://collezioni.museoegizio.it/public/objects/images/001R6V_C08CFA3B11D84B1970CCE7E0FCEA52AE_big.jpg",
    permanentExhibitions: [
      { id: "museo-egizio-collection", name: "Egyptian Collection", title: "Museo Egizio Collection", description: "Over 40,000 artifacts spanning 4,000 years of Egyptian history including statues, papyri, mummies, and sarcophagi.", startDate: "Permanent", endDate: "Permanent", collectionFile: "museo-egizio-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "musei-capitolini",
    description_ko: "1471년 카피톨리노 언덕에 세워진 세계에서 가장 오래된 공공 박물관이다. 미켈란젤로가 설계한 광장에 자리하며 고대 로마 조각과 르네상스 미술을 소장하고, 로마의 상징인 '카피톨리노의 암늑대' 청동상으로 유명하다.",
    name: "Musei Capitolini",
    name_ko: "카피톨리노 박물관",
    city: "Rome",
    country: "Italy",
    latitude: 41.8931,
    longitude: 12.4828,
    description: "The world's oldest public museum, founded in 1471 on Capitoline Hill. Houses an extraordinary collection of ancient Roman sculptures, Renaissance art, and archaeological treasures including Bernini's Medusa and the iconic Capitoline Wolf.",
    representativeImage: "https://www.museicapitolini.org/sites/default/files/storage/images/musei/musei_capitolini/percorsi/percorsi_per_sale/appartamento_dei_conservatori/sala_delle_oche/busto_di_medusa/11527-12-ita-IT/busto_di_medusa.jpg",
    permanentExhibitions: [
      { id: "musei-capitolini-collection", name: "Capitoline Collection", title: "Musei Capitolini Collection", description: "Ancient Roman sculptures, Renaissance masterpieces, and archaeological treasures spanning over 2,500 years of history.", startDate: "Permanent", endDate: "Permanent", collectionFile: "musei-capitolini-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "museo-novecento",
    name_ko: "피렌체 노베첸토 미술관",
    description_ko: "20세기 이탈리아 미술에 집중하는 피렌체의 미술관이다. 산타 마리아 노벨라 광장의 옛 수도원 건물에 자리하며, 이탈리아 근현대 작가들의 회화와 조각을 폭넓게 선보인다.",
    name: "Museo Novecento",
    city: "Florence",
    country: "Italy",
    latitude: 43.7696,
    longitude: 11.2494,
    description: "Museum dedicated to Italian art of the 20th century, housed in the former Leopoldine complex of Santa Maria Novella. Features works by major Italian modern artists.",
    representativeImage: "https://www.museonovecento.it/wp-content/uploads/2022/01/Schermata-2022-01-25-alle-16.57.01.png",
    permanentExhibitions: [
      { id: "novecento-della-ragione-collection", name: "Alberto Della Ragione Collection", title: "Della Ragione Collection", description: "Collection of 20th century Italian art donated by Alberto Della Ragione.", startDate: "Permanent", endDate: "Permanent", collectionFile: "novecento-della-ragione-collection.json" },
      { id: "novecento-rosai-collection", name: "Ottone Rosai Collection", title: "Rosai Collection", description: "Works by Florentine artist Ottone Rosai (1895-1957).", startDate: "Permanent", endDate: "Permanent", collectionFile: "novecento-rosai-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "pinacoteca-ambrosiana",
    description_ko: "밀라노에 자리한 이탈리아의 주요 회화관으로, 17세기 추기경 페데리코 보로메오가 세운 암브로시아나 도서관에서 비롯했다. 레오나르도 다 빈치의 '코덱스 아틀란티쿠스'와 카라바조의 '과일 바구니', 라파엘로의 대형 밑그림을 소장한다.",
    name: "Pinacoteca Ambrosiana",
    name_ko: "암브로시아나 회화관",
    city: "Milan",
    country: "Italy",
    latitude: 45.4632,
    longitude: 9.1867,
    description: "One of Italy's most important art galleries, housing masterpieces from Leonardo da Vinci's Codex Atlanticus to Caravaggio's Basket of Fruit, along with works by Raphael, Titian, and Botticelli.",
    representativeImage: "https://museum.comwork.eu/api/v1/files/743276?t=6bf1436f-fb73-496f-8790-bbe8fcbcdfd3",
    permanentExhibitions: [
      { id: "ambrosiana-collection", name: "Pinacoteca Ambrosiana Collection", title: "Ambrosiana Collection", description: "Renaissance masterpieces including works by Leonardo, Caravaggio, Raphael, and Botticelli.", startDate: "Permanent", endDate: "Permanent", collectionFile: "ambrosiana-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  // Museo del Novecento Milan
  {
    id: "museo-del-novecento-milan",
    description_ko: "20세기 이탈리아 미술에 헌정된 밀라노의 미술관으로, 두오모 광장에 면한 건물에 자리한다. 보초니로 대표되는 미래주의부터 모딜리아니, 데 키리코, 폰타나까지 이탈리아 근현대미술의 흐름을 보여 준다.",
    name: "Museo del Novecento",
    name_ko: "노베첸토 박물관",
    city: "Milan",
    country: "Italy",
    latitude: 45.4636,
    longitude: 9.1891,
    description: "Museum dedicated to 20th-century Italian art, housing masterpieces by Boccioni, Modigliani, De Chirico, Fontana, and other modern masters.",
    representativeImage: "https://lh3.googleusercontent.com/ci/AL18g_RpDQ9yqLqD0G0Z0K8k7Q8X0Q8X0Q8X0Q8X0Q",
    permanentExhibitions: [
      { id: "museo-novecento-milan-collection", name: "Museo del Novecento Collection", title: "20th Century Italian Art", description: "Masterpieces of Italian modernism including works by Boccioni, Modigliani, and Fontana.", startDate: "Permanent", endDate: "Permanent", collectionFile: "museo-del-novecento-milan-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  // Castello di Rivoli - Turin
  {
    id: "castello-di-rivoli",
    name_ko: "리볼리 성 현대미술관",
    description_ko: "토리노 인근 사보이아 왕가의 바로크 성을 개조한, 이탈리아 최초의 현대미술 전문 미술관이다. 1960년대 이탈리아에서 일어난 '아르테 포베라' 거장들의 작업과 국제 현대미술, 장소 특정적 설치 작품을 폭넓게 선보인다.",
    name: "Castello di Rivoli",
    city: "Turin",
    country: "Italy",
    latitude: 45.0714,
    longitude: 7.5150,
    description: "Italy's first museum dedicated to contemporary art, housed in a Baroque castle designed by Juvarra. Features works by Arte Povera masters, international contemporary artists, and site-specific installations.",
    representativeImage: "https://www.castellodirivoli.org/wp-content/uploads/2017/02/Senza-nome-1.jpg",
    permanentExhibitions: [
      { id: "castello-di-rivoli-collection", name: "Contemporary Art Collection", title: "Castello di Rivoli Collection", description: "900+ contemporary artworks including video art, installations, paintings, and sculptures by international artists.", startDate: "Permanent", endDate: "Permanent", collectionFile: "castello-di-rivoli-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  // Museo Archeologico Nazionale di Napoli (MANN)
  {
    id: "museo-archeologico-napoli",
    description_ko: "폼페이와 헤르쿨라네움에서 나온 유물을 집대성한, 세계에서 가장 중요한 고고학 박물관 가운데 하나다. 나폴리에 자리하며, 파르네세 가문의 고대 조각과 폼페이의 벽화·모자이크, 이집트 유물을 소장한다.",
    name: "Museo Archeologico Nazionale di Napoli",
    name_ko: "나폴리 국립 고고학 박물관",
    city: "Naples",
    country: "Italy",
    latitude: 40.8536,
    longitude: 14.2505,
    description: "One of the world's most important archaeological museums, housing treasures from Pompeii, Herculaneum, the Farnese collection, and Egyptian antiquities.",
    representativeImage: "https://www.museoarcheologiconapoli.it/mann/uploads/2025/06/anteprimacollezioneegizia.jpg",
    permanentExhibitions: [
      { id: "napoli-collection", name: "Archaeological Collection", title: "MANN Collection", description: "690 artifacts from Egyptian, Farnese, Mosaic, Fresco, and other collections spanning ancient civilizations.", startDate: "Permanent", endDate: "Permanent", collectionFile: "museo-archeologico-napoli-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  // === GERMANY ===
  // Humboldt Forum - Berlin
  {
    id: "humboldt-forum",
    description_ko: "복원된 베를린 궁전 건물에 들어선 독일 최대의 문화 복합 공간이다. 민족학 박물관과 아시아미술관의 소장품을 중심으로 세계 각지에서 모은 2만여 점의 유물을 선보이며, 박물관 섬과 마주한다.",
    name: "Humboldt Forum",
    name_ko: "훔볼트 포룸",
    city: "Berlin",
    country: "Germany",
    latitude: 52.5185,
    longitude: 13.4018,
    description: "Germany's largest cultural project, housed in the reconstructed Berlin Palace. Features the Ethnological Museum and Museum of Asian Art collections with over 20,000 objects from around the world.",
    representativeImage: "https://recherche.smb.museum/images/5699144_1400x1400.jpg",
    permanentExhibitions: [
      { id: "smb-humboldt-forum-collection", name: "World Cultures Collection", title: "Humboldt Forum Collection", description: "Ethnological and Asian art collections from the Staatliche Museen zu Berlin.", startDate: "Permanent", endDate: "Permanent", collectionFile: "smb-humboldt-forum-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  // Altes Museum - Berlin
  {
    id: "altes-museum",
    description_ko: "베를린 박물관 섬에 자리한 고대 미술 전문 박물관으로, 신고전주의 건축의 걸작으로 꼽힌다. 그리스·에트루리아·로마의 조각과 공예, 고대 유물을 소장하며, 웅장한 원형 홀이 인상적이다.",
    name: "Altes Museum",
    name_ko: "베를린 구 박물관",
    city: "Berlin",
    country: "Germany",
    latitude: 52.5194,
    longitude: 13.3988,
    description: "One of the world's most important museums of Classical antiquity, featuring Greek, Etruscan, and Roman art and artifacts from the Antikensammlung collection.",
    representativeImage: "https://recherche.smb.museum/images/2991205_1400x1400.jpg",
    permanentExhibitions: [
      { id: "smb-altes-museum-collection", name: "Classical Antiquity Collection", title: "Altes Museum Collection", description: "Greek, Roman, and Etruscan masterpieces including sculptures, vases, jewelry, and architectural elements.", startDate: "Permanent", endDate: "Permanent", collectionFile: "smb-altes-museum-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  // Neues Museum - Berlin
  {
    id: "neues-museum",
    description_ko: "베를린 박물관 섬에 자리한 박물관으로, 고대 이집트 컬렉션과 선사·고대 유물로 이름 높다. 무엇보다 3,300여 년 전에 만들어진 '네페르티티 왕비 흉상'이 이곳의 상징이다. 제2차 세계대전으로 파괴된 건물을 데이비드 치퍼필드가 옛 흔적을 살려 복원한 것으로도 유명하다.",
    name: "Neues Museum",
    name_ko: "베를린 신 박물관",
    city: "Berlin",
    country: "Germany",
    latitude: 52.5200,
    longitude: 13.3978,
    description: "Home to the Egyptian Museum with the famous bust of Nefertiti, the Museum of Prehistory and Early History, and part of the Collection of Classical Antiquities.",
    representativeImage: "https://recherche.smb.museum/images/6000074_1400x1400.jpg",
    permanentExhibitions: [
      { id: "smb-neues-museum-collection", name: "Egyptian & Prehistoric Collection", title: "Neues Museum Collection", description: "Ancient Egyptian artifacts including the bust of Nefertiti, plus prehistoric and early history objects.", startDate: "Permanent", endDate: "Permanent", collectionFile: "smb-neues-museum-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  // Gemäldegalerie - Berlin
  {
    id: "gemaeldegalerie",
    description_ko: "13세기부터 18세기까지 유럽 회화의 정수를 모은 베를린의 미술관으로, 세계 최고 수준의 옛 거장 컬렉션으로 꼽힌다. 렘브란트, 페르메이르, 뒤러, 라파엘로, 보티첼리, 카라바조의 걸작을 두루 소장한다.",
    name: "Gemäldegalerie",
    name_ko: "베를린 국립회화관",
    city: "Berlin",
    country: "Germany",
    latitude: 52.5082,
    longitude: 13.3650,
    description: "One of the world's leading collections of European paintings from the 13th to 18th centuries, featuring masterpieces by Rembrandt, Vermeer, Dürer, Raphael, Botticelli, and Caravaggio.",
    representativeImage: "https://recherche.smb.museum/images/4229858_2500x2500.jpg",
    permanentExhibitions: [
      { id: "smb-gemaeldegalerie-collection", name: "European Old Masters", title: "Gemäldegalerie Collection", description: "782 masterpieces of European painting spanning 500 years, from medieval altarpieces to Baroque masterworks.", startDate: "Permanent", endDate: "Permanent", collectionFile: "smb-gemaeldegalerie-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  // Alte Nationalgalerie - Berlin (Museum Island)
  {
    id: "alte-nationalgalerie",
    description_ko: "베를린 박물관 섬에 자리한 19세기 회화·조각 전문 미술관이다. 카스파르 다비트 프리드리히로 대표되는 독일 낭만주의부터 프랑스 인상주의, 초기 모더니즘까지 19세기 미술의 흐름을 폭넓게 소장한다.",
    name: "Alte Nationalgalerie",
    name_ko: "베를린 구 국립미술관",
    city: "Berlin",
    country: "Germany",
    latitude: 52.5209,
    longitude: 13.3988,
    description: "A gallery of 19th-century paintings and sculptures on Berlin's Museum Island, featuring German Romanticism, French Impressionism, and early Modernism.",
    representativeImage: "https://recherche.smb.museum/images/5669755_2500x2500.jpg",
    permanentExhibitions: [
      { id: "smb-alte-nationalgalerie-collection", name: "19th Century Art", title: "Alte Nationalgalerie Collection", description: "2,258 paintings and sculptures from Romanticism to early Modernism, including works by Caspar David Friedrich, Monet, Renoir, and Menzel.", startDate: "Permanent", endDate: "Permanent", collectionFile: "smb-alte-nationalgalerie-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  // Neue Nationalgalerie - Berlin (Kulturforum)
  {
    id: "neue-nationalgalerie",
    description_ko: "건축가 미스 반 데어 로에가 설계한 유리와 강철의 모더니즘 건축으로 이름난 미술관이다. 베를린에 자리하며, 20세기 미술 특히 독일 표현주의와 바우하우스, 전후 추상미술을 소장한다. 기둥 없이 트인 유리 전시관 자체가 근대 건축의 이정표로 평가받는다.",
    name: "Neue Nationalgalerie",
    name_ko: "신 국립미술관",
    city: "Berlin",
    country: "Germany",
    latitude: 52.5074,
    longitude: 13.3653,
    description: "Mies van der Rohe's iconic modernist building housing 20th-century art, featuring Expressionism, Cubism, Bauhaus, and contemporary works.",
    representativeImage: "https://recherche.smb.museum/images/5640125_2500x2500.jpg",
    permanentExhibitions: [
      { id: "smb-neue-nationalgalerie-collection", name: "20th Century Art", title: "Neue Nationalgalerie Collection", description: "2,275 works of modern and contemporary art including masterpieces by Kirchner, Klee, Picasso, Dalí, and Warhol.", startDate: "Permanent", endDate: "Permanent", collectionFile: "smb-neue-nationalgalerie-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  // Bode-Museum - Berlin (Museum Island)
  {
    id: "bode-museum",
    description_ko: "베를린 박물관 섬 끝자락에 자리한 네오바로크 양식의 박물관이다. 중세부터 18세기까지의 유럽 조각과 비잔틴 미술, 방대한 화폐 컬렉션을 소장하며, 돔 아래 기마상이 맞이하는 입구가 상징이다.",
    name: "Bode-Museum",
    name_ko: "보데 박물관",
    city: "Berlin",
    country: "Germany",
    latitude: 52.5225,
    longitude: 13.3945,
    description: "A stunning neo-Baroque museum on Museum Island housing Byzantine art, sculptures from the Middle Ages to the 18th century, and the Numismatic Collection.",
    representativeImage: "https://recherche.smb.museum/images/2539176_1400x1400.jpg",
    permanentExhibitions: [
      { id: "smb-bode-museum-collection", name: "Sculptures & Byzantine Art", title: "Bode-Museum Collection", description: "2,263 works including Byzantine art, medieval sculptures, and Renaissance masterpieces by Donatello, Riemenschneider, and Giacometti.", startDate: "Permanent", endDate: "Permanent", collectionFile: "smb-bode-museum-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  // Städel Museum - Frankfurt
  {
    id: "staedel-museum",
    description_ko: "700년에 걸친 유럽 미술사를 망라하는 프랑크푸르트의 미술관으로, 독일에서 가장 명망 높은 미술관 가운데 하나다. 옛 거장 회화부터 인상주의, 현대미술까지 폭넓게 소장하며, 지하 증축으로 동시대 미술 공간을 넓혔다.",
    name: "Städel Museum",
    name_ko: "슈테델 미술관",
    city: "Frankfurt",
    country: "Germany",
    latitude: 50.1056,
    longitude: 8.6724,
    description: "One of Germany's most prestigious art museums with 700 years of European art history. Features Old Masters, modern art, and contemporary works including paintings, sculptures, drawings, and photographs.",
    representativeImage: "https://sammlung.staedelmuseum.de/images/1839/alexej-von-jawlensky-abstract-head-symphony-pink-1855--thumb-xl.jpg",
    permanentExhibitions: [
      { id: "staedel-museum-collection", name: "Städel Collection", title: "Städel Museum Collection", description: "1,712 masterpieces spanning 700 years: Old Masters (1300-1800), Modern Art (1800-1945), Contemporary Art (1945-present), plus drawings, prints, and photographs.", startDate: "Permanent", endDate: "Permanent", collectionFile: "staedel-museum-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  // Brücke-Museum - Berlin
  {
    id: "bruecke-museum",
    name_ko: "브뤼케 미술관",
    description_ko: "20세기 초 독일 표현주의 운동 '브뤼케(다리)'의 작품을 세계에서 가장 많이 소장한 베를린의 미술관이다. 키르히너, 헤켈, 슈미트로틀루프 등 이 운동을 이끈 화가들의 강렬한 색채와 형태를 한자리에서 만날 수 있다.",
    name: "Brücke-Museum",
    city: "Berlin",
    country: "Germany",
    latitude: 52.4575,
    longitude: 13.2619,
    description: "World's largest collection of German Expressionist art from Die Brücke movement. Features works by Ernst Ludwig Kirchner, Erich Heckel, Karl Schmidt-Rottluff, Max Pechstein, and Emil Nolde.",
    representativeImage: "https://iiif.deutsche-digitale-bibliothek.de/image/2/8e3dd712-d189-4bd3-b67c-4af6ca4fe7eb/full/!800,800/0/default.jpg",
    permanentExhibitions: [
      { id: "bruecke-museum-collection", name: "Brücke Collection", title: "Die Brücke Collection", description: "1,152 works of German Expressionism: paintings (Gemälde), drawings (Zeichnung), prints (Druckgrafik), watercolors (Aquarell), and pastels by the founding artists of Die Brücke movement.", startDate: "Permanent", endDate: "Permanent", collectionFile: "bruecke-museum-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  // Alte Pinakothek - Munich
  {
    id: "alte-pinakothek",
    description_ko: "세계에서 가장 오래된 미술관 가운데 하나로, 14세기부터 18세기까지 유럽 거장 회화를 소장한다. 뒤러, 라파엘로, 루벤스, 렘브란트의 걸작이 풍부하며, 특히 뮌헨이 자랑하는 루벤스 컬렉션이 압도적이다. 바이에른 비텔스바흐 가문의 수집 전통에서 비롯했다.",
    name: "Alte Pinakothek",
    name_ko: "알테 피나코테크",
    city: "Munich",
    country: "Germany",
    latitude: 48.1482,
    longitude: 11.5699,
    description: "One of the world's oldest art galleries, housing an exceptional collection of Old Master paintings from the 14th to 18th centuries including works by Dürer, Rubens, and Rembrandt.",
    representativeImage: "https://res.cloudinary.com/tne/image/authenticated/s--ThA-PqKg--/q_60/w_400/artworks/DEUTSCH_BILDNIS-EINES-RITTERS_CC-BY-SA_BSTGS_11897.jpg",
    permanentExhibitions: [
      { id: "alte-pinakothek-collection", name: "Old Masters Collection", title: "Alte Pinakothek Collection", description: "5,262 masterpieces from the 14th-18th centuries including German, Dutch, Flemish, Italian, and Spanish painting.", startDate: "Permanent", endDate: "Permanent", collectionFile: "alte-pinakothek-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  // Neue Pinakothek - Munich
  {
    id: "neue-pinakothek",
    description_ko: "19세기 유럽 미술에 집중하는 미술관으로, 알테 피나코테크와 짝을 이룬다. 고흐의 '해바라기', 클림트, 모네 등 낭만주의에서 인상주의·후기인상주의로 이어지는 흐름을 폭넓게 소장한다. 19세기 미술의 다채로운 전개를 한자리에서 조망할 수 있다.",
    name: "Neue Pinakothek",
    name_ko: "노이에 피나코테크",
    city: "Munich",
    country: "Germany",
    latitude: 48.1495,
    longitude: 11.5700,
    description: "Home to 19th-century European art, featuring masterpieces of Romanticism, Impressionism, and Art Nouveau by artists like Monet, Van Gogh, and Klimt.",
    representativeImage: "https://res.cloudinary.com/tne/image/authenticated/s--ThA-PqKg--/q_60/w_400/artworks/DEUTSCH_BILDNIS-EINES-RITTERS_CC-BY-SA_BSTGS_11897.jpg",
    permanentExhibitions: [
      { id: "neue-pinakothek-collection", name: "19th Century Art", title: "Neue Pinakothek Collection", description: "136 works of 19th-century European painting and sculpture from Romanticism to Art Nouveau.", startDate: "Permanent", endDate: "Permanent", collectionFile: "neue-pinakothek-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  // Pinakothek der Moderne - Munich
  {
    id: "pinakothek-der-moderne",
    name_ko: "피나코테크 데어 모데르네",
    description_ko: "뮌헨에 자리한 유럽 최대 규모의 현대미술관 가운데 하나다. 미술·그래픽·건축·디자인을 다루는 네 개의 독립 컬렉션이 한 건물에 모여 있어, 20세기 이후 시각문화 전반을 폭넓게 조망한다.",
    name: "Pinakothek der Moderne",
    city: "Munich",
    country: "Germany",
    latitude: 48.1472,
    longitude: 11.5720,
    description: "One of the largest modern art museums in Europe, bringing together four independent museums under one roof: art, graphic arts, architecture, and design.",
    representativeImage: "https://res.cloudinary.com/tne/image/authenticated/s--ThA-PqKg--/q_60/w_400/artworks/DEUTSCH_BILDNIS-EINES-RITTERS_CC-BY-SA_BSTGS_11897.jpg",
    permanentExhibitions: [
      { id: "pinakothek-moderne-collection", name: "Modern & Contemporary Art", title: "Pinakothek der Moderne Collection", description: "467 works of 20th and 21st-century art including expressionism, cubism, abstract art, and contemporary installations.", startDate: "Permanent", endDate: "Permanent", collectionFile: "pinakothek-moderne-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  // Sammlung Schack - Munich
  {
    id: "sammlung-schack",
    name_ko: "샤크 컬렉션",
    description_ko: "19세기 독일 회화를 모은 뮌헨의 미술관으로, 수집가 아돌프 프리드리히 폰 샤크 백작의 컬렉션에서 비롯했다. 뵈클린과 포이어바흐 등 낭만주의 화가들의 작품을 그가 꾸민 전시 공간에서 그대로 만날 수 있다.",
    name: "Sammlung Schack",
    city: "Munich",
    country: "Germany",
    latitude: 48.1432,
    longitude: 11.5942,
    description: "The collection of Count Adolf Friedrich von Schack, featuring 19th-century German painting with works by Böcklin, Feuerbach, Lenbach, and Schwind.",
    representativeImage: "https://res.cloudinary.com/tne/image/authenticated/s--ThA-PqKg--/q_60/w_400/artworks/DEUTSCH_BILDNIS-EINES-RITTERS_CC-BY-SA_BSTGS_11897.jpg",
    permanentExhibitions: [
      { id: "sammlung-schack-collection", name: "German Romanticism", title: "Sammlung Schack Collection", description: "173 works of 19th-century German Romanticism and Late Romanticism painting.", startDate: "Permanent", endDate: "Permanent", collectionFile: "sammlung-schack-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  // Staatsgalerien - Munich (Bavarian State Galleries)
  {
    id: "staatsgalerien",
    name_ko: "바이에른 주립미술관 분관",
    description_ko: "바이에른 주립 회화 컬렉션이 바이에른 각지에 운영하는 분관들을 아우르는 이름이다. 뮌헨의 본관과 떨어진 여러 도시에서 그 지역과 연관된 유럽 미술을 선보인다.",
    name: "Staatsgalerien",
    city: "Munich",
    country: "Germany",
    latitude: 48.1400,
    longitude: 11.5800,
    description: "The Bavarian State Paintings Collections branch galleries spread across Bavaria, showcasing regional collections of European art.",
    representativeImage: "https://res.cloudinary.com/tne/image/authenticated/s--ThA-PqKg--/q_60/w_400/artworks/DEUTSCH_BILDNIS-EINES-RITTERS_CC-BY-SA_BSTGS_11897.jpg",
    permanentExhibitions: [
      { id: "staatsgalerien-collection", name: "Bavarian Collection", title: "Staatsgalerien Collection", description: "1,200 works from Bavarian State branch galleries across the region.", startDate: "Permanent", endDate: "Permanent", collectionFile: "staatsgalerien-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  // Hamburger Kunsthalle - Hamburg
  {
    id: "hamburger-kunsthalle",
    description_ko: "함부르크에 자리한 독일 최대 규모의 미술관 가운데 하나로, 중세부터 동시대까지 유럽 미술을 폭넓게 아우른다. 카스파르 다비트 프리드리히의 '안개 바다 위의 방랑자'를 비롯해 막스 리베르만, 키르히너의 걸작을 소장한다.",
    name: "Hamburger Kunsthalle",
    name_ko: "함부르크 미술관",
    city: "Hamburg",
    country: "Germany",
    latitude: 53.5533,
    longitude: 10.0033,
    description: "One of the largest art museums in Germany, housing an extensive collection of European paintings from medieval to contemporary art, including masterworks by Caspar David Friedrich, Max Liebermann, and Ernst Ludwig Kirchner.",
    representativeImage: "https://online-sammlung.hamburger-kunsthalle.de/sites/default/files/multimedia-files/61328.jpg",
    permanentExhibitions: [
      { id: "hamburger-kunsthalle-paintings", name: "Paintings Collection", title: "Malerei Collection", description: "2,286 paintings spanning seven centuries of European art history, from Old Masters to German Expressionism and contemporary works.", startDate: "Permanent", endDate: "Permanent", collectionFile: "hamburger-kunsthalle-paintings.json" },
      { id: "hamburger-kunsthalle-drawings", name: "Drawings Collection", title: "Zeichnung Collection", description: "13,397 drawings from the 15th century to present day, including works by Dürer, Rembrandt, Kirchner, and contemporary artists.", startDate: "Permanent", endDate: "Permanent", collectionFile: "hamburger-kunsthalle-drawings.json" },
      { id: "hamburger-kunsthalle-video", name: "Video Art Collection", title: "Video Art", description: "289 video artworks and media installations by international contemporary artists.", startDate: "Permanent", endDate: "Permanent", collectionFile: "hamburger-kunsthalle-video.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  // Rijksmuseum - Amsterdam
  {
    id: "rijksmuseum",
    description_ko: "네덜란드의 국립미술관으로, 중세부터 오늘에 이르는 미술과 역사를 아우른다. 무엇보다 네덜란드 황금기 회화의 정수가 모여 있어, 렘브란트의 대작 '야경'과 페르메이르의 '우유 따르는 여인'을 만날 수 있다. '명예의 갤러리'를 중심으로 한 웅장한 전시 공간으로도 유명하다.",
    name: "Rijksmuseum",
    name_ko: "암스테르담 국립미술관",
    city: "Amsterdam",
    country: "Netherlands",
    latitude: 52.3600,
    longitude: 4.8852,
    description: "The national museum of the Netherlands, housing an extensive collection of Dutch art and history from the Middle Ages to the present day, including masterpieces by Rembrandt, Vermeer, and Van Gogh.",
    representativeImage: "https://www.rijksmuseum.nl/images/rijksmuseum-building.jpg",
    permanentExhibitions: [
      { id: "rijksmuseum-paintings", name: "The collection", title: "The collection", description: "Collection of artworks from the Rijksmuseum, including Dutch Golden Age masterpieces and works currently on display.", startDate: "Permanent", endDate: "Permanent", collectionFile: "rijksmuseum-paintings-collection.json" },
      { id: "rijksmuseum-photography", name: "Photography Collection", title: "Photography Collection", description: "Collection of photographs from the Rijksmuseum, featuring works from the 19th century to the present day.", startDate: "Permanent", endDate: "Permanent", collectionFile: "rijksmuseum-photography-collection.json" },
      { id: "rijksmuseum-drawings", name: "Drawings Collection", title: "Drawings Collection", description: "Collection of drawings from the Rijksmuseum, featuring works from various periods.", startDate: "Permanent", endDate: "Permanent", collectionFile: "rijksmuseum-drawings-collection.json" },
      { id: "rijksmuseum-prints", name: "Book Illustrations", title: "Book Illustrations", description: "Collection of book illustrations from the Rijksmuseum.", startDate: "Permanent", endDate: "Permanent", collectionFile: "rijksmuseum-prints-collection.json" },
      { id: "rijksmuseum-prints2-collection", name: "Prints Collection", title: "Prints Collection", description: "Collection of prints from the Rijksmuseum.", startDate: "Permanent", endDate: "Permanent", collectionFile: "rijksmuseum-prints2-collection.json" },
      { id: "rijksmuseum-cartoon", name: "Cartoons & Caricatures", title: "Cartoons & Caricatures", description: "Collection of cartoons and caricatures from the Rijksmuseum archives.", startDate: "Permanent", endDate: "Permanent", collectionFile: "rijksmuseum-cartoon-collection.json" },
      { id: "rijksmuseum-design", name: "Design Collection", title: "Design Collection", description: "Collection of design objects from the Rijksmuseum, spanning industrial and applied arts.", startDate: "Permanent", endDate: "Permanent", collectionFile: "rijksmuseum-design-collection.json" },
      { id: "rijksmuseum-poster", name: "Posters Collection", title: "Posters Collection", description: "Collection of posters from the Rijksmuseum archives, featuring graphic design across the centuries.", startDate: "Permanent", endDate: "Permanent", collectionFile: "rijksmuseum-poster-collection.json" },
      { id: "rijksmuseum-docphotos", name: "Documentary Photographs", title: "Documentary Photographs", description: "Collection of documentary photographs from the Rijksmuseum archives.", startDate: "Permanent", endDate: "Permanent", collectionFile: "rijksmuseum-docphotos-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  // Van Gogh Museum - Amsterdam
  {
    id: "vangogh-museum",
    description_ko: "빈센트 반 고흐의 작품을 세계에서 가장 많이 소장한 암스테르담의 미술관이다. '해바라기', '아몬드 꽃', '감자 먹는 사람들' 등 회화와 드로잉을 시기별로 망라해, 한 화가의 삶과 예술의 전개를 깊이 있게 따라가 볼 수 있다.",
    name: "Van Gogh Museum",
    name_ko: "반 고흐 미술관",
    city: "Amsterdam",
    country: "Netherlands",
    latitude: 52.3584,
    longitude: 4.8811,
    description: "A museum dedicated to the works of Vincent van Gogh and his contemporaries in Amsterdam. Houses the largest collection of Van Gogh's paintings and drawings in the world.",
    representativeImage: "https://www.vangoghmuseum.nl/images/museum-building.jpg",
    permanentExhibitions: [
      { id: "vangogh-museum-collection", name: "Van Gogh Museum Collection", title: "Van Gogh Museum Collection", description: "Collection of artworks from the Van Gogh Museum, featuring works by Vincent van Gogh and his contemporaries.", startDate: "Permanent", endDate: "Permanent", collectionFile: "vangogh-museum-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  // Mauritshuis - The Hague
  {
    id: "mauritshuis",
    description_ko: "네덜란드 헤이그의 옛 귀족 저택에 자리한 미술관으로, 네덜란드 황금기 회화를 정선해 소장한다. 페르메이르의 '진주 귀고리를 한 소녀', 렘브란트의 '튈프 박사의 해부학 강의' 등 손에 꼽히는 걸작이 집약돼 있다. 규모는 아담하지만 작품의 밀도가 높기로 유명하다.",
    name: "Mauritshuis",
    name_ko: "마우리츠하위스 미술관",
    city: "The Hague",
    country: "Netherlands",
    latitude: 52.0806,
    longitude: 4.3144,
    description: "A museum in The Hague housing a world-renowned collection of Dutch Golden Age paintings, including Vermeer's 'Girl with a Pearl Earring' and Rembrandt's 'The Anatomy Lesson of Dr. Nicolaes Tulp'.",
    representativeImage: "https://www.mauritshuis.nl/images/museum-building.jpg",
    permanentExhibitions: [
      { id: "mauritshuis-collection", name: "Mauritshuis Collection", title: "Mauritshuis Collection", description: "Collection of Dutch Golden Age paintings from the Mauritshuis, including masterpieces by Vermeer, Rembrandt, and other Dutch masters.", startDate: "Permanent", endDate: "Permanent", collectionFile: "mauritshuis-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  // Stedelijk Museum Amsterdam
  {
    id: "stedelijk-museum",
    description_ko: "네덜란드를 대표하는 근현대미술·디자인 전문 미술관이다. 몬드리안, 말레비치, 샤갈부터 전후 추상미술과 팝아트까지 20세기 미술의 흐름을 폭넓게 소장한다. 새하얀 증축 건물의 독특한 외형으로도 화제를 모았다.",
    name: "Stedelijk Museum Amsterdam",
    name_ko: "암스테르담 시립 미술관",
    city: "Amsterdam",
    country: "Netherlands",
    latitude: 52.3579,
    longitude: 4.8792,
    description: "A museum of modern and contemporary art and design in Amsterdam. Features works from the early 20th century to the present day, including pieces by Mondrian, De Kooning, and Warhol.",
    representativeImage: "https://www.stedelijk.nl/images/museum-building.jpg",
    permanentExhibitions: [
      { id: "stedelijk-collection", name: "Stedelijk Museum Collection", title: "Stedelijk Museum Collection", description: "Collection of modern and contemporary art and design from the Stedelijk Museum Amsterdam, featuring works from the 20th and 21st centuries.", startDate: "Permanent", endDate: "Permanent", collectionFile: "stedelijk-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  // Netherlands - Kröller-Müller Museum
  {
    id: "kroller-muller-museum",
    description_ko: "세계에서 손꼽히는 반 고흐 컬렉션을 소장한 미술관으로, 수집가 헬레네 크뢸러 뮐러의 안목에서 비롯했다. 네덜란드 데호헤펠뤼버 국립공원 한가운데 자리해, 야외 조각 정원과 자연이 어우러진 산책로로도 사랑받는다. 고흐의 초기작부터 후기 풍경화까지 폭넓게 만날 수 있다.",
    name: "Kröller-Müller Museum",
    name_ko: "크뢸러 뮐러 미술관",
    city: "Otterlo",
    country: "Netherlands",
    latitude: 52.0956,
    longitude: 5.8167,
    description: "One of the largest Van Gogh collections in the world, housed in a stunning museum within De Hoge Veluwe National Park. Features over 90 Van Gogh paintings and 180 drawings, plus works by Picasso, Mondrian, and Seurat.",
    representativeImage: "https://krollermuller.nl/images/museum-exterior.jpg",
    permanentExhibitions: [
      { id: "kroller-muller-collection", name: "Kröller-Müller Collection", title: "Kröller-Müller Permanent Collection", description: "The complete permanent collection of the Kröller-Müller Museum — one of the largest Van Gogh collections in the world, alongside paintings, drawings, and sculptures by Mondrian, Seurat, Picasso, Redon, and other modern masters, plus an extensive photography collection and pioneering film and video art works.", startDate: "Permanent", endDate: "Permanent", collectionFile: "kroller-muller-permanent.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  // South Korea - MMCA
  {
    id: "mmca-seoul",
    slug: "mmca-seoul",
    name: "국립현대미술관",
    name_ko: "국립현대미술관",
    name_en: "National Museum of Modern and Contemporary Art",
    location: "서울특별시 종로구 삼청로 30",
    location_en: "30 Samcheong-ro, Jongno-gu, Seoul",
    description: "한국과 세계의 현대미술을 선도하는 국립미술관. 다양한 전시, 교육, 융복합 예술, 영화/영상 프로그램 운영. 소장작품 112점.",
    description_en: "A national museum leading contemporary art in Korea and abroad, with diverse exhibitions, education, interdisciplinary arts, and film/video programs. 112 artworks from the permanent collection.",
    latitude: 37.579617,
    longitude: 126.981805,
    country: "South Korea",
    region: "Seoul",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/MMCA_Seoul.jpg/1280px-MMCA_Seoul.jpg",
    floorPlan: "",
    permanentExhibitions: [
      { id: "mmca-collection", name: "국립현대미술관 소장작품", name_en: "MMCA Collection", title: "국립현대미술관 소장작품", title_en: "MMCA Collection", description: "국립현대미술관 소장작품 컬렉션 (112점)", description_en: "MMCA permanent collection (112 items)", startDate: "Permanent", endDate: "Permanent", collectionFile: "mmca-collection.json" }
    ],
    temporaryExhibitions: [
      {
        id: "mmca-2026-hirst",
        title: "데이미언 허스트",
        titleEn: "Damien Hirst",
        description: "삶과 죽음, 아름다움에 대한 인간의 복합적 감정을 조명하는 데이미언 허스트의 전시.",
        startDate: "2026-03-20",
        endDate: "2026-06-28",
        coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/exhibitions/covers/mmca-202601060002023.png",
        officialUrl: "https://www.mmca.go.kr/exhibitions/progressList.do",
        status: "ongoing"
      },
      {
        id: "mmca-2026-hirst-yba",
        title: "데이미언 허스트와 YBA",
        titleEn: "Damien Hirst and YBA",
        description: "허스트와 YBA를 통해 동시대 미술을 조망하는 다큐멘터리 프로그램.",
        startDate: "2026-04-01",
        endDate: "2026-06-06",
        coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/exhibitions/covers/mmca-202601060002025.png",
        officialUrl: "https://www.mmca.go.kr/exhibitions/progressList.do",
        status: "ongoing"
      },
      {
        id: "mmca-2026-detective",
        title: "MMCA 다원예술 2026: 탐정의 시간",
        titleEn: "MMCA Multidisciplinary Arts 2026: Detective's Time",
        description: "AI의 효율성에 대비하여, 탐정처럼 미세한 단서를 쫓으며 인간 고유의 깊고 느린 시간을 감각하는 다원예술 프로젝트.",
        startDate: "2026-04-01",
        endDate: "2026-12-06",
        coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/exhibitions/covers/mmca-202601060002024.gif",
        officialUrl: "https://www.mmca.go.kr/exhibitions/progressList.do",
        status: "ongoing"
      },
      {
        id: "mmca-2026-dissolution",
        title: "소멸의 시학: 삭는 미술에 대하여",
        titleEn: "Poetics of Dissolution: On Art that Decays",
        description: "자신의 분해를 공공연히 드러내는 작품을 '삭는 미술'이라는 이름으로 묶어 소개하는 기획전.",
        startDate: "2026-01-30",
        endDate: "2026-05-03",
        coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/exhibitions/covers/mmca-202511280002008.gif",
        officialUrl: "https://www.mmca.go.kr/exhibitions/progressList.do",
        status: "ongoing"
      }
    ],
    pastExhibitions: [],
    rooms: {}
  },
  // South Korea - National Museum of Korea
  {
    id: "national-museum-korea",
    description_ko: "한국의 역사와 문화를 대표하는 국립박물관으로, 선사시대부터 조선과 근대에 이르는 유물을 아우른다. 백제 금동대향로, 반가사유상 등 국보급 명품을 비롯해 회화·도자·불교미술을 폭넓게 소장한다. 상설전시관과 '사유의 방'을 중심으로 한국 미술의 깊이를 차분히 보여 준다.",
    slug: "national-museum-korea",
    name: "국립중앙박물관",
    name_ko: "국립중앙박물관",
    name_en: "National Museum of Korea",
    location: "서울특별시 용산구 서빙고로 137",
    location_en: "137 Seobinggo-ro, Yongsan-gu, Seoul",
    description: "한국의 역사와 문화를 대표하는 국립박물관. 선사시대부터 근대까지의 유물 97,000여 점 소장.",
    description_en: "The largest museum in Korea, housing 97,000+ artifacts spanning from prehistoric times to the modern era.",
    latitude: 37.5238,
    longitude: 126.9804,
    country: "South Korea",
    region: "Seoul",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5b/National_Museum_of_Korea.jpg/1280px-National_Museum_of_Korea.jpg",
    floorPlan: "",
    permanentExhibitions: [
      { id: "nmk-collection", name: "국립중앙박물관 회화 컬렉션", name_en: "National Museum of Korea Paintings", title: "국립중앙박물관 회화 컬렉션", title_en: "National Museum of Korea Paintings Collection", description: "국립중앙박물관 소장 회화 컬렉션 (4,309점)", description_en: "National Museum of Korea paintings collection (4,309 items)", startDate: "Permanent", endDate: "Permanent", collectionFile: "national-museum-korea.json" }
    ],
    temporaryExhibitions: [
      {
        id: "nmk-2026-bongjeongsa",
        title: "깨달음으로 이끄는 부처: 안동 봉정사 괘불",
        titleEn: "Large Buddhist Hanging Scroll from Bongjeongsa Temple, Andong",
        description: "국립중앙박물관의 20번째 괘불전. 1710년에 제작된 봉정사 괘불은 세로 8m 이상, 가로 6m에 달하는 대형 불화로 영산회상 장면을 묘사한다.",
        startDate: "2026-04-07",
        endDate: "2026-06-21",
        coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/exhibitions/covers/nmk-2026-bongjeongsa.jpg",
        officialUrl: "https://www.museum.go.kr/MUSEUM/contents/M0202010000.do?menuId=current",
        status: "ongoing"
      },
      {
        id: "nmk-2026-conservation",
        title: "보존과학, 새로운 시작 함께하는 미래",
        titleEn: "Conservation Science: A New Beginning, Shared Future",
        description: "국립중앙박물관 보존과학센터 개관을 기념하는 특별전. 문화유산 보존의 과학적 원리와 최신 기술을 소개한다.",
        startDate: "2025-10-28",
        endDate: "2026-06-30",
        coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/exhibitions/covers/nmk-2026-conservation.jpg",
        officialUrl: "https://www.museum.go.kr/MUSEUM/contents/M0202010000.do?menuId=current",
        status: "ongoing"
      },
      {
        id: "nmk-2026-baekja",
        title: "각角진 백자 이야기",
        titleEn: "Stories of Angular White Porcelain",
        description: "조선 백자 중 각진 형태의 기형에 주목한 테마전. 사각·팔각·육각 등 다양한 각형 백자의 조형미와 시대별 변천을 조명한다.",
        startDate: "2025-08-26",
        endDate: "2026-06-21",
        coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/exhibitions/covers/nmk-2026-baekja.jpg",
        officialUrl: "https://www.museum.go.kr/MUSEUM/contents/M0202010000.do?menuId=current",
        status: "ongoing"
      }
    ],
    pastExhibitions: [],
    rooms: {}
  },
  // South Korea - Jeonju National Museum
  {
    id: "jeonju-national-museum",
    slug: "jeonju-national-museum",
    name: "국립전주박물관",
    name_ko: "국립전주박물관",
    name_en: "Jeonju National Museum",
    location: "전라북도 전주시 완산구 쑥고개로 249",
    location_en: "249 Ssukgogae-ro, Wansan-gu, Jeonju-si, Jeollabuk-do",
    description: "전라북도 지역의 역사와 문화를 간직한 국립박물관. 전북 지역에서 출토된 유물과 회화 컬렉션 소장.",
    description_en: "National museum preserving the history and culture of the Jeonbuk region with a collection of artifacts and paintings.",
    latitude: 35.8219,
    longitude: 127.1480,
    country: "South Korea",
    region: "Jeonju",
    representativeImage: "/images/jeonju-museum.jpg",
    floorPlan: "",
    permanentExhibitions: [
      { id: "jeonju-collection", name: "국립전주박물관 회화 컬렉션", name_en: "Jeonju National Museum Paintings", title: "국립전주박물관 회화 컬렉션", title_en: "Jeonju National Museum Paintings Collection", description: "국립전주박물관 소장 회화 컬렉션 (382점)", description_en: "Jeonju National Museum paintings collection (382 items)", startDate: "Permanent", endDate: "Permanent", collectionFile: "jeonju-museum.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    rooms: {}
  },
  // South Korea - Gwangju National Museum
  {
    id: "gwangju-national-museum",
    slug: "gwangju-national-museum",
    name: "국립광주박물관",
    name_ko: "국립광주박물관",
    name_en: "Gwangju National Museum",
    location: "광주광역시 북구 하서로 110",
    location_en: "110 Haseo-ro, Buk-gu, Gwangju",
    description: "전라남도와 광주 지역의 역사와 문화를 대표하는 국립박물관. 다양한 시대의 유물과 회화 컬렉션 소장.",
    description_en: "National museum representing the history and culture of the Gwangju and Jeonnam region with diverse artifact and painting collections.",
    latitude: 35.1774,
    longitude: 126.8947,
    country: "South Korea",
    region: "Gwangju",
    representativeImage: "/images/gwangju-museum.jpg",
    floorPlan: "",
    permanentExhibitions: [
      { id: "gwangju-collection", name: "국립광주박물관 회화 컬렉션", name_en: "Gwangju National Museum Paintings", title: "국립광주박물관 회화 컬렉션", title_en: "Gwangju National Museum Paintings Collection", description: "국립광주박물관 소장 회화 컬렉션 (331점)", description_en: "Gwangju National Museum paintings collection (331 items)", startDate: "Permanent", endDate: "Permanent", collectionFile: "gwangju-museum.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    rooms: {}
  },
  // South Korea - National Folk Museum of Korea
  {
    id: "folk-museum",
    slug: "folk-museum",
    name: "국립민속박물관",
    name_ko: "국립민속박물관",
    name_en: "National Folk Museum of Korea",
    location: "서울특별시 종로구 삼청로 37",
    location_en: "37 Samcheong-ro, Jongno-gu, Seoul",
    description: "경복궁 내에 위치한 한국 민속·생활문화 전문 박물관. 선사시대부터 근현대까지 한국인의 일상생활과 세시풍속·생업·주거 문화를 방대한 소장품과 디오라마로 전시한다. 어린이 박물관 및 야외 민속마을을 운영하며 연간 300만 명 이상이 방문한다.",
    description_en: "A national museum of Korean folk and everyday culture situated within Gyeongbokgung Palace. It documents Korean daily life from prehistory to the modern era through its extensive collection, dioramas, an outdoor folk village, and a dedicated children's museum.",
    latitude: 37.5811,
    longitude: 126.9786,
    country: "South Korea",
    region: "Seoul",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e8/National_Folk_Museum_of_Korea_-_entrance.jpg/1280px-National_Folk_Museum_of_Korea_-_entrance.jpg",
    floorPlan: "",
    permanentExhibitions: [
      { id: "folk-collection", name: "국립민속박물관 회화 컬렉션", name_en: "National Folk Museum Paintings", title: "국립민속박물관 회화 컬렉션", title_en: "National Folk Museum Paintings Collection", description: "국립민속박물관 소장 회화 컬렉션 (927점)", description_en: "National Folk Museum paintings collection (927 items)", startDate: "Permanent", endDate: "Permanent", collectionFile: "folk-museum.json" }
    ],
    temporaryExhibitions: [
      {
        id: "nfm-2025-childbirth",
        title: "출산, 모두의 잔치",
        titleEn: "Childbirth, A Celebration for All",
        description: "선사시대부터 현대까지 한국의 출산 풍습과 의례를 조명하는 특별전. 출산 관련 유물 328점을 통해 생명 탄생을 둘러싼 공동체의 기원과 축하 문화를 살펴본다.",
        startDate: "2025-12-03",
        endDate: "2026-05-10",
        coverImage: "",
        officialUrl: "https://www.nfm.go.kr/home/exhibition/current.do",
        status: "ongoing"
      }
    ],
    pastExhibitions: [],
    rooms: {}
  },
  // South Korea - Busan Museum
  {
    id: "busan-museum",
    slug: "busan-museum",
    name: "부산광역시립박물관",
    name_ko: "부산광역시립박물관",
    name_en: "Busan Museum",
    location: "부산광역시 남구 유엔평화로 63",
    location_en: "63 UN Pyeonghwa-ro, Nam-gu, Busan",
    description: "부산의 역사와 문화를 간직한 시립박물관. 부산 지역의 유물과 회화 컬렉션 소장.",
    description_en: "Municipal museum preserving the history and culture of Busan with a collection of artifacts and paintings.",
    latitude: 35.1380,
    longitude: 129.0654,
    country: "South Korea",
    region: "Busan",
    representativeImage: "/images/busan-museum.jpg",
    floorPlan: "",
    permanentExhibitions: [
      { id: "busan-collection", name: "부산박물관 회화 컬렉션", name_en: "Busan Museum Paintings", title: "부산박물관 회화 컬렉션", title_en: "Busan Museum Paintings Collection", description: "부산박물관 소장 회화 컬렉션 (198점)", description_en: "Busan Museum paintings collection (198 items)", startDate: "Permanent", endDate: "Permanent", collectionFile: "busan-museum.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    rooms: {}
  },
  // South Korea - Seoul Museum of Art (SeMA)
  {
    id: "seoul-museum-of-art",
    slug: "sema",
    name: "서울시립미술관",
    name_ko: "서울특별시립미술관",
    name_en: "Seoul Museum of Art",
    location: "서울특별시 중구 덕수궁길 61",
    location_en: "61 Deoksugung-gil, Jung-gu, Seoul",
    description: "서울시립미술관은 서울의 대표 미술관으로, 한국 근현대 미술과 동시대 미술을 폭넓게 소장하고 있습니다. 회화, 사진, 한국화, 드로잉&판화, 조각, 뉴미디어, 설치, 공예, 서예, 디자인 등 다양한 장르의 6,167점 소장.",
    description_en: "Seoul Museum of Art (SeMA) showcases Korean modern and contemporary art across diverse media including painting, photography, sculpture, new media, and more. Collection of 6,167 works.",
    latitude: 37.565284,
    longitude: 126.975361,
    country: "South Korea",
    region: "Seoul",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/Seoul_Museum_of_Art%2C_Korea.jpg/1280px-Seoul_Museum_of_Art%2C_Korea.jpg",
    floorPlan: "",
    permanentExhibitions: [
      { id: "sema-collection", name: "서울시립미술관 소장품", name_en: "Seoul Museum of Art Collection", title: "서울시립미술관 소장품", title_en: "Seoul Museum of Art Collection", description: "서울시립미술관 소장 미술작품 컬렉션 (회화, 사진, 한국화, 드로잉&판화, 조각, 뉴미디어, 설치, 공예, 서예, 디자인 등 6,167점)", description_en: "Seoul Museum of Art collection featuring painting, photography, Korean painting, drawing & print, sculpture, new media, installation, craft, calligraphy, design (6,167 works)", startDate: "Permanent", endDate: "Permanent", collectionFile: "seoul-museum-of-art-collection.json" }
    ],
    temporaryExhibitions: [
      {
        id: "sema-2026-gana-tech",
        title: "가나아트컬렉션: 기술의 저변 — 경계에 선 장면들",
        titleEn: "Gana Art Collection: The Undercurrent of Technology",
        description: "1970–90년대 급격한 산업화·도시화 속 미디어 환경의 변화가 한국 사회 풍경을 어떻게 형성했는지를 탐구한다. SeMA의 2026년 기관 주제 '기술'의 핵심 전시.",
        startDate: "2026-04-16",
        endDate: "2026-11-22",
        coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/exhibitions/covers/sema-2026-gana-tech.jpg",
        officialUrl: "https://sema.seoul.go.kr/kr/whatson/landing",
        status: "ongoing"
      },
      {
        id: "sema-2026-yooyoungkuk",
        title: "유영국: 산은 내 안에 있다",
        titleEn: "Yoo Young-kuk: The Mountain Is Within Me",
        description: "한국 추상미술의 선구자 유영국(1916–2002)의 110주년 기념 역대 최대 회고전. 산과 색면으로 유명한 그의 대표작을 통해 한국 현대 추상회화의 궤적을 조망한다.",
        startDate: "2026-05-14",
        endDate: "2026-10-18",
        coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/exhibitions/covers/sema-2026-yooyoungkuk.jpg",
        officialUrl: "https://sema.seoul.go.kr",
        status: "upcoming"
      },
      {
        id: "sema-2026-hershman",
        title: "린 허쉬만 리슨",
        titleEn: "Lynn Hershman Leeson",
        description: "미국 미디어아트·영화 선구자 린 허쉬만 리슨의 아시아 첫 대규모 개인전. 60년 작업 세계를 아우르며 SeMA의 2026년 '기술' 주제에 응답한다.",
        startDate: "2026-10-01",
        endDate: "2027-02-07",
        coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/exhibitions/covers/sema-2026-hershman.jpg",
        officialUrl: "https://sema.seoul.go.kr",
        status: "upcoming"
      }
    ],
    pastExhibitions: [],
    rooms: {}
  },
  // Spain - Museo Nacional Centro de Arte Reina Sofía
  {
    id: "museo-reina-sofia",
    description_ko: "스페인의 국립 현대미술관으로, 20세기 이후 미술을 중심으로 소장하고 전시한다. 무엇보다 피카소가 게르니카 폭격의 참상을 고발한 대작 '게르니카'를 만날 수 있는 곳으로 유명하다. 달리, 미로 등 스페인 현대미술의 거장들을 폭넓게 아우른다.",
    slug: "reina-sofia",
    name: "Museo Reina Sofía",
    name_ko: "국립 소피아 왕비 예술센터",
    name_en: "Museo Reina Sofía",
    location: "Calle Santa Isabel 52, 28012 Madrid, Spain",
    location_en: "Calle Santa Isabel 52, 28012 Madrid, Spain",
    description: "스페인 국립 현대미술관. 피카소의 게르니카를 비롯하여 달리, 미로 등 20세기 스페인 현대미술의 걸작 14,700여 점을 소장하고 있습니다.",
    description_en: "Spain's national museum of 20th-century art. Home to Picasso's Guernica and masterpieces by Dalí, Miró, and other modern Spanish artists. Collection of over 14,700 works.",
    latitude: 40.4088,
    longitude: -3.6945,
    country: "Spain",
    region: "Madrid",
    representativeImage: "https://recursos.museoreinasofia.es/styles/small_landscape/public/Obra/DE00050_1.jpg.webp",
    floorPlan: "",
    permanentExhibitions: [
      { id: "reina-sofia-collection", name: "Reina Sofía Collection", name_en: "Reina Sofía Collection", title: "Museo Reina Sofía Collection", title_en: "Museo Reina Sofía Collection", description: "Museo Nacional Centro de Arte Reina Sofía 소장품 컬렉션 (14,712점)", description_en: "Museo Nacional Centro de Arte Reina Sofía collection (14,712 works)", startDate: "Permanent", endDate: "Permanent", collectionFile: "reina-sofia-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    rooms: {}
  },
  // Spain - Museo Nacional Thyssen-Bornemisza
  {
    id: "museo-thyssen-bornemisza",
    description_ko: "프라도, 소피아 왕비 미술관과 더불어 마드리드의 '미술 황금 삼각지대'를 이루는 미술관이다. 티센보르네미차 남작 가문이 두 대에 걸쳐 모은 컬렉션을 토대로 하며, 13세기 이탈리아 초기 회화부터 20세기 팝아트까지 서양 미술사를 통사적으로 훑는다.",
    slug: "thyssen-bornemisza",
    name: "Museo Thyssen-Bornemisza",
    name_ko: "티센보르네미차 미술관",
    name_en: "Museo Nacional Thyssen-Bornemisza",
    location: "P.º del Prado, 8, 28014 Madrid, Spain",
    location_en: "P.º del Prado, 8, 28014 Madrid, Spain",
    description: "마드리드의 주요 미술관 중 하나로, 중세부터 현대까지의 서양 회화 컬렉션을 소장하고 있습니다.",
    description_en: "One of Madrid's major museums, featuring a renowned collection of Western painting from the Middle Ages to the modern era.",
    latitude: 40.4160,
    longitude: -3.6945,
    country: "Spain",
    region: "Madrid",
    representativeImage: "https://www.museothyssen.org/sites/default/files/styles/16x9_social_share/public/imagen/2015-09/museo-thyssen-bornemisza.jpg",
    floorPlan: "",
    permanentExhibitions: [
      {
        id: "thyssen-collection-41",
        name: "Thyssen Collection 41",
        name_en: "Thyssen Collection 41",
        title: "Museo Thyssen-Bornemisza Collection (41)",
        title_en: "Museo Thyssen-Bornemisza Collection (41)",
        description: "Thyssen-Bornemisza 소장품 컬렉션 (Collection 41 테스트 데이터)",
        description_en: "Thyssen-Bornemisza collection (Collection 41 test dataset)",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "museothyssen-collection-41.full.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    rooms: {}
  },
  // Spain - Guggenheim Bilbao
  {
    id: "guggenheim-bilbao",
    description_ko: "프랭크 게리가 티타늄 곡면으로 빚어낸 건축 자체가 하나의 거대한 조형 작품으로 평가받는 현대미술관이다. 1997년 개관과 함께 쇠락하던 공업 도시 빌바오를 문화 관광지로 되살려 '빌바오 효과'라는 말을 낳았다. 대형 설치와 동시대 미술을 중심으로 전시한다.",
    slug: "guggenheim-bilbao",
    name: "Guggenheim Bilbao",
    name_ko: "빌바오 구겐하임 미술관",
    name_en: "Guggenheim Bilbao",
    location: "Abandoibarra Etorb., 2, 48009 Bilbo, Bizkaia, Spain",
    location_en: "Abandoibarra Etorb., 2, 48009 Bilbo, Bizkaia, Spain",
    description: "프랭크 게리가 설계한 구겐하임 빌바오는 20세기 건축의 가장 중요한 예 중 하나로 꼽힙니다. 현대 및 동시대 미술 작품을 주로 전시합니다.",
    description_en: "Designed by Frank Gehry, the Guggenheim Museum Bilbao is considered one of the most important examples of 20th-century architecture. It primarily exhibits modern and contemporary art.",
    latitude: 43.2686,
    longitude: -2.9340,
    country: "Spain",
    region: "Bilbao",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Guggenheim_Museum_Bilbao_July_2010.jpg/1200px-Guggenheim_Museum_Bilbao_July_2010.jpg",
    floorPlan: "",
    permanentExhibitions: [
      {
        id: "guggenheim-bilbao-collection",
        name: "Guggenheim Bilbao Collection",
        name_en: "Guggenheim Bilbao Collection",
        title: "Guggenheim Bilbao Permanent Collection",
        title_en: "Guggenheim Bilbao Permanent Collection",
        description: "구겐하임 빌바오 미술관의 영구 소장품 컬렉션입니다.",
        description_en: "Permanent collection of the Guggenheim Museum Bilbao.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "guggenheim-bilbao-collection.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    rooms: {}
  },
  {
    id: "huntington-library",
    name_ko: "헌팅턴 도서관·미술관",
    name: "Huntington Library",
    name_en: "The Huntington Library, Art Museum, and Botanical Gardens",
    location: "San Marino, USA",
    description: "헌팅턴 도서관, 예술관, 식물원은 헨리 E. 헌팅턴이 설립한 교육 및 연구 기관입니다. 유럽 및 미국 예술 컬렉션과 희귀 서적으로 유명합니다.",
    description_en: "The Huntington Library, Art Museum, and Botanical Gardens is a collections-based educational and research institution. It is known for its extensive collection of European and American art and rare books.",
    latitude: 34.1274,
    longitude: -118.1132,
    country: "USA",
    region: "San Marino, California",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1e/Huntington_Art_Gallery_LOGGIA.jpg/1200px-Huntington_Art_Gallery_LOGGIA.jpg",
    floorPlan: "",
    permanentExhibitions: [
      {
        id: "huntington-collection",
        name: "Huntington Museum Collection",
        name_en: "Huntington Museum Collection",
        title: "Huntington Museum Permanent Collection",
        title_en: "Huntington Museum Permanent Collection",
        description: "헌팅턴 예술관의 영구 소장품 컬렉션입니다.",
        description_en: "Permanent collection of the Huntington Art Museum.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "huntington-collection.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    rooms: {}
  },
  {
    id: "famsf-museum",
    name: "Fine Arts Museums of San Francisco",
    name_ko: "샌프란시스코 미술관",
    name_en: "Fine Arts Museums of San Francisco",
    location: "San Francisco, USA",
    description: "샌프란시스코 미술관(FAMSF)은 드 영(de Young) 미술관과 레지옹 도뇌르(Legion of Honor) 미술관을 통합한 샌프란시스코 최대의 공공 예술 기관입니다.",
    description_en: "The Fine Arts Museums of San Francisco (FAMSF), comprising the de Young Museum and the Legion of Honor, is the largest public arts institution in San Francisco.",
    latitude: 37.7715,
    longitude: -122.4687,
    country: "USA",
    region: "San Francisco, California",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/10/De_Young_Museum_view.jpg/1200px-De_Young_Museum_view.jpg",
    floorPlan: "",
    permanentExhibitions: [
      {
        id: "famsf-collections",
        name: "FAMSF Collection",
        name_en: "FAMSF Collection",
        title: "FAMSF Permanent Collection",
        title_en: "FAMSF Permanent Collection",
        description: "샌프란시스코 미술관의 소장품 컬렉션입니다.",
        description_en: "Collection of the Fine Arts Museums of San Francisco.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "famsf-collections.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    rooms: {}
  },
  
  {
    id: "museu-picasso-barcelona",
    name_ko: "바르셀로나 피카소 미술관",
    description_ko: "파블로 피카소가 청소년기와 청년기를 보낸 바르셀로나에 자리한 미술관으로, 화가의 초기 작품을 세계에서 가장 풍부하게 소장한다. 중세 고딕 양식의 저택 다섯 채를 이어 만든 공간에서 한 천재의 형성기를 따라가 볼 수 있다. 벨라스케스의 '시녀들'을 재해석한 연작도 이곳의 백미다.",
    name: "Museu Picasso Barcelona",
    city: "Barcelona",
    country: "Spain",
    latitude: 41.3851,
    longitude: 2.1819,
    description: "피카소의 초기 작품과 바르셀로나 시절 작품들을 대규모로 소장한 미술관.",
    representativeImage: "",
    permanentExhibitions: [
      { id: "picasso-bcn-collection", name: "Collection", name_en: "Collection", title: "Museu Picasso Barcelona - Collection", title_en: "Museu Picasso Barcelona - Collection", description: "바르셀로나 피카소 미술관의 작품 컬렉션입니다.", description_en: "Artworks from the Museu Picasso Barcelona collection.", startDate: "Permanent", endDate: "Permanent", collectionFile: "picasso-bcn-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "dali-foundation",
    name_ko: "달리 미술관",
    name: "Fundació Gala-Salvador Dalí",
    city: "Figueres",
    country: "Spain",
    latitude: 42.2679,
    longitude: 2.9600,
    description: "살바도르 달리의 작품을 소장한 달리 재단 미술관.",
    representativeImage: "",
    permanentExhibitions: [
      { id: "dali-foundation-collection", name: "Collection", name_en: "Collection", title: "Fundació Gala-Salvador Dalí - Collection", title_en: "Fundació Gala-Salvador Dalí - Collection", description: "달리 재단의 작품 컬렉션입니다.", description_en: "Artworks from the Fundació Gala-Salvador Dalí collection.", startDate: "Permanent", endDate: "Permanent", collectionFile: "dali-foundation-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "caixaforum",
    name_ko: "카이샤포룸",
    name: "Fundación la Caixa",
    city: "Barcelona",
    country: "Spain",
    latitude: 41.3851,
    longitude: 2.1700,
    description: "라 카이샤 재단의 현대 미술 컬렉션.",
    representativeImage: "",
    permanentExhibitions: [
      { id: "caixaforum-collection", name: "Collection", name_en: "Collection", title: "Fundación la Caixa - Collection", title_en: "Fundación la Caixa - Collection", description: "라 카이샤 재단의 현대 미술 컬렉션 723점. 회화, 드로잉, 판화, 비디오, 사진 등 다양한 매체.", description_en: "723 works from the Fundación la Caixa collection: paintings, drawings, prints, video, and photography.", startDate: "Permanent", endDate: "Permanent", collectionFile: "caixaforum-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "prado",
    name_ko: "프라도 미술관",
    name: "Museo Nacional del Prado",
    city: "Madrid",
    country: "Spain",
    latitude: 40.4138,
    longitude: -3.6921,
    description_ko: "벨라스케스·고야·보스의 회화가 한자리에 모인 스페인 국립 미술관. 합스부르크 왕가 컬렉션을 모체로 1819년 마드리드에 문을 열었다.",
    description: "Spain's national art museum, opened in Madrid in 1819 from the Habsburg royal collection. Houses masterpieces by Velázquez, Goya, and Bosch under one roof.",
    representativeImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/prado-collection/Q208758-d4b863ba-imageUrl.webp",
    permanentExhibitions: [
      { id: "prado-collection", name: "Collection", name_en: "Collection", title: "Museo Nacional del Prado — Collection", title_en: "Museo Nacional del Prado — Collection", description: "3,743점의 회화 컬렉션. 1100~1900년대를 아우르며 1600년대 스페인 황금기가 무게 중심이다.", description_en: "3,743 paintings spanning the 1100s–1900s, weighted toward the 17th-century Spanish Golden Age.", startDate: "Permanent", endDate: "Permanent", collectionFile: "prado-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "sorolla",
    name_ko: "소로야 미술관",
    name: "Museo Sorolla",
    city: "Madrid",
    country: "Spain",
    latitude: 40.4344,
    longitude: -3.6912,
    description_ko: "호아킨 소로야가 살던 마드리드 자택을 그대로 남긴 작가 미술관. 지중해의 빛을 화폭에 옮긴 발렌시아 화가의 회화와 정원이 함께 보인다.",
    description: "Painter's house museum preserving Joaquín Sorolla's Madrid residence and studio, alongside the surrounding garden and his luminous Mediterranean paintings.",
    representativeImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/sorolla-collection-pilot/Q6065609-8e83f597-imageUrl.webp",
    permanentExhibitions: [
      { id: "sorolla-collection", name: "Collection", name_en: "Collection", title: "Museo Sorolla — Collection", title_en: "Museo Sorolla — Collection", description: "62점의 회화 컬렉션. 작가의 자화상·가족 초상·해변 풍경이 중심을 이룬다.", description_en: "62 paintings centered on the artist's self-portraits, family scenes, and coastal landscapes.", startDate: "Permanent", endDate: "Permanent", collectionFile: "sorolla-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "malba",
    name_ko: "말바 (라틴아메리카 미술관)",
    name: "MALBA — Museo de Arte Latinoamericano de Buenos Aires",
    city: "Buenos Aires",
    country: "Argentina",
    latitude: -34.5775,
    longitude: -58.4033,
    description_ko: "라틴아메리카 근현대 미술을 전문으로 다루는 부에노스아이레스의 미술관. 프리다 칼로의 '두 명의 프리다', 타르실라 두 아마라우의 '아바포루' 등 20세기 라틴 거장들의 대표작을 모았다.",
    description: "Buenos Aires museum dedicated to modern and contemporary Latin American art, home to Frida Kahlo's Las dos Fridas and Tarsila do Amaral's Abaporu.",
    representativeImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/malba-collection/malba-8174-73031ab7-imageUrl.webp",
    permanentExhibitions: [
      { id: "malba-collection", name: "Collection", name_en: "Collection", title: "MALBA — Collection", title_en: "MALBA — Collection", description: "582점의 평면 컬렉션. 회화·드로잉·판화·사진·영상을 아우르는 라틴아메리카 모더니즘.", description_en: "582 works spanning painting, drawing, print, photography, and video — Latin American modernism.", startDate: "Permanent", endDate: "Permanent", collectionFile: "malba-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "galnas-jakarta",
    name_ko: "인도네시아 국립미술관",
    name: "Galeri Nasional Indonesia",
    city: "Jakarta",
    country: "Indonesia",
    latitude: -6.1817,
    longitude: 106.8331,
    description_ko: "자카르타의 인도네시아 국립미술관. 수조요노, 아판디 등 인도네시아 근대 회화를 이끈 작가들의 작품을 소장한다.",
    description: "Indonesia's national gallery in Jakarta, holding works by the founders of Indonesian modern painting such as S. Sudjojono and Affandi.",
    representativeImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/galnas-collection/galnas-garuda-a555c9f5-imageUrl.webp",
    permanentExhibitions: [
      { id: "galnas-collection", name: "Collection", name_en: "Collection", title: "Galeri Nasional Indonesia — Collection", title_en: "Galeri Nasional Indonesia — Collection", description: "온라인 공개 회화·드로잉 38점.", description_en: "38 paintings and drawings published online.", startDate: "Permanent", endDate: "Permanent", collectionFile: "galnas-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "nmfa-manila",
    name_ko: "필리핀 국립미술관",
    name: "National Museum of Fine Arts, Manila",
    city: "Manila",
    country: "Philippines",
    latitude: 14.5869,
    longitude: 120.9790,
    description_ko: "마닐라의 필리핀 국립미술관. 후안 루나의 '스폴리아리움'을 비롯해 필리핀 시각예술의 정전을 보존한다.",
    description: "The Philippines' national fine arts museum in Manila, preserving the canon of Filipino visual art including Juan Luna's Spoliarium.",
    representativeImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/nmfa-collection/nmfa-ffd219-paintings-ffd219c8-imageUrl.webp",
    permanentExhibitions: [
      { id: "nmfa-collection", name: "Collection", name_en: "Collection", title: "National Museum of Fine Arts — Collection", title_en: "National Museum of Fine Arts — Collection", description: "회화·드로잉·판화·사진 52점.", description_en: "52 paintings, drawings, prints, and photographs.", startDate: "Permanent", endDate: "Permanent", collectionFile: "nmfa-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "mathaf-doha",
    name_ko: "마타프 (아랍 근현대 미술관)",
    name: "Mathaf: Arab Museum of Modern Art",
    city: "Doha",
    country: "Qatar",
    latitude: 25.3173,
    longitude: 51.4370,
    description_ko: "도하의 아랍 근현대 미술관. 20세기 이후 아랍 세계의 회화와 시각예술을 집중적으로 소장한다.",
    description: "Doha museum focused on modern and contemporary art from the Arab world.",
    representativeImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/mathaf-collection/mathaf-blue-moon-mat20071317-12522b8c-imageUrl.webp",
    permanentExhibitions: [
      { id: "mathaf-collection", name: "Collection", name_en: "Collection", title: "Mathaf — Collection", title_en: "Mathaf — Collection", description: "233점의 아랍 근현대 회화 컬렉션.", description_en: "233 works of modern and contemporary Arab art.", startDate: "Permanent", endDate: "Permanent", collectionFile: "mathaf-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "museum-ludwig",
    name_ko: "루트비히 미술관",
    name: "Museum Ludwig",
    city: "Cologne",
    country: "Germany",
    latitude: 50.9407,
    longitude: 6.9606,
    description_ko: "쾰른 대성당 옆에 자리한 현대미술관. 피카소와 독일 표현주의, 그리고 유럽 최대 규모의 팝아트 컬렉션으로 이름이 높다.",
    description: "Cologne museum of modern art beside the cathedral, renowned for its Picasso holdings, German Expressionism, and one of Europe's largest Pop Art collections.",
    representativeImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/museum-ludwig-collection/05020164-68d9c373-imageUrl.webp",
    permanentExhibitions: [
      { id: "museum-ludwig-collection", name: "Collection", name_en: "Collection", title: "Museum Ludwig — Collection", title_en: "Museum Ludwig — Collection", description: "11,281점 — 회화 전체 + 그래픽·사진. 피카소, 표현주의, 팝아트 중심.", description_en: "11,281 works — all paintings plus graphics and photography, spanning Picasso, Expressionism and Pop Art.", startDate: "Permanent", endDate: "Permanent", collectionFile: "museum-ludwig-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "iziko-sang",
    name_ko: "이지코 남아프리카 국립미술관",
    name: "Iziko South African National Gallery",
    city: "Cape Town",
    country: "South Africa",
    latitude: -33.9292,
    longitude: 18.4146,
    description_ko: "케이프타운의 남아프리카 국립미술관. 남아공 근현대 회화와 유럽 회화를 함께 소장한다.",
    description: "South Africa's national gallery in Cape Town, holding both South African and European painting.",
    representativeImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/iziko-collection/iziko-12707-70d6e970-imageUrl.webp",
    permanentExhibitions: [
      { id: "iziko-collection", name: "Collection", name_en: "Collection", title: "Iziko SANG — Collection", title_en: "Iziko SANG — Collection", description: "'이달의 명작' 시리즈 회화 12점.", description_en: "12 paintings from the Masterpiece of the Month series.", startDate: "Permanent", endDate: "Permanent", collectionFile: "iziko-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "mam-cdmx",
    name_ko: "멕시코 근대미술관",
    name: "Museo de Arte Moderno, Mexico City",
    city: "Mexico City",
    country: "Mexico",
    latitude: 19.4196,
    longitude: -99.1816,
    description_ko: "멕시코시티 차풀테펙 공원에 자리한 근대미술관. 프리다 칼로의 '두 명의 프리다', 디에고 리베라, 시케이로스 등 멕시코 모더니즘의 핵심 작품을 모았다.",
    description: "Modern art museum in Mexico City's Chapultepec Park, gathering key works of Mexican modernism by Frida Kahlo, Diego Rivera, and Siqueiros.",
    representativeImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/mam-cdmx-collection/mam-cdmx-16-f9c8b82a-imageUrl.webp",
    permanentExhibitions: [
      { id: "mam-cdmx-collection", name: "Collection", name_en: "Collection", title: "Museo de Arte Moderno — Collection", title_en: "Museo de Arte Moderno — Collection", description: "주요 작품 44점. 멕시코 모더니즘 회화의 정전.", description_en: "44 highlighted works — the canon of Mexican modernist painting.", startDate: "Permanent", endDate: "Permanent", collectionFile: "mam-cdmx-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "mnba-habana",
    name_ko: "쿠바 국립미술관",
    name: "Museo Nacional de Bellas Artes (Arte Cubano), Havana",
    city: "Havana",
    country: "Cuba",
    latitude: 23.1380,
    longitude: -82.3590,
    description_ko: "아바나의 쿠바 국립미술관. 쿠바 근현대 회화와 유럽 고전 회화를 아우른다.",
    description: "Cuba's national fine arts museum in Havana, spanning Cuban modern painting and European old masters.",
    representativeImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/mnba-habana-collection/mnba-conrado-massaguer-alfonso-xiii-d1ec8e7b-imageUrl.webp",
    permanentExhibitions: [
      { id: "mnba-habana-collection", name: "Collection", name_en: "Collection", title: "MNBA Habana — Collection", title_en: "MNBA Habana — Collection", description: "추천작 중 평면 회화·판화 53점.", description_en: "53 paintings and prints from the recommended works.", startDate: "Permanent", endDate: "Permanent", collectionFile: "mnba-habana-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "ngma-newdelhi",
    name_ko: "인도 국립현대미술관 (뉴델리)",
    name: "National Gallery of Modern Art, New Delhi",
    city: "New Delhi",
    country: "India",
    latitude: 28.6118,
    longitude: 77.2197,
    description_ko: "인도 근현대 미술의 진화를 한자리에 모은 국립 미술관. 암리타 셰르길, 자미니 로이, 벵골 화파 등 18세기 무굴 세밀화부터 20세기 모더니즘까지 인도 자생적 미술의 계보를 보여준다.",
    description: "India's national museum of modern art in New Delhi, tracing the evolution of Indian art from Mughal miniatures to 20th-century modernism — Amrita Sher-Gil, Jamini Roy, the Bengal School.",
    representativeImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/ngma-newdelhi-collection/ngma_del-ngma-00079-12-0d8ff03a-imageUrl.webp",
    permanentExhibitions: [
      { id: "ngma-newdelhi-collection", name: "Collection", name_en: "Collection", title: "NGMA New Delhi — Collection", title_en: "NGMA New Delhi — Collection", description: "12,309점의 평면 컬렉션. 회화·드로잉·판화·사진을 아우르는 인도 근현대 미술.", description_en: "12,309 works spanning painting, drawing, print, and photography — Indian modern art.", startDate: "Permanent", endDate: "Permanent", collectionFile: "ngma-newdelhi-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "albertina-museum",
    name_ko: "알베르티나 미술관",
    description_ko: "합스부르크 왕가의 궁전에 자리한 미술관으로, 세계에서 가장 중요한 판화·소묘 컬렉션을 갖춘 곳으로 꼽힌다. 뒤러의 '어린 산토끼'와 '기도하는 손' 같은 종이 위의 걸작이 대표 소장품이다. 근래에는 모네에서 피카소에 이르는 인상주의·근대 회화도 상설로 선보인다.",
    slug: "albertina",
    name: "ALBERTINA Museum Vienna",
    location: "Albertinaplatz 1, 1010 Vienna, Austria",
    description: "A palace housing one of the most important print rooms in the world, with collections ranging from late Gothic to contemporary art.",
    latitude: 48.2047,
    longitude: 16.3682,
    country: "Austria",
    region: "Vienna",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Albertina_Wien_2008.jpg/1200px-Albertina_Wien_2008.jpg",
    floorPlan: "",
    permanentExhibitions: [
      { id: "albertina-permanent-collection", name: "Permanent Collection", title: "ALBERTINA — Permanent Collection", description: "Highlights from the ALBERTINA's permanent collection spanning paintings, sculptures, drawings, prints, and objects & media art.", startDate: "Permanent", endDate: "Permanent" , collectionFile: "albertina-permanent-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    rooms: {}
  },
  {
    id: "leopold-museum",
    description_ko: "빈 분리파와 아르누보 미술의 보고로 꼽히는 빈의 미술관이다. 무엇보다 에곤 실레의 작품을 세계에서 가장 많이 소장한 곳으로 유명하며, 클림트를 비롯한 빈 모더니즘의 걸작을 함께 만날 수 있다.",
    slug: "leopold-museum",
    name: "Leopold Museum",
    name_ko: "레오폴트 미술관",
    location: "Museumsplatz 1, 1070 Vienna, Austria",
    description: "Home to the world's largest Egon Schiele collection and masterpieces of the Vienna Secession and Art Nouveau.",
    latitude: 48.2030,
    longitude: 16.3590,
    country: "Austria",
    region: "Vienna",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Wien_-_Leopold_Museum.JPG/1200px-Wien_-_Leopold_Museum.JPG",
    floorPlan: "",
    permanentExhibitions: [
      {
        id: "leopold-museum-collection",
        name: "Collection",
        title: "Leopold Museum Collection",
        description: "Highlights from the Leopold Museum's collection of Austrian modern art.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "leopold-museum-collection.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    rooms: {}
  },
  {
    id: "kunsthistorisches-museum-vienna",
    name_ko: "빈 미술사 박물관",
    description_ko: "합스부르크 제국이 수 세기에 걸쳐 모은 컬렉션을 토대로 한 빈의 미술사 박물관이다. 고대 이집트와 그리스·로마 유물부터 브뤼헐, 페르메이르, 라파엘로, 카라바조의 회화까지 방대하게 아우르며, 세계 최대의 대 브뤼헐 컬렉션으로 유명하다.",
    slug: "khm",
    name: "Kunsthistorisches Museum Vienna",
    location: "Maria-Theresien-Platz, 1010 Vienna, Austria",
    description: "One of the world's foremost museums, housing an extensive collection of art and artifacts spanning several millennia, from ancient Egypt to the late 18th century.",
    latitude: 48.2037,
    longitude: 16.3612,
    country: "Austria",
    region: "Vienna",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/Kunsthistorisches_Museum_Vienna_June_2006_002.jpg/1200px-Kunsthistorisches_Museum_Vienna_June_2006_002.jpg",
    floorPlan: "",
    permanentExhibitions: [
      {
        id: "khm-collection",
        name: "KHM Collection",
        title: "Kunsthistorisches Museum Collection",
        description: "Masterpieces from the museum's vast collection including paintings, sculptures, decorative arts, and antiquities.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "khm-collection.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    rooms: {}
  },
  {
    id: "belvedere-museum",
    description_ko: "빈의 바로크 궁전에 자리한 미술관으로, 중세부터 오늘까지 오스트리아 미술을 가장 폭넓게 소장한다. 무엇보다 구스타프 클림트의 황금빛 대표작 '키스'를 만날 수 있는 곳으로 세계적인 사랑을 받는다. 에곤 실레, 코코슈카 등 빈 모더니즘의 거장들도 함께 아우른다.",
    slug: "belvedere",
    name: "Belvedere Museum",
    name_ko: "오스트리아 벨베데레 미술관",
    location: "Prinz-Eugen-Straße 27, 1030 Vienna, Austria",
    description: "One of Austria's most important art museums, housing the largest collection of Austrian art from the Middle Ages to the present day, including the world's largest collection of Gustav Klimt paintings.",
    latitude: 48.1919,
    longitude: 16.3807,
    country: "Austria",
    region: "Vienna",
    representativeImage: "https://www.belvedere.at/sites/default/files/styles/large/public/2024-11/belvedere-building.jpg",
    floorPlan: "",
    permanentExhibitions: [
      {
        id: "belvedere-collection",
        name: "Belvedere Collection",
        title: "Belvedere Collection",
        description: "Collection of artworks from the Belvedere Museum.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "belvedere-collection.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    rooms: {}
  },
  {
    id: "wawel-royal-castle",
    name_ko: "바벨 왕성",
    description_ko: "크라쿠프 바벨 언덕에 자리한 폴란드 왕실의 옛 궁성이다. 카지미에시 대왕 때부터 여러 시대에 걸쳐 지어진 건축이 이탈리아풍 안뜰을 둘러싸며, 왕실의 태피스트리와 회화, 무기 컬렉션을 소장한다.",
    slug: "wawel",
    name: "Wawel Royal Castle",
    location: "Wawel 5, 31-001 Kraków, Poland",
    description: "The Wawel Royal Castle is a castle residency located in central Kraków, Poland. Built at the behest of King Casimir III the Great, it consists of a number of structures from different periods situated around the Italian-styled main courtyard.",
    latitude: 50.0540,
    longitude: 19.9354,
    country: "Poland",
    region: "Krakow",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Wawel_Castle_from_Vistula_River.jpg/1200px-Wawel_Castle_from_Vistula_River.jpg",
    floorPlan: "",
    permanentExhibitions: [
      {
        id: "wawel-collection",
        name: "Wawel Collection",
        title: "Wawel Royal Castle Collection",
        description: "The digital collection of the Wawel Royal Castle.",
        startDate: "Permanent",
        endDate: "Permanent", collectionFile: "wawel-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    rooms: {}
  },
  {
    id: "mnk-krakow",
    description_ko: "1879년에 세워진 폴란드 국립박물관의 본관으로, 크라쿠프에 자리한다. 레오나르도 다 빈치의 '담비를 안은 여인'을 소장한 곳으로 유명하며, 폴란드 미술과 유럽 회화, 공예를 폭넓게 아우른다.",
    slug: "mnk",
    name: "National Museum in Krakow",
    name_ko: "크라쿠프 국립미술관",
    location: "al. 3 Maja 1, 30-062 Kraków, Poland",
    description: "The National Museum in Krakow (MNK), established in 1879, is the main branch of Poland's National Museum, which has several independent branches with permanent collections around the country.",
    latitude: 50.0604,
    longitude: 19.9236,
    country: "Poland",
    region: "Krakow",
    representativeImage: "https://cdn-zbiory.mnk.pl/upload/multimedia/70/cf/70cf455ae3a01688ee35b91049110d73.jpg",
    floorPlan: "",
    permanentExhibitions: [
      {
        id: "mnk-collection",
        name: "MNK Collection",
        title: "National Museum in Krakow Collection",
        description: "Paintings, drawings, posters and photography from the National Museum in Krakow.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "mnk-collection.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    rooms: {}
  },
  {
    id: "mfab",
    description_ko: "부다페스트 영웅광장에 자리한 헝가리의 대표 미술관이다. 20세기 초 신고전주의 양식으로 지어졌으며, 이집트 유물부터 라파엘로, 엘 그레코, 고야 등 유럽 거장 회화까지 국제적인 컬렉션을 소장한다.",
    slug: "mfab",
    name: "Museum of Fine Arts, Budapest",
    name_ko: "부다페스트 미술관",
    location: "Budapest, Dózsa György út 41, 1146 Hungary",
    description: "The Museum of Fine Arts is a museum in Heroes' Square, Budapest, Hungary, built in the eclectic-neoclassical style between 1900 and 1906, housing a significant international art collection.",
    latitude: 47.5163,
    longitude: 19.0763,
    country: "Hungary",
    region: "Budapest",
    representativeImage: "https://www.mfab.hu/app/uploads/2019/02/szepmuveszeti_epulet_2.jpg",
    floorPlan: "",
    permanentExhibitions: [
      {
        id: "mfab-collection",
        name: "MFAB Collection",
        title: "Museum of Fine Arts Collection",
        description: "Highlights from the Museum of Fine Arts, Budapest, spanning from antiquity to the present day.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "mfab-collection.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    rooms: {}
  },
  {
    id: "gulbenkian-museum",
    description_ko: "석유 사업가이자 수집가 칼루스트 굴벤키안이 평생 모은 컬렉션을 토대로 한 리스본의 미술관이다. 고대 이집트와 이슬람 미술부터 유럽 회화, 르네 랄리크의 아르누보 보석까지 한 개인의 안목으로 모은 인류 미술의 정수를 보여 준다.",
    slug: "gulbenkian",
    name: "Gulbenkian Museum",
    name_ko: "칼루스트 굴벤키안 미술관",
    location: "Av. de Berna 45A, 1067-001 Lisboa, Portugal",
    description: "The Calouste Gulbenkian Museum houses one of the world's most important private art collections, spanning from Ancient Egypt to the early 20th century.",
    latitude: 38.7375,
    longitude: -9.1547,
    country: "Portugal",
    region: "Lisbon",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6e/Museu_Calouste_Gulbenkian_exterior.jpg/1200px-Museu_Calouste_Gulbenkian_exterior.jpg",
    permanentExhibitions: [
      {
        id: "gulbenkian-collection",
        name: "Founder's Collection",
        title: "Founder's Collection",
        description: "Highlights from the Calouste Gulbenkian collection, ranging from Islamic art to René Lalique.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "gulbenkian-collection.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "fine-arts-be",
    description_ko: "브뤼셀에 자리한 벨기에 왕립미술관은 여러 미술관이 모인 통합 기관이다. 15세기 플랑드르 거장부터 루벤스, 그리고 마그리트로 대표되는 벨기에 근현대미술까지 폭넓게 소장하며, 옛 거장 미술관과 마그리트 미술관 등으로 구성된다.",
    slug: "fine-arts-be",
    name: "Musées royaux des Beaux-Arts de Belgique",
    name_ko: "벨기에 왕립미술관",
    location: "Rue de la Régence 3, 1000 Bruxelles, Belgium",
    description: "The Royal Museums of Fine Arts of Belgium are a group of art museums in Brussels.",
    latitude: 50.8411,
    longitude: 4.3596,
    country: "Belgium",
    region: "Brussels",
    representativeImage: "https://fine-arts-museum.be/assets/img/logo-fr.png",
    floorPlan: "",
    permanentExhibitions: [
      {
        id: "fine-arts-be-collection",
        name: "Collection Highlights",
        title: "Painting Collection Highlights",
        description: "A selection of 100 paintings from the collection.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "fine-arts-be-complete.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    rooms: {}
  },
  {
    id: "nam-athens",
    description_ko: "고대 그리스 미술을 다루는 세계에서 가장 중요한 박물관 가운데 하나로, 그리스 최대의 고고학 박물관이다. 미케네의 황금 가면, 안티키테라 기계, 청동 조각 등 그리스 문명의 정수를 소장한다.",
    slug: "nam-athens",
    name: "National Archaeological Museum",
    name_ko: "아테네 국립 고고학 박물관",
    location: "44 Patission Street, Athens 10682, Greece",
    description: "The largest archaeological museum in Greece and one of the most important museums in the world devoted to ancient Greek art.",
    latitude: 37.9891,
    longitude: 23.7326,
    country: "Greece",
    region: "Athens",
    representativeImage: "https://www.namuseum.gr/wp-content/themes/nam/assets/images/logo_en.png",
    permanentExhibitions: [
      {
        id: "nam-collection",
        name: "Collection Highlights",
        title: "Collection Highlights",
        description: "A selection of major artifacts from the National Archaeological Museum, Athens.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "nam-collection.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "kunsthaus-zurich",
    description_ko: "스위스에서 손꼽히는 미술 컬렉션을 갖춘 취리히의 미술관이다. 중세 미술부터 인상주의, 자코메티의 조각, 뭉크와 스위스 근현대미술까지 폭넓게 소장한다.",
    slug: "kunsthaus-zurich",
    name: "Kunsthaus Zürich",
    name_ko: "취리히 미술관",
    location: "Heimplatz 1, 8001 Zürich, Switzerland",
    description: "The Kunsthaus Zürich houses one of the most important art collections in Switzerland.",
    latitude: 47.3702,
    longitude: 8.5482,
    country: "Switzerland",
    region: "Zurich",
    representativeImage: "https://www.kunsthaus.ch/typo3conf/ext/kunsthaus_site/Resources/Public/Assets/logo.svg",
    permanentExhibitions: [
      {
        id: "kunsthaus-collection",
        name: "Collection Highlights",
        title: "Collection Highlights",
        description: "Artworks from the Kunsthaus Zürich collection.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "kunsthaus-collection.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "kunstmuseum-basel",
    description_ko: "세계에서 가장 오래된 공공 미술 컬렉션을 이어받은 바젤의 미술관으로, 스위스에서 가장 중요한 미술관으로 꼽힌다. 한스 홀바인을 비롯한 르네상스 회화부터 인상주의, 입체주의, 전후 현대미술까지 폭넓게 소장한다.",
    slug: "kunstmuseum-basel",
    name: "Kunstmuseum Basel",
    name_ko: "바젤 시립 미술관",
    location: "St. Alban-Graben 16, 4051 Basel, Switzerland",
    description: "The Kunstmuseum Basel houses the oldest public art collection in the world and is generally considered to be the most important museum of art in Switzerland.",
    latitude: 47.5540,
    longitude: 7.5944,
    country: "Switzerland",
    region: "Basel",
    representativeImage: "https://sammlungonline.kunstmuseumbasel.ch/eMP/eMuseumPlus?service=WebAsset&url=/images/siteTitle.png&contentType=image/png",
    permanentExhibitions: [
      {
        id: "basel-collection",
        name: "Painting Collection",
        title: "Painting Collection",
        description: "Highlights from the painting collection of Kunstmuseum Basel.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "basel-collection.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "fondation-beyeler",
    description_ko: "화상 에른스트 바이엘러 부부의 컬렉션을 토대로 한, 스위스에서 가장 많은 사람이 찾는 미술관이다. 렌초 피아노가 설계한 빛 가득한 건물에 모네, 피카소, 자코메티 등 고전적 모더니즘과 동시대 미술 400여 점을 소장한다.",
    slug: "fondation-beyeler",
    name: "Fondation Beyeler",
    name_ko: "바이엘러 재단",
    location: "Baselstrasse 101, 4125 Riehen/Basel, Switzerland",
    description: "The most visited art museum in Switzerland, founded by collectors Ernst and Hildy Beyeler. The collection comprises over 400 works of classic modernism and contemporary art.",
    latitude: 47.5878,
    longitude: 7.6515,
    country: "Switzerland",
    region: "Basel",
    representativeImage: "https://www.fondationbeyeler.ch/fileadmin/_processed_/3/5/csm_FOBE_Aussen_01_a939f603c7.jpg",
    permanentExhibitions: [
      {
        id: "beyeler-collection",
        name: "Beyeler Collection",
        title: "Fondation Beyeler Collection",
        description: "The complete collection of classic modernism and contemporary art.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "beyeler-collection.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "mah-geneva",
    description_ko: "1910년에 문을 연 제네바의 미술사 박물관으로, 스위스 최대 규모의 박물관 가운데 하나다. 회화와 조각 같은 미술품부터 고고학 유물, 응용미술까지 폭넓은 분야를 아우른다.",
    slug: "mah-geneva",
    name: "Musée d'Art et d'Histoire",
    name_ko: "제네바 미술사 박물관",
    location: "Rue Charles-Galland 2, 1206 Genève, Switzerland",
    description: "One of the largest museums in Switzerland, dating back to 1910, housing collections of fine art, archaeology, and applied arts.",
    latitude: 46.1993,
    longitude: 6.1559,
    country: "Switzerland",
    region: "Geneva",
    representativeImage: "",
    permanentExhibitions: [
      {
        id: "mah-collection",
        name: "Collection Highlights",
        title: "MAH Collection Highlights",
        description: "Artworks from the Musée d'Art et d'Histoire Geneva.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "mah-collection.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  // International Museums
  {
    id: "acropolis-museum",
    description_ko: "아테네 아크로폴리스 기슭에 자리한 고고학 박물관으로, 아크로폴리스에서 출토된 유물을 전문으로 전시한다. 파르테논 신전의 조각과 고졸기 조각상을 자연광 아래 선보이며, 유리 바닥 아래로 고대 도시의 발굴 현장이 그대로 드러난다.",
    slug: "acropolis-museum",
    name: "Acropolis Museum",
    name_ko: "아크로폴리스 박물관",
    location: "Dionysiou Areopagitou 15, Athens 117 42, Greece",
    description: "An archaeological museum focused on the findings of the archaeological site of the Acropolis of Athens.",
    latitude: 37.9684,
    longitude: 23.7285,
    country: "Greece",
    region: "Athens",
    representativeImage: "https://www.theacropolismuseum.gr/sites/default/files/styles/carousel_large/public/2020-09/exterior-view-of-the-museum_0.jpg",
    permanentExhibitions: [
      {
        id: "acropolis-highlights",
        name: "Acropolis Museum Highlights",
        title: "Museum Highlights",
        description: "Key exhibits from the Acropolis Museum collection, featuring masterpieces of ancient Greek art.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "acropolis-museum-collection.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "national-gallery-prague",
    description_ko: "체코에서 가장 큰 미술 컬렉션을 운영하는 국립미술관이다. 프라하 곳곳의 역사적 건물에 나뉘어 자리하며, 중세 보헤미아 미술부터 무하로 대표되는 체코 근대미술, 유럽 거장 회화까지 폭넓게 소장한다.",
    slug: "national-gallery-prague",
    name: "National Gallery Prague",
    name_ko: "프라하 국립미술관",
    location: "Staroměstské náměstí 12, 110 15 Praha 1, Czech Republic",
    description: "The National Gallery Prague manages the largest collection of art in the Czech Republic.",
    latitude: 50.0875,
    longitude: 14.4213,
    country: "Czech Republic",
    region: "Prague",
    representativeImage: "https://sbirky.ngprague.cz/images/logo_en.svg",
    permanentExhibitions: [
      {
        id: "ngprague-collection",
        name: "Collection Highlights",
        title: "Collection Highlights",
        description: "A selection of masterpieces from the National Gallery Prague.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "ngprague-collection.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "nasjonalmuseet",
    description_ko: "오슬로에 자리한 노르웨이의 국립미술관으로, 북유럽 최대 규모를 자랑한다. 미술·건축·디자인을 두루 아우르며, 무엇보다 에드바르 뭉크의 '절규'를 소장한 곳으로 잘 알려져 있다.",
    slug: "nasjonalmuseet",
    name: "Nasjonalmuseet",
    name_ko: "노르웨이 국립박물관",
    location: "Pb. 7014 St. Olavs plass, 0130 Oslo, Norway",
    description: "The National Museum of Art, Architecture and Design in Oslo is the largest art museum in the Nordic countries.",
    latitude: 59.9119,
    longitude: 10.7275,
    country: "Norway",
    region: "Oslo",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/e/e5/Nasjonalmuseet_Oslo_2022.jpg",
    permanentExhibitions: [
      {
        id: "nasjonal-collection",
        name: "Collection Highlights",
        title: "Collection Highlights",
        description: "Highlights from the National Museum's painting collection.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "nasjonal-collection.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "musee-matisse-nice",
    name_ko: "마티스 미술관",
    description_ko: "프랑스 화가 앙리 마티스에게 헌정된 니스의 미술관이다. 마티스가 만년을 보낸 시미에 언덕의 옛 저택에 자리하며, 그의 회화·드로잉·종이 오리기 작업과 조각을 두루 소장해 한 거장의 예술 세계를 깊이 있게 보여 준다.",
    slug: "musee-matisse-nice",
    name: "Musée Matisse",
    location: "164 Av. des Arènes de Cimiez, 06000 Nice, France",
    description: "Located in Nice, the museum is dedicated to the work of French painter Henri Matisse.",
    latitude: 43.7196,
    longitude: 7.2762,
    country: "France",
    region: "Nice",
    representativeImage: "images/musee-matisse-logo.svg",
    permanentExhibitions: [
      {
        id: "matisse-nice-collection",
        name: "Collection Highlights",
        title: "Collection Highlights",
        description: "A selection of works by Henri Matisse from the museum's collection.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "matisse-nice-collection.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "munchmuseet",
    description_ko: "노르웨이 화가 에드바르 뭉크의 작품을 세계에서 가장 많이 소장한 미술관이다. 뭉크가 직접 오슬로시에 기증한 회화·판화·드로잉을 토대로 하며, 대표작 '절규'의 여러 판본을 만날 수 있다. 오슬로 피오르 곁에 새로 지은 고층 건물로 자리를 옮겼다.",
    slug: "munchmuseet",
    name: "Munchmuseet",
    name_ko: "뭉크 미술관",
    location: "Edvard Munchs Plass 1, 0194 Oslo, Norway",
    description: "Munchmuseet houses the world's largest collection of art by Edvard Munch.",
    latitude: 59.9075,
    longitude: 10.7533,
    country: "Norway",
    region: "Oslo",
    representativeImage: "https://www.munch.no/android-chrome-512x512.png",
    permanentExhibitions: [
      {
        id: "munch-collection",
        name: "Collection Highlights",
        title: "Collection Highlights",
        description: "A selection of works by Edvard Munch from the museum's collection.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "munch-collection.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "nationalmuseum-sweden",
    description_ko: "스톡홀름에 자리한 스웨덴의 국립미술관으로, 미술과 디자인을 아우른다. 렘브란트를 비롯한 유럽 옛 거장 회화부터 스웨덴 미술, 그리고 북유럽 디자인 컬렉션까지 폭넓게 소장한다.",
    slug: "nationalmuseum-sweden",
    name: "Nationalmuseum Sweden",
    name_ko: "스웨덴 국립미술관",
    location: "Södra Blasieholmshamnen 2, 111 48 Stockholm, Sweden",
    description: "Sweden's premier museum of art and design.",
    latitude: 59.3283,
    longitude: 18.0772,
    country: "Sweden",
    region: "Stockholm",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Nationalmuseum_Stockholm_2009.jpg/1200px-Nationalmuseum_Stockholm_2009.jpg",
    permanentExhibitions: [
      {
        id: "nationalmuseum-sweden-collection",
        name: "Collection Highlights",
        title: "Nationalmuseum Collection",
        description: "Artworks from the Nationalmuseum Sweden collection.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "sweden-collection.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "smk-collection",
    name_ko: "덴마크 국립미술관",
    description_ko: "덴마크의 국립미술관으로, 700년에 걸친 덴마크와 유럽 미술을 아우른다. 덴마크 회화의 황금기를 비롯해 마티스, 뭉크 등 유럽 근대미술의 걸작도 폭넓게 소장한다. 옛 건물과 현대적 증축이 유리 통로로 이어진 공간 구성으로도 사랑받는다.",
    slug: "smk",
    name: "SMK – Statens Museum for Kunst",
    location: "Sølvgade 48-50, 1307 Copenhagen, Denmark",
    description: "Denmark's National Gallery, housing the largest collection of Danish and international art spanning 700 years. Collection of 6,653 paintings.",
    latitude: 55.6880,
    longitude: 12.5765,
    country: "Denmark",
    region: "Copenhagen",
    representativeImage: "https://open.smk.dk/static/media/smk-logo.svg",
    permanentExhibitions: [
      {
        id: "smk-collection",
        name: "Painting Collection",
        title: "SMK Painting Collection",
        description: "6,653 paintings from Denmark's National Gallery, featuring Danish and international masters.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "smk-collection.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "glyptoteket",
    description_ko: "맥주 양조가 카를 야콥센이 세운 코펜하겐의 미술관으로, 고대와 근대 미술을 함께 소장한다. 이집트·그리스·로마 조각과 더불어 인상주의·후기인상주의 회화, 특히 풍부한 로댕과 드가, 고갱 컬렉션으로 유명하다. 야자수가 자라는 유리 돔 겨울 정원이 명소다.",
    slug: "glyptoteket",
    name: "Ny Carlsberg Glyptotek",
    name_ko: "글립토테크 미술관",
    location: "Dantes Plads 7, 1556 København, Denmark",
    description: "An art museum of international standing in the heart of Copenhagen, featuring ancient and modern art.",
    latitude: 55.6722,
    longitude: 12.5714,
    country: "Denmark",
    region: "Copenhagen",
    representativeImage: "https://glyptoteket.com/media/s12m5e10/fransk-kunst-1800-1870_0028_glyptoteket-2022-ana-cecilia-gonzález.jpg",
    floorPlan: "",
    permanentExhibitions: [
      {
        id: "glyptoteket-collection",
        name: "Collection Highlights",
        title: "Collection Highlights",
        description: "Selected 2D works from the diverse collection of Ny Carlsberg Glyptotek.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "glyptoteket-collection.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "aros-aarhus",
    description_ko: "북유럽에서 손꼽히는 규모의 미술관으로, 덴마크 오르후스에 자리한다. 옥상에 올라퀴르 엘리아손이 만든 무지갯빛 원형 통로 '당신의 무지개 파노라마'가 도시의 상징이 되었다. 19세기부터 동시대까지 덴마크와 국제 미술을 폭넓게 소장한다.",
    slug: "aros",
    name: "ARoS Aarhus Kunstmuseum",
    name_ko: "아로스 오르후스 쿤스트뮤지엄",
    location: "Aros Allé 2, 8000 Aarhus, Denmark",
    description: "One of the largest art museums in Northern Europe, known for Olafur Eliasson's 'Your rainbow panorama'.",
    latitude: 56.1528,
    longitude: 10.1997,
    country: "Denmark",
    region: "Aarhus",
    representativeImage: "https://www.aros.dk/media/1001/aros-by-night-foto-adam-moerk_.jpg",
    floorPlan: "",
    permanentExhibitions: [
      {
        id: "aros-collection",
        name: "Collection Highlights",
        title: "ARoS Collection",
        description: "A comprehensive collection of Danish and international art from the ARoS Aarhus Kunstmuseum.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "aros-collection.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "skagens-museum",
    name_ko: "스카겐 미술관",
    description_ko: "덴마크 최북단 어촌 스카겐에 모여든 '스카겐 화파'의 작품을 집대성한 미술관이다. 19세기 말 이곳의 밝은 빛에 매료된 화가들이 그린 바다와 어부, 일상의 풍경을 폭넓게 소장한다.",
    slug: "skagens",
    name: "Skagens Museum",
    location: "Brøndumsvej 4, 9990 Skagen, Denmark",
    description: "An art museum in Skagen, Denmark, exhibiting an extensive collection of works by members of the colony of Skagen Painters.",
    latitude: 57.7250,
    longitude: 10.5980,
    country: "Denmark",
    region: "North Jutland",
    representativeImage: "https://samlinger.slks.dk/upload/127/000/030/6/36e162c1-cb6a-4fa7-a61d-adafd6016870.jpg",
    floorPlan: "",
    permanentExhibitions: [
      {
        id: "skagens-collection",
        name: "Collection Highlights",
        title: "Skagens Museum Collection",
        description: "Works by the Skagen Painters, including Anna Ancher, Michael Ancher, and P.S. Krøyer.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "skagens-collection.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "ateneum-collection",
    name_ko: "아테네움 미술관",
    description_ko: "핀란드 미술의 본산으로 불리는 헬싱키의 미술관으로, 핀란드 국립미술관에 속한다. 회화·조각·판화 등 핀란드 최대 규모의 컬렉션을 갖추었으며, 핀란드 황금기 미술과 더불어 고흐와 세잔 등 국제 미술도 함께 소장한다.",
    slug: "ateneum",
    name: "Ateneum Art Museum",
    location: "Kaivokatu 2, 00100 Helsinki, Finland",
    description: "The home of Finnish art and part of the Finnish National Gallery. It houses the largest collection of paintings, sculptures and graphics in Finland.",
    latitude: 60.1700,
    longitude: 24.9441,
    country: "Finland",
    region: "Helsinki",
    representativeImage: "https://www.kansallisgalleria.fi/assets/static/media/ateneum-logo-en.334a17.svg", // Using generic or we can use a known image
    permanentExhibitions: [
      {
        id: "ateneum-collection",
        name: "Collection Highlights",
        title: "Ateneum Collection",
        description: "Comprehensive collection of 5,367 artworks from the Ateneum Art Museum (Finnish National Gallery).",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "ateneum-collection.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "kiasma-collection",
    name_ko: "키아스마 현대미술관",
    description_ko: "핀란드 국립미술관에 속한 헬싱키의 현대미술관이다. 건축가 스티븐 홀이 설계한 곡면의 건물로 유명하며, 오늘의 미술을 소개하는 전시와 핀란드 동시대 미술 컬렉션을 선보인다.",
    slug: "kiasma",
    name: "Kiasma Museum of Contemporary Art",
    location: "Mannerheiminaukio 2, 00100 Helsinki, Finland",
    description: "A museum of contemporary art under the Finnish National Gallery, displaying the art of our time.",
    latitude: 60.1719,
    longitude: 24.9372,
    country: "Finland",
    region: "Helsinki",
    representativeImage: "https://www.kansallisgalleria.fi/assets/static/media/kiasma-logo-en.2a8738.svg",
    permanentExhibitions: [
      {
        id: "kiasma-collection",
        name: "Collection Highlights",
        title: "Kiasma Collection",
        description: "Comprehensive collection of 3,067 contemporary artworks from Kiasma (Finnish National Gallery).",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "kiasma-collection.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "sinebrychoff-collection",
    name_ko: "시네브리코프 미술관",
    description_ko: "유럽 옛 거장의 미술을 전문으로 하는 핀란드 유일의 미술관이다. 헬싱키에 자리하며, 14세기부터 19세기까지 유럽 회화와 초상화, 장식미술을 소장한다.",
    slug: "sinebrychoff",
    name: "Sinebrychoff Art Museum",
    location: "Bulevardi 40, 00120 Helsinki, Finland",
    description: "The only museum in Finland specializing in old European art, presenting collections from the 14th to the 19th century.",
    latitude: 60.1630,
    longitude: 24.9338,
    country: "Finland",
    region: "Helsinki",
    representativeImage: "https://www.kansallisgalleria.fi/assets/static/media/sinebrychoff-logo-en.525850.svg",
    permanentExhibitions: [
      {
        id: "sinebrychoff-collection",
        name: "Collection Highlights",
        title: "Sinebrychoff Collection",
        description: "Comprehensive collection of 1,295 Old Masters and European artworks from Sinebrychoff Art Museum (Finnish National Gallery).",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "sinebrychoff-collection.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "state-russian-museum",
    name_ko: "러시아 국립미술관",
    description_ko: "러시아 미술만을 전문으로 소장한 세계 최대의 미술관이다. 상트페테르부르크에 자리하며, 중세 이콘부터 일리야 레핀의 19세기 사실주의, 칸딘스키·말레비치의 전위미술까지 러시아 미술의 전 흐름을 아우른다.",
    slug: "state-russian-museum",
    name: "The State Russian Museum",
    location: "Inzhenernaya St, 4, St Petersburg, Russia",
    description: "The world's largest collection of Russian art.",
    latitude: 59.9386,
    longitude: 30.3323,
    country: "Russia",
    region: "St. Petersburg",
    representativeImage: "",
    permanentExhibitions: [
      {
        id: "rusmuseum-collection",
        name: "Iconography Collection",
        title: "Russian Museum Iconography",
        description: "Ancient Russian art and icons.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "rusmuseum-collection.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "tretyakov-gallery",
    description_ko: "러시아 미술만을 모은 세계 최고의 미술관으로, 모스크바에 자리한다. 상인 파벨 트레티야코프의 수집에서 비롯했으며, 중세 이콘부터 일리야 레핀의 사실주의 회화까지 러시아 미술의 정수를 소장한다.",
    name: "State Tretyakov Gallery",
    name_ko: "트레티야코프 미술관",
    city: "Moscow",
    country: "Russia",
    latitude: 55.7415,
    longitude: 37.6208,
    description: "The foremost depository of Russian fine art in the world.",
    representativeImage: "",
    permanentExhibitions: [
      {
        id: "tretyakov-collection",
        name: "Collection",
        title: "Tretyakov Gallery Collection",
        description: "A comprehensive collection of Russian art from the 11th to the early 20th century.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "tretyakov-wikidata.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "hermitage-museum",
    description_ko: "상트페테르부르크의 겨울궁전 등 여섯 채의 건물에 걸쳐 있는, 세계에서 가장 크고 오래된 미술관 가운데 하나다. 예카테리나 2세의 수집에서 출발해 회화·조각·고대 유물까지 300만 점이 넘는 소장품을 자랑한다. 화려한 궁전 내부 자체가 또 하나의 볼거리다.",
    name: "State Hermitage Museum",
    name_ko: "예르미타시 미술관",
    city: "Saint Petersburg",
    country: "Russia",
    latitude: 59.9398,
    longitude: 30.3146,
    description: "One of the largest and oldest museums in the world, holding over 3 million items.",
    representativeImage: "",
    permanentExhibitions: [
      {
        id: "hermitage-collection",
        name: "Highlights",
        title: "Hermitage Highlights",
        description: "A selection of masterpieces from the State Hermitage Museum.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "hermitage-highlights.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "pushkin-museum",
    description_ko: "모스크바 최대의 유럽 미술 박물관이다. 고대 유물의 모형부터 옛 거장 회화까지 두루 소장하며, 특히 모로조프와 슈킨이 모은 인상주의·후기인상주의 컬렉션으로 세계적 명성을 얻었다.",
    name: "The Pushkin State Museum of Fine Arts",
    name_ko: "푸시킨 미술관",
    city: "Moscow",
    country: "Russia",
    latitude: 55.7472,
    longitude: 37.6053,
    description: "The largest museum of European art in Moscow.",
    representativeImage: "",
    permanentExhibitions: [
      {
        id: "pushkin-collection",
        name: "Collection",
        title: "Pushkin Museum Collection",
        description: "A selection of paintings from the Pushkin Museum.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "pushkin-paintings.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "kremlin-museum",
    name_ko: "모스크바 크렘린 박물관",
    description_ko: "모스크바 크렘린 안에 자리한 국립 박물관으로, 러시아 차르의 보물을 소장한다. 대관식 예복과 왕관 같은 국가 보물, 금·은 세공품, 무기와 갑옷, 황실 마차 등 러시아 군주제의 화려한 유산을 보여 준다.",
    name: "Moscow Kremlin Museums",
    city: "Moscow",
    country: "Russia",
    latitude: 55.7520,
    longitude: 37.6175,
    description: "A major state-run museum in the Moscow Kremlin, housing unique collections of Russian state regalia, gold and silver ware, arms and armour, and carriages.",
    representativeImage: "",
    permanentExhibitions: [
      {
        id: "kremlin-collection",
        name: "Collection",
        title: "Moscow Kremlin Collection",
        description: "A selection of artifacts from the Moscow Kremlin Museums.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "kremlin-collection.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "topkapi-palace",
    description_ko: "약 400년간 오스만 제국 술탄이 머문 이스탄불의 궁전으로, 지금은 박물관으로 공개된다. 보스포루스 해협을 굽어보는 자리에서 황실의 보석과 도자, 필사본, 그리고 이슬람의 성유물을 소장한다.",
    name: "Topkapi Palace Museum",
    name_ko: "톱카프 궁전",
    city: "Istanbul",
    country: "Turkey",
    latitude: 41.0115,
    longitude: 28.9833,
    description: "The primary residence of the Ottoman sultans for nearly 400 years, now a museum housing Imperial collections of crystal, silver, manuscripts, and the Holy Relics.",
    representativeImage: "",
    permanentExhibitions: [
      {
        id: "topkapi-collection",
        name: "Imperial Treasury",
        title: "Treasures of Topkapi Palace",
        description: "A collection including the Imperial Treasury, Arms and Armour, Manuscripts, and Sacred Relics.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "topkapi-collection.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "hirschsprung-collection",
    description_ko: "담배 제조업자 하인리히 히르슈프룽이 모은 컬렉션을 토대로 한 코펜하겐의 미술관이다. 공원 속에 자리하며, 19세기부터 20세기 초까지 덴마크 회화의 황금기를 집약해 보여 준다.",
    slug: "hirschsprung",
    name: "Den Hirschsprungske Samling",
    name_ko: "히르슈프룽 컬렉션",
    location: "Stockholmsgade 20, 2100 København Ø, Denmark",
    description: "The Hirschsprung Collection is an art museum in Copenhagen, Denmark, located in a parkland setting in Østre Anlæg. It houses a large collection of Danish art from the 19th and early 20th centuries.",
    latitude: 55.6908,
    longitude: 12.5786,
    country: "Denmark",
    region: "Copenhagen",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Den_Hirschsprungske_Samling_seen_from_Stockholmsgade.jpg/1200px-Den_Hirschsprungske_Samling_seen_from_Stockholmsgade.jpg",
    permanentExhibitions: [
      {
        id: "hirschsprung-perm",
        name: "Collection",
        title: "The Collection",
        description: "A large collection of Danish art from the 19th and early 20th centuries, including works by P.S. Krøyer, Anna Ancher, and Vilhelm Hammershøi.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "hirschsprung-collection.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "louisiana-museum",
    description_ko: "코펜하겐 북쪽 외레순 해협을 굽어보는 자리에 들어선 스칸디나비아의 대표 현대미술관이다. 빼어난 건축과 조각 정원, 바다 풍광이 어우러진 곳으로, 근현대미술 컬렉션과 함께 미술관 자체가 하나의 명소로 사랑받는다.",
    slug: "louisiana",
    name: "Louisiana Museum of Modern Art",
    name_ko: "루이지애나 근대미술관",
    location: "Humlebæk, Denmark",
    description: "One of Scandinavia's most visited art museums, combining stunning architecture, landscaped gardens, and an exceptional collection of modern and contemporary art.",
    latitude: 55.9641,
    longitude: 12.5452,
    country: "Denmark",
    region: "Copenhagen",
    representativeImage: "https://archive.louisiana.dk/I/?v=%7B506ffea7-e574-4c3d-8ccb-fbafce360b70%7D&i=88348&b=2000&f=asset&bm=1",
    permanentExhibitions: [],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  // Seogwipo Museums
  {
    id: "lee-jung-seop-museum",
    slug: "lee-jung-seop-museum",
    name: "이중섭미술관",
    name_ko: "이중섭미술관",
    name_en: "Lee Jung-seob Art Museum",
    location: "제주특별자치도 서귀포시 이중섭로 27-3",
    location_en: "27-3 Lee Jung-seop-ro, Seogwipo, Jeju",
    description: "한국 근대미술의 거장 이중섭(1916-1956)이 피란 시절 거주한 서귀포에 2002년 건립된 미술관. 그의 대표작 〈황소〉를 비롯한 원화, 은지화, 엽서화 등을 소장하며, 인근 이중섭 거리와 함께 서귀포의 문화예술 중심지를 형성한다.",
    description_en: "Built in 2002 in Seogwipo, where the revered Korean modern master Lee Jung-seob lived as a refugee, this museum houses originals, silver-foil works, and postcard paintings including his iconic bull paintings.",
    latitude: 33.2458,
    longitude: 126.5649,
    country: "South Korea",
    region: "Jeju",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cf/Lee_Jung-seob_Museum.jpg/1280px-Lee_Jung-seob_Museum.jpg",
    permanentExhibitions: [
      { id: "ljs-collection", name: "이중섭 소장품", title: "이중섭 소장품", description: "이중섭의 원화, 은지화, 엽서화를 포함한 상설 컬렉션.", startDate: "Permanent", endDate: "Permanent", collectionFile: "lee-jung-seop-collection.json" }
    ],
    temporaryExhibitions: [
      {
        id: "jungseob-2026-archive4",
        title: "이중섭 아카이브 전시 4부: 1955-1956년",
        titleEn: "Lee Jung-seob Archive Exhibition Part 4: 1955–1956",
        description: "이중섭의 말년(1955-1956년)을 집중 조명하는 아카이브 연작 전시 4부. 대구와 서울을 오가며 활동하다 세상을 떠난 그의 마지막 시기 작품과 기록을 통해 생애 말년의 예술 세계를 재조명한다.",
        startDate: "2026-01-29",
        endDate: "2026-08-30",
        coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/exhibitions/covers/jungseob-2026-archive4.jpg",
        officialUrl: "http://culture.seogwipo.go.kr/jslee/",
        status: "ongoing"
      }
    ],
    pastExhibitions: []
  },
  {
    id: "gidang-art-museum",
    slug: "gidang-art-museum",
    name: "기당미술관",
    name_ko: "기당미술관",
    name_en: "Gidang Art Museum",
    location: "제주특별자치도 서귀포시 남성중로 153번길 15",
    location_en: "15 Namseongjung-ro 153beon-gil, Seogwipo, Jeju",
    description: "1987년 서귀포 출신 사업가 기당 강구범이 설립한 제주 최초의 사립 미술관. 제주 출신 화가 변시지의 작품 세계를 중심으로 국내외 현대미술 소장품을 전시하며, 서귀포 도심 속 아늑한 문화 거점으로 자리한다.",
    description_en: "Jeju's first private art museum, founded in 1987 by businessman Kang Gu-beom. Centered on the works of Jeju-born painter Byun Si-ji, it presents modern and contemporary art in a quiet cultural enclave in central Seogwipo.",
    latitude: 33.2447,
    longitude: 126.5518,
    country: "South Korea",
    region: "Jeju",
    representativeImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/exhibitions/covers/gidang-2026-daily.png",
    permanentExhibitions: [
      { id: "gidang-collection", name: "소장품", title: "기당 소장품", description: "변시지를 비롯한 근현대 회화·서예 소장품 상설전.", startDate: "Permanent", endDate: "Permanent", collectionFile: "gidang-collection.json" }
    ],
    temporaryExhibitions: [
      {
        id: "gidang-2026-daily",
        title: "소장품전 〈일상의 온도〉",
        titleEn: "Collection Exhibition: The Temperature of Daily Life",
        description: "기당미술관 소장품을 중심으로 우리 일상의 온도를 담은 작품들을 선보이는 소장품 기획전.",
        startDate: "2026-02-12",
        endDate: "2026-05-10",
        coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/exhibitions/covers/gidang-2026-daily.png",
        officialUrl: "http://culture.seogwipo.go.kr/gidang/",
        status: "ongoing"
      }
    ],
    pastExhibitions: []
  },
  {
    id: "soam-memorial-hall",
    name_ko: "소암기념관",
    description_ko: "한국 근대 서예의 대가 소암 현중화를 기리는 기념관이다. 제주 서귀포에 자리하며, 그의 서예 작품을 상설 전시해 제주 서예 문화의 거점 역할을 한다.",
    name: "Soam Memorial Hall",
    slug: "soam",
    location: "15, Soam-ro, Seogwipo-si, Jeju-do",
    description: "A memorial hall dedicated to Soam Hyun Joong-hwa, a master of modern calligraphy, exhibiting his calligraphic works.",
    latitude: 33.2405,
    longitude: 126.5802,
    country: "South Korea",
    region: "Jeju",
    representativeImage: "",
    permanentExhibitions: [
      { id: "soam-collection", name: "Permanent Collection", title: "Soam Collection", description: "Exhibition of Soam Hyun Joong-hwa's calligraphy masterpieces.", startDate: "Permanent", endDate: "Permanent", collectionFile: "soam-memorial-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "house-of-refuge",
    name_ko: "하우스 오브 레퓨지",
    description_ko: "버려진 건물을 되살려 만든 제주의 복합 문화공간이다. 미술과 음악, 패션, 다이닝이 한자리에 어우러진 공간으로 운영된다.",
    name: "House of Refuge",
    slug: "house-of-refuge",
    location: "735 Haso-ro, Aewol-eup, Jeju-si, Jeju-do",
    description: "A cultural complex in Jeju housed in a revitalized abandoned structure, featuring art, music, fashion, and dining.",
    latitude: 33.4352,
    longitude: 126.4166,
    country: "South Korea",
    region: "Jeju",
    representativeImage: "https://live.staticflickr.com/65535/51243914271_16e7e2578b.jpg",
    permanentExhibitions: [],
    temporaryExhibitions: [
      {
        id: "erick-oh-retrospective",
        name: "O: An Erick Oh Retrospective",
        title: "O: An Erick Oh Retrospective",
        description: "A large-scale media exhibition based on Erick Oh's animated work 'Opera' and other masterpieces.",
        startDate: "2024-04-25",
        endDate: "2024-12-31",
        collectionFile: "house-of-refuge-collection.json"
      }
    ],
    pastExhibitions: []
  },
  {
    id: "kim-tschang-yeul-art-museum",
    slug: "kim-tschang-yeul-art-museum",
    name: "제주도립 김창열미술관",
    name_en: "Kim Tschang-Yeul Art Museum Jeju",
    location: "제주특별자치도 제주시 한림읍 용금로 883-5",
    location_en: "883-5 Yonggeum-ro, Hallim-eup, Jeju-si, Jeju",
    description: "물방울 화가 김창열(1929-2021)의 작품 1200여 점을 소장한 도립 미술관. 2016년 개관. 프랑스에서 활동하며 물방울 회화를 평생 탐구한 그의 작업 세계를 상설 및 기획전으로 선보인다. 제주 저지예술인마을 인근에 위치한다.",
    description_en: "A provincial museum dedicated to 'waterdrop painter' Kim Tschang-yeul (1929–2021), housing over 1,200 of his works. Opened in 2016, it presents his lifetime exploration of waterdrop painting developed during his decades in France.",
    latitude: 33.3391,
    longitude: 126.2688,
    country: "South Korea",
    region: "Jeju",
    representativeImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/exhibitions/covers/kimtschangyeul-2026-waterstones.jpg",
    permanentExhibitions: [
      {
        id: "kimtschang-yeul-collection",
        name: "소장품",
        title: "김창열 소장품",
        description: "물방울 회화를 중심으로 한 김창열 작품 상설 소장품.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "kimtschang-yeul-collection-all.json"
      }
    ],
    temporaryExhibitions: [
      {
        id: "kimtschangyeul-2026-waterstones",
        title: "김창열과 한용진: 물방울과 돌",
        titleEn: "Kim Tschang-yeul & Han Yongjin: Waterdrops & Stones",
        description: "김창열의 물방울 회화와 조각가 한용진의 작품 15점을 함께 선보이는 2인전. 물방울과 돌이라는 대비되는 자연 소재를 통해 두 작가의 조형 언어를 대화시킨다.",
        startDate: "2026-03-24",
        endDate: "2026-06-14",
        coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/exhibitions/covers/kimtschangyeul-2026-waterstones.jpg",
        officialUrl: "https://kimtschang-yeul.jeju.go.kr/",
        status: "ongoing"
      },
      {
        id: "kimtschangyeul-2026-10years",
        title: "10/10: 미술관 10년의 선택",
        titleEn: "10/10: A Decade's Selection at the Museum",
        description: "개관 10주년을 기념하여 큐레이터가 엄선한 김창열 회화 10점을 소개하는 온라인 기획전.",
        startDate: "2026-02-10",
        endDate: "2026-12-31",
        coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/exhibitions/covers/kimtschangyeul-2026-10years.jpg",
        officialUrl: "https://kimtschang-yeul.jeju.go.kr/",
        status: "ongoing"
      }
    ],
    pastExhibitions: []
  }
  ,
  {
    id: "dumoak",
    name_ko: "김영갑갤러리 두모악",
    description_ko: "제주의 자연을 평생 카메라에 담은 사진가 김영갑을 기리는 갤러리다. 폐교를 고쳐 만든 '김영갑갤러리 두모악'은 제주 중산간의 들녘과 오름, 바람을 담은 그의 사진과 정원을 함께 품고 있다.",
    name: "Dumoak",
    slug: "dumoak",
    location: "Jeju, South Korea",
    description: "Online works imported from dumoak.co.kr (Kim Young-gap).",
    latitude: 33.385,
    longitude: 126.635,
    country: "South Korea",
    region: "Jeju",
    representativeImage: "",
    permanentExhibitions: [
      {
        id: "dumoak-collection",
        name: "Works",
        title: "작품",
        description: "Works imported from dumoak.co.kr.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "dumoak-kim-work-all.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "national-gallery-singapore",
    description_ko: "동남아시아 근현대미술을 세계에서 가장 폭넓게 소장한 미술관이다. 옛 대법원과 시청 건물을 개조해 2015년 문을 열었으며, 식민과 독립을 거친 이 지역 미술의 전개를 깊이 있게 보여 준다. 싱가포르와 동남아시아 작가들의 작품이 핵심을 이룬다.",
    slug: "national-gallery-singapore",
    name: "National Gallery Singapore",
    name_ko: "내셔널 갤러리 싱가포르",
    location: "Singapore",
    description: "The world's largest public collection of Singapore and Southeast Asian modern art.",
    latitude: 1.2905,
    longitude: 103.8519,
    country: "Singapore",
    region: "Singapore",
    representativeImage: "",
    permanentExhibitions: [
      {
        id: "ngs-collection-all",
        name: "Collection",
        title: "National Collection",
        description: "Complete digitized collection of the National Gallery Singapore.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "ngs-all.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "met-ny",
    description_ko: "1870년 설립된 미국 최대의 미술관으로, 5천 년에 걸친 전 세계 미술을 한곳에서 조망한다. 이집트에서 옮겨 와 통째로 복원한 덴두르 신전, 유럽 회화관, 미국 미술관 등 여러 부서가 200만 점이 넘는 소장품을 펼쳐 보인다. 센트럴파크 동편에 자리한 본관은 도시의 문화 중심지로 꼽힌다.",
    slug: "met-ny",
    name: "The Metropolitan Museum of Art",
    name_ko: "메트로폴리탄 미술관",
    location: "New York, USA",
    description: "The Met presents over 5,000 years of art from around the world for everyone to experience and enjoy.",
    latitude: 40.7794,
    longitude: -73.9632,
    country: "USA",
    region: "New York",
    representativeImage: "https://images.metmuseum.org/CRDImages/rl/web-large/LC-1975_1_065a-001.jpg",
    permanentExhibitions: [
      {
        id: "met-ny-collection",
        name: "Collection Highlights",
        title: "Collection Highlights",
        description: "A selection of paintings and masterpieces from The Met's vast collection.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "met-ny-collection.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "nga",
    description_ko: "미국 수도 워싱턴에 자리한 국립미술관으로, 금융가 앤드루 멜런의 기증으로 세워졌다. 미국에 있는 유일한 레오나르도 다 빈치 회화를 소장하며, 유럽과 미국 미술을 폭넓게 아우른다. 입장료 없이 공개한다.",
    slug: "nga",
    name: "National Gallery of Art",
    name_ko: "내셔널 갤러리 오브 아트",
    location: "Washington, D.C., USA",
    description: "The National Gallery of Art in Washington, D.C. with an open dataset (CC0) of collection metadata and published images.",
    latitude: 38.8913,
    longitude: -77.0199,
    country: "USA",
    region: "Washington, D.C.",
    representativeImage: "https://api.nga.gov/iiif/7b170a4c-9d44-475c-b294-cee6f43d88af/full/full/0/default.jpg",
    permanentExhibitions: [
      {
        id: "nga-collection",
        name: "The Collection",
        title: "The Collection",
        description: "A merged collection of paintings and downloadable drawings from the National Gallery of Art.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "nga-collection.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "smithsonian-american-art-museum",
    description_ko: "미국 미술만을 전문으로 하는, 세계에서 가장 폭넓은 미국 미술 컬렉션을 갖춘 미술관이다. 워싱턴에 자리하며, 식민기부터 동시대까지 미국 미술의 흐름을 두루 보여 준다.",
    slug: "smithsonian-american-art-museum",
    name: "Smithsonian American Art Museum",
    name_ko: "스미스소니언 미술관",
    location: "Washington, D.C.",
    description: "The Smithsonian American Art Museum (SAAM) is home to one of the largest and most inclusive collections of American art in the world.",
    latitude: 38.8979,
    longitude: -77.0232,
    country: "USA",
    region: "Washington D.C.",
    representativeImage: "https://ids.si.edu/ids/deliveryService?id=SAAM-2002.23_1&max=640",
    permanentExhibitions: [
      {
        id: "saam-paintings",
        name: "American Paintings & Drawings",
        title: "Paintings & Drawings (Full Collection)",
        description: "Comprehensive collection of paintings and drawings from the Smithsonian American Art Museum (SAAM) via Open Access Bulk Data.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "saam-paintings-full.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "smithsonian-asian-art",
    name_ko: "국립 아시아미술관",
    description_ko: "스미스소니언 산하의 아시아 미술 전문 박물관으로, 미국 수도 워싱턴에 자리한다. 프리어 갤러리와 새클러 갤러리로 이루어져 있으며, 동아시아·남아시아·중동의 미술을 폭넓게 소장한다.",
    slug: "smithsonian-asian-art",
    name: "National Museum of Asian Art",
    location: "Washington, D.C.",
    description: "The National Museum of Asian Art preserves, exhibits, and interprets Asian art in ways that deepen our understanding of Asia, America, and the world.",
    latitude: 38.8882,
    longitude: -77.0274,
    country: "USA",
    region: "Washington D.C.",
    representativeImage: "https://ids.si.edu/ids/deliveryService?id=FS-7539_06&max=640",
    permanentExhibitions: [
      {
        id: "si-asian-art-collection",
        name: "Asian Art Collection",
        title: "Asian Art (Paintings & Drawings)",
        description: "Selected paintings and drawings from the National Museum of Asian Art (Freer Gallery of Art and Arthur M. Sackler Gallery).",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "si-asian-art.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "smithsonian-national-portrait-gallery",
    name_ko: "스미스소니언 국립 초상화 미술관",
    description_ko: "미국의 역사를 그 시대를 만든 인물들의 초상으로 풀어내는 스미스소니언 산하의 미술관이다. 워싱턴에 자리하며, 역대 대통령의 공식 초상을 모은 전시로 특히 유명하다.",
    slug: "smithsonian-national-portrait-gallery",
    name: "National Portrait Gallery",
    location: "Washington, D.C.",
    description: "The National Portrait Gallery tells the history of America through individuals who have shaped its culture.",
    latitude: 38.8979,
    longitude: -77.0232,
    country: "USA",
    region: "Washington D.C.",
    representativeImage: "https://ids.si.edu/ids/deliveryService?id=NPG-NPG_2011_16&max=640",
    permanentExhibitions: [
      {
        id: "si-npg-collection",
        name: "Portrait Collection",
        title: "Portraits (Paintings, Drawings & Photographs)",
        description: "Selected portraits from the National Portrait Gallery collection.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "si-npg.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "moma-collection",
    description_ko: "1929년 문을 연 이래 근현대미술의 정전을 세워 온 미술관으로, '모마(MoMA)'라는 약칭으로 더 친숙하다. 반 고흐의 '별이 빛나는 밤', 피카소의 '아비뇽의 여인들', 앤디 워홀의 작품 등 20세기 미술사를 대표하는 걸작을 소장한다. 회화·조각뿐 아니라 사진·디자인·영화·건축까지 수집 영역을 넓혀 왔다.",
    slug: "museum-of-modern-art",
    cityCluster: "New York",
    name: "The Museum of Modern Art",
    name_ko: "뉴욕 근대미술관",
    location: "New York, USA",
    description: "The Museum of Modern Art (MoMA) plays a leading role in defining contemporary art culture.",
    latitude: 40.7614,
    longitude: -73.9776,
    country: "USA",
    region: "New York",
    representativeImage: "https://www.moma.org/media/W1siZiIsIjUyNzk1OSJdLFsicCIsImNvbnZlcnQiLCItcmVzaXplIDEwMjR4MTAyNFx1MDAzZSJdXQ.jpg?sha=5e9dcd73303fc973",
    permanentExhibitions: [
      {
        id: "moma-highlights",
        name: "Collection Highlights",
        title: "Collection Highlights (Pre-1850 to 2026)",
        description: "Paintings, Drawings & Sculptures from the MoMA collection.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "moma-collection.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "art-institute-of-chicago",
    description_ko: "1879년에 설립된 미국에서 가장 오래되고 규모가 큰 미술관 가운데 하나다. 쇠라의 '그랑드자트섬의 일요일 오후', 호퍼의 '나이트호크스', 우드의 '아메리칸 고딕' 등 미국인이 사랑하는 명화를 다수 소장한다. 인상주의와 후기인상주의 컬렉션도 미국 최고 수준으로 꼽힌다.",
    slug: "art-institute-of-chicago",
    name: "The Art Institute of Chicago",
    name_ko: "시카고 미술관",
    location: "Chicago, USA",
    description: "One of the oldest and largest art museums in the United States, founded in 1879.",
    latitude: 41.8796,
    longitude: -87.6237,
    country: "USA",
    region: "Chicago",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f8/Art_Institute_of_Chicago_%2851838662998%29.jpg/1200px-Art_Institute_of_Chicago_%2851838662998%29.jpg",
    permanentExhibitions: [
      {
        id: "aic-highlights",
        name: "Collection Highlights",
        title: "Collection Highlights (Paintings, Drawings, Photos)",
        description: "Highlights from the Art Institute of Chicago, featuring paintings, drawings, watercolors, and photography.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "aic-collection.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "getty",
    description_ko: "로스앤젤레스 언덕 위 게티 센터에 자리한 미술관으로, 석유 재벌 폴 게티의 수집품에서 출발했다. 리처드 마이어가 설계한 백색의 건축과 정원, 도시를 굽어보는 전망으로도 유명하다. 중세 채색 필사본부터 유럽 회화, 조각, 사진까지 폭넓은 컬렉션을 무료로 공개한다.",
    slug: "getty",
    name: "Getty Museum",
    name_ko: "J. 폴 게티 미술관",
    location: "Los Angeles, USA",
    description: "Paintings from the Getty Museum collection (via getty.edu public collection API).",
    latitude: 34.0780,
    longitude: -118.4741,
    country: "USA",
    region: "Los Angeles",
    representativeImage: "https://www.getty.edu/favicon.ico",
    permanentExhibitions: [
      {
        id: "getty-collection",
        name: "Paintings (With Images)",
        title: "Getty Collection (Paintings)",
        description: "Paintings with images from the Getty Museum collection, including flags for On View and Open Content.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "getty-collection.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "whitney-museum",
    description_ko: "20세기와 21세기 미국 미술에 집중하는 미술관으로, 조각가 거트루드 밴더빌트 휘트니의 컬렉션에서 출발했다. 에드워드 호퍼, 조지아 오키프 등 미국 근현대 작가의 작품을 폭넓게 소장한다. 동시대 미술의 현주소를 보여 주는 '휘트니 비엔날레'로도 잘 알려져 있다.",
    slug: "whitney",
    cityCluster: "New York",
    name: "Whitney Museum of American Art",
    name_ko: "휘트니 미술관",
    location: "New York, USA",
    description: "The Whitney Museum of American Art, known informally as the 'Whitney', houses a renowned collection of 20th- and 21st-century American art.",
    latitude: 40.7396,
    longitude: -74.0089,
    country: "USA",
    region: "New York",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c2/Whitney_Museum_of_American_Art_2015.jpg/1280px-Whitney_Museum_of_American_Art_2015.jpg",
    permanentExhibitions: [
      {
        id: "whitney-collection",
        name: "Whitney Collection",
        title: "Full Collection",
        description: "Comprehensive collection of American art from the 20th and 21st centuries. Includes Paintings, Drawings, Photographs, Video, Digital Art, and Film. Shows on-view status.",
        startDate: "Permanent",
        collectionFile: "whitney-collection.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "museo-frida-kahlo",
    name_ko: "프리다 칼로 미술관",
    description_ko: "멕시코 화가 프리다 칼로가 태어나고 생을 마감한 '푸른 집(라 카사 아술)'을 그대로 보존한 집 박물관이다. 멕시코시티 코요아칸에 자리하며, 그의 작품과 유품, 디에고 리베라와 함께한 삶의 흔적을 만날 수 있다.",
    slug: "museo-frida-kahlo",
    name: "Museo Frida Kahlo",
    location: "Mexico City, Mexico",
    description: "The Blue House (La Casa Azul) is the historic house museum and art museum dedicated to the life and work of Mexican artist Frida Kahlo. It is located in the Coyoacán borough of Mexico City.",
    latitude: 19.3551,
    longitude: -99.1624,
    country: "Mexico",
    region: "Mexico City",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/2/29/Museo_Frida_Kahlo.jpg",
    permanentExhibitions: [
      {
        id: "frida-timeline",
        name: "Life and Work",
        title: "Frida Kahlo: Life and Work",
        description: "A comprehensive timeline and collection of works by Frida Kahlo, displayed in her lifelong home.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "frida-timeline.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "agnsw",
    description_ko: "시드니 도심의 더 도메인 공원에 자리한 뉴사우스웨일스주의 대표 공립 미술관이다. 식민기 회화부터 원주민 미술, 유럽과 아시아 미술, 동시대 작품까지 폭넓게 소장하며, 시드니에서 가장 중요한 미술관으로 꼽힌다.",
    slug: "agnsw",
    name: "Art Gallery of New South Wales",
    name_ko: "뉴사우스웨일스 주 아트 갤러리",
    location: "Sydney, Australia",
    description: "The Art Gallery of New South Wales (AGNSW) is located in The Domain in Sydney, New South Wales, Australia. It is the most important public gallery in Sydney and one of the largest in Australia.",
    latitude: -33.8688,
    longitude: 151.2172,
    country: "Australia",
    region: "New South Wales",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/46/Art_Gallery_of_NSW_exterior_2021.jpg/640px-Art_Gallery_of_NSW_exterior_2021.jpg",
    permanentExhibitions: [
      {
        id: "agnsw-collection",
        name: "Collection",
        title: "Collection Highlights",
        description: "A selection of works currently on display at the Art Gallery of NSW, spanning Australian, Asian, and European art.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "agnsw-collection.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "ngv",
    description_ko: "1861년에 세워진 오스트레일리아에서 가장 오래되고 가장 많은 사람이 찾는 미술관이다. 멜버른에 자리하며, 유럽 고전 회화부터 오스트레일리아 미술과 동시대 미술까지 이 지역 최대 규모의 컬렉션을 자랑한다.",
    slug: "ngv",
    name: "National Gallery of Victoria",
    name_ko: "빅토리아 국립미술관",
    location: "Melbourne, Australia",
    description: "The National Gallery of Victoria (NGV) is the oldest and most visited gallery in Australia. Founded in 1861, it holds the most significant collection of art in the region.",
    latitude: -37.8226,
    longitude: 144.9689,
    country: "Australia",
    region: "Victoria",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/NGV_International_front.jpg/640px-NGV_International_front.jpg",
    permanentExhibitions: [
      {
        id: "ngv-collection",
        name: "Collection Highlights",
        title: "Collection Highlights (NGV)",
        description: "A comprehensive selection of artworks from the National Gallery of Victoria.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "ngv-collection.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "mca-australia",
    description_ko: "시드니 항만을 마주한 오스트레일리아의 대표 현대미술관이다. 오스트레일리아 작가들의 동시대 작품을 중심으로 국제적인 주요 작가의 작품도 함께 소장하며, 살아 있는 미술의 흐름을 보여 준다.",
    slug: "mca-australia",
    name: "Museum of Contemporary Art Australia",
    name_ko: "시드니 현대 미술관",
    location: "Sydney, Australia",
    description: "The Museum of Contemporary Art Australia (MCA) houses one of Australia's leading collections of contemporary art, with works by Australian artists and key international figures.",
    latitude: -33.8599,
    longitude: 151.2091,
    country: "Australia",
    region: "New South Wales",
    representativeImage: "https://www.mca.com.au/files/images/250218_MCA_001_WEB.width-800.jpegquality-70.jpg",
    permanentExhibitions: [
      {
        id: "mca-collection",
        name: "Collection Artworks",
        title: "MCA Collection Artworks",
        description: "Complete artworks dataset from MCA collection index, including detail metadata, medium-derived category, and on-display status.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "mca-collection.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "qagoma",
    name_ko: "퀸즐랜드 미술관·현대미술관",
    description_ko: "브리즈번에 자리한 오스트레일리아의 주요 공립 미술관으로, 두 개의 건물로 이루어져 있다. 오스트레일리아와 아시아, 태평양 지역의 근현대미술을 폭넓게 다루며, 특히 아시아·태평양 현대미술 트리엔날레로 잘 알려져 있다.",
    slug: "qagoma",
    name: "Queensland Art Gallery | Gallery of Modern Art",
    location: "Brisbane, Australia",
    description: "QAGOMA is one of Australia's leading public art institutions, presenting historical, modern, and contemporary art from Australia, Asia, and the Pacific.",
    latitude: -27.4728,
    longitude: 153.0170,
    country: "Australia",
    region: "Queensland",
    representativeImage: "https://collection.qagoma.qld.gov.au/sites/default/files/styles/wide/filesqagoma/assets/qagoma-building.jpg",
    permanentExhibitions: [
      {
        id: "qagoma-collection",
        name: "Collection (Assemblage, Painting, Print, Drawing)",
        title: "QAGOMA Collection",
        description: "Artworks with images from selected categories (Assemblage, Painting, Print, Drawing), including detailed metadata and on-display status.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "qagoma-collection.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "egyptian-museum-cairo",
    name_ko: "카이로 이집트 박물관",
    description_ko: "카이로 타흐리르 광장에 자리한, 세계에서 가장 중요한 고대 이집트 유물 컬렉션을 갖춘 박물관이다. 투탕카멘의 황금 마스크를 비롯해 여러 왕조에 걸친 미라와 조각, 파피루스 등 방대한 유물을 소장한다.",
    slug: "egyptian-museum-cairo",
    name: "The Egyptian Museum in Cairo",
    location: "Cairo, Egypt",
    description: "The Egyptian Museum in Cairo holds one of the world's most important collections of ancient Egyptian antiquities, with major artefacts spanning multiple dynasties.",
    latitude: 30.0478,
    longitude: 31.2336,
    country: "Egypt",
    region: "Cairo Governorate",
    representativeImage: "https://egyptianmuseumcairo.eg/wp-content/uploads/2023/01/egyptian-museum-cairo.jpg",
    permanentExhibitions: [
      { id: "egyptian-museum-cairo-collection", name: "Permanent Collection", title: "Permanent Collection", startDate: "Permanent", endDate: "Permanent", collectionFile: "egyptian-museum-cairo-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "nmec",
    name_ko: "이집트 문명 박물관",
    description_ko: "선사시대부터 근현대까지 이집트 문명 전체를 통사적으로 보여 주는 카이로의 박물관이다. 역대 파라오의 미라를 모신 '왕실 미라관'으로 특히 유명하다.",
    slug: "nmec",
    name: "National Museum of Egyptian Civilization",
    location: "Cairo, Egypt",
    description: "NMEC presents key objects from Egyptian civilization in a permanent collection spanning prehistory to modern periods.",
    latitude: 30.0060,
    longitude: 31.2488,
    country: "Egypt",
    region: "Cairo Governorate",
    representativeImage: "https://nmec.gov.eg/wp-content/uploads/2021/03/nmec.jpg",
    permanentExhibitions: [],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "gem",
    description_ko: "기자의 피라미드 인근에 자리한 세계 최대 규모의 고대 이집트 전문 박물관이다. 투탕카멘 유물 전체를 한자리에 모은 전시로 주목받으며, 이집트 문명의 보고로 꼽힌다.",
    slug: "gem",
    name: "Grand Egyptian Museum",
    name_ko: "대이집트 박물관",
    location: "Giza, Egypt",
    description: "The Grand Egyptian Museum presents major artefacts from ancient Egyptian civilization, including curated collection records from the official artefacts portal.",
    latitude: 29.9884,
    longitude: 31.1342,
    country: "Egypt",
    region: "Giza Governorate",
    representativeImage: "https://cdn.gem.eg/media/4129/gem9208-1.jpeg?center=0.43609022556391,0.473469387755102&mode=crop&width=1200&height=900",
    permanentExhibitions: [
      {
        id: "gem-collection",
        name: "Artefacts Collection",
        title: "GEM Artefacts Collection",
        description: "Artefact records from GEM collection API, including period/dynasty metadata and image assets.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "gem-collection.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "zeitz-mocaa",
    name_ko: "자이츠 아프리카 현대미술관",
    description_ko: "아프리카와 그 디아스포라의 동시대 미술에 집중하는 케이프타운의 미술관이다. 옛 곡물 저장고를 토머스 헤더윅이 극적으로 개조한 건축으로 유명하며, 아프리카 현대미술을 선도하는 거점으로 꼽힌다.",
    slug: "zeitz-mocaa",
    name: "Zeitz Museum of Contemporary Art Africa",
    location: "Cape Town, South Africa",
    description: "Zeitz MOCAA is a leading museum for contemporary art from Africa and its diaspora, with a permanent collection presented through rotating collection-based exhibitions.",
    latitude: -33.9077,
    longitude: 18.4206,
    country: "South Africa",
    region: "Western Cape",
    representativeImage: "https://zeitzmocaa.museum/wp-content/uploads/2024/03/APP_140401_27-scaled.jpg",
    permanentExhibitions: [],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "tepapa-collection",
    description_ko: "뉴질랜드의 국립박물관으로, 수도 웰링턴에 자리한다. 마오리 문화와 자연사, 뉴질랜드 미술을 아우르며, 마오리어로 '보물을 간직한 곳'이라는 이름처럼 이 나라의 정체성을 폭넓게 담아낸다.",
    slug: "tepapa",
    name: "Te Papa Tongarewa",
    name_ko: "뉴질랜드 테 파파 통가레와 박물관",
    location: "Wellington, New Zealand",
    description: "The Museum of New Zealand Te Papa Tongarewa is New Zealand's national museum, located in Wellington.",
    latitude: -41.2905,
    longitude: 174.7819,
    country: "New Zealand",
    region: "Wellington",
    representativeImage: "https://tepapa.govt.nz/assets/76067/1658185372-our-building_tile.jpeg",
    permanentExhibitions: [
      {
        id: "tepapa-paintings",
        name: "Collection Highlights",
        title: "Collection Highlights",
        description: "A comprehensive collection of paintings and drawings from the National Museum of New Zealand.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "tepapa-collection.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },

  // ─────────────────────────────────────────────────────────────────────────
  //  한국 주요 미술관 (2026 현재·예정 전시)
  // ─────────────────────────────────────────────────────────────────────────

  {
    id: "mmca-gwacheon",
    slug: "mmca-gwacheon",
    name: "국립현대미술관 과천관",
    name_ko: "국립현대미술관 과천",
    location: "과천, 경기도, 대한민국",
    description: "국립현대미술관 과천관은 경기도 과천에 위치한 국립현대미술관의 본관이다. 3,300㎡ 규모의 소장품 상설전시와 한국 근현대미술 대규모 기획전을 개최하며, 2026년 개관 40주년을 맞이한다.",
    latitude: 37.4397,
    longitude: 126.9874,
    country: "South Korea",
    region: "Gyeonggi",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2c/MMCA_Gwacheon_Korea.jpg/1280px-MMCA_Gwacheon_Korea.jpg",
    permanentExhibitions: [],
    temporaryExhibitions: [
      {
        id: "mmca-gwacheon-2026-waterlilies",
        title: "MMCA 해외 명작: 수련과 샹들리에",
        titleEn: "MMCA Masterworks: Water Lilies and Chandeliers",
        description: "국립현대미술관이 소장하고 있는 해외 명작을 소개하는 상설 전시.",
        startDate: "2025-10-02",
        endDate: "2027-01-03",
        coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/exhibitions/covers/mmca-202508210001995.gif",
        officialUrl: "https://www.mmca.go.kr/exhibitions/progressList.do",
        status: "ongoing"
      },
      {
        id: "mmca-gwacheon-2026-artbank",
        title: "미술은행 20주년 특별전 «돌아온 미래: 형태와 생각의 발현»",
        titleEn: "Art Bank 20th Anniversary: The Return of the Future",
        description: "미술은행 설립 20주년을 기념하는 특별전.",
        startDate: "2025-08-06",
        endDate: "2026-06-30",
        coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/exhibitions/covers/mmca-202508060001987.png",
        officialUrl: "https://www.mmca.go.kr/exhibitions/progressList.do",
        status: "ongoing"
      },
      {
        id: "mmca-gwacheon-2026-drawing",
        title: "특별수장고: 국립현대미술관 드로잉·일본 현대 판화 소장품",
        titleEn: "Special Storage: MMCA Drawings and Japanese Contemporary Prints",
        description: "국립현대미술관 드로잉과 일본 현대 판화 소장품을 공개하는 특별수장고 전시.",
        startDate: "2025-07-10",
        endDate: "2026-06-30",
        coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/exhibitions/covers/mmca-202507100001975.png",
        officialUrl: "https://www.mmca.go.kr/exhibitions/progressList.do",
        status: "ongoing"
      }
    ],
    pastExhibitions: []
  },

  {
    id: "leeum-museum",
    slug: "leeum-museum",
    name: "리움미술관",
    name_ko: "리움미술관",
    location: "서울, 대한민국",
    description: "리움미술관은 삼성문화재단이 운영하는 서울 용산구 한남동의 사립미술관이다. 마리오 보타, 장 누벨, 렘 쿨하스 등 세계적 건축가가 설계한 세 개 건물에 한국 고미술과 국내외 현대미술 컬렉션을 소장·전시한다.",
    latitude: 37.5380,
    longitude: 126.9980,
    country: "South Korea",
    region: "Seoul",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8b/Leeum_Museum_of_Art_Itaewon_Seoul_Korea.jpg/1280px-Leeum_Museum_of_Art_Itaewon_Seoul_Korea.jpg",
    permanentExhibitions: [],
    temporaryExhibitions: [
      {
        id: "leeum-2026-sehgal",
        title: "티노 세갈 개인전",
        titleEn: "Tino Sehgal",
        description: "독일-영국 작가 티노 세갈의 국내 첫 개인전. 훈련된 인터프리터가 관객과 직접 상호작용하는 '구성된 상황(Constructed Situations)'으로 유명하다. 25년 작업 세계의 신작과 리움 컬렉션을 활성화하는 라이브 아트를 선보인다.",
        startDate: "2026-03-03",
        endDate: "2026-06-28",
        coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/exhibitions/covers/leeum-2026-sehgal.jpg",
        officialUrl: "https://www.leeumhoam.org/leeum/exhibition",
        status: "ongoing"
      },
      {
        id: "leeum-2026-orozco",
        title: "가브리엘 오로스코: 정원",
        titleEn: "Gabriel Orozco: Garden",
        description: "멕시코 작가 가브리엘 오로스코의 신규 커미션 야외 작품. 리움 야외 데크를 자연 지향적이고 공공 접근 가능한 공간으로 재구성하는 설치 프로젝트.",
        startDate: "2026-04-03",
        endDate: "2026-09-30",
        coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/exhibitions/covers/leeum-2026-orozco.jpg",
        officialUrl: "https://www.leeumhoam.org/leeum/exhibition",
        status: "ongoing"
      },
      {
        id: "leeum-2026-koojunga",
        title: "구정아 개인전: OUSSS",
        titleEn: "Koo Jeong-a: OUSSS",
        description: "구정아의 국내 최대 개인전. 자기력·향기·빛 등 비가시적 에너지 흐름을 중심으로 하는 그의 실천이 M2 갤러리를 넘어 로비, 벽면, 고미술 컬렉션 인근 공간까지 확장되며 'OUSSS'라는 개념 세계를 구현한다.",
        startDate: "2026-09-05",
        endDate: "2026-12-27",
        coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/exhibitions/covers/leeum-2026-koojunga.jpg",
        officialUrl: "https://www.leeumhoam.org/leeum/exhibition",
        status: "upcoming"
      }
    ],
    pastExhibitions: []
  },

  {
    id: "apma",
    slug: "apma",
    name: "아모레퍼시픽 미술관",
    location: "서울, 대한민국",
    description: "아모레퍼시픽 미술관(APMA)은 서울 용산구 아모레퍼시픽 본사 건물에 위치한 기업 미술관이다. 데이비드 치퍼필드 설계의 건물 안에 한국 및 국제 현대미술 컬렉션을 소장하며 격 높은 기획전을 개최한다.",
    latitude: 37.5289,
    longitude: 126.9645,
    country: "South Korea",
    region: "Seoul",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0a/Amorepacific_Corporation_Headquarters.jpg/1280px-Amorepacific_Corporation_Headquarters.jpg",
    permanentExhibitions: [],
    temporaryExhibitions: [
      {
        id: "apma-2026-chapter5",
        title: "APMA, CHAPTER FIVE",
        titleEn: "APMA, Chapter Five — From the APMA Collection",
        description: "APMA 소장품 특별전 다섯 번째 시즌. 데이비드 호크니, 로즈 와일리, 키키 스미스, 갈라 포라스-킴, 백남준, 이불, 이우환, 구본창 등 40여 명의 작가 50여 점을 통해 한국·국제 현대미술의 주요 궤적을 조망한다.",
        startDate: "2026-04-01",
        endDate: "2026-08-02",
        coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/exhibitions/covers/apma-2026-chapter5.jpg",
        officialUrl: "https://apma.amorepacific.com/contents/exhibition/index.do",
        status: "ongoing"
      },
      {
        id: "apma-2026-bradford",
        title: "마크 브래드포드: KEEP WALKING",
        titleEn: "Mark Bradford: Keep Walking",
        description: "미국 작가 마크 브래드포드의 개인전. 상업 포스터, 신문지 등 일상 재료를 겹겹이 쌓아 추상적 화면을 구성하는 그의 작업 세계를 소개한다.",
        startDate: "2025-09-01",
        endDate: "2026-02-28",
        coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/exhibitions/covers/apma-2026-bradford.jpg",
        officialUrl: "https://apma.amorepacific.com/contents/exhibition/index.do",
        status: "ongoing"
      }
    ],
    pastExhibitions: []
  },

  {
    id: "d-museum",
    slug: "d-museum",
    name: "디뮤지엄",
    name_ko: "디뮤지엄",
    name_en: "D Museum",
    location: "서울특별시 성동구 왕십리로 83-21 (성수동)",
    location_en: "83-21 Wangsimni-ro, Seongdong-gu, Seoul (Seongsu)",
    description: "대림문화재단이 운영하는 성수동의 현대미술·라이프스타일 복합 뮤지엄. 한남동에서 성수로 이전 후 지역 거점과 맞물려 MZ세대 방문이 폭발적으로 증가했다. 몰입형 체험 전시와 라이프스타일 큐레이션이 특징.",
    latitude: 37.5474,
    longitude: 127.0575,
    country: "South Korea",
    region: "Seoul",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/Seoul_Seongsu-dong_D_museum.jpg/1280px-Seoul_Seongsu-dong_D_museum.jpg",
    permanentExhibitions: [],
    temporaryExhibitions: [
      {
        id: "dmuseum-2025-home2",
        title: "취향가옥 2: Art in Life, Life in Art 2",
        titleEn: "A House of Taste 2: Art in Life, Life in Art 2",
        description: "디뮤지엄 개관 10주년 기념 대형전. 약 600점의 작품이 영화감독·차 소믈리에·출판 에디터·패션 디렉터·건축가의 상상 속 집 5곳에 배치된다. 백남준의 'Apple Tree'(1995), 이우환, 하종현, 로이 리히텐슈타인, 올라퍼 엘리아슨 등 참여.",
        startDate: "2025-06-28",
        endDate: "2026-09-20",
        coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/exhibitions/covers/dmuseum-2025-home2.jpg",
        officialUrl: "http://www.daelimmuseum.org",
        status: "ongoing"
      }
    ],
    pastExhibitions: []
  },

  {
    id: "hoam-museum",
    slug: "hoam-museum",
    name: "호암미술관",
    name_ko: "호암미술관",
    location: "용인, 경기도, 대한민국",
    description: "호암미술관은 삼성문화재단이 운영하는 경기도 용인 에버랜드 인근의 미술관이다. 전통 정원 희원(熙苑) 속에 위치하며 한국 고미술과 현대미술을 아우르는 전시를 개최한다.",
    latitude: 37.2738,
    longitude: 127.2100,
    country: "South Korea",
    region: "Gyeonggi",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/70/Hoam_Art_Museum.jpg/1280px-Hoam_Art_Museum.jpg",
    permanentExhibitions: [],
    temporaryExhibitions: [
      {
        id: "hoam-2026-kimyunshin",
        title: "김윤신: 합이합일 분이분일",
        titleEn: "Kim Yun Shin: Combine to Make One, Divide to Make One",
        description: "한국 1세대 여성 조각가이자 기하 추상의 선구자 김윤신(1935-)의 첫 대규모 회고전. 60년 작업 세계를 아우르는 조각·회화·드로잉 약 100점. 자연 소재(나무·돌)를 통해 공간과 시간의 역동성을 표현한 작업을 조명한다. 호암미술관 최초의 한국 여성 작가 단독전.",
        startDate: "2026-03-17",
        endDate: "2026-06-28",
        coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/exhibitions/covers/hoam-2026-kimyunshin.jpg",
        officialUrl: "https://www.leeumhoam.org/hoam/exhibition",
        status: "ongoing"
      },
      {
        id: "hoam-2026-artspectrum",
        title: "아트 스펙트럼 2026",
        titleEn: "Art Spectrum 2026",
        description: "팔레 드 도쿄(유럽 최대 현대미술 센터)와 공동 기획한 아트 스펙트럼의 실험적 새 버전. 현대미술·영화·디자인·건축·실험음악을 아우르는 복합 프로그램으로, 처음으로 리움이 아닌 호암에서 개최된다.",
        startDate: "2026-09-01",
        endDate: "2026-12-31",
        coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/exhibitions/covers/hoam-2026-artspectrum.jpg",
        officialUrl: "https://www.leeumhoam.org/hoam/exhibition",
        status: "upcoming"
      }
    ],
    pastExhibitions: []
  },

  {
    id: "busan-museum-art",
    slug: "busan-museum-art",
    name: "부산시립미술관",
    name_ko: "부산광역시립미술관",
    location: "부산, 대한민국",
    description: "부산시립미술관은 부산광역시 해운대구에 위치한 공립미술관이다. 2024년 말부터 2026년 가을까지 본관 대규모 리노베이션 중이며, 이우환 공간은 계속 운영된다. 2026년 가을 재개관 특별 프로그램이 예정되어 있다.",
    latitude: 35.1795,
    longitude: 129.1268,
    country: "South Korea",
    region: "Busan",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d2/Busan_Museum_of_Art.jpg/1280px-Busan_Museum_of_Art.jpg",
    permanentExhibitions: [],
    temporaryExhibitions: [
      {
        id: "bma-leeufan-space",
        title: "이우환 공간 상설전",
        titleEn: "Lee Ufan Space — Permanent Exhibition",
        description: "이우환과 건축가 안도 다다오가 공동 설계한 세계 두 번째 이우환 개인 미술관. 1,400㎡ 3개 층에 한국 미니멀리즘 거장의 회화·조각이 상설 전시되며, 2025년 개관 10주년 특별 문화 행사가 열렸다.",
        startDate: "2015-04-01",
        endDate: "ongoing",
        coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/exhibitions/covers/bma-leeufan-space.png",
        officialUrl: "https://art.busan.go.kr",
        status: "ongoing"
      },
      {
        id: "bma-2026-looplab",
        title: "2026 LOOP LAB BUSAN",
        titleEn: "2026 LOOP LAB BUSAN",
        description: "부산시립미술관 이우환 공간에서 열리는 국제 실험예술 프로그램. 루프 형식의 영상·설치·퍼포먼스 작업을 중심으로 한 동시대 미술 프로젝트.",
        startDate: "2026-04-16",
        endDate: "2026-06-28",
        coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/exhibitions/covers/bma-2026-looplab.jpg",
        officialUrl: "https://art.busan.go.kr/tblTsite07Display/listFutureClient.nm",
        status: "upcoming"
      }
    ],
    pastExhibitions: []
  },

  {
    id: "jeju-museum-art",
    slug: "jmoa",
    name: "제주도립미술관",
    name_ko: "제주도립미술관",
    name_en: "Jeju Museum of Art",
    location: "제주특별자치도 제주시 1100로 2894-78",
    location_en: "2894-78 1100-ro, Jeju-si, Jeju-do",
    description: "제주도립미술관(JMOA)은 제주특별자치도가 운영하는 공립미술관으로 제주시 연동에 위치한다. 제주의 자연·역사·문화를 반영한 특색 있는 기획전과 제주 비엔날레를 운영한다.",
    latitude: 33.4993,
    longitude: 126.5319,
    country: "South Korea",
    region: "Jeju",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Jeju_Museum_of_Art.jpg/1280px-Jeju_Museum_of_Art.jpg",
    permanentExhibitions: [
      {
        id: "jmoa-collection",
        name: "Digital Collection",
        title: "디지털 소장품",
        description: "온라인 제주도립미술관 소장품. onlinejmoa.or.kr에서 수집한 판화·회화 컬렉션.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "jmoa-collection-all.json"
      }
    ],
    temporaryExhibitions: [
      {
        id: "jmoa-2025-ujumo",
        title: "제주도립미술관 중정프로젝트 《우주목(宇宙木)》",
        titleEn: "JMOA Courtyard Project: Cosmic Tree",
        description: "제주도립미술관 중정에 설치된 야외 설치 프로젝트. 제주의 자연과 우주를 잇는 거대한 나무 형상의 조형물을 통해 생명·공간·시간의 순환을 탐구한다.",
        startDate: "2025-08-05",
        endDate: "2026-05-10",
        coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/exhibitions/covers/jmoa-2026-ujumo.jpg",
        officialUrl: "https://www.jeju.go.kr/jmoa/show/current.htm",
        status: "ongoing"
      },
      {
        id: "jmoa-2026-boundary",
        title: "경계 위의 그녀",
        titleEn: "She Who Stands on the Boundary",
        description: "국내외 여성 작가 19명의 작품 68점으로 구성된 기획전. 쿠사마 야요이 등 참여. 자기 인식, 역사적 억압, 치유, 예술적 변용이라는 네 주제 섹션으로 구성되며, 한국 최초의 여성 미술가 나혜석(1896–1948)에게 마지막 섹션을 헌정한다.",
        startDate: "2026-04-07",
        endDate: "2026-08-02",
        coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/exhibitions/covers/jmoa-2026-boundary.png",
        officialUrl: "https://www.jeju.go.kr/jmoa/show/current.htm",
        status: "upcoming"
      },
      {
        id: "jmoa-2026-biennale",
        title: "2026 제5회 제주비엔날레",
        titleEn: "5th Jeju Biennale 2026",
        description: "주제 '허끄곡 모닥치곡 이야홍: 변용의 기술'. 19개국 70팀 참여. 제주도립미술관·관덕정·제주도청 옛 터·제주아트플랫폼 등 7개 분산 거점에서 개최. 제주의 돌 문화·신화·유배의 역사를 현대미술로 재해석한다.",
        startDate: "2026-08-25",
        endDate: "2026-11-15",
        coverImage: "",
        officialUrl: "https://www.jeju.go.kr/jmoa/",
        status: "upcoming"
      }
    ],
    pastExhibitions: []
  },

  {
    id: "hangaram-art-museum",
    slug: "hangaram-art-museum",
    name: "예술의전당 한가람미술관",
    name_en: "Seoul Arts Center Hangaram Art Museum",
    location: "서울특별시 서초구 남부순환로 2406",
    location_en: "2406 Nambusunhwan-ro, Seocho-gu, Seoul",
    description: "예술의전당 내 위치한 한가람미술관은 피카소, 달리, 모네 등 세계적 거장의 블록버스터 전시를 국내 최대 규모로 유치하는 복합 전시 공간이다. 연간 관람객 최상위권의 국내 최고 인기 전시 공간.",
    description_en: "Located within Seoul Arts Center, Hangaram Art Museum hosts world-class blockbuster exhibitions featuring masters like Picasso, Dalí, and Monet. Among Korea's top-attended exhibition spaces annually.",
    latitude: 37.4784,
    longitude: 127.0147,
    country: "South Korea",
    region: "Seoul",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Seoul_Arts_Center.jpg/1280px-Seoul_Arts_Center.jpg",
    floorPlan: "",
    permanentExhibitions: [],
    temporaryExhibitions: [
      {
        id: "hangaram-2026-botero",
        title: "페르난도 보테로: 형태의 미학",
        titleEn: "Fernando Botero: The Aesthetics of Form",
        description: "콜롬비아 출신 거장 페르난도 보테로의 국내 대규모 회고전. 특유의 풍만한 형태로 인간·동물·정물을 유머러스하게 재해석한 회화·조각 작품을 망라한다.",
        startDate: "2026-04-24",
        endDate: "2026-08-30",
        coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/exhibitions/covers/hangaram-2026-botero.jpg",
        officialUrl: "https://www.sac.or.kr/site/main/show/show_view?SN=76470",
        status: "ongoing"
      },
      {
        id: "hangaram-2026-spain",
        title: "스페인 미술 500년",
        titleEn: "500 Years of Spanish Art",
        description: "엘 그레코부터 피카소, 달리, 미로까지 스페인 미술 500년의 흐름을 조망하는 대형 기획전. 스페인 주요 미술관 소장품을 포함한 원화 100여 점을 선보인다.",
        startDate: "2026-09-22",
        endDate: "2027-01-20",
        coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/exhibitions/covers/hangaram-2026-botero.jpg",
        officialUrl: "https://www.sac.or.kr/site/main/show/show_view?SN=77679",
        status: "upcoming"
      }
    ],
    pastExhibitions: [],
    rooms: {}
  },

  {
    id: "ddp-gallery",
    slug: "ddp-gallery",
    name: "DDP (동대문디자인플라자)",
    name_ko: "동대문디자인플라자",
    name_en: "Dongdaemun Design Plaza",
    location: "서울특별시 중구 을지로 281",
    location_en: "281 Eulji-ro, Jung-gu, Seoul",
    description: "자하 하디드가 설계한 서울의 랜드마크 복합 문화 공간. 디자인·패션·예술이 교차하는 비정형 건축물로, 대형 상업 전시와 팝업 전시, 패션위크의 핵심 거점이다.",
    description_en: "Designed by Zaha Hadid, DDP is a landmark multiplex cultural space in Seoul where design, fashion, and art converge. A prime venue for large commercial exhibitions, pop-up shows, and fashion weeks.",
    latitude: 37.5665,
    longitude: 127.0094,
    country: "South Korea",
    region: "Seoul",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6a/DDP_dongdaemun_design_plaza_2014.jpg/1280px-DDP_dongdaemun_design_plaza_2014.jpg",
    floorPlan: "",
    permanentExhibitions: [],
    temporaryExhibitions: [
      {
        id: "ddp-2026-offcourse",
        title: "OFF COURSE CLUB",
        titleEn: "OFF COURSE CLUB",
        description: "DDP 전시.",
        startDate: "2026-04-03",
        endDate: "2026-04-26",
        coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/exhibitions/covers/ddp-2026-offcourse.jpg",
        officialUrl: "https://ddp.or.kr/index.html?menuno=240",
        status: "ongoing"
      },
      {
        id: "ddp-2026-btheb",
        title: "BtheB 뷰티기획전 <Beauty For All>",
        titleEn: "BtheB Beauty Exhibition: Beauty For All",
        description: "DDP 뮤지엄 뷰티 기획전.",
        startDate: "2026-02-28",
        endDate: "2026-06-07",
        coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/exhibitions/covers/ddp-2026-btheb.jpg",
        officialUrl: "https://ddp.or.kr/index.html?menuno=240",
        status: "ongoing"
      },
      {
        id: "ddp-2026-ultra",
        title: "울트라백화점 서울 Vol.2: 포스트 서브컬쳐",
        titleEn: "Ultra Department Store Seoul Vol.2: Post Subculture",
        description: "서브컬쳐를 주제로 한 DDP 기획전.",
        startDate: "2026-02-06",
        endDate: "2026-05-10",
        coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/exhibitions/covers/ddp-2026-ultra.jpg",
        officialUrl: "https://ddp.or.kr/index.html?menuno=240",
        status: "ongoing"
      }
    ],
    pastExhibitions: [],
    rooms: {}
  },

  {
    id: "daelim-museum",
    slug: "daelim-museum",
    name: "대림미술관",
    name_ko: "대림미술관",
    name_en: "Daelim Museum",
    location: "서울특별시 종로구 자하문로4길 21",
    location_en: "21 Jahamun-ro 4-gil, Jongno-gu, Seoul",
    description: "대림문화재단이 운영하는 서촌 인근의 디자인·사진·생활문화 전문 미술관. MZ세대 취향을 겨냥한 트렌디한 기획전으로 '전시의 대중화'를 이끌었다. 도시 한옥 공간을 활용한 특유의 전시 방식이 특징.",
    description_en: "Operated by the Daelim Cultural Foundation near Seochon, this design and photography museum pioneered the popularization of art exhibitions with MZ-generation-targeted shows in a hanok-inspired space.",
    latitude: 37.5788,
    longitude: 126.9722,
    country: "South Korea",
    region: "Seoul",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Gyeongbokgung_palace.jpg/1280px-Gyeongbokgung_palace.jpg",
    floorPlan: "",
    permanentExhibitions: [],
    temporaryExhibitions: [
      {
        id: "daelim-2025-tanaami-dpublic",
        title: "PUBLIC ART SPACE: 케이이치 타나아미",
        titleEn: "PUBLIC ART SPACE: Keiichi Tanaami",
        description: "D PUBLIC PROJECT의 야외 공공 미술 프로그램. 일본 팝아트의 거장 케이이치 타나아미(1936-)의 생동감 넘치는 환상적 이미지를 공공 공간에 설치한다.",
        startDate: "2025-07-22",
        endDate: "2026-09-20",
        coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/exhibitions/covers/daelim-2025-tanaami-dpublic.jpg",
        officialUrl: "https://www.daelimmuseum.org/exhibition/current",
        status: "ongoing"
      }
    ],
    pastExhibitions: [
      {
        id: "daelim-2024-tanaami",
        title: "Keiichi Tanaami: I'M THE ORIGIN",
        titleEn: "Keiichi Tanaami: I'M THE ORIGIN",
        startDate: "2024-12-14",
        endDate: "2025-06-29",
        coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/exhibitions/covers/daelim-tanaami.jpg",
        officialUrl: "https://www.daelimmuseum.org/exhibition/past",
        status: "past"
      },
      {
        id: "daelim-2025-petra",
        title: "페트라 콜린스: fangirl",
        titleEn: "Petra Collins: fangirl",
        startDate: "2025-08-29",
        endDate: "2026-02-15",
        coverImage: "",
        officialUrl: "https://www.daelimmuseum.org/exhibition/past",
        status: "past"
      }
    ],
    rooms: {}
  },

      {
    id: "groundseesaw",
    slug: "groundseesaw",
    name: "그라운드시소",
    name_en: "Ground Seesaw",
    location: "서울특별시 종로구 자하문로 35 (서촌점)",
    location_en: "35 Jahamun-ro, Jongno-gu, Seoul (Seocho)",
    description: "서촌·한남·성수에 위치한 복합 문화공간. 사진, 일러스트, 그래픽 아트 중심의 대중적인 기획전을 주로 개최하며 MZ세대 감성의 전시로 큰 인기를 얻고 있다.",
    latitude: 37.5842,
    longitude: 126.9666,
    country: "South Korea",
    region: "Seoul",
    representativeImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/exhibitions/covers/groundseesaw-2026-max.jpg",
    permanentExhibitions: [],
    temporaryExhibitions: [
      {
        id: "groundseesaw-2026-max",
        title: "맥스 시덴토프 개인전",
        titleEn: "Max Siedentopf: NOT SERIOUS",
        description: "독일 출신 사진작가 겸 감독 맥스 시덴토프의 국내 첫 개인전. 유머와 부조리함으로 가득한 그의 작업 세계를 통해 일상과 예술의 경계를 탐구한다.",
        startDate: "2026-03-27",
        endDate: "2026-08-30",
        coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/exhibitions/covers/groundseesaw-2026-max.jpg",
        officialUrl: "https://www.groundseesaw.co.kr",
        status: "ongoing"
      },
      {
        id: "groundseesaw-2026-sungryul",
        title: "성률 기획전: 여름을 닮은 우리",
        titleEn: "Seongryul: Summer Like Us",
        description: "그라운드시소 한남점 기획전. 한국 일러스트레이터 성률의 감성적 작품 세계를 선보이는 기획전.",
        startDate: "2026-04-30",
        endDate: "2026-09-27",
        coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/exhibitions/covers/groundseesaw-2026-sungryul.jpg",
        officialUrl: "https://www.groundseesaw.co.kr",
        status: "upcoming"
      },
      {
        id: "groundseesaw-2026-roomforwonder",
        title: "룸 포 원더: 상상의 문을 열다",
        titleEn: "Room for Wonder: Open the Door to Imagination",
        description: "그라운드시소 성수 이스트관의 몰입형 복합 전시. 동화적 세계관과 인터랙티브 설치로 구성된 대형 체험전이다.",
        startDate: "2025-12-19",
        endDate: "2026-06-07",
        coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/exhibitions/covers/groundseesaw-2026-roomforwonder.jpg",
        officialUrl: "https://www.groundseesaw.co.kr",
        status: "ongoing"
      }
    ],
    pastExhibitions: [
      {
        id: "groundseesaw-2025-himuro",
        title: "히무로 유리: 오늘의 기쁨",
        titleEn: "Himuro Yuri: Today's Joy",
        startDate: "2025-10-03",
        endDate: "2026-04-04",
        coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/exhibitions/covers/groundseesaw-2026-yoru.jpg",
        officialUrl: "https://www.groundseesaw.co.kr",
        status: "past"
      }
    ],
    rooms: {}
  },

  {
    id: "jeju-contemporary-art-museum",
    slug: "jeju-contemporary-art-museum",
    name: "제주현대미술관",
    name_en: "Jeju Museum of Contemporary Art",
    location: "제주특별자치도 제주시 한경면 저지리 2114-63",
    location_en: "2114-63 Jeoji-ri, Hangyeong-myeon, Jeju-si, Jeju",
    description: "제주 한경면 저지예술인마을 내 위치한 도립 현대미술관. 제주와 국내외 현대미술 작가의 기획전을 개최하며, 야외 조각공원과 공공수장고를 함께 운영한다. 자연 속 미술관 경험을 제공하는 제주 서부의 대표 문화기관이다.",
    description_en: "A provincial museum of contemporary art located in the Jeoji Artists' Village in Hangyeong, western Jeju. It presents changing exhibitions by Korean and international artists alongside an outdoor sculpture park and public art storage.",
    latitude: 33.3403,
    longitude: 126.2663,
    country: "South Korea",
    region: "Jeju",
    representativeImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/exhibitions/covers/jejumodern-2026-kimheungsoo.jpg",
    permanentExhibitions: [],
    temporaryExhibitions: [
      {
        id: "jejumodern-2026-kimheungsoo",
        title: "김흥수: 어디서 본 듯한",
        titleEn: "Kim Heung-soo: Familiar Yet Strange",
        description: "한국 작가 김흥수의 개인전.",
        startDate: "2026-04-03",
        endDate: "2026-10-25",
        coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/exhibitions/covers/jejumodern-2026-kimheungsoo.jpg",
        officialUrl: "https://www.jeju.go.kr/jejumuseum/index.htm",
        status: "ongoing"
      },
      {
        id: "jejumodern-2026-parkhanna",
        title: "박한나: 태양의 소실점에서",
        titleEn: "Park Han-na: At the Vanishing Point of the Sun",
        description: "한국 작가 박한나의 개인전.",
        startDate: "2026-03-24",
        endDate: "2026-09-13",
        coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/exhibitions/covers/jejumodern-2026-parkhanna.jpg",
        officialUrl: "https://www.jeju.go.kr/jejumuseum/index.htm",
        status: "ongoing"
      },
      {
        id: "jejumodern-2026-parkkwangjin",
        title: "박광진: 형상, 시가 되다",
        titleEn: "Park Kwang-jin: Form Becomes Poetry",
        description: "한국 작가 박광진의 개인전.",
        startDate: "2026-03-06",
        endDate: "2026-11-01",
        coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/exhibitions/covers/jejumodern-2026-parkkwangjin.jpg",
        officialUrl: "https://www.jeju.go.kr/jejumuseum/index.htm",
        status: "ongoing"
      },
      {
        id: "jejumodern-2026-mediaart",
        title: "공공수장고 미디어아트: 해와 달의 노래",
        titleEn: "Public Archive Media Art: Song of Sun and Moon",
        description: "제주현대미술관 공공수장고 연계 미디어아트 전시.",
        startDate: "2026-03-17",
        endDate: "2026-05-31",
        coverImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/exhibitions/covers/jejumodern-2026-mediaart.jpg",
        officialUrl: "https://www.jeju.go.kr/jejumuseum/index.htm",
        status: "ongoing"
      }
    ],
    pastExhibitions: []
  },

  {
    id: "fitzwilliam",
    slug: "fitzwilliam",
    name_ko: "피츠윌리엄 박물관",
    name: "The Fitzwilliam Museum",
    location: "Cambridge, United Kingdom",
    description_ko: "케임브리지 대학교의 미술·고고학 박물관으로, 1816년 피츠윌리엄 자작의 유증으로 문을 열었다. 거장들의 회화와 드로잉, 판화, 세밀화를 폭넓게 소장하며, 유럽 르네상스부터 19세기까지의 거장 회화가 특히 충실하다.",
    description: "The Fitzwilliam Museum is the art and antiquities museum of the University of Cambridge, founded in 1816. Its Paintings, Drawings and Prints department holds an exceptional collection of European old-master paintings, drawings, prints, and portrait miniatures.",
    latitude: 52.2002,
    longitude: 0.1196,
    country: "United Kingdom",
    region: "England",
    representativeImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/fitzwilliam-collection/object-1027-b66b667c-imageUrl.webp",
    permanentExhibitions: [
      {
        id: "fitzwilliam-collection",
        name: "Paintings, Drawings & Prints",
        name_en: "Paintings, Drawings & Prints",
        title: "The Fitzwilliam Museum — Paintings, Drawings & Prints",
        title_en: "The Fitzwilliam Museum — Paintings, Drawings & Prints",
        description: "3,830점 — 회화 전체 + 드로잉·판화·사진. 작가·연도·재료 메타데이터 포함.",
        description_en: "3,830 works — all paintings plus drawings, prints and photographs.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "fitzwilliam-collection.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "whitechapel",
    name_ko: "화이트채플 갤러리",
    name: "Whitechapel Gallery",
    city: "London",
    country: "United Kingdom",
    latitude: 51.5159,
    longitude: -0.0726,
    description_ko: "런던 이스트엔드의 화이트채플 갤러리. 상설 소장품을 두지 않는 쿤스트할레로, 작가들이 기증한 에디션 판화·사진 컬렉션을 운영한다.",
    description: "A kunsthalle in London's East End with no permanent collection; its artist-editions programme features limited-edition prints and photographs donated by major artists.",
    representativeImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/whitechapel-collection/whitechapel-15362827288961-c62b4d25-imageUrl.webp",
    permanentExhibitions: [
      { id: "whitechapel-collection", name: "Editions", name_en: "Editions", title: "Whitechapel Gallery — Artist Editions", title_en: "Whitechapel Gallery — Artist Editions", description: "156점의 작가 에디션 — 판화·사진 중심 (Kentridge·Kiki Smith·Thomas Ruff 등).", description_en: "156 artist editions — prints and photographs by Kentridge, Kiki Smith, Thomas Ruff, and others.", startDate: "Permanent", endDate: "Permanent", collectionFile: "whitechapel-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "ashmolean",
    name_ko: "애슈몰린 박물관",
    name: "Ashmolean Museum",
    city: "Oxford",
    country: "United Kingdom",
    latitude: 51.7556,
    longitude: -1.2602,
    description_ko: "옥스퍼드 대학의 애슈몰린 박물관. 1683년 문을 연 세계 최초의 공공 박물관으로, 동서양 회화와 라파엘로·터너의 드로잉을 아우른다.",
    description: "Oxford University's Ashmolean, the world's first public museum (opened 1683), spanning Western and Eastern painting and drawings by Raphael and Turner.",
    representativeImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/ashmolean-collection/90589-fb75c7d7-imageUrl.webp",
    permanentExhibitions: [
      { id: "ashmolean-collection", name: "Collection", name_en: "Collection", title: "Ashmolean Museum — Collection", title_en: "Ashmolean Museum — Collection", description: "2,542점 — 회화(2,505) + 전시 중 드로잉·판화. 동서양 회화를 아우른다. (상아·에나멜 미니어쳐 218점 제외)", description_en: "2,542 works — 2,505 paintings plus on-display drawings and prints, spanning Western and Eastern art (218 ivory/enamel miniatures excluded).", startDate: "Permanent", endDate: "Permanent", collectionFile: "ashmolean-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "k20-k21",
    name_ko: "노르트라인베스트팔렌 미술관 (K20/K21)",
    name: "Kunstsammlung NRW (K20/K21)",
    city: "Düsseldorf",
    country: "Germany",
    latitude: 51.2277,
    longitude: 6.7735,
    description_ko: "뒤셀도르프의 노르트라인베스트팔렌 미술관. 20세기 모더니즘(K20)과 동시대 미술(K21)을 나눠 선보이며 파울 클레 컬렉션으로 이름났다.",
    description: "Düsseldorf's Kunstsammlung NRW, split between 20th-century modernism (K20) and contemporary art (K21), renowned for its Paul Klee holdings.",
    representativeImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/k20-k21-collection/156-e3bc6b4f-imageUrl.webp",
    permanentExhibitions: [
      { id: "k20-k21-collection", name: "Collection", name_en: "Collection", title: "Kunstsammlung NRW — Collection", title_en: "Kunstsammlung NRW — Collection", description: "309점의 평면 컬렉션 (회화·사진·드로잉·콜라주·판화·영상).", description_en: "309 flat works — painting, photography, drawing, collage, print, video.", startDate: "Permanent", endDate: "Permanent", collectionFile: "k20-k21-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "folkwang",
    name_ko: "폴크방 미술관",
    name: "Museum Folkwang",
    city: "Essen",
    country: "Germany",
    latitude: 51.4350,
    longitude: 7.0073,
    description_ko: "에센의 폴크방 미술관. 인상주의·표현주의 회화와 19세기 이후 사진을 폭넓게 소장한다.",
    description: "Essen's Museum Folkwang, holding Impressionist and Expressionist painting alongside a deep photography collection from the 19th century onward.",
    representativeImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/folkwang-collection/folkwang-201-6b3737b2-imageUrl.webp",
    permanentExhibitions: [
      { id: "folkwang-collection", name: "Collection", name_en: "Collection", title: "Museum Folkwang — Collection", title_en: "Museum Folkwang — Collection", description: "501점의 평면 컬렉션 (사진·판화·드로잉).", description_en: "501 flat works — photographs, prints, and drawings.", startDate: "Permanent", endDate: "Permanent", collectionFile: "folkwang-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "astrup-fearnley",
    name_ko: "아스트룹 피언리 미술관",
    name: "Astrup Fearnley Museet",
    city: "Oslo",
    country: "Norway",
    latitude: 59.9027,
    longitude: 10.7197,
    description_ko: "오슬로 튀브홀멘 해변에 자리한 사립 현대미술관. 렌초 피아노가 설계한 건물에 제프 쿤스, 데이미언 허스트, 안젤름 키퍼 등 국제 현대미술을 소장한다.",
    description: "A private contemporary-art museum on Oslo's Tjuvholmen waterfront, in a Renzo Piano-designed building, holding international contemporary art including Jeff Koons, Damien Hirst, and Anselm Kiefer.",
    representativeImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/astrup-fearnley-collection/1851-9034325e-imageUrl.webp",
    permanentExhibitions: [
      { id: "astrup-fearnley-collection", name: "Collection", name_en: "Collection", title: "Astrup Fearnley Museet — Collection", title_en: "Astrup Fearnley Museet — Collection", description: "282점의 평면 컬렉션 — 회화·사진·드로잉·영상.", description_en: "282 flat works — painting, photography, drawing, and video.", startDate: "Permanent", endDate: "Permanent", collectionFile: "astrup-fearnley-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "ngi-reykjavik",
    name_ko: "아이슬란드 국립미술관",
    name: "National Gallery of Iceland",
    city: "Reykjavik",
    country: "Iceland",
    latitude: 64.1454,
    longitude: -21.9405,
    description_ko: "레이캬비크 도심 호숫가에 자리한 아이슬란드 국립미술관. 아우스그림뮈르 욘손을 비롯한 19~20세기 아이슬란드 회화를 중심으로 소장한다.",
    description: "Iceland's national art museum beside the Reykjavik city pond, centered on 19th–20th-century Icelandic painting including Ásgrímur Jónsson.",
    representativeImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/ngi-reykjavik-collection/liaj-572-360-82214466-imageUrl.webp",
    permanentExhibitions: [
      { id: "ngi-reykjavik-collection", name: "Collection", name_en: "Collection", title: "National Gallery of Iceland — Collection", title_en: "National Gallery of Iceland — Collection", description: "305점의 평면 컬렉션 — 회화·드로잉·판화·사진.", description_en: "305 flat works — painting, drawing, print, and photography.", startDate: "Permanent", endDate: "Permanent", collectionFile: "ngi-reykjavik-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "foam-amsterdam",
    name_ko: "포암 사진미술관",
    name: "Foam Photography Museum",
    city: "Amsterdam",
    country: "Netherlands",
    latitude: 52.364,
    longitude: 4.8923,
    description_ko: "암스테르담 케이저르스흐라흐트 운하변에 자리한 동시대 사진 전문 미술관으로, 신진과 거장의 기획전으로 이름났으며 약 170점 규모의 포암 컬렉션을 소장하고 있다.",
    description: "A leading contemporary photography museum on Amsterdam's Keizersgracht canal, holding the Foam Collection of around 170 photographs alongside its renowned rotating exhibitions of emerging and established image-makers.",
    representativeImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/foam-amsterdam-collection/0790becc-53f5-4af3-8e7f-b10bbaa9674c-0269a455-imageUrl.webp",
    permanentExhibitions: [
      { id: "foam-amsterdam-collection", name: "Collection", name_en: "Collection", title: "Foam — Collection", title_en: "Foam — Collection", description: "153점의 사진 컬렉션 (포암 컬렉션).", description_en: "153 photographs from the Foam Collection.", startDate: "Permanent", endDate: "Permanent", collectionFile: "foam-amsterdam-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "garage-moscow",
    name_ko: "가라지 현대미술관",
    name: "Garage Museum of Contemporary Art",
    city: "Moscow",
    country: "Russia",
    latitude: 55.728,
    longitude: 37.6014,
    description_ko: "2008년 문을 연 러시아의 대표적인 현대미술 기관으로, 고리키 공원 안 렘 콜하스가 리모델링한 소비에트 시절 건물에 자리한다.",
    description: "Russia's leading institution for contemporary art and culture, founded in 2008 and housed in a Rem Koolhaas-designed pavilion in Moscow's Gorky Park.",
    representativeImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/garage-moscow-collection/CT45-9255c550-imageUrl.webp",
    permanentExhibitions: [
      { id: "garage-moscow-collection", name: "Collection", name_en: "Collection", title: "Garage — Collection", title_en: "Garage — Collection", description: "100점의 평면 컬렉션 — 회화·영상·사진.", description_en: "100 flat works — painting, video, and photography.", startDate: "Permanent", endDate: "Permanent", collectionFile: "garage-moscow-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "museum-kampa",
    name_ko: "캄파 미술관",
    name: "Museum Kampa",
    city: "Prague",
    country: "Czech Republic",
    latitude: 50.0858,
    longitude: 14.4083,
    description_ko: "얀과 메다 믈라데크 부부가 설립한 프라하 캄파섬의 현대미술관으로, 프란티셰크 쿠프카와 오토 구트프로인트를 비롯한 중부 유럽 모더니즘 컬렉션을 중심으로 한다.",
    description: "A Prague modern-art museum on Kampa Island founded by Jan and Meda Mládek, centred on Central European modernism and the works of František Kupka and Otto Gutfreund.",
    representativeImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/museum-kampa-collection/66680835-fa81b59a-imageUrl.webp",
    permanentExhibitions: [
      { id: "museum-kampa-collection", name: "Collection", name_en: "Collection", title: "Museum Kampa — Collection", title_en: "Museum Kampa — Collection", description: "326점의 평면 컬렉션 — 드로잉·판화 중심 (중부 유럽 모더니즘).", description_en: "326 flat works — chiefly drawings and prints (Central European modernism).", startDate: "Permanent", endDate: "Permanent", collectionFile: "museum-kampa-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "boijmans",
    name_ko: "보이만스 판뵈닝언 미술관",
    name: "Museum Boijmans Van Beuningen",
    city: "Rotterdam",
    country: "Netherlands",
    latitude: 51.9144,
    longitude: 4.4722,
    description_ko: "로테르담에 자리한 네덜란드에서 가장 오래되고 폭넓은 컬렉션을 자랑하는 미술관으로, 보스와 브뤼헐, 렘브란트의 걸작부터 초현실주의와 동시대 미술까지 아우른다.",
    description: "One of the Netherlands' oldest and most wide-ranging art museums in Rotterdam, holding masterpieces from Bosch, Bruegel and Rembrandt through to Surrealism and contemporary art.",
    representativeImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/boijmans-collection/60832-b6e7bdcd-imageUrl.webp",
    permanentExhibitions: [
      { id: "boijmans-collection", name: "Collection", name_en: "Collection", title: "Museum Boijmans Van Beuningen — Collection", title_en: "Museum Boijmans Van Beuningen — Collection", description: "9,574점 — 드로잉5,499·판화1,911·회화1,449·사진715. 흑백 복제판화·플레이스홀더 정리.", description_en: "9,574 works — drawings, prints, paintings and photographs (B&W reproductive prints and placeholders curated out).", startDate: "Permanent", endDate: "Permanent", collectionFile: "boijmans-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "ngi-dublin",
    name_ko: "아일랜드 국립미술관",
    name: "National Gallery of Ireland",
    city: "Dublin",
    country: "Ireland",
    latitude: 53.3408,
    longitude: -6.2522,
    description_ko: "더블린 메리언 광장에 자리한 아일랜드 국립미술관으로, 카라바조의 '그리스도의 체포'를 비롯한 유럽·아일랜드 미술 국가 컬렉션을 소장한다.",
    description: "Ireland's national art museum on Merrion Square in Dublin, home to the national collection of European and Irish fine art including Caravaggio's The Taking of Christ.",
    representativeImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/ngi-dublin-collection/21-84fda157-imageUrl.webp",
    permanentExhibitions: [
      { id: "ngi-dublin-collection", name: "Collection", name_en: "Collection", title: "National Gallery of Ireland — Collection", title_en: "National Gallery of Ireland — Collection", description: "1,947점 — 회화·드로잉·판화 (유럽·아일랜드 미술; 풀해상도 가능분만).", description_en: "1,947 works — paintings, drawings, and prints (European and Irish art; full-resolution images only).", startDate: "Permanent", endDate: "Permanent", collectionFile: "ngi-dublin-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "hungarian-ng",
    name_ko: "헝가리 국립미술관",
    name: "Hungarian National Gallery",
    city: "Budapest",
    country: "Hungary",
    latitude: 47.496,
    longitude: 19.0399,
    description_ko: "부다 왕궁 안에 자리한 헝가리 국립미술관은 중세부터 현대까지 헝가리 미술을 가장 폭넓게 아우르는 컬렉션을 소장하고 있다.",
    description: "Housed in Buda Castle, the Hungarian National Gallery holds the largest collection of Hungarian art from the medieval period to the present day.",
    representativeImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/hungarian-ng-collection/19-a202a7ae-imageUrl.webp",
    permanentExhibitions: [
      { id: "hungarian-ng-collection", name: "Collection", name_en: "Collection", title: "Hungarian National Gallery — Collection", title_en: "Hungarian National Gallery — Collection", description: "10,767점 — 회화·드로잉·판화·사진. 중세부터 현대까지 헝가리 미술.", description_en: "10,767 works — paintings, drawings, prints and photographs spanning Hungarian art.", startDate: "Permanent", endDate: "Permanent", collectionFile: "hungarian-ng-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "sng-bratislava",
    name_ko: "슬로바키아 국립미술관",
    name: "Slovak National Gallery",
    city: "Bratislava",
    country: "Slovakia",
    latitude: 48.1408,
    longitude: 17.1093,
    description_ko: "브라티슬라바 다뉴브 강변에 자리한 슬로바키아의 국립 중앙 미술관으로, 고딕 시대부터 현대까지 슬로바키아와 유럽 미술을 아우르는 국내 최대 컬렉션을 소장하고 있다.",
    description: "Slovakia's central state gallery on the Danube embankment in Bratislava, holding the country's largest collection of Slovak and European art from the Gothic era to the present.",
    representativeImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/sng-bratislava-collection/SVK:SNG.DO_1117-2aeb8343-imageUrl.webp",
    permanentExhibitions: [
      { id: "sng-bratislava-collection", name: "Collection", name_en: "Collection", title: "Slovak National Gallery — Collection", title_en: "Slovak National Gallery — Collection", description: "14,395점 — 회화·판화·드로잉 (슬로바키아·중유럽 미술).", description_en: "14,395 works — paintings, prints and drawings (Slovak and Central European art).", startDate: "Permanent", endDate: "Permanent", collectionFile: "sng-bratislava-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "moderna-museet",
    name_ko: "모데르나 미술관",
    name: "Moderna Museet",
    city: "Stockholm",
    country: "Sweden",
    latitude: 59.3257,
    longitude: 18.0838,
    description_ko: "스톡홀름 셰프스홀멘 섬에 자리한 스웨덴 국립 근현대미술관으로, 20세기와 21세기 회화·사진·조각·영상을 아우르는 대규모 컬렉션을 소장하고 있다.",
    description: "Sweden's national museum of modern and contemporary art on the island of Skeppsholmen in Stockholm, holding a major collection of 20th- and 21st-century painting, photography, sculpture and film.",
    representativeImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/moderna-museet-collection/123855-855ff327-imageUrl.webp",
    permanentExhibitions: [
      { id: "moderna-museet-collection", name: "Collection", name_en: "Collection", title: "Moderna Museet — Collection", title_en: "Moderna Museet — Collection", description: "37,441점 — 사진·드로잉·판화·회화·영상 (스웨덴 근현대미술).", description_en: "21,446 works — drawings, prints, paintings, photographs and video (Swedish modern and contemporary art; low-value photos curated).", startDate: "Permanent", endDate: "Permanent", collectionFile: "moderna-museet-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "masi-lugano",
    name_ko: "마시 루가노 (이탈리아 스위스 미술관)",
    name: "Museo d'arte della Svizzera italiana (MASI Lugano)",
    city: "Lugano",
    country: "Switzerland",
    latitude: 46.0009,
    longitude: 8.9606,
    description_ko: "루가노 호숫가의 LAC 문화센터와 팔라초 레알리에 걸쳐 자리한, 이탈리아어권 스위스를 대표하는 근현대 미술관이다.",
    description: "Switzerland's leading museum of modern and contemporary Italian-Swiss art, spread across the lakeside LAC cultural centre and Palazzo Reali in Lugano.",
    representativeImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/masi-lugano-collection/95095-e4cdaec8-imageUrl.webp",
    permanentExhibitions: [
      { id: "masi-lugano-collection", name: "Collection", name_en: "Collection", title: "Museo d'arte della Svizzera italiana (MASI Lugano) — Collection", title_en: "Museo d'arte della Svizzera italiana (MASI Lugano) — Collection", description: "2,720점 — 회화·드로잉·판화·사진.", description_en: "2,720 works — paintings, drawings, prints and photographs.", startDate: "Permanent", endDate: "Permanent", collectionFile: "masi-lugano-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "guggenheim-ny",
    name_ko: "솔로몬 R. 구겐하임 미술관",
    name: "Solomon R. Guggenheim Museum",
    city: "New York",
    country: "USA",
    latitude: 40.78287,
    longitude: -73.95898,
    description_ko: "센트럴파크 옆 5번가에 자리한 프랭크 로이드 라이트의 나선형 건축물로, 근현대미술을 선도해 온 컬렉션을 품고 있다.",
    description: "Frank Lloyd Wright's spiraling Fifth Avenue landmark on the edge of Central Park, home to a pioneering collection of modern and contemporary art.",
    representativeImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/guggenheim-ny-collection/2-3531d508-imageUrl.webp",
    permanentExhibitions: [
      { id: "guggenheim-ny-collection", name: "Collection", name_en: "Collection", title: "Solomon R. Guggenheim Museum — Collection", title_en: "Solomon R. Guggenheim Museum — Collection", description: "1,041점 — 회화·사진·드로잉 (근현대미술).", description_en: "1,041 works — paintings, photographs and drawings (modern and contemporary art).", startDate: "Permanent", endDate: "Permanent", collectionFile: "guggenheim-ny-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "hirshhorn",
    name_ko: "허시혼 미술관 조각공원",
    name: "Hirshhorn Museum and Sculpture Garden",
    city: "Washington, D.C.",
    country: "USA",
    latitude: 38.888,
    longitude: -77.0228,
    description_ko: "내셔널 몰에 자리한 스미스소니언 산하 현대미술관으로, 고든 번섀프트가 설계한 원통형 건물과 지하로 내려앉은 조각공원으로 유명하다.",
    description: "The Smithsonian's museum of modern and contemporary art on the National Mall, known for its cylindrical Gordon Bunshaft building and adjacent sunken sculpture garden.",
    representativeImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/hirshhorn-collection/hmsg_66.1096-315b7405-imageUrl.webp",
    permanentExhibitions: [
      { id: "hirshhorn-collection", name: "Collection", name_en: "Collection", title: "Hirshhorn Museum and Sculpture Garden — Collection", title_en: "Hirshhorn Museum and Sculpture Garden — Collection", description: "344점 — 회화·드로잉·사진·판화 (전후·동시대 미술).", description_en: "344 works — paintings, drawings, photographs and prints (postwar and contemporary art).", startDate: "Permanent", endDate: "Permanent", collectionFile: "hirshhorn-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "walker-art-center",
    name_ko: "워커 아트 센터",
    name: "Walker Art Center",
    city: "Minneapolis",
    country: "USA",
    latitude: 44.96806,
    longitude: -93.28861,
    description_ko: "미니애폴리스를 대표하는 현대미술센터로, 전후·동시대 판화와 사진·회화·무빙이미지에 강한 컬렉션을 갖췄으며 미니애폴리스 조각공원과 이어진다.",
    description: "A leading contemporary art center in Minneapolis, known for its multidisciplinary program and a collection strong in postwar and contemporary prints, photography, painting, and moving image, adjoining the Minneapolis Sculpture Garden.",
    representativeImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/walker-art-center-collection/wac_425-ed1a4a18-imageUrl.webp",
    permanentExhibitions: [
      { id: "walker-art-center-collection", name: "Collection", name_en: "Collection", title: "Walker Art Center — Collection", title_en: "Walker Art Center — Collection", description: "7,595점 — 판화·사진·회화·드로잉·영상 (전후·동시대; 매체로 평면 분류).", description_en: "7,595 works — prints, photographs, paintings, drawings and moving image (postwar and contemporary).", startDate: "Permanent", endDate: "Permanent", collectionFile: "walker-art-center-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "dma-dallas",
    name_ko: "댈러스 미술관",
    name: "Dallas Museum of Art",
    city: "Dallas",
    country: "USA",
    latitude: 32.7876,
    longitude: -96.801,
    description_ko: "댈러스 아트 디스트릭트에 자리한 종합 미술관으로, 고대부터 현대까지 전 세계 문화를 아우르는 약 2만 9천 점의 소장품을 회화·조각·장식미술·종이 작품에 걸쳐 보유하고 있다.",
    description: "A major encyclopedic art museum in the Dallas Arts District, its 29,000-object collection spans global cultures from antiquity to contemporary art across painting, sculpture, decorative arts, and works on paper.",
    representativeImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/dma-dallas-collection/3039527-4b4dba48-imageUrl.webp",
    permanentExhibitions: [
      { id: "dma-dallas-collection", name: "Collection", name_en: "Collection", title: "Dallas Museum of Art — Collection", title_en: "Dallas Museum of Art — Collection", description: "5,686점 — 판화·회화·사진·드로잉 (종합 컬렉션의 평면 작품).", description_en: "5,686 flat works — prints, paintings, photographs and drawings from the encyclopedic collection.", startDate: "Permanent", endDate: "Permanent", collectionFile: "dma-dallas-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "icp-ny",
    name_ko: "국제사진센터",
    name: "International Center of Photography",
    city: "New York",
    country: "USA",
    latitude: 40.7174,
    longitude: -73.9883,
    description_ko: "1974년 코넬 카파가 '참여 사진'을 기치로 세운 사진 전문 미술관. 위지 아카이브를 비롯해 포토저널리즘과 다큐멘터리, 동시대 사진까지 폭넓게 소장하고 있다.",
    description: "New York's museum devoted entirely to photography, founded by Cornell Capa in 1974 to champion \"concerned photography.\" Its archive spans photojournalism and documentary work — including the Weegee archive — through fine-art and contemporary image-making.",
    representativeImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/icp-ny-collection/icp-ny-309-ec3019d7-imageUrl.webp",
    permanentExhibitions: [
      { id: "icp-ny-collection", name: "Collection", name_en: "Collection", title: "International Center of Photography — Collection", title_en: "International Center of Photography — Collection", description: "23,007점 — 사진 (포토저널리즘·다큐멘터리·동시대 사진).", description_en: "23,007 photographs — photojournalism, documentary and contemporary image-making.", startDate: "Permanent", endDate: "Permanent", collectionFile: "icp-ny-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "museo-jumex",
    name_ko: "후멕스 미술관",
    name: "Museo Jumex",
    city: "Mexico City",
    country: "Mexico",
    latitude: 19.44,
    longitude: -99.2047,
    description_ko: "멕시코시티 폴랑코의 톱니 지붕 건물(데이비드 치퍼필드 설계)에 자리한 멕시코 대표 현대미술관입니다. 라틴아메리카 최대급 민간 현대미술 컬렉션인 콜렉시온 후멕스를 통해 가브리엘 오로스코부터 피슐리 & 바이스까지 동시대 작품을 선보입니다.",
    description: "Mexico's leading contemporary art museum, housed in David Chipperfield's saw-toothed building in Polanco. It presents Colección Jumex, one of Latin America's largest private holdings of contemporary art, from Gabriel Orozco to Fischli & Weiss.",
    representativeImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/museo-jumex-collection/21-c90bf033-imageUrl.webp",
    permanentExhibitions: [
      { id: "museo-jumex-collection", name: "Collection", name_en: "Collection", title: "Museo Jumex — Collection", title_en: "Museo Jumex — Collection", description: "301점 — 사진·회화·영상·드로잉 (콜렉시온 후멕스 동시대 미술).", description_en: "301 works — photographs, paintings, video and drawings from Colección Jumex.", startDate: "Permanent", endDate: "Permanent", collectionFile: "museo-jumex-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "vnfam-hanoi",
    name_ko: "베트남 국립미술관",
    name: "Vietnam National Fine Arts Museum",
    city: "Hanoi",
    country: "Vietnam",
    latitude: 21.0293,
    longitude: 105.8386,
    description_ko: "하노이 한복판의 옛 프랑스풍 건물에 자리한 베트남 대표 미술관. 국보로 지정된 쩐 반 껀의 〈엠 투이〉를 비롯해 옻칠화와 비단 그림 등 베트남 근현대 미술의 정수를 모아놓았다.",
    description: "Vietnam's national art museum in a French-colonial building in central Hanoi, home to the country's defining lacquer (son mai) and silk paintings — including Tran Van Can's national-treasure portrait Em Thuy and Nguyen Gia Tri's monumental lacquer screens.",
    representativeImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/vnfam-hanoi-collection/vnfam-hanoi-5a61a3f99f1f592e7371ab12-0791a3f1-imageUrl.webp",
    permanentExhibitions: [
      { id: "vnfam-hanoi-collection", name: "Collection", name_en: "Collection", title: "Vietnam National Fine Arts Museum — Collection", title_en: "Vietnam National Fine Arts Museum — Collection", description: "196점 — 회화174·판화17·혼합매체4·드로잉1.", description_en: "196 works — painting, print, mixed_media_2d, drawing.", startDate: "Permanent", endDate: "Permanent", collectionFile: "vnfam-hanoi-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "sam-singapore",
    name_ko: "싱가포르 미술관",
    name: "Singapore Art Museum",
    city: "Singapore",
    country: "Singapore",
    latitude: 1.2706,
    longitude: 103.8386,
    description_ko: "1996년 개관한 싱가포르의 대표 현대미술관. 동남아시아 현대미술을 세계에서 가장 폭넓게 소장한 곳으로 꼽히며, 현재는 탄종파가 디스트리파크에서 회화와 사진 중심의 국가 컬렉션을 선보인다.",
    description: "Singapore's flagship contemporary art museum, holding one of the world's most significant collections of Southeast Asian contemporary art. Opened in 1996 and now based at Tanjong Pagar Distripark, its National Collection holdings span painting and photography from across the region.",
    representativeImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/sam-singapore-collection/sam-singapore-1000039-3133b167-imageUrl.webp",
    permanentExhibitions: [
      { id: "sam-singapore-collection", name: "Collection", name_en: "Collection", title: "Singapore Art Museum — Collection", title_en: "Singapore Art Museum — Collection", description: "1,462점 — 회화919·사진537·판화6.", description_en: "1,462 works — painting, photograph, print.", startDate: "Permanent", endDate: "Permanent", collectionFile: "sam-singapore-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "museo-botero",
    name_ko: "보테로 미술관",
    name: "Museo Botero",
    city: "Bogotá",
    country: "Colombia",
    latitude: 4.5968,
    longitude: -74.073,
    description_ko: "페르난도 보테로가 고국에 기증한 대표작들과 그가 평생 모은 피카소, 모네, 프랜시스 베이컨 등 거장들의 작품을 한자리에서 볼 수 있는 곳. 보고타 옛 도심 라 칸델라리아의 식민지 시대 저택에 자리하며 누구나 무료로 관람할 수 있다.",
    description: "Housed in a colonial mansion in Bogotá's La Candelaria, the museum presents Fernando Botero's 2000 donation to Colombia: his own signature paintings and drawings alongside his personal collection of international masters including Picasso, Monet, Bacon, Chagall and Dalí — free to all visitors.",
    representativeImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/museo-botero-collection/museo-botero-63a069015d96b8790f25fff8-b620c2a8-imageUrl.webp",
    permanentExhibitions: [
      { id: "museo-botero-collection", name: "Collection", name_en: "Collection", title: "Museo Botero — Collection", title_en: "Museo Botero — Collection", description: "151점 — 회화113·드로잉33·판화4·혼합매체1.", description_en: "151 works — painting, drawing, print, mixed_media_2d.", startDate: "Permanent", endDate: "Permanent", collectionFile: "museo-botero-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },

];