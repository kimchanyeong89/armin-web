const fs = require('fs');

let content = fs.readFileSync('src/components/ProductModal.tsx', 'utf-8');

// 1. Add useNavigate and cleanArtistName
content = content.replace(
  "import { getWeservUrl } from '../utils/imageProxy';",
  "import { getWeservUrl } from '../utils/imageProxy';\nimport { useNavigate } from 'react-router-dom';\n\nconst cleanArtistName = (artist: string | undefined | null): string => {\n    if (!artist) return '';\n    const lower = artist.toLowerCase();\n    if (lower.includes('©') || lower.includes('all rights reserved') || lower.includes('unknown')) return '';\n    return artist.replace(/\\s*\\([^)]*\\d{4}[^)]*\\)\\s*/g, '').trim();\n};"
);

// 2. Add navigate to component
content = content.replace(
  "const [isMobile, setIsMobile] = useState(() => typeof window !== \"undefined\" ? window.innerWidth < 768 : false);",
  "const [isMobile, setIsMobile] = useState(() => typeof window !== \"undefined\" ? window.innerWidth < 768 : false);\n    const navigate = useNavigate();"
);

// 3. Update Styles in <style>
content = content.replace(
  /background: #fafafa;/g,
  "background: rgba(201,165,90,0.1);"
).replace(
  /background: #222;/g,
  "background: rgba(201,165,90,0.2); border-color: #c9a55a;"
).replace(
  /background: #f5f5f5;/g,
  "background: rgba(255,255,255,0.05);"
).replace(
  /background: #f0f0f0;/g,
  "background: rgba(201,165,90,0.1);"
).replace(
  /border-color: #222;/g,
  "border-color: #c9a55a;"
).replace(
  /color: #fff !important;/g,
  "color: #c9a55a !important;"
).replace(
  /color: white;/g,
  "color: #c9a55a;"
).replace(
  /border: 2px solid #e5e5e5;/g,
  "border: 1px solid rgba(255,255,255,0.1);"
).replace(
  /border: 1px solid #e5e5e5;/g,
  "border: 1px solid rgba(255,255,255,0.1);"
).replace(
  /color: '#333'/g,
  "color: '#f0ede6'"
).replace(
  /color: '#111'/g,
  "color: '#fff'"
).replace(
  /color: '#666'/g,
  "color: '#aaa'"
).replace(
  /color: '#888'/g,
  "color: 'rgba(240,237,230,0.4)'"
).replace(
  /color: selectedSize === sizeItem\.id \? '#fff' : '#333'/g,
  "color: selectedSize === sizeItem.id ? '#c9a55a' : '#f0ede6'"
).replace(
  /color: selectedType === type\.id \? '#fff' : '#222'/g,
  "color: selectedType === type.id ? '#c9a55a' : '#f0ede6'"
).replace(
  /color: selectedType === type\.id \? 'rgba\\(255,255,255,0\.8\\)' : '#888'/g,
  "color: selectedType === type.id ? 'rgba(201,165,90,0.8)' : 'rgba(240,237,230,0.4)'"
);

// Update specific background colors inline
content = content.replace(
  "background: '#fff',",
  "background: 'transparent'," // Payment buttons and container inside the main modal
).replace(
  "background: '#fff',",
  "background: 'transparent'," 
).replace(
  "background: '#fff',",
  "background: 'transparent'," 
).replace(
  "background: '#fff',",
  "background: 'transparent',"
);

// Main Modal Container
content = content.replace(
  "background: '#fff',\n                    borderRadius: 16,",
  "background: 'rgba(8, 8, 7, 0.75)',\n                    backdropFilter: 'blur(30px)',\n                    WebkitBackdropFilter: 'blur(30px)',\n                    border: '1px solid rgba(201, 165, 90, 0.2)',\n                    borderRadius: 16,"
);

// Artist Clickable
content = content.replace(
  "<p style={{\n                                    color: '#aaa',\n                                    fontSize: 14,\n                                    margin: 0\n                                }}>\n                                    {artwork.artist}{artwork.year ? ` · ${artwork.year}` : ''}\n                                </p>",
  `{(() => {
                                    const artistStr = cleanArtistName(artwork.artist);
                                    const isUnknown = !artistStr || artistStr.toLowerCase() === 'unknown artist' || artistStr.toLowerCase() === 'unknown';
                                    return (
                                        <p style={{ color: '#aaa', fontSize: 14, margin: 0, marginTop: 4 }}>
                                            {isUnknown ? artistStr : (
                                                <span
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onClose();
                                                        navigate(\`/artist/\${encodeURIComponent(artistStr)}\`);
                                                    }}
                                                    style={{ cursor: 'pointer', borderBottom: '1px solid rgba(201,165,90,0.3)', transition: 'color 0.2s, border-color 0.2s', paddingBottom: 2 }}
                                                    onMouseEnter={e => { e.currentTarget.style.color = '#c9a55a'; e.currentTarget.style.borderColor = '#c9a55a'; }}
                                                    onMouseLeave={e => { e.currentTarget.style.color = '#aaa'; e.currentTarget.style.borderColor = 'rgba(201,165,90,0.3)'; }}
                                                    title="View Artist Page"
                                                >
                                                    {artistStr}
                                                </span>
                                            )}
                                            {artwork.year ? \` \\u00B7 \${artwork.year}\` : ''}
                                        </p>
                                    );
                                })()}`
);


// Replace the remaining #fff backgrounds for containers
content = content.replace(/background: '#fff'/g, "background: 'rgba(0,0,0,0.2)'");
content = content.replace(/background: '#fafafa'/g, "background: 'rgba(0,0,0,0.3)'");
content = content.replace(/borderTop: '1px solid #e5e5e5'/g, "borderTop: '1px solid rgba(255,255,255,0.05)'");
content = content.replace(/background: '#222'/g, "background: 'rgba(201,165,90,0.1)'");
content = content.replace(/background: selectedType === type.id \? 'rgba\\(201,165,90,0.1\\)' : 'rgba\\(0,0,0,0.2\\)'/g, "background: selectedType === type.id ? 'rgba(201,165,90,0.2)' : 'rgba(0,0,0,0.3)'");
content = content.replace(/background: selectedSize === sizeItem.id \? 'rgba\\(201,165,90,0.1\\)' : 'rgba\\(0,0,0,0.2\\)'/g, "background: selectedSize === sizeItem.id ? 'rgba(201,165,90,0.2)' : 'rgba(0,0,0,0.3)'");

// Purchase button
content = content.replace(
  "background: 'rgba(201,165,90,0.1)',\n                                    border: 'none',\n                                    borderRadius: 12,\n                                    padding: '14px 36px',\n                                    color: '#c9a55a',",
  "background: 'rgba(201,165,90,0.15)',\n                                    border: '1px solid rgba(201,165,90,0.4)',\n                                    borderRadius: 12,\n                                    padding: '14px 36px',\n                                    color: '#c9a55a',"
);

// Close button hover
content = content.replace(
  "onMouseEnter={(e) => e.currentTarget.style.background = '#e5e5e5'}",
  "onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}"
).replace(
  "onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}",
  "onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}"
);
content = content.replace(/#333/g, '#f0ede6');
content = content.replace(/#111/g, '#fff');

fs.writeFileSync('src/components/ProductModal.tsx', content);

