const fs = require('fs');

let content = fs.readFileSync('src/data/exhibitions.js', 'utf8');

const regex = /\{\s*id:\s*"hamburger-kunsthalle-collection"[\s\S]*?collectionFile:\s*"hamburger-kunsthalle-paintings\.json"\s*\}/;

const newHamburger = `{ id: "hamburger-kunsthalle-paintings", name: "Paintings Collection", title: "Malerei Collection", description: "2,286 paintings spanning seven centuries of European art history, from Old Masters to German Expressionism and contemporary works.", startDate: "Permanent", endDate: "Permanent", collectionFile: "hamburger-kunsthalle-paintings.json" },
      { id: "hamburger-kunsthalle-drawings", name: "Drawings Collection", title: "Zeichnung Collection", description: "13,397 drawings from the 15th century to present day, including works by Dürer, Rembrandt, Kirchner, and contemporary artists.", startDate: "Permanent", endDate: "Permanent", collectionFile: "hamburger-kunsthalle-drawings.json" },
      { id: "hamburger-kunsthalle-video", name: "Video Art Collection", title: "Video Art", description: "289 video artworks and media installations by international contemporary artists.", startDate: "Permanent", endDate: "Permanent", collectionFile: "hamburger-kunsthalle-video.json" }`;

if (content.match(regex)) {
    content = content.replace(regex, newHamburger);
    fs.writeFileSync('src/data/exhibitions.js', content);
    console.log('Reverted Hamburger Kunsthalle to multiple exhibitions.');
} else {
    console.log('Could not find single Hamburger Kunsthalle exhibition.');
}
