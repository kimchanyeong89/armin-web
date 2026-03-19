const fs = require('fs');
let code = fs.readFileSync('src/components/ArtistWikiPanel.tsx', 'utf8');

const sIdx = code.indexOf('return (', code.indexOf('export function ArtistWikiPanel'));
if (sIdx > -1) {
  const eIdx = code.lastIndexOf(');');
  
  const toReplace = code.substring(sIdx, eIdx + 2);
  const replaceStr = `return (
    <div style={{ padding: 0, margin: 0 }}>
      {headerSlot}
      <p style={{ fontSize: 13, color: 'inherit', lineHeight: 1.6, margin: 0 }}>
        {wikiLoading && !wikiSummary
          ? "작가 정보를 불러오는 중입니다..."
          : wikiSummary || "Loading artist lore..."}
      </p>
    </div>
  );`;
  
  code = code.replace(toReplace, replaceStr);
  fs.writeFileSync('src/components/ArtistWikiPanel.tsx', code);
}
