// cleanArtist 테스트
function cleanArtist(artist) {
  if (!artist || artist === 'Unknown') return 'Unknown';
  
  const monthOnlyPattern = /^(?:\d{1,2}(?:st|nd|rd|th)?\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December)(?:\s+\d{1,2}(?:st|nd|rd|th)?)?$/i;
  if (monthOnlyPattern.test(artist.trim())) return 'Unknown';
  
  if (/^from\s+the\s+/i.test(artist.trim())) return 'Unknown';
  if (/\(maker\s+unknown\)/i.test(artist)) return 'Unknown';
  if (/^After\s+unidentified/i.test(artist.trim())) return 'Unknown';
  
  return artist
    .replace(/(\w)\d{1,2}(?:st|nd|rd|th)?-century.*$/i, '$1')
    .replace(/\s*\d{1,2}(?:st|nd|rd|th)?-century\s+(?:plaster|bronze|marble)\s+cast.*$/i, '')
    .replace(/,?\s*made\s+from\s+.*$/i, '')
    .replace(/^Design\s+by\s+/i, '')
    .replace(/^Designed\s+by\s+/i, '')
    .replace(/^Photographed\s+by\s+/i, '')
    .replace(/^Published\s+by\s+/i, '')
    .replace(/^Original\s+attributed\s+to\s+/i, '')
    .replace(/\s*\d{1,2}(?:st|nd|rd|th)?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s*$/i, '')
    .replace(/\s*(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?\s*$/i, '')
    .replace(/\d{4}(?:\s*[-–;\/,]\s*\d{2,4})*\s*$/, '')
    .replace(/c(?:a)?\.?\s*(?:January|February|March|April|May|June|July|August|September|October|November|December)?\s*$/i, '')
    .replace(/c\.\s*\d{4}(?:\s*[-–]\s*\d{2,4})?\s*$/i, '')
    .replace(/c\.\s*$/i, '')
    .replace(/^\s*\d{4}(?:\s*[-–;\/,]\s*\d{2,4})*\s*/, '')
    .replace(/\s*(?:late|early|mid)?\s*\d{1,2}(?:st|nd|rd|th)\s+century(?:\/early\s+\d{1,2}(?:st|nd|rd|th)\s+century)?\s*$/i, '')
    .replace(/\s+/g, ' ')
    .replace(/[;\/,\?\.]\s*$/, '')
    .replace(/^\s*[;\/,]\s*/, '')
    .trim() || 'Unknown';
}

console.log('테스트 결과:');
console.log('May →', cleanArtist('May'));
console.log('4th December →', cleanArtist('4th December'));
console.log('sculptor18th-century plaster cast →', cleanArtist('sculptor18th-century plaster cast'));
console.log('George Dance1780 →', cleanArtist('George Dance1780'));
console.log('Design by Guyatt/Jenkins →', cleanArtist('Design by Guyatt/Jenkins'));
console.log('from the Baths of Caracalla →', cleanArtist('from the Baths of Caracalla'));
console.log('After unidentified Roman →', cleanArtist('After unidentified Roman'));
console.log('Agasias of Ephesus19th-century plaster cast →', cleanArtist('Agasias of Ephesus19th-century plaster cast'));
console.log('Gérard Audran19th-century plaster cast →', cleanArtist('Gérard Audran19th-century plaster cast'));
