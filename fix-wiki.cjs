const fs = require('fs');
let code = fs.readFileSync('src/components/ArtistWikiPanel.tsx', 'utf8');

const sIdx = code.indexOf('return (');
if (sIdx > -1) {
  const eIdx = code.lastIndexOf(');');
  
  const toReplace = code.substring(sIdx, eIdx + 2);
  const replaceStr = `return (
    <section className="infinite-wiki" style={{ padding: 0 }}>
      <div className="infinite-wiki__content" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div className="infinite-wiki__text" style={{ width: '100%', maxWidth: 'none' }}>
          {headerSlot && (
            <div className="infinite-wiki__header-slot" style={{ marginBottom: 16 }}>{headerSlot}</div>
          )}
          <p className="infinite-wiki__body" style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: 'inherit' }}>
            {wikiLoading && !wikiSummary
              ? "작가 정보를 불러오는 중입니다..."
              : wikiSummary || safeFallbackDescription}
          </p>
          {wikiSourceUrl && (
            <a
              href={wikiSourceUrl}
              className="infinite-wiki__link"
              target="_blank"
              rel="noreferrer"
              style={{ display: 'inline-block', marginTop: 12, fontSize: 12, opacity: 0.7 }}
            >
              Wikipedia ↗
            </a>
          )}
          {wikiError && false}
        </div>
        <div 
          className="infinite-wiki__ascii" 
          aria-label="artist typing"
          style={{
            margin: 0,
            fontSize: '0.75rem',
            fontFamily: '"IBM Plex Mono", monospace',
            color: 'inherit',
            background: 'transparent',
            border: '1px dashed rgba(200, 200, 200, 0.3)',
            padding: '12px 16px',
            borderRadius: 4,
            alignSelf: 'flex-start',
            display: 'inline-block',
            lineHeight: 1
          }}
        >
          {visibleName}
          {isTyping && <span className="infinite-wiki__cursor">|</span>}
        </div>
      </div>
    </section>
  );`;
  
  code = code.replace(toReplace, replaceStr);
  
  if (!code.includes('visibleName')) {
     const stateInject = `
  const [visibleName, setVisibleName] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    let index = 0;
    setVisibleName("");
    setIsTyping(true);
    const interval = setInterval(() => {
      if (index >= artistName.length) {
        clearInterval(interval);
        setTimeout(() => setIsTyping(false), 2000);
        return;
      }
      setVisibleName(prev => prev + artistName[index]);
      index++;
    }, 80);
    return () => clearInterval(interval);
  }, [artistName]);
`;
     code = code.replace(/(const \[wikiLoading[^;]+;)/, `$1\n${stateInject}`);
  }
  
  fs.writeFileSync('src/components/ArtistWikiPanel.tsx', code);
  console.log('Fixed wiki panel render');
}
