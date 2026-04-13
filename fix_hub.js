import fs from 'fs';

const filePath = '/Users/kietzsche/armin-web-main/src/pages/AICurationHubPage.tsx';
let txt = fs.readFileSync(filePath, 'utf8');

// 1. Add firebase imports if missing
if (!txt.includes('deleteDoc')) {
  txt = txt.replace(/import {([^}]*)getDoc,([^}]*)} from "firebase\/firestore";/, 'import { $1getDoc, deleteDoc, setDoc, serverTimestamp,$2} from "firebase/firestore";');
}

// 2. Fix the AI Fallback Recommendation random sort and limit sids
const fallbackRegex = /const sampleIds = shuffledLikes\.slice\(\s*0,\s*Math\.min\(3, shuffledLikes\.length\),\s*\);[\s\S]*?\/\/\s*Deduplicate and randomize the merged results[\s\S]*?fetchedResults = mixedResults\s*\.sort\(\(\) => 0\.5 - Math\.random\(\)\)/m;

if (fallbackRegex.test(txt)) {
  txt = txt.replace(fallbackRegex, `const sampleIds = shuffledLikes.slice(0, 1); // Only 1 random seed for cohesive aesthetic
            
            let mixedResults: any[] = [];
            for (const sid of sampleIds) {
              const fallbackRes = await fetch(\`\${WORKER}/recommend-by-id\`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: sid, limit: 30, metadata: { name: likedData.find((d: any) => d.id === sid)?.title || '' } }),
              });
              if (fallbackRes.ok) {
                const fbData = await fallbackRes.json();
                if (fbData.results) mixedResults.push(...fbData.results);
              }
            }

            // Deduplicate (maintain similarity ordering from worker!)
            const seen = new Set();
            fetchedResults = mixedResults`);
}

// 3. Define handleToggleLike in the component and track likedSet
const compRegex = /const \[statsLoaded, setStatsLoaded\] = useState\(false\);/;
if (compRegex.test(txt)) {
  if (!txt.includes('const [likedSet, setLikedSet]')) {
    txt = txt.replace(compRegex, `const [statsLoaded, setStatsLoaded] = useState(false);
  const [likedSet, setLikedSet] = useState<Set<string>>(new Set());

  const handleToggleLike = async (e: any, art: any) => {
    if (e) e.stopPropagation();
    if (!user) return;
    const id = art.id || art.artworkId;
    if (!id) return;
    const isLiked = likedSet.has(id);
    const db = getFirestore();
    const ref = doc(db, \`users/\${user.uid}/liked_artworks/\${id}\`);
    if (isLiked) {
      await deleteDoc(ref);
      setLikedSet(prev => { const n = new Set(prev); n.delete(id); return n; });
    } else {
      await setDoc(ref, {
        ...art,
        id,
        image: art.image || art.i || '',
        title: art.title || art.n || art.name || 'Untitled',
        artist: art.artist || art.a || 'Unknown',
        museumName: art.museumName || art.m || '',
        likedAt: serverTimestamp()
      });
      setLikedSet(prev => { const n = new Set(prev); n.add(id); return n; });
    }
  };`);
  }
}

// Also update where we read likedData to populate initial likedSet
const likedDataRegex = /const likedData = snap\.docs\.map\(\s*\(d\) => \(\{ id: d\.id, \.\.\.d\.data\(\) \}\),\s*\);/;
if (likedDataRegex.test(txt) && !txt.includes('setLikedSet(new Set(likedIds))')) {
  txt = txt.replace(likedDataRegex, `const likedData = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setLikedSet(new Set(likedIds));`);
}

// 4. Update CurationTab invocation to pass onToggleLike
if (!txt.includes('onToggleLike={handleToggleLike}')) {
  txt = txt.replace(/onSelect=\{\(ex: any\) => \{/, `likedSet={likedSet}\n              onToggleLike={handleToggleLike}\n              onSelect={(ex: any) => {`);
}

// 5. Update CurationTab definition
const tabMatch = txt.match(/function CurationTab\(\{([^}]*)\}\) \{[\s\S]*?if \(loading\)/);
if (tabMatch && !tabMatch[0].includes('onToggleLike')) {
  const replacement = tabMatch[0]
      .replace('userArtworks,', 'userArtworks, likedSet, onToggleLike,')
      .replace('loading,', 'loading,');
  txt = txt.replace(tabMatch[0], replacement);
}

// 6. Fix CurationTab rendering: Remove "더 많은 추천 작품" and merge map
const aiPicksRegex = /const aiPicks = userArtworks\.slice\(0, 4\);[\s\S]*?aiPicks\.map/m;
if (aiPicksRegex.test(txt)) {
  txt = txt.replace(/const aiPicks = userArtworks\.slice\(0, 4\);[\s\S]*?aiPicks\.map/m, `userArtworks.map`);
  // Remove the entire "More Highlight" block: <h3 ...> 더 많은 추천 작품 </h3> ...
  txt = txt.replace(/<\/div>\s*<div\s*style=\{\{\s*padding: "32px 20px 48px"[\s\S]*?더 많은 추천 작품[\s\S]*?<\/h3>\s*<div[^>]*>[\s\S]*?userArtworks\.slice\(4\)\.map[\s\S]*?\}\)\}\s*<\/div>\s*<\/div>/m, '</div>');
  
  // Fix the Heart onClick inside CurationTab mapping (which was calling onSelect)
  txt = txt.replace(/<button\s*onClick=\{\(e\) => \{\s*e\.stopPropagation\(\);\s*onSelect\([^)]+\);\s*\}\}\s*style=\{\{\s*width: 24/g, 
    `<button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onToggleLike) onToggleLike(e, ex);
                      }}
                      style={{
                        width: 24`);
                        
  // Also pass isLiked prop conditionally if we can determine it
  // Actually we need to change <Heart size={12} strokeWidth={2.2} /> to filled/unfilled if liked!
  txt = txt.replace(/<Heart size=\{12\} strokeWidth=\{2\.2\} \/>/g, `<Heart size={12} strokeWidth={2.2} fill={likedSet?.has(ex.id || ex.artworkId) ? "currentColor" : "none"} />`);
}

// Also pass onToggleLike to ArtworkLightbox !
const lightboxRegex = /<ArtworkLightbox\s*artwork=\{lightboxArtwork\}\s*isLiked=\{false\}\s*onToggleLike=\{\(\) => \{\}\}/;
if (lightboxRegex.test(txt)) {
  txt = txt.replace(lightboxRegex, `<ArtworkLightbox 
          artwork={lightboxArtwork}
          isLiked={likedSet.has(lightboxArtwork.id)}
          onToggleLike={handleToggleLike}`);
}


fs.writeFileSync(filePath, txt);
console.log("Rewrite complete");
