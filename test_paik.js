const normalizeSearchText = (value) => {
  if (!value) return '';
  const base = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const cleaned = base.replace(/[^\p{L}\p{N}]+/gu, ' ');
  return cleaned.replace(/\s+/g, ' ').trim();
};

function getArtistKey(name) {
    if (!name) return '';
    let stripped = name.replace(/(?:^|\s)dit\)\s*/i, ' ');
    const bioRegex = /\([^)]*(\d+|active|born|died|century|france|italy|germany|spain|dutch|flemish|british|lithuania|american|english)[^)]*(\)|$)/ig;
    stripped = stripped.replace(bioRegex, ' ');
    stripped = stripped.replace(/[()]/g, ' ');

    if (stripped.includes(',') && !stripped.includes(' and ') && !stripped.includes('&')) {
        const parts = stripped.split(',');
        if (parts.length >= 2) {
            stripped = parts[1] + ' ' + parts[0];
        }
    }

    let normalized = normalizeSearchText(stripped);

    const tokens = normalized.split(/[\s-]+/).filter(t => t.length > 2 && !['the', 'van', 'der', 'von', 'and', 'und', 'la', 'le'].includes(t));

    return tokens.sort().join(' ');
}

console.log(getArtistKey('Nam June Paik'));
console.log(getArtistKey('PAIK, Nam June'));
console.log(getArtistKey('Paik, Nam June (1932-)'));
console.log(getArtistKey('NAM JUNE PAIK'));
