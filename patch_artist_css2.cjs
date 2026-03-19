const fs = require('fs');

const cssCode = `
@import url("https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400&family=Space+Grotesk:wght@300;400;500;600&display=swap");

/* ─────────────────────────────────────────────
   CSS CUSTOM PROPERTIES
───────────────────────────────────────────── */
.artist-page {
  --ap-bg:            #080807; /* very dark background */
  --ap-surface:       #111110;
  --ap-surface-2:     #1a1918;
  --ap-text:          #f0ede6;
  --ap-text-2:        #b8b3aa;
  --ap-text-3:        #8a867d;
  --ap-text-4:        #6a6560;
  --ap-accent:        #c9a55a;
  --ap-accent-2:      #e8d5a3;
  --ap-border:        #2a2926;
  --ap-border-light:  #1e1d1c;
}

.artist-page[data-theme="light"] {
  --ap-bg:            #f7f4ef;
  --ap-surface:       #ffffff;
  --ap-surface-2:     #f2ede6;
  --ap-text:          #1a1918;
  --ap-text-2:        #3d3a35;
  --ap-text-3:        #7a746e;
  --ap-text-4:        #a09890;
  --ap-accent:        #8a6420;
  --ap-accent-2:      #6a4c18;
  --ap-border:        #e8e3dc;
  --ap-border-light:  #ddd8cf;
}

/* ─────────────────────────────────────────────
   BASE
───────────────────────────────────────────── */
.artist-page {
  min-height: 100vh;
  background: var(--ap-bg);
  color: var(--ap-text);
  font-family: inherit;
  padding: 3vh 3vw;
  display: flex;
  justify-content: center;
}

.artist-page__frame {
  max-width: 1400px;
  width: 100%;
  border: 1px solid var(--ap-border-light);
  background: var(--ap-surface);
  border-radius: 4px; /* subtle border radius */
  overflow: hidden;
  box-shadow: 0 10px 40px rgba(0,0,0,0.5);
}

/* ─────────────────────────────────────────────
   HERO
───────────────────────────────────────────── */
.artist-hero {
  padding: 4vw 5vw 3vw 5vw;
  border-bottom: 1px solid var(--ap-border-light);
  position: relative;
  overflow: hidden;
}

/* Add that subtle noise texture from before */
.artist-hero::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E");
  pointer-events: none; opacity: 0.5;
}

.artist-hero__eyebrow {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 40px;
  position: relative;
  z-index: 2;
}

.artist-hero__tag-group {
  display: flex;
  align-items: center;
  gap: 20px;
}

.artist-hero__tag {
  font-size: 0.75rem;
  letter-spacing: 0.25em;
  font-weight: 500;
}

.artist-hero__tag--primary {
  color: var(--ap-accent);
  padding: 6px 14px;
  border: 1px solid color-mix(in srgb, var(--ap-accent) 40%, transparent);
  border-radius: 2px;
}

.artist-hero__tag--ghost {
  color: var(--ap-text-4);
}

.artist-hero__controls {
  display: flex;
  gap: 12px;
}

.artist-hero__icon-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--ap-surface-2);
  border: 1px solid var(--ap-border-light);
  color: var(--ap-text-3);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s;
}
.artist-hero__icon-btn:hover {
  border-color: var(--ap-accent);
  color: var(--ap-accent);
}

.artist-hero__name {
  font-family: "Playfair Display", Georgia, serif;
  font-size: clamp(3.2rem, 8vw, 6.5rem);
  font-weight: 300;
  line-height: 0.92;
  letter-spacing: -0.02em;
  margin: 0 0 30px;
  color: var(--ap-text);
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 20px;
}

.artist-hero__heart {
  font-size: clamp(1.8rem, 4vw, 3rem);
  color: var(--ap-text-4);
  font-weight: 300;
  cursor: pointer;
  transition: color 0.2s;
  display: flex;
  align-items: center;
}
.artist-hero__heart:hover {
  color: var(--ap-accent);
}

.artist-hero__footer {
  display: flex;
  gap: 40px;
  align-items: center;
  position: relative;
  z-index: 2;
}

.artist-hero__count {
  font-size: 0.8rem;
  letter-spacing: 0.14em;
  color: var(--ap-text-3);
  text-transform: uppercase;
}
.artist-hero__count strong {
  color: var(--ap-text);
  font-weight: 500;
}

.artist-hero__wiki-link {
  font-size: 0.8rem;
  letter-spacing: 0.12em;
  color: var(--ap-accent);
  text-decoration: none;
  text-transform: uppercase;
  border-bottom: 1px solid color-mix(in srgb, var(--ap-accent) 35%, transparent);
  padding-bottom: 2px;
  transition: all 0.2s;
}
.artist-hero__wiki-link:hover {
  color: var(--ap-accent-2);
  border-bottom-color: var(--ap-accent-2);
}

/* ─────────────────────────────────────────────
   BIO + MAP
───────────────────────────────────────────── */
.artist-profile {
  display: grid;
  grid-template-columns: minmax(320px, 35%) 1fr;
  border-bottom: 1px solid var(--ap-border-light);
}

.artist-bio {
  padding: 4vw 5vw 4vw 5vw;
  border-right: 1px solid var(--ap-border-light);
  display: flex;
  flex-direction: column;
}

.artist-bio__label {
  color: var(--ap-accent);
  font-size: 0.65rem;
  font-weight: 500;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  margin: 0 0 24px 0;
}

.artist-bio__text {
  font-size: 0.95rem;
  line-height: 1.8;
  color: var(--ap-text-2);
  margin: 0 0 auto 0; 
}

.artist-bio__ascii {
  margin-top: 40px;
  font-family: "IBM Plex Mono", Menlo, monospace;
  font-size: 0.72rem;
  color: var(--ap-border);
  line-height: 1.2;
  white-space: pre;
  overflow: hidden;
  user-select: none;
}

.artist-map-col {
  padding: 4vw 5vw 4vw 5vw;
  background: var(--ap-bg); 
}

.artist-map-col__label {
  color: var(--ap-accent);
  font-size: 0.65rem;
  font-weight: 500;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  margin: 0 0 24px 0;
}

.artist-map-col__map-wrapper {
  position: relative;
}

/* ─────────────────────────────────────────────
   GALLERY / FILTERS
───────────────────────────────────────────── */
.artist-gallery {
  /* padding bottom */
}

.artist-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 2vw 5vw;
  border-bottom: 1px solid var(--ap-border-light);
}

.artist-filter-btn {
  background: transparent;
  border: 1px solid color-mix(in srgb, var(--ap-border-light) 60%, transparent);
  color: var(--ap-text-3);
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 0.8rem;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
}
.artist-filter-btn:hover {
  border-color: var(--ap-text-3);
  color: var(--ap-text);
}
.artist-filter-btn.artist-filter-btn--active {
  background: var(--ap-accent);
  color: #000;
  border-color: var(--ap-accent);
  font-weight: 500;
}

.artist-gallery__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 4vw;
  padding: 4vw 5vw;
}

.artist-gallery__card {
  cursor: pointer;
  display: flex;
  flex-direction: column;
}

.artist-gallery__img-wrap {
  width: 100%;
  aspect-ratio: 4 / 3;
  position: relative;
  overflow: hidden;
  background: var(--ap-surface-2);
  border-radius: 4px;
}

.artist-gallery__img-wrap img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  padding: 4%;
  transition: transform 0.3s ease;
}

.artist-gallery__card:hover .artist-gallery__img-wrap img {
  transform: scale(1.02);
}

.artist-gallery__card-actions {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  gap: 6px;
  opacity: 0;
  transition: opacity 0.2s;
}

.artist-gallery__card:hover .artist-gallery__card-actions {
  opacity: 1;
}

.artist-gallery__card-btn {
  background: rgba(0,0,0,0.6);
  border: 1px solid rgba(255,255,255,0.2);
  color: #fff;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
  backdrop-filter: blur(4px);
}
.artist-gallery__card-btn:hover {
  background: rgba(0,0,0,0.8);
  border-color: rgba(255,255,255,0.4);
}

.artist-gallery__card-info {
  padding: 16px 0;
}

.artist-gallery__card-title {
  font-size: 0.95rem;
  margin: 0 0 6px 0;
  font-weight: 500;
  color: var(--ap-text);
  line-height: 1.3;
}

.artist-gallery__card-subtitle {
  font-size: 0.8rem;
  margin: 0;
  color: var(--ap-text-3);
}

/* RESPONSIVE */
@media (max-width: 900px) {
  .artist-page {
    padding: 0;
  }
  .artist-page__frame {
    border: none;
    border-radius: 0;
  }
  .artist-profile {
    grid-template-columns: 1fr;
  }
  .artist-bio {
    border-right: none;
    border-bottom: 1px solid var(--ap-border-light);
  }
  .artist-controls {
    display: none; /* or modify appropriately */
  }
}
`;

fs.writeFileSync('src/styles/ArtistPage.css', cssCode);
console.log('CSS Created cleanly');
