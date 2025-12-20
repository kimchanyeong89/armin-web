# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:


## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default tseslint.config({
  extends: [
    // Remove ...tseslint.configs.recommended and replace with this
    ...tseslint.configs.recommendedTypeChecked,
    // Alternatively, use this for stricter rules
    ...tseslint.configs.strictTypeChecked,
    // Optionally, add this for stylistic rules
    ...tseslint.configs.stylisticTypeChecked,
  ],
  languageOptions: {
    // other options...
    parserOptions: {
      project: ['./tsconfig.node.json', './tsconfig.app.json'],
      tsconfigRootDir: import.meta.dirname,
    },
  },
})
```

## National Portrait Gallery data import (manual assist)

When Cloudflare blocks automated scraping, you can capture results in your browser and import them per room:

1) Open an NPG location page (e.g. https://www.npg.org.uk/collections/search/location/998/) and solve any human verification. Ensure the artworks list is visible.

2) In DevTools Console, run this snippet to extract visible cards to JSON and copy to clipboard:

```js
(() => {
  const norm = s => (s || '').replace(/\s+/g, ' ').trim();
  const cards = Array.from(document.querySelectorAll('a[href*="/collections/"]')).map((a, i) => {
    const scope = a.closest('li, article, .result, .c-card, .listing__item, .grid__item') || a;
    const img = scope.querySelector('img');
    const getImg = el => {
      if (!el) return '';
      const ds = el.getAttribute('data-src') || el.getAttribute('data-lazy') || '';
      const ss = el.getAttribute('srcset') || '';
      const sr = el.getAttribute('src') || '';
      if (ds) return ds;
      if (ss) return (ss.split(',').map(s => s.trim()).pop() || '').split(' ')[0] || '';
      return sr;
    };
    const tEl = scope.querySelector('h3, h2, .title, .c-card__title') || a;
    const meta = scope.querySelector('.artist, .creator, .meta, .c-card__meta, .details, .result__meta');
    const title = norm(tEl?.textContent || img?.alt || 'Artwork');
    const metaText = norm(meta?.textContent || '');
    const yearMatch = metaText.match(/\b(1[5-9]\d{2}|20\d{2})\b/);
    const artist = (metaText.split(/[—|·,]/).map(norm).filter(Boolean)[0]) || '';
    return {
      id: `npg-manual-${Date.now()}-${i}`,
      title,
      name: title,
      artist,
      year: yearMatch ? parseInt(yearMatch[0], 10) : null,
      date: yearMatch ? yearMatch[0] : '',
      image: getImg(img),
      url: a.href
    };
  });
  const json = JSON.stringify({ items: cards }, null, 2);
  copy(json); // Copies to clipboard in Chrome/Edge DevTools
  console.log(`Copied ${cards.length} items to clipboard`);
})();
```

3) Paste the clipboard into a file like downloads/npg/room1.json. Repeat per page if there is pagination (scroll or navigate Next and re-run snippet).

4) Import into the app dataset:

- From the project root, run the importer with the directory containing your JSON files and target room:

  - DIR=/abs/path/to/downloads/npg ROOM=1 npm run import:npg:json

This merges and de-duplicates items into public/data/npg-floor3.json under the specified room.
You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default tseslint.config({
  plugins: {
    // Add the react-x and react-dom plugins
    'react-x': reactX,
    'react-dom': reactDom,
  },
  rules: {
    // other rules...
    // Enable its recommended typescript rules
    ...reactX.configs['recommended-typescript'].rules,
    ...reactDom.configs.recommended.rules,
  },
})
```
