const fs = require('fs');
let code = fs.readFileSync('src/data/exhibitions.js', 'utf8');

const replacements = [
  {
    old: `    permanentExhibitions: [
      { id: "carnavalet-the-collection", name: "The Collection", title: "Carnavalet - La Collection", description: "파리 역사를 담은 회화 및 판화 전체 컬렉션 1,600여점.", startDate: "Permanent", endDate: "Permanent", collectionFile: "carnavalet-the-collection.json" },
      { id: "carnavalet-paintings", name: "Paintings", title: "Carnavalet Paintings", description: "파리 역사를 담은 회화 필수 컬렉션.", startDate: "Permanent", endDate: "Permanent", collectionFile: "carnavalet-paintings.json" },
      { id: "carnavalet-prints", name: "Prints", title: "Carnavalet Prints", description: "카르나발레 판화 아카이브.", startDate: "Permanent", endDate: "Permanent", collectionFile: "carnavalet-prints.json" },
      { id: "carnavalet-prints", name: "Prints", title: "Carnavalet Prints", description: "카르나발레 판화 아카이브.", startDate: "Permanent", endDate: "Permanent", collectionFile: "carnavalet-prints.json" }
    ],`,
    new: `    permanentExhibitions: [
      { id: "carnavalet-the-collection", name: "The Collection", title: "Carnavalet - La Collection", description: "파리 역사를 담은 회화 및 판화 전체 컬렉션 1,600여점.", startDate: "Permanent", endDate: "Permanent", collectionFile: "carnavalet-the-collection.json" }
    ],`
  },
  {
    old: `    permanentExhibitions: [
      { id: "petit-palais-collection", name: "The Collection", title: "Petit Palais Collection", description: "The eclectic permanent collection of the Petit Palais.", startDate: "Permanent", endDate: "Permanent", collectionFile: "petit-palais-collection.json" },
      { id: "petit-palais-drawings", name: "Drawings", title: "Petit Palais Drawings", description: "Important drawings and sketches.", startDate: "Permanent", endDate: "Permanent", collectionFile: "petit-palais-drawings.json" },
      { id: "petit-palais-drawings", name: "Drawings", title: "Petit Palais Drawings", description: "Important drawings and sketches.", startDate: "Permanent", endDate: "Permanent", collectionFile: "petit-palais-drawings.json" }
    ],`,
    new: `    permanentExhibitions: [
      { id: "petit-palais-collection", name: "The Collection", title: "Petit Palais Collection", description: "The eclectic permanent collection of the Petit Palais.", startDate: "Permanent", endDate: "Permanent", collectionFile: "petit-palais-collection.json" }
    ],`
  },
  {
    old: `    permanentExhibitions: [
      { id: "petit-palais-collection", name: "The Collection", title: "Petit Palais Collection", description: "The eclectic permanent collection of the Petit Palais.", startDate: "Permanent", endDate: "Permanent", collectionFile: "petit-palais-collection.json" },
      { id: "petit-palais-drawings", name: "Drawings", title: "Petit Palais Drawings", description: "Important drawings and sketches.", startDate: "Permanent", endDate: "Permanent", collectionFile: "petit-palais-drawings.json" }
    ],`,
    new: `    permanentExhibitions: [
      { id: "petit-palais-collection", name: "The Collection", title: "Petit Palais Collection", description: "The eclectic permanent collection of the Petit Palais.", startDate: "Permanent", endDate: "Permanent", collectionFile: "petit-palais-collection.json" }
    ],`
  },
  {
    old: `    permanentExhibitions: [
      { id: "wales-art", name: "Art Collection", title: "National Museum Wales - Art", description: "Welsh and international art including the Davies Sisters collection of Impressionist paintings.", startDate: "Permanent", endDate: "Permanent", collectionFile: "wales-art.json" },
      { id: "wales-industry", name: "Industry Collection", title: "National Museum Wales - Industry", description: "The industrial heritage of Wales.", startDate: "Permanent", endDate: "Permanent", collectionFile: "wales-industry.json" }
    ],`,
    new: `    permanentExhibitions: [
    ],`
  },
  {
    old: `    permanentExhibitions: [
      { id: "kroller-muller-collection", name: "Kröller-Müller Collection", title: "Kröller-Müller Permanent Collection", description: "The complete permanent collection of the Kröller-Müller Museum.", startDate: "Permanent", endDate: "Permanent", collectionFile: "kroller-muller-paintings.json" },
      { id: "kroller-muller-photography", name: "Photography Collection", title: "Kröller-Müller Photography", description: "Extensive photography collection.", startDate: "Permanent", endDate: "Permanent", collectionFile: "kroller-muller-photography.json" },
      { id: "kroller-muller-film-video", name: "Film & Video Art", title: "Kröller-Müller Film & Video", description: "Pioneering film and video art works.", startDate: "Permanent", endDate: "Permanent", collectionFile: "kroller-muller-film-video.json" },
      { id: "kroller-muller-photography", name: "Photography Collection", title: "Kröller-Müller Photography", description: "Extensive photography collection.", startDate: "Permanent", endDate: "Permanent", collectionFile: "kroller-muller-photography.json" },
      { id: "kroller-muller-film-video", name: "Film & Video Art", title: "Kröller-Müller Film & Video", description: "Pioneering film and video art works.", startDate: "Permanent", endDate: "Permanent", collectionFile: "kroller-muller-film-video.json" }
    ],`,
    new: `    permanentExhibitions: [
      { id: "kroller-muller-collection", name: "Kröller-Müller Collection", title: "Kröller-Müller Permanent Collection", description: "The complete permanent collection of the Kröller-Müller Museum.", startDate: "Permanent", endDate: "Permanent", collectionFile: "kroller-muller-permanent.json" }
    ],`
  },
  {
    old: `    permanentExhibitions: [
      { id: "kroller-muller-collection", name: "Kröller-Müller Collection", title: "Kröller-Müller Permanent Collection", description: "The complete permanent collection of the Kröller-Müller Museum.", startDate: "Permanent", endDate: "Permanent", collectionFile: "kroller-muller-paintings.json" },
      { id: "kroller-muller-photography", name: "Photography Collection", title: "Kröller-Müller Photography", description: "Extensive photography collection.", startDate: "Permanent", endDate: "Permanent", collectionFile: "kroller-muller-photography.json" },
      { id: "kroller-muller-film-video", name: "Film & Video Art", title: "Kröller-Müller Film & Video", description: "Pioneering film and video art works.", startDate: "Permanent", endDate: "Permanent", collectionFile: "kroller-muller-film-video.json" }
    ],`,
    new: `    permanentExhibitions: [
      { id: "kroller-muller-collection", name: "Kröller-Müller Collection", title: "Kröller-Müller Permanent Collection", description: "The complete permanent collection of the Kröller-Müller Museum.", startDate: "Permanent", endDate: "Permanent", collectionFile: "kroller-muller-permanent.json" }
    ],`
  }
];

let changed = 0;
for (const r of replacements) {
  if (code.includes(r.old)) {
    code = code.replace(r.old, r.new);
    changed++;
  } else {
    console.log("NOT FOUND:", r.old.substring(0, 80) + "...");
  }
}
if (changed > 0) {
  fs.writeFileSync('src/data/exhibitions.js', code);
  console.log('Fixed exhibitions.js, changes:', changed);
}
