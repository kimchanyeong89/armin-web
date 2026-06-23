// One-shot: swap dead-slot rows in the genre Top-10 tables for the next-ranked viable museums.
// Replaces cols 2-5 (museum/city/country/continent) of the matched row; the ARMIN status cell
// (col 6) is left to update-genre-status.mjs (the new name resolves via NAME2SLUG). Genre-table
// rows only (8 pipe-fields, col1 numeric). Idempotent: if the new name is already present, skip.
import fs from 'node:fs';
const DOC = 'GENRE_TOP10_LIST.md';

// [matcher(col2)->bool, newMuseum, city, country, continent]
const SWAPS = [
  [(c) => c.includes('George Eastman') && c.includes('이스트먼'), "Musée Nicéphore Niépce (니엡스)", 'Chalon-sur-Saône', 'France', '유럽'],
  [(c) => c.includes('Fotomuseum Winterthur'), 'Huis Marseille', 'Amsterdam', 'Netherlands', '유럽'],
  [(c) => c.trim() === 'Vitra Design Museum', 'CNAP (프랑스 국립조형예술센터)', 'Paris', 'France', '유럽'],
  [(c) => c.trim() === 'Design Museum', 'Powerhouse Museum', 'Sydney', 'Australia', '오세아니아'],
  [(c) => c.includes('Designmuseum Danmark'), 'Nationalmuseum (스웨덴 국립)', 'Stockholm', 'Sweden', '유럽'],
  [(c) => c.includes('ginza graphic gallery'), 'Letterform Archive', 'San Francisco', 'USA', '북미'],
  [(c) => c.includes('La Cinémathèque française'), 'Filmmuseum Potsdam', 'Potsdam', 'Germany', '유럽'],
];

const lines = fs.readFileSync(DOC, 'utf8').split('\n');
let n = 0;
const out = lines.map((line) => {
  if (!line.startsWith('| ')) return line;
  const cells = line.split('|');
  if (cells.length !== 8 || !/^\s*\d+\s*$/.test(cells[1])) return line;
  for (const [match, name, city, country, cont] of SWAPS) {
    if (match(cells[2])) {
      cells[2] = ` ${name} `; cells[3] = ` ${city} `; cells[4] = ` ${country} `; cells[5] = ` ${cont} `;
      cells[6] = ' 🔄 '; // placeholder; update-genre-status fills the real status
      n++;
      return cells.join('|');
    }
  }
  return line;
});
fs.writeFileSync(DOC, out.join('\n'));
console.log(`swapped ${n} dead-slot rows`);
