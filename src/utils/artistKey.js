// One artist, one key. The static artist files in public/artists are named with
// this key, and the portrait map in public/data/artist-portraits.json shares it,
// so a name written any way — "Monet, Claude", "Claude Monet", "MONET Claude" —
// lands on the same entry. Plain JS, because the build scripts run it under Node.

/**
 * Search text for lookups and keys. Keeps ALL Unicode letters and numbers: the
 * old [^a-z0-9] class normalized every Korean/CJK name to '' — so 한글 작가 never
 * got a merge key, and '' === '' silently cross-matched unrelated names.
 * @param {string} [value]
 * @returns {string}
 */
export const normalizeLookupText = (value) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    // Re-compose Hangul: NFD splits its syllables into jamo.
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/** Words that carry none of a name's identity. */
const ARTIST_KEY_STOP = new Set(['the', 'van', 'der', 'von', 'and', 'und', 'la', 'le']);

/** Known artist last-name keys (mirrors search.worker.ts KNOWN_ARTIST_KEYS). */
export const KNOWN_ARTIST_FILE_KEYS = {
    monet:'monet', manet:'manet', renoir:'renoir', picasso:'picasso', nolde:'nolde',
    delacroix:'delacroix', gogh:'gogh', rembrandt:'rembrandt', vermeer:'vermeer',
    cezanne:'cezanne', degas:'degas', gauguin:'gauguin', matisse:'matisse',
    kandinsky:'kandinsky', klimt:'klimt', dali:'dali', warhol:'warhol', miro:'miro',
    chagall:'chagall', klee:'klee', rodin:'rodin', mondrian:'mondrian',
    pollock:'pollock', rothko:'rothko', bacon:'bacon', hockney:'hockney',
    basquiat:'basquiat', caravaggio:'caravaggio', raphael:'raphael',
    michelangelo:'michelangelo', botticelli:'botticelli', titian:'titian',
    tintoretto:'tintoretto', veronese:'veronese', rubens:'rubens', velazquez:'velazquez',
    goya:'goya', greco:'greco', bruegel:'bruegel', bosch:'bosch', durer:'durer',
    holbein:'holbein', constable:'constable', turner:'turner', gainsborough:'gainsborough',
    reynolds:'reynolds', hogarth:'hogarth', whistler:'whistler', sargent:'sargent',
    homer:'homer', eakins:'eakins', cassatt:'cassatt', seurat:'seurat', signac:'signac',
    caillebotte:'caillebotte', toulouse:'toulouse-lautrec', lautrec:'toulouse-lautrec',
    bonnard:'bonnard', vuillard:'vuillard', redon:'redon', munch:'munch', ensor:'ensor',
    kirchner:'kirchner', schiele:'schiele', kokoschka:'kokoschka', beckmann:'beckmann',
    grosz:'grosz', dix:'dix', duchamp:'duchamp', leger:'leger', braque:'braque',
    gris:'gris', malevich:'malevich', tatlin:'tatlin', lissitzky:'lissitzky',
    rivera:'rivera', kahlo:'kahlo', orozco:'orozco', siqueiros:'siqueiros',
    hopper:'hopper', okeefe:'okeefe', wood:'wood', benton:'benton',
    lichtenstein:'lichtenstein', rauschenberg:'rauschenberg', johns:'johns',
    haring:'haring', koons:'koons', richter:'richter', kiefer:'kiefer',
    bourgeois:'bourgeois', kusama:'kusama', banksy:'banksy', heckel:'heckel',
    pechstein:'pechstein', soutine:'soutine', simonet:'simonet', desportes:'desportes',
    rottluff:'schmidt-rottluff', manetti:'manetti', paik:'paik',
    fantin:'fantin-latour', latour:'fantin-latour',
};

/**
 * Cataloguing notes that say nothing about who the artist is: life dates and
 * nationality in brackets ("(Russian, 1893–1943)"), "(mentioned on object)",
 * "(signed by artist)". Left in, one person became several — "Cuno Amiet" and
 * "Cuno Amiet (Swiss, 1868–1961)" each had a page and a count of their own.
 * Brackets that do tell people apart — "(I)", "(the Elder)" — stay.
 * @param {string} [name]
 * @returns {string}
 */
export const stripArtistNoise = (name) =>
  String(name || '')
    .replace(/\s*[([][^)\]]*(?:\d{4}|mentioned on object|signed by artist|dates unknown)[^)\]]*[)\]]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Hangul and Han carry a whole name in two letters — 김태, 仇英. */
const WHOLE_IN_TWO = /[\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

/**
 * The static-file key for an artist name (e.g. "gogh" for Vincent van Gogh), else
 * the name's own tokens sorted, so word order never matters. Callers holding
 * malformed labels pass the canonical name (getCanonicalName) in, as the search
 * bar does.
 * @param {string} [artistName]
 * @returns {string}
 */
export const artistFileKey = (artistName) => {
  const words = normalizeLookupText(stripArtistNoise(artistName)).split(/\s+/).filter(Boolean);
  let tokens = words.filter((t) => t.length > 2 && !ARTIST_KEY_STOP.has(t));
  for (const t of tokens) {
    if (KNOWN_ARTIST_FILE_KEYS[t]) return KNOWN_ARTIST_FILE_KEYS[t];
  }
  /* only short words left ("김태", "Wu Li"): they are the name, not noise */
  if (tokens.length === 0) tokens = words.filter((t) => WHOLE_IN_TWO.test(t) || t.length > 1);
  return tokens.sort().join('_');
};

/**
 * Which of the 512 shared files holds an artist's works when they have too few
 * for a file of their own. The build and the app must agree, so it lives here.
 * @param {string} key
 * @returns {string}
 */
export const artistShardOf = (key) => {
  let hash = 0x811c9dc5;
  for (const ch of String(key || '')) {
    hash ^= ch.codePointAt(0) || 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash % 512).toString(16).padStart(3, '0');
};

/**
 * The file an artist's works are served from. A key of plain letters is its own
 * name; a key in another script (김태, 李公麟) gets a stable ASCII name, because a
 * URL has to carry it and the old "replace every non-ASCII letter with _" turned
 * every Korean name into the same "__.json".
 * @param {string} key
 * @returns {string}
 */
export const artistFileName = (key) => {
  const value = String(key || '');
  if (/^[a-z0-9_-]+$/.test(value)) return value;
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (const ch of value) {
    const code = ch.codePointAt(0) || 0;
    a = Math.imul(a ^ code, 0x01000193) >>> 0;
    b = Math.imul(b ^ code, 0x5bd1e995) >>> 0;
  }
  return `x-${a.toString(16).padStart(8, '0')}${b.toString(16).padStart(8, '0')}`;
};

/** Artists with at least this many works have a file of their own. */
export const ARTIST_OWN_FILE_MIN = 10;

/**
 * "Monet, Claude" → "Claude Monet", "SURNAME Given" → "Given Surname", with the
 * cataloguing brackets taken off. The one display form of a name — the app shows
 * it and the build files artists under it.
 * @param {string} [raw]
 * @returns {string}
 */
export const prettifyArtistName = (raw) => {
  let name = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!name) return name;
  // strip bio-year parens ("(1900-1989)", "(French, 1887-1985)") — display noise, not a qualifier
  name = name.replace(/\s*\([^)]*\d{4}[^)]*\)/g, '').replace(/\s+/g, ' ').trim();
  if (!name) return name;
  // "Surname, Given" → "Given Surname". Skip multi-artist ("A & B" / "A and B")
  // and anonymous/role designations whose comma is NOT a name inversion
  // ("Anonymous Italian, Florentine", "Unknown Painter, mid-18th century").
  const isAnonRole = /\b(anonymous|unknown|unidentified|attributed|circle|school|workshop|studio|follower|manner|various|after)\b/i.test(name);
  if (name.includes(',') && !/\b(and|&)\b/i.test(name) && !isAnonRole) {
    const parts = name.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length === 2) name = `${parts[1]} ${parts[0]}`;
  }
  const words = name.split(' ');
  const isShouty = (w) => w.length >= 2 && /[A-Z]/.test(w) && w === w.toUpperCase();
  if (!words.some(isShouty)) return name;
  const titleCase = (w) => w.replace(/[^\s'-]+/g, (p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase());
  // "SURNAME Given" — a leading run of shouted words then a normal one.
  if (words.length >= 2 && isShouty(words[0]) && !words.every(isShouty)) {
    let i = 0;
    while (i < words.length && isShouty(words[i])) i += 1;
    return [...words.slice(i), ...words.slice(0, i)].map(titleCase).join(' ');
  }
  // Fully shouted — Title Case in place (word order is unknowable).
  return words.map((w) => (isShouty(w) ? titleCase(w) : w)).join(' ');
};
