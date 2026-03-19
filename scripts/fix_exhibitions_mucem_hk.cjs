const fs = require('fs');
let content = fs.readFileSync('src/data/exhibitions.js', 'utf8');

// Update Mucem: replace the permanentExhibitions array entirely
content = content.replace(
  /permanentExhibitions:\s*\[\s*\{\s*id:\s*"mucem-collection"[^\]]+\]/,
  `permanentExhibitions: [
      { id: "mucem-collection", name: "The Collection", title: "Mucem - The Collection", description: "회화, 판화, 드로잉을 포함한 순수 미술 및 전체 컬렉션 4,314점.", startDate: "Permanent", endDate: "Permanent", collectionFile: "mucem-collection.json" }
    ]`
  );

// Hamburger Kunsthalle - ADD Missing Drawing/Video collections and update Painting name
content = content.replace(
  /collectionFile:\s*"hamburger-kunsthalle-paintings.json"\s*\}/,
  `collectionFile: "hamburger-kunsthalle-paintings.json" },
      { id: "hamburger-kunsthalle-drawings", name: "Drawings", title: "Hamburger Kunsthalle Drawings", description: "Over 13,390 drawings and prints from the Hamburger Kunsthalle collection.", startDate: "Permanent", endDate: "Permanent", collectionFile: "hamburger-kunsthalle-drawings.json" },
      { id: "hamburger-kunsthalle-video", name: "Video Art", title: "Hamburger Kunsthalle Video Art", description: "289 contemporary video artworks and installations.", startDate: "Permanent", endDate: "Permanent", collectionFile: "hamburger-kunsthalle-video.json" }`
);

content = content.replace(
  /id:\s*"hamburger-kunsthalle-collection"/,
  'id: "hamburger-kunsthalle-paintings"'
);

content = content.replace(/name:\s*"Permanent Collection",\s*title:\s*"Hamburger Kunsthalle Sammlung"/, 'name: "Paintings", title: "Hamburger Kunsthalle Sammlung"');


fs.writeFileSync('src/data/exhibitions.js', content);
