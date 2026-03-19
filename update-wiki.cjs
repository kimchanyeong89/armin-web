const fs = require('fs');
let content = fs.readFileSync('src/components/ArtistWikiPanel.tsx', 'utf8');
content = content.replace(/  return \([\s\S]*?    <\/section>\n  \);\n}/, `  return (
    <div style={{ padding: 0, margin: 0 }}>
      {headerSlot}
      <p style={{ fontSize: 13, color: 'inherit', lineHeight: 1.6, margin: 0 }}>
        {wikiLoading && !wikiSummary
          ? "작가 정보를 불러오는 중입니다..."
          : wikiSummary || safeFallbackDescription}
      </p>
    </div>
  );
}`);
fs.writeFileSync('src/components/ArtistWikiPanel.tsx', content);
