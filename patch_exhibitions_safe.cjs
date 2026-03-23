const fs = require('fs');

let content = fs.readFileSync('src/data/exhibitions.js', 'utf8');

// Petit Palais
content = content.replace(
  '{ id: "petit-palais-collection", name: "Permanent Collection", title: "Petit Palais - Musée des Beaux-Arts de la Ville de Paris", description: "고대부터 아르누보까지, 회화·드로잉·판화 컬렉션 400점. 쿠르베, 르누아르, 들라크루아 등 프랑스 미술의 정수.", startDate: "Permanent", endDate: "Permanent" }',
  '{ id: "petit-palais-collection", name: "Permanent Collection", title: "Petit Palais - Musée des Beaux-Arts de la Ville de Paris", description: "고대부터 아르누보까지, 회화·드로잉·판화 컬렉션 400점. 쿠르베, 르누아르, 들라크루아 등 프랑스 미술의 정수.", startDate: "Permanent", endDate: "Permanent", collectionFile: "petit-palais-collection.json" },\n      { id: "petit-palais-drawings", name: "Drawings", title: "Petit Palais Drawings", description: "프티 팔레 드로잉 컬렉션 157점.", startDate: "Permanent", endDate: "Permanent", collectionFile: "petit-palais-drawings.json" }'
);
// Some space variants just in case
content = content.replace(
  /{ id: "petit-palais-collection", name: "Permanent Collection".*?endDate: "Permanent" }/g,
  (match) => match.includes('collectionFile') ? match : match + ', collectionFile: "petit-palais-collection.json" },\n      { id: "petit-palais-drawings", name: "Drawings", title: "Petit Palais Drawings", description: "프티 팔레 드로잉 컬렉션 157점.", startDate: "Permanent", endDate: "Permanent", collectionFile: "petit-palais-drawings.json" }'
);

// Kroller-Muller
content = content.replace(
  /{ id: "kroller-muller-collection", name: "Kröller-Müller Collection".*?collectionFile: "kroller-muller-paintings.json" }/s,
  `{ id: "kroller-muller-collection", name: "Kröller-Müller Collection", title: "Kröller-Müller Permanent Collection", description: "The complete permanent collection of the Kröller-Müller Museum.", startDate: "Permanent", endDate: "Permanent", collectionFile: "kroller-muller-paintings.json" },
      { id: "kroller-muller-photography", name: "Photography Collection", title: "Kröller-Müller Photography", description: "Extensive photography collection.", startDate: "Permanent", endDate: "Permanent", collectionFile: "kroller-muller-photography.json" },
      { id: "kroller-muller-film-video", name: "Film & Video Art", title: "Kröller-Müller Film & Video", description: "Pioneering film and video art works.", startDate: "Permanent", endDate: "Permanent", collectionFile: "kroller-muller-film-video.json" }`
);

// Carnavalet
content = content.replace(
  /{ id: "carnavalet-the-collection", name: "The Collection".*?collectionFile: "carnavalet-paintings.json" }/s,
  `{ id: "carnavalet-the-collection", name: "The Collection", title: "Carnavalet - La Collection", description: "파리 역사를 담은 회화 및 판화 전체 컬렉션 1,600여점.", startDate: "Permanent", endDate: "Permanent", collectionFile: "carnavalet-the-collection.json" },
      { id: "carnavalet-paintings", name: "Paintings", title: "Carnavalet Paintings", description: "파리 역사를 담은 회화 필수 컬렉션.", startDate: "Permanent", endDate: "Permanent", collectionFile: "carnavalet-paintings.json" },
      { id: "carnavalet-prints", name: "Prints", title: "Carnavalet Prints", description: "카르나발레 판화 아카이브.", startDate: "Permanent", endDate: "Permanent", collectionFile: "carnavalet-prints.json" }`
);

// Wales
content = content.replace(
  /{ id: "museum-wales-paintings", name: "The collection".*?collectionFile: "museum-wales-paintings.json" }/s,
  `{ id: "museum-wales-art", name: "Art Collection", title: "National Museum Wales - Art", description: "Extensive art collection of the National Museum Wales, featuring nearly 10,000 works.", startDate: "Permanent", endDate: "Permanent", collectionFile: "museum-wales-art.json" },
      { id: "museum-wales-paintings", name: "Paintings & Drawings", title: "National Museum Wales - Paintings, Drawings & Watercolours", description: "Selected paintings, drawings, and watercolours.", startDate: "Permanent", endDate: "Permanent", collectionFile: "museum-wales-paintings.json" },
      { id: "museum-wales-industry", name: "Industry Collection", title: "National Museum Wales - Industry", description: "Extensive industrial heritage collections.", startDate: "Permanent", endDate: "Permanent", collectionFile: "museum-wales-industry.json" }`
);

fs.writeFileSync('src/data/exhibitions.js', content, 'utf8');
console.log('Done!');
