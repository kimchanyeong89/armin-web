// src/data/exhibitions.js
module.exports = [
  {
    id: "mfa-boston",
    slug: "mfa-boston",
    name: "Museum of Fine Arts, Boston",
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
    slug: "mfah",
    name: "Museum of Fine Arts, Houston",
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
    slug: "lacma",
    name: "Los Angeles County Museum of Art (LACMA)",
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
    slug: "sfmoma",
    name: "San Francisco Museum of Modern Art (SFMOMA)",
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
    slug: "cma",
    name: "Cleveland Museum of Art",
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
    slug: "philadelphia",
    name: "Philadelphia Museum of Art",
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
    slug: "dia",
    name: "Detroit Institute of Arts",
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
    slug: "masp",
    name: "Museu de Arte de São Paulo",
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
    slug: "mbam",
    name: "Montreal Museum of Fine Arts",
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
    slug: "shanghai-museum",
    name: "Shanghai Museum",
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
    slug: "nanjing-museum",
    name: "Nanjing Museum",
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
    slug: "national-museum-of-china",
    name: "National Museum of China",
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
    slug: "palace-museum-intl",
    name: "The Palace Museum (International)",
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
        name: "Paintings",
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
    slug: "hkmoa",
    name: "Hong Kong Museum of Art",
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
    slug: "nich-tnm",
    name: "Tokyo National Museum (ColBase)",
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
    slug: "nmwa-collection",
    name: "National Museum of Western Art",
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
    slug: "adachi-museum",
    name: "Adachi Museum of Art",
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
    slug: "kanazawa-21",
    name: "21st Century Museum of Contemporary Art, Kanazawa",
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

    slug: "tobikan-collection",
    name: "Tokyo Metropolitan Art Museum",
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
    slug: "national-palace-museum-taipei",
    name: "National Palace Museum (Taipei)",
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
    slug: "tfam",
    name: "Taipei Fine Arts Museum",
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
    slug: "ntmofa",
    name: "National Taiwan Museum of Fine Arts",
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
    slug: "namoc",
    name: "National Art Museum of China",
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
    slug: "tate-modern",
    name: "Tate Modern",
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
      { id: "tm-perm-3", name: "Tate Collection", title: "Tate Collection", description: "Complete collection of artworks from Tate galleries.", startDate: "Permanent", endDate: "Permanent" }
    ],
    temporaryExhibitions: [
    ],
    pastExhibitions: [
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
    country: "United Kingdom",
    region: "London",
    representativeImage: "images/tate-britain-logo.svg",
    floorPlan: "",
    permanentExhibitions: [
      // Tate Britain Collection - 853 artworks from Tate Britain
      { id: "tbc-perm-1", name: "Tate Britain Collection", title: "Tate Britain Collection", description: "Complete collection of artworks on display at Tate Britain, featuring British art from 1500 to the present day.", startDate: "Permanent", endDate: "Permanent", collectionFile: "tate-britain.json" },
      // Mirror Tate Modern's "Tate Collection" so the modal loads the same local artworks feed
      { id: "tm-perm-3", name: "Tate Collection", title: "Tate Collection", description: "Complete collection of artworks from Tate galleries.", startDate: "Permanent", endDate: "Permanent" }
    ],
    temporaryExhibitions: [
    ],
    pastExhibitions: [
    ],
  },
  // London major museums
  {
    id: "national-gallery",
    name: "National Gallery",
    slug: "national-gallery",
    location: "Trafalgar Square, London WC2N 5DN",
    description: "Houses a rich collection of European paintings from the 13th to the 19th centuries.",
    latitude: 51.508929,
    longitude: -0.128299,
    country: "United Kingdom",
    region: "London",
    representativeImage: "images/national-gallery-logo.svg",
    permanentExhibitions: [
      { id: "ng-1", name: "European Paintings", title: "European Paintings", description: "Masterworks by Botticelli, Van Gogh, Turner and more.", startDate: "Permanent", endDate: "Permanent" }
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
    name: "National Portrait Gallery",
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
    name: "Victoria and Albert Museum",
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
      { id: "tm-perm-3", name: "Tate Collection", title: "Tate Collection", description: "Complete collection of artworks from Tate galleries.", startDate: "Permanent", endDate: "Permanent", collectionFile: "tate-liverpool.json" }
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
    slug: "tate-st-ives",
    name: "Tate St Ives",
    location: "Porthmeor Beach, St Ives, Cornwall TR26 1TG",
    description: "Overlooking the Atlantic Ocean, Tate St Ives showcases work by artists including Barbara Hepworth, Marlow Moss, Naum Gabo and Patrick Heron, whose captivating works have brought international attention to St Ives and West Cornwall.",
    latitude: 50.2115,
    longitude: -5.4796,
    country: "United Kingdom",
    region: "Cornwall",
    representativeImage: "images/tate-st-ives-logo.svg",
    permanentExhibitions: [
      { id: "tm-perm-3", name: "Tate Collection", title: "Tate Collection", description: "Complete collection of artworks from Tate galleries.", startDate: "Permanent", endDate: "Permanent", collectionFile: "tate-st-ives.json" },
      { id: "tsi-perm-1", name: "Tate St Ives Collection", title: "Tate St Ives Collection", description: "Artworks from the Tate collection displayed at Tate St Ives, featuring modernist and contemporary works connected to St Ives and Cornwall.", startDate: "Permanent", endDate: "Permanent" }
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
    slug: "sng",
    name: "Scottish National Gallery",
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
    slug: "royal-academy",
    name: "Royal Academy of Arts",
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
      }
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
    slug: "courtauld",
    name: "The Courtauld Gallery",
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
    slug: "manchester-gallery",
    name: "Manchester Art Gallery",
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
    slug: "snpg",
    name: "Scottish National Portrait Gallery",
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
    slug: "british-museum",
    name: "British Museum",
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
    slug: "hayward",
    name: "Hayward Gallery",
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
    name: "Musée du Louvre",
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
    slug: "musee-dorsay",
    name: "Musée d'Orsay",
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
    name: "Centre Pompidou",
    city: "Paris",
    country: "France",
    latitude: 48.8607,
    longitude: 2.3522,
    description: "유럽 최대 현대 미술 갤러리. 20세기 평면 예술의 흐름을 주도하는 영향력.",
    representativeImage: "images/centre-pompidou-logo.svg",
    permanentExhibitions: [
      { id: "pompidou-cinema-collection", name: "Cinema Collection", title: "Centre Pompidou Cinema Collection", description: "Experimental cinema, video art, and film installations from the Centre Pompidou collection.", startDate: "Permanent", endDate: "Permanent", collectionFile: "pompidou-cinema-collection.json" },
      { id: "pompidou-painting-collection", name: "Painting Collection", title: "Centre Pompidou Painting Collection", description: "Modern and contemporary paintings from the Centre Pompidou collection, featuring masterworks from Picasso, Matisse, Kandinsky, and more.", startDate: "Permanent", endDate: "Permanent", collectionFile: "pompidou-unmapped-paintings.json" },
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
    slug: "musee-de-lorangerie",
    name: "Musée de l'Orangerie",
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
      { id: "orangerie-collection", name: "Orangerie Collection", title: "Musée de l'Orangerie Permanent Collection", description: "Monet's Water Lilies and the Jean Walter and Paul Guillaume collection of Impressionist and Post-Impressionist masterpieces.", startDate: "Permanent", endDate: "Permanent" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "petit-palais",
    name: "Petit Palais",
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
    name: "Musée Jacquemart-André",
    slug: "jacquemart-andre",
    city: "Paris",
    country: "France",
    latitude: 48.8753,
    longitude: 2.3109,
    description: "개인 저택형 갤러리. 이탈리아 르네상스 및 프랑스 고전 회화의 정수.",
    representativeImage: "images/jacquemart-andre-logo.svg",
    permanentExhibitions: [
      { id: "jacquemart-collection", name: "Must-See Works", title: "Musée Jacquemart-André Must-See Works", description: "Masterpieces by Botticelli, Rembrandt, Fragonard, and other masters in an elegant 19th-century mansion.", startDate: "Permanent", endDate: "Permanent" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "jeu-de-paume",
    name: "Jeu de Paume",
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
      { id: "mep-photography", name: "The Collection", title: "MEP: The Collection", description: "Photography and video works from legendary artists including Brassaï, Robert Frank, Nan Goldin, Irving Penn, William Klein, Erwin Wurm, and contemporary artists.", startDate: "Permanent", endDate: "Permanent" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "palais-de-tokyo",
    name: "Palais de Tokyo",
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
    city: "Lyon",
    country: "France",
    latitude: 45.7672,
    longitude: 4.8335,
    description: "'작은 루브르'라 불릴 만큼 시대별 회화의 밀도가 높은 갤러리.",
    representativeImage: "images/musee-des-beaux-arts-de-lyon-logo.svg",
    permanentExhibitions: [
      { id: "lyon-collection", name: "Painting & Graphic Design Collection", title: "Musée des Beaux-Arts de Lyon Collection", description: "15세기부터 현대까지의 회화와 그래픽 디자인 컬렉션 538점.", startDate: "Permanent", endDate: "Permanent" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "musee-conde",
    name: "Musée Condé",
    city: "Chantilly",
    country: "France",
    latitude: 49.1941,
    longitude: 2.4867,
    description: "라파엘로 등 루브르에 견줄만한 올드 마스터들의 유화가 즐비한 곳.",
    representativeImage: "images/musee-conde-logo.svg",
    permanentExhibitions: [
      { id: "conde-paintings", name: "The Collection", title: "Musée Condé - The Collection", description: "프랑스에서 루브르 다음으로 중요한 올드 마스터 회화 및 드로잉 컬렉션. 라파엘로, 푸생, 앵그르 등 걸작 소장.", startDate: "Permanent", endDate: "Permanent", collectionFile: "musee-conde-paintings.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "musee-toulouse-lautrec",
    name: "Musée Toulouse-Lautrec",
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
    city: "Grenoble",
    country: "France",
    latitude: 45.1949,
    longitude: 5.7317,
    description: "프랑스 최초로 현대 미술을 수집한 곳으로, 2D 현대 예술의 보고.",
    representativeImage: "images/musee-de-grenoble-logo.svg",
    permanentExhibitions: [
      { id: "grenoble-collection", name: "The Collection", title: "Musée de Grenoble - The Collection", description: "회화 1,152점, 드로잉 954점, 사진 27점 등 총 2,133점의 컬렉션.", startDate: "Permanent", endDate: "Permanent" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "musee-granet",
    name: "Musée Granet",
    city: "Aix-en-Provence",
    country: "France",
    latitude: 43.5265,
    longitude: 5.4481,
    description: "세잔의 고향에서 만나는 인상주의 및 피카소, 자코메티의 평면 작품들.",
    representativeImage: "images/musee-granet-logo.svg",
    permanentExhibitions: [
      { id: "granet-collection", name: "Collection", title: "Musée Granet Collection", description: "세잔부터 자코메티까지, 14세기-20세기 회화와 조각 30점.", startDate: "Permanent", endDate: "Permanent" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  {
    id: "mamcs-strasbourg",
    name: "Musée d'Art Moderne et Contemporain de Strasbourg",
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
    city: "Paris",
    country: "France",
    location: "16 Rue des Francs Bourgeois, 75003 Paris, France",
    latitude: 48.8576,
    longitude: 2.3622,
    description: "파리의 역사를 담은 미술관. 고대부터 현대까지 파리의 변천사를 조각, 회화, 사진, 가구 등 60만 점 이상의 소장품으로 전시.",
    representativeImage: "images/carnavalet-logo.svg",
    permanentExhibitions: [
      { id: "carnavalet-the-collection", name: "The Collection", title: "Carnavalet - La Collection", description: "파리 역사를 담은 회화 및 판화 컬렉션 1,747점. 필수 작품 55점 포함.", startDate: "Permanent", endDate: "Permanent", collectionFile: "carnavalet-paintings.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  // Musée de l'Armée - Invalides
  {
    id: "musee-armee",
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
    name: "Musée Guimet",
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
    city: "Marseille",
    country: "France",
    latitude: 43.2965,
    longitude: 5.3610,
    description: "유럽과 지중해 문명 박물관. 마르세유의 랜드마크로, 지중해 문화권의 역사와 문명을 전시하는 국립 박물관.",
    representativeImage: "images/mucem-logo.svg",
    permanentExhibitions: [
      { id: "mucem-collection", name: "Full Collection", title: "Mucem - 전체 컬렉션", description: "회화, 판화, 드로잉을 포함한 전체 컬렉션 3,943점.", startDate: "Permanent", endDate: "Permanent", collectionFile: "mucem-collection.json" },
      { id: "mucem-fine-arts-collection", name: "회화 컬렉션", title: "Mucem 회화 및 순수미술", description: "지중해 문화권의 회화·드로잉·판화·사진 등 순수미술 컬렉션.", startDate: "Permanent", endDate: "Permanent" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  // Musée Fabre - Montpellier
  {
    id: "musee-fabre",
    name: "Musée Fabre",
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
    name: "Vatican Museums",
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
    name: "National Museum Wales",
    city: "Cardiff",
    country: "United Kingdom",
    region: "Wales",
    latitude: 51.4816,
    longitude: -3.1791,
    description: "The national museum of Wales featuring world-class art collections including Impressionist works, Welsh art, and extensive industrial heritage collections.",
    representativeImage: "images/museum-wales-logo.svg",
    permanentExhibitions: [
      { id: "museum-wales-art", name: "Art Collection", title: "National Museum Wales Art Collection", description: "Paintings, sculptures, and works on paper from Wales and around the world, including an outstanding collection of Impressionist works.", startDate: "Permanent", endDate: "Permanent", collectionFile: "museum-wales-art.json" },
      { id: "museum-wales-paintings", name: "Paintings, Drawings & Watercolours", title: "National Museum Wales – Paintings, Drawings & Watercolours", description: "Selected paintings, drawings, and watercolours from the National Museum Wales art collection, covering Welsh and international artists.", startDate: "Permanent", endDate: "Permanent", collectionFile: "museum-wales-paintings.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  // Uffizi Galleries - Florence
  {
    id: "uffizi",
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
    name: "Pitti Palace",
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
    name: "Galleria dell'Accademia",
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
    name: "Galleria Borghese",
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
    name: "Gallerie dell'Accademia di Venezia",
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
    name: "Peggy Guggenheim Collection",
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
    name: "Pinacoteca di Brera",
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
    name: "Galleria Doria Pamphilj",
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
    name: "Museo Egizio",
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
    name: "Musei Capitolini",
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
    name: "Pinacoteca Ambrosiana",
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
    name: "Museo del Novecento",
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
    name: "Museo Archeologico Nazionale di Napoli",
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
    name: "Humboldt Forum",
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
    name: "Altes Museum",
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
    name: "Neues Museum",
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
    name: "Gemäldegalerie",
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
    name: "Alte Nationalgalerie",
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
    name: "Neue Nationalgalerie",
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
    name: "Bode-Museum",
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
    name: "Städel Museum",
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
    name: "Alte Pinakothek",
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
    name: "Neue Pinakothek",
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
    name: "Hamburger Kunsthalle",
    city: "Hamburg",
    country: "Germany",
    latitude: 53.5533,
    longitude: 10.0033,
    description: "One of the largest art museums in Germany, housing an extensive collection of European paintings from medieval to contemporary art, including masterworks by Caspar David Friedrich, Max Liebermann, and Ernst Ludwig Kirchner.",
    representativeImage: "https://online-sammlung.hamburger-kunsthalle.de/sites/default/files/multimedia-files/61328.jpg",
    permanentExhibitions: [
      { id: "hamburger-kunsthalle-collection", name: "Permanent Collection", title: "Hamburger Kunsthalle Sammlung", description: "Over 15,900 works spanning seven centuries — 2,286 paintings, 13,397 drawings, and 289 video artworks by artists including Caspar David Friedrich, Rembrandt, Dürer, Kirchner, and leading contemporary media artists.", startDate: "Permanent", endDate: "Permanent", collectionFile: "hamburger-kunsthalle-paintings.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },
  // Rijksmuseum - Amsterdam
  {
    id: "rijksmuseum",
    name: "Rijksmuseum",
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
    name: "Van Gogh Museum",
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
    name: "Mauritshuis",
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
    name: "Stedelijk Museum Amsterdam",
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
    name: "Kröller-Müller Museum",
    city: "Otterlo",
    country: "Netherlands",
    latitude: 52.0956,
    longitude: 5.8167,
    description: "One of the largest Van Gogh collections in the world, housed in a stunning museum within De Hoge Veluwe National Park. Features over 90 Van Gogh paintings and 180 drawings, plus works by Picasso, Mondrian, and Seurat.",
    representativeImage: "https://krollermuller.nl/images/museum-exterior.jpg",
    permanentExhibitions: [
      { id: "kroller-muller-collection", name: "Kröller-Müller Collection", title: "Kröller-Müller Permanent Collection", description: "The complete permanent collection of the Kröller-Müller Museum — one of the largest Van Gogh collections in the world, alongside paintings, drawings, and sculptures by Mondrian, Seurat, Picasso, Redon, and other modern masters, plus an extensive photography collection and pioneering film and video art works.", startDate: "Permanent", endDate: "Permanent", collectionFile: "kroller-muller-paintings.json" }
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
    name_en: "National Museum of Modern and Contemporary Art",
    location: "서울특별시 종로구 삼청로 30",
    location_en: "30 Samcheong-ro, Jongno-gu, Seoul",
    description: "한국과 세계의 현대미술을 선도하는 국립미술관. 다양한 전시, 교육, 융복합 예술, 영화/영상 프로그램 운영. 소장작품 112점.",
    description_en: "A national museum leading contemporary art in Korea and abroad, with diverse exhibitions, education, interdisciplinary arts, and film/video programs. 112 artworks from the permanent collection.",
    latitude: 37.579617,
    longitude: 126.981805,
    country: "South Korea",
    region: "Seoul",
    representativeImage: "/images/mmca-seoul.jpg",
    floorPlan: "",
    permanentExhibitions: [
      { id: "mmca-collection", name: "국립현대미술관 소장작품", name_en: "MMCA Collection", title: "국립현대미술관 소장작품", title_en: "MMCA Collection", description: "국립현대미술관 소장작품 컬렉션 (112점)", description_en: "MMCA permanent collection (112 items)", startDate: "Permanent", endDate: "Permanent", collectionFile: "mmca-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    rooms: {}
  },
  // South Korea - National Museum of Korea
  {
    id: "national-museum-korea",
    slug: "national-museum-korea",
    name: "국립중앙박물관",
    name_en: "National Museum of Korea",
    location: "서울특별시 용산구 서빙고로 137",
    location_en: "137 Seobinggo-ro, Yongsan-gu, Seoul",
    description: "한국의 역사와 문화를 대표하는 국립박물관. 선사시대부터 근대까지의 유물 97,000여 점 소장.",
    description_en: "The largest museum in Korea, housing 97,000+ artifacts spanning from prehistoric times to the modern era.",
    latitude: 37.5238,
    longitude: 126.9804,
    country: "South Korea",
    region: "Seoul",
    representativeImage: "/images/national-museum-korea.jpg",
    floorPlan: "",
    permanentExhibitions: [
      { id: "nmk-collection", name: "국립중앙박물관 회화 컬렉션", name_en: "National Museum of Korea Paintings", title: "국립중앙박물관 회화 컬렉션", title_en: "National Museum of Korea Paintings Collection", description: "국립중앙박물관 소장 회화 컬렉션 (4,309점)", description_en: "National Museum of Korea paintings collection (4,309 items)", startDate: "Permanent", endDate: "Permanent", collectionFile: "national-museum-korea.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    rooms: {}
  },
  // South Korea - Jeonju National Museum
  {
    id: "jeonju-national-museum",
    slug: "jeonju-national-museum",
    name: "국립전주박물관",
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
    name_en: "National Folk Museum of Korea",
    location: "서울특별시 종로구 삼청로 37",
    location_en: "37 Samcheong-ro, Jongno-gu, Seoul",
    description: "한국의 전통 생활문화를 보존하고 전시하는 국립박물관. 민속자료와 회화 컬렉션 소장.",
    description_en: "National museum preserving and exhibiting traditional Korean folk culture with a collection of folk materials and paintings.",
    latitude: 37.5817,
    longitude: 126.9787,
    country: "South Korea",
    region: "Seoul",
    representativeImage: "/images/folk-museum.jpg",
    floorPlan: "",
    permanentExhibitions: [
      { id: "folk-collection", name: "국립민속박물관 회화 컬렉션", name_en: "National Folk Museum Paintings", title: "국립민속박물관 회화 컬렉션", title_en: "National Folk Museum Paintings Collection", description: "국립민속박물관 소장 회화 컬렉션 (927점)", description_en: "National Folk Museum paintings collection (927 items)", startDate: "Permanent", endDate: "Permanent", collectionFile: "folk-museum.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    rooms: {}
  },
  // South Korea - Busan Museum
  {
    id: "busan-museum",
    slug: "busan-museum",
    name: "부산광역시립박물관",
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
    name_en: "Seoul Museum of Art",
    location: "서울특별시 중구 덕수궁길 61",
    location_en: "61 Deoksugung-gil, Jung-gu, Seoul",
    description: "서울시립미술관은 서울의 대표 미술관으로, 한국 근현대 미술과 동시대 미술을 폭넓게 소장하고 있습니다. 회화, 사진, 한국화, 드로잉&판화, 조각, 뉴미디어, 설치, 공예, 서예, 디자인 등 다양한 장르의 6,167점 소장.",
    description_en: "Seoul Museum of Art (SeMA) showcases Korean modern and contemporary art across diverse media including painting, photography, sculpture, new media, and more. Collection of 6,167 works.",
    latitude: 37.565284,
    longitude: 126.975361,
    country: "South Korea",
    region: "Seoul",
    representativeImage: "https://collections.eseoul.go.kr/common/file/getImage.do?size=700&fileSeq=FILE_0000083583-1",
    floorPlan: "",
    permanentExhibitions: [
      { id: "sema-collection", name: "서울시립미술관 소장품", name_en: "Seoul Museum of Art Collection", title: "서울시립미술관 소장품", title_en: "Seoul Museum of Art Collection", description: "서울시립미술관 소장 미술작품 컬렉션 (회화, 사진, 한국화, 드로잉&판화, 조각, 뉴미디어, 설치, 공예, 서예, 디자인 등 6,167점)", description_en: "Seoul Museum of Art collection featuring painting, photography, Korean painting, drawing & print, sculpture, new media, installation, craft, calligraphy, design (6,167 works)", startDate: "Permanent", endDate: "Permanent", collectionFile: "seoul-museum-of-art-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    rooms: {}
  },
  // Spain - Museo Nacional Centro de Arte Reina Sofía
  {
    id: "museo-reina-sofia",
    slug: "reina-sofia",
    name: "Museo Reina Sofía",
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
    slug: "thyssen-bornemisza",
    name: "Museo Thyssen-Bornemisza",
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
    slug: "guggenheim-bilbao",
    name: "Guggenheim Bilbao",
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
    id: "albertina-museum",
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
      { id: "albertina-permanent-collection", name: "Permanent Collection", title: "ALBERTINA — Permanent Collection", description: "Highlights from the ALBERTINA's permanent collection spanning paintings, sculptures, drawings, prints, and objects & media art.", startDate: "Permanent", endDate: "Permanent" , collectionFile: "albertina-permanent-collection.json" },
      { id: "albertina-photography-100", name: "Photography", title: "Photography", description: "Photography collection from the ALBERTINA Museum.", startDate: "Permanent", endDate: "Permanent" },
      { id: "albertina-poster-100", name: "Posters", title: "Posters", description: "Poster collection from the ALBERTINA Museum.", startDate: "Permanent", endDate: "Permanent" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    rooms: {}
  },
  {
    id: "leopold-museum",
    slug: "leopold-museum",
    name: "Leopold Museum",
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
    slug: "belvedere",
    name: "Belvedere Museum",
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
    slug: "mnk",
    name: "National Museum in Krakow",
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
    slug: "mfab",
    name: "Museum of Fine Arts, Budapest",
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
    slug: "gulbenkian",
    name: "Gulbenkian Museum",
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
    slug: "fine-arts-be",
    name: "Musées royaux des Beaux-Arts de Belgique",
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
        collectionFile: "fine-arts-be-100.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    rooms: {}
  },
  {
    id: "nam-athens",
    slug: "nam-athens",
    name: "National Archaeological Museum",
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
    slug: "kunsthaus-zurich",
    name: "Kunsthaus Zürich",
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
    slug: "kunstmuseum-basel",
    name: "Kunstmuseum Basel",
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
    slug: "fondation-beyeler",
    name: "Fondation Beyeler",
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
    slug: "mah-geneva",
    name: "Musée d'Art et d'Histoire",
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
    slug: "acropolis-museum",
    name: "Acropolis Museum",
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
    slug: "national-gallery-prague",
    name: "National Gallery Prague",
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
    slug: "nasjonalmuseet",
    name: "Nasjonalmuseet",
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
    slug: "munchmuseet",
    name: "Munchmuseet",
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
    slug: "nationalmuseum-sweden",
    name: "Nationalmuseum Sweden",
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
    slug: "glyptoteket",
    name: "Ny Carlsberg Glyptotek",
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
    slug: "aros",
    name: "ARoS Aarhus Kunstmuseum",
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
    name: "State Tretyakov Gallery",
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
    name: "State Hermitage Museum",
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
    name: "The Pushkin State Museum of Fine Arts",
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
    name: "Topkapi Palace Museum",
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
    slug: "hirschsprung",
    name: "Den Hirschsprungske Samling",
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
    slug: "louisiana",
    name: "Louisiana Museum of Modern Art",
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
    name: "Lee Jung-seop Art Museum",
    slug: "lee-jung-seop",
    location: "27-3, Leejungseop-ro, Seogwipo-si, Jeju-do",
    description: "Located in Seogwipo, the museum honors Lee Jung-seop, a genius painter of Korea, exhibiting his works and personal history.",
    latitude: 33.2458,
    longitude: 126.5649,
    country: "South Korea",
    region: "Jeju",
    representativeImage: "",
    permanentExhibitions: [
      { id: "ljs-collection", name: "Permanent Collection", title: "Lee Jung-seop Collection", description: "Permanent exhibition of Lee Jung-seop's works and related archives.", startDate: "Permanent", endDate: "Permanent", collectionFile: "lee-jung-seop-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "gidang-art-museum",
    name: "Gidang Art Museum",
    slug: "gidang",
    location: "15, Namseongjung-ro 153beon-gil, Seogwipo-si, Jeju-do",
    description: "The first public general art museum in Korea, established by Gidang Kang Gu-beom. It houses diverse modern and contemporary artworks.",
    latitude: 33.2435,
    longitude: 126.5583,
    country: "South Korea",
    region: "Jeju",
    representativeImage: "",
    permanentExhibitions: [
      { id: "gidang-collection", name: "Permanent Collection", title: "Gidang Collection", description: "Permanent exhibition featuring modern calligraphy, paintings, and contemporary art.", startDate: "Permanent", endDate: "Permanent", collectionFile: "gidang-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "soam-memorial-hall",
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
    id: "jeju-museum-of-art",
    name: "Jeju Museum of Art",
    slug: "jmoa",
    location: "1100-ro 2894-78, Jeju-si, Jeju-do",
    description: "Online digital collection from Jeju Museum of Art (JMOA).",
    latitude: 33.4892,
    longitude: 126.4899,
    country: "South Korea",
    region: "Jeju",
    representativeImage: "",
    permanentExhibitions: [
      {
        id: "jmoa-collection",
        name: "Digital Collection",
        title: "디지털 소장품",
        description: "Digital collection imported from onlinejmoa.or.kr.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "jmoa-collection-all.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  }
  ,
  {
    id: "kim-tschang-yeul-art-museum",
    name: "Kim Tschang-Yeul Art Museum Jeju",
    slug: "kimtschang-yeul",
    location: "Jeju, South Korea",
    description: "Online collection imported from kimtschang-yeul.jeju.go.kr.",
    latitude: 33.285,
    longitude: 126.257,
    country: "South Korea",
    region: "Jeju",
    representativeImage: "",
    permanentExhibitions: [
      {
        id: "kimtschang-yeul-collection",
        name: "Collection",
        title: "소장품",
        description: "Digital collection imported from kimtschang-yeul.jeju.go.kr.",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "kimtschang-yeul-collection-all.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  }
  ,
  {
    id: "dumoak",
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
    slug: "national-gallery-singapore",
    name: "National Gallery Singapore",
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
    slug: "met-ny",
    name: "The Metropolitan Museum of Art",
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
    slug: "nga",
    name: "National Gallery of Art",
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
    slug: "smithsonian-american-art-museum",
    name: "Smithsonian American Art Museum",
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
    slug: "museum-of-modern-art",
    cityCluster: "New York",
    name: "The Museum of Modern Art",
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
    slug: "art-institute-of-chicago",
    name: "The Art Institute of Chicago",
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
    slug: "getty",
    name: "Getty Museum",
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
    slug: "whitney",
    cityCluster: "New York",
    name: "Whitney Museum of American Art",
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
    slug: "agnsw",
    name: "Art Gallery of New South Wales",
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
    slug: "ngv",
    name: "National Gallery of Victoria",
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
    slug: "mca-australia",
    name: "Museum of Contemporary Art Australia",
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
    slug: "egyptian-museum-cairo",
    name: "The Egyptian Museum in Cairo",
    location: "Cairo, Egypt",
    description: "The Egyptian Museum in Cairo holds one of the world's most important collections of ancient Egyptian antiquities, with major artefacts spanning multiple dynasties.",
    latitude: 30.0478,
    longitude: 31.2336,
    country: "Egypt",
    region: "Cairo Governorate",
    representativeImage: "https://egyptianmuseumcairo.eg/wp-content/uploads/2023/01/egyptian-museum-cairo.jpg",
    permanentExhibitions: [],
    temporaryExhibitions: [],
    pastExhibitions: []
  },
  {
    id: "nmec",
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
    slug: "gem",
    name: "Grand Egyptian Museum",
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
    slug: "tepapa",
    name: "Te Papa Tongarewa",
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
  }
];
