export const getFallbackExhibitionIdForJson = (item: any): string => {
  if (item.exhibitionId) return item.exhibitionId;
  if (item.e) return item.e;
  
  if (item.museumName) {
    const m = (item.museumName || '').toLowerCase();
    if (m.includes('brücke') || m.includes('brucke')) return 'bruecke-museum-collection';
    if (m.includes('tate')) {
      if (m.includes('modern')) return 'tate-modern-collection';
      if (m.includes('britain')) return 'tate-britain-artworks';
      if (m.includes('st iv')) return 'tate-st-ives-artworks';
      if (m.includes('liverpool')) return 'tate-liverpool-artworks';
      return 'tate-modern-collection';
    }
  }
  return '';
};
