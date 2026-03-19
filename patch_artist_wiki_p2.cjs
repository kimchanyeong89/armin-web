const fs = require('fs');
let content = fs.readFileSync('src/components/ArtistWikiPanel.tsx', 'utf8');

const target1 = `  return (
    <section className="infinite-wiki">`;

const replace = `  return (
    <>
      {headerSlot && <div className="infinite-wiki__header-slot">{headerSlot}</div>}
      {wikiLoading && !wikiSummary ? (
        <p className="artist-bio__loading">Loading biography…</p>
      ) : (
        <p className="artist-bio__text">
          {wikiSummary || safeFallbackDescription}
        </p>
      )}
      {wikiError && <p className="artist-bio__error">{wikiError}</p>}
    </>
  );`;

if(content.indexOf(target1) !== -1) {
    const start = content.indexOf(target1);
    const end = content.indexOf('</section>', start) + '</section>'.length;
    const finalEnd = content.indexOf(';', end) + 1;
    
    let newContent = content.substring(0, start) + replace + content.substring(finalEnd);
    fs.writeFileSync('src/components/ArtistWikiPanel.tsx', newContent);
    console.log("Patched ArtistWikiPanel successfully!");
} else {
    console.log("Target not found!");
}
