const fs = require('fs');
fs.writeFileSync('inner.js', `
const normalizeSearchText = (value) => {
  if (!value) return '';
  const base = value
    .normalize('NFKD')
    .replace(/[\\u0300-\\u036f]/g, '')
    .toLowerCase();
  const cleaned = base.replace(/[^\\p{L}\\p{N}]+/gu, ' ');
  return cleaned.replace(/\\s+/g, ' ').trim();
};

const KNOWN_ARTIST_KEYS = {
    soutine: 'soutine',
    simonet: 'simonet',
    desportes: 'desportes',
    rottluff: 'schmidt-rottluff',
    ofrembrandt: 'rembrandt',
    manetti: 'manetti',
    paik: 'paik'
};

function getArtistKey(name) {
    if (!name) return '';
    let stripped = name.replace(/(?:^|\\s)dit\\)\\s*/i, ' ');
    const bioRegex = /\\([^)]*(\\d+|active|born|died|century|france|italy|germany|spain|dutch|flemish|british|lithuania|american|english)[^)]*(\\)|$)/ig;
    stripped = stripped.replace(bioRegex, ' ');
    stripped = stripped.replace(/[()]/g, ' ');

    if (stripped.includes(',') && !stripped.includes(' and ') && !stripped.includes('&')) {
        const parts = stripped.split(',');
        if (parts.length >= 2) {
            stripped = parts[1] + ' ' + parts[0];
        }
    }

    let normalized = normalizeSearchText(stripped);

    const tokens = normalized.split(/[\\s-]+/).filter(t => t.length > 2 && !['the', 'van', 'der', 'von', 'and', 'und', 'la', 'le'].includes(t));

    for (const token of tokens) {
        if (KNOWN_ARTIST_KEYS[token]) {
            return KNOWN_ARTIST_KEYS[token];
        }
    }

    return tokens.sort().join(' ');
}

const variants = [
'Allan Kaprow, Nam June Paik, Otto Piene,',
'Charlotte Moorman Nam June Paik',
'Charlotte Moorman, Nam June Paik',
'Jongkwan PAIK',
'Nam June Paik',
'Nam June PAIK',
'NAM JUNE PAIK',
'Paik Mee-Ok',
'Paik Moon Ki',
'Paik Tae-Ho',
'Paik Tae-Won',
'Paik Youn Hee',
'PAIK, Nam June',
'YOONHEE PAIK'
];

for (const v of variants) {
  console.log('[' + getArtistKey(v) + '] <- ' + v);
}
`);
