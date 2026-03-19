const fs = require('fs');
let code = fs.readFileSync('src/components/ArtistWikiPanel.tsx', 'utf8');

const returnRegex = /return \([\s\S]*\}\;/;
const newReturn = `return (
    <div style={{ padding: 0, margin: 0 }}>
      {headerSlot}
      <p style={{ fontSize: 15, color: 'inherit', lineHeight: 1.6, margin: 0 }}>
        {wikiLoading && !wikiSummary
          ? "작가 정보를 불러오는 중입니다..."
          : wikiSummary || safeFallbackDescription}
      </p>
    </div>
  );
}`;

code = code.replace(returnRegex, newReturn);
fs.writeFileSync('src/components/ArtistWikiPanel.tsx', code);
console.log('Fixed syntax error!');
