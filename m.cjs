const fs = require('fs');
let code = fs.readFileSync('src/components/ArtistWikiPanel.tsx', 'utf8');

const target = code.substring(code.indexOf('return ('), code.lastIndexOf(');') + 2);
const replace = `return (
    <div style={{ padding: 0, margin: 0 }}>
      {headerSlot}
      <p style={{ fontSize: 13, color: 'inherit', lineHeight: 1.6, margin: 0 }}>
        {wikiLoading && !wikiSummary
          ? "작가 정보를 불러오는 중입니다..."
          : wikiSummary || fallbackDescription}
      </p>
    </div>
  );`;

code = code.replace(target, replace);
fs.writeFileSync('src/components/ArtistWikiPanel.tsx', code);
