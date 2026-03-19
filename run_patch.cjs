const fs = require('fs');

let code = fs.readFileSync('src/components/GlobalSearchBar.tsx', 'utf8');

code = code.replace(
  /<button\s+className=\{\`artist-filter-btn \$\{!galleryCategory \? 'artist-filter-btn--active' : ''\}\`\}\s+onClick=\{\(\) => setGalleryCategory\(null\)\}\s*>/g,
  `<button
      className={\`artist-filter-btn \${!galleryCategory ? 'artist-filter-btn--active' : ''}\`}
      onClick={() => setGalleryCategory(null)}
      style={{ borderRadius: 20, padding: '4px 14px', fontSize: '0.75rem', fontWeight: 600, border: !galleryCategory ? 'none' : '1px solid var(--ap-border)', background: !galleryCategory ? 'var(--ap-accent)' : 'var(--ap-surface-2)', color: !galleryCategory ? '#111' : 'var(--ap-text)', cursor: 'pointer', transition: 'all 0.2s', fontFamily: 'Inter, sans-serif' }}
  >`
);

code = code.replace(
  /<button\s+key=\{cat\}\s+className=\{\`artist-filter-btn \$\{active \? 'artist-filter-btn--active' : ''\}\`\}\s+onClick=\{\(\) => setGalleryCategory\(active \? null : cat\)\}\s*>/g,
  `<button
      key={cat}
      className={\`artist-filter-btn \${active ? 'artist-filter-btn--active' : ''}\`}
      onClick={() => setGalleryCategory(active ? null : cat)}
      style={{ borderRadius: 20, padding: '4px 14px', fontSize: '0.75rem', fontWeight: 600, border: active ? 'none' : '1px solid var(--ap-border)', background: active ? 'var(--ap-accent)' : 'var(--ap-surface-2)', color: active ? '#111' : 'var(--ap-text)', cursor: 'pointer', transition: 'all 0.2s', fontFamily: 'Inter, sans-serif' }}
  >`
);

fs.writeFileSync('src/components/GlobalSearchBar.tsx', code, 'utf8');
