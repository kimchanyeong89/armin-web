// One-shot: swap the 3 dead last-slot rows for the gap7 viable museums.
// Replaces cols 2-5; col6 → 🔄 placeholder for update-genre-status to fill via NAME2SLUG.
import fs from 'node:fs';
const DOC = 'GENRE_TOP10_LIST.md';
const SWAPS = [
  [(c) => c.includes('Tokyo Photographic'), 'FOMU — FotoMuseum Antwerpen', 'Antwerp', 'Belgium', '유럽'],
  [(c) => c.includes('Triennale Milano'), 'Museum für Kunst und Gewerbe Hamburg (MKG)', 'Hamburg', 'Germany', '유럽'],
  [(c) => c.includes('RIBA Collections'), 'Frac Centre-Val de Loire', 'Orléans', 'France', '유럽'],
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
      cells[6] = ' 🔄 '; n++;
      return cells.join('|');
    }
  }
  return line;
});
fs.writeFileSync(DOC, out.join('\n'));
console.log(`swapped ${n} dead-slot rows`);
