import { normalizeSearchText } from "./textNormalize";

const KNOWN_ARTIST_KEYS: Record<string, string> = {
    'monet': 'monet', 'manet': 'manet', 'renoir': 'renoir', 'picasso': 'picasso',
    'nolde': 'nolde', 'delacroix': 'delacroix', 'gogh': 'gogh', 'rembrandt': 'rembrandt',
    'rembrandts': 'rembrandt',
    'vermeer': 'vermeer', 'cezanne': 'cezanne', 'degas': 'degas', 'gauguin': 'gauguin',
    'matisse': 'matisse', 'kandinsky': 'kandinsky', 'klimt': 'klimt', 'dali': 'dali',
    'warhol': 'warhol', 'miro': 'miro', 'chagall': 'chagall', 'klee': 'klee',
    'mondrian': 'mondrian', 'pollock': 'pollock', 'rothko': 'rothko', 'bacon': 'bacon',
    'hockney': 'hockney', 'basquiat': 'basquiat', 'caravaggio': 'caravaggio',
    'raphael': 'raphael', 'michelangelo': 'michelangelo', 'botticelli': 'botticelli',
    'titian': 'titian', 'tintoretto': 'tintoretto', 'veronese': 'veronese',
    'rubens': 'rubens', 'velazquez': 'velazquez', 'goya': 'goya', 'greco': 'greco',
    'bruegel': 'bruegel', 'bosch': 'bosch', 'durer': 'durer', 'holbein': 'holbein',
    'constable': 'constable', 'turner': 'turner', 'gainsborough': 'gainsborough',
    'reynolds': 'reynolds', 'hogarth': 'hogarth', 'whistler': 'whistler',
    'sargent': 'sargent', 'homer': 'homer', 'eakins': 'eakins', 'cassatt': 'cassatt',
    'seurat': 'seurat', 'signac': 'signac', 'caillebotte': 'caillebotte',
    'toulouse': 'toulouse-lautrec', 'lautrec': 'toulouse-lautrec',
    'bonnard': 'bonnard', 'vuillard': 'vuillard', 'redon': 'redon',
    'munch': 'munch', 'ensor': 'ensor', 'kirchner': 'kirchner', 'schiele': 'schiele',
    'kokoschka': 'kokoschka', 'beckmann': 'beckmann', 'grosz': 'grosz', 'dix': 'dix',
    'duchamp': 'duchamp', 'leger': 'leger', 'braque': 'braque', 'gris': 'gris',
    'malevich': 'malevich', 'tatlin': 'tatlin', 'lissitzky': 'lissitzky',
    'rivera': 'rivera', 'kahlo': 'kahlo', 'orozco': 'orozco', 'siqueiros': 'siqueiros',
    'hopper': 'hopper', 'okeefe': 'okeefe', 'wood': 'wood', 'benton': 'benton',
    'lichtenstein': 'lichtenstein', 'rauschenberg': 'rauschenberg', 'johns': 'johns',
    'haring': 'haring', 'koons': 'koons', 'richter': 'richter', 'kiefer': 'kiefer',
    'bourgeois': 'bourgeois', 'kusama': 'kusama', 'ai': 'ai weiwei', 'banksy': 'banksy',
    'fantin': 'fantin-latour', 'latour': 'fantin-latour',
    'heckel': 'heckel', 'pechstein': 'pechstein',
    'soutine': 'soutine', 'modigliani': 'modigliani',
    'rottluff': 'schmidt-rottluff',
    'paik': 'nam june paik'
};

const CANONICAL_NAMES: Record<string, string> = {
    'monet': 'Claude Monet',
    'manet': 'Édouard Manet',
    'renoir': 'Pierre-Auguste Renoir',
    'picasso': 'Pablo Picasso',
    'nolde': 'Emil Nolde',
    'delacroix': 'Eugène Delacroix',
    'gogh': 'Vincent van Gogh',
    'rembrandt': 'Rembrandt van Rijn',
    'vermeer': 'Johannes Vermeer',
    'cezanne': 'Paul Cézanne',
    'degas': 'Edgar Degas',
    'gauguin': 'Paul Gauguin',
    'matisse': 'Henri Matisse',
    'kandinsky': 'Wassily Kandinsky',
    'klimt': 'Gustav Klimt',
    'dali': 'Salvador Dalí',
    'warhol': 'Andy Warhol',
    'miro': 'Joan Miró',
    'chagall': 'Marc Chagall',
    'klee': 'Paul Klee',
    'mondrian': 'Piet Mondrian',
    'pollock': 'Jackson Pollock',
    'rothko': 'Mark Rothko',
    'bacon': 'Francis Bacon',
    'hockney': 'David Hockney',
    'basquiat': 'Jean-Michel Basquiat',
    'caravaggio': 'Caravaggio',
    'raphael': 'Raphael',
    'michelangelo': 'Michelangelo',
    'botticelli': 'Sandro Botticelli',
    'titian': 'Titian',
    'tintoretto': 'Tintoretto',
    'veronese': 'Paolo Veronese',
    'rubens': 'Peter Paul Rubens',
    'velazquez': 'Diego Velázquez',
    'goya': 'Francisco Goya',
    'greco': 'El Greco',
    'bruegel': 'Pieter Bruegel the Elder',
    'bosch': 'Hieronymus Bosch',
    'durer': 'Albrecht Dürer',
    'holbein': 'Hans Holbein the Younger',
    'constable': 'John Constable',
    'turner': 'J. M. W. Turner',
    'gainsborough': 'Thomas Gainsborough',
    'reynolds': 'Joshua Reynolds',
    'hogarth': 'William Hogarth',
    'whistler': 'James McNeill Whistler',
    'sargent': 'John Singer Sargent',
    'homer': 'Winslow Homer',
    'eakins': 'Thomas Eakins',
    'cassatt': 'Mary Cassatt',
    'seurat': 'Georges Seurat',
    'signac': 'Paul Signac',
    'caillebotte': 'Gustave Caillebotte',
    'toulouse-lautrec': 'Henri de Toulouse-Lautrec',
    'bonnard': 'Pierre Bonnard',
    'vuillard': 'Édouard Vuillard',
    'redon': 'Odilon Redon',
    'munch': 'Edvard Munch',
    'ensor': 'James Ensor',
    'kirchner': 'Ernst Ludwig Kirchner',
    'schiele': 'Egon Schiele',
    'kokoschka': 'Oskar Kokoschka',
    'beckmann': 'Max Beckmann',
    'grosz': 'George Grosz',
    'dix': 'Otto Dix',
    'duchamp': 'Marcel Duchamp',
    'leger': 'Fernand Léger',
    'braque': 'Georges Braque',
    'gris': 'Juan Gris',
    'malevich': 'Kazimir Malevich',
    'tatlin': 'Vladimir Tatlin',
    'lissitzky': 'El Lissitzky',
    'rivera': 'Diego Rivera',
    'kahlo': 'Frida Kahlo',
    'orozco': 'José Clemente Orozco',
    'siqueiros': 'David Alfaro Siqueiros',
    'hopper': 'Edward Hopper',
    'okeefe': 'Georgia O\'Keeffe',
    'wood': 'Grant Wood',
    'benton': 'Thomas Hart Benton',
    'lichtenstein': 'Roy Lichtenstein',
    'rauschenberg': 'Robert Rauschenberg',
    'johns': 'Jasper Johns',
    'haring': 'Keith Haring',
    'koons': 'Jeff Koons',
    'richter': 'Gerhard Richter',
    'kiefer': 'Anselm Kiefer',
    'bourgeois': 'Louise Bourgeois',
    'kusama': 'Yayoi Kusama',
    'ai weiwei': 'Ai Weiwei',
    'banksy': 'Banksy',
    'fantin-latour': 'Henri Fantin-Latour',
    'heckel': 'Erich Heckel',
    'pechstein': 'Max Pechstein',
    'soutine': 'Chaïm Soutine',
    'modigliani': 'Amedeo Modigliani',
    'schmidt-rottluff': 'Karl Schmidt-Rottluff',
    'nam june paik': 'Nam June Paik'
};

export const getCanonicalName = (name: string | undefined | null): string => {
    if (!name) return '';
    if (name.toLowerCase().includes('©') || name.toLowerCase().includes('all rights reserved') || name.toLowerCase().includes('unknown')) return '';

    let cleanName = name.replace(/\s*\([^)]*\d{4}[^)]*\)\s*/g, '').trim();
    
    // Attempt standard grouping algorithm
    const stripped = cleanName
        .replace(/\([^)]*(?:\)|$)/g, ' ')
        .replace(/\b(?:school of|workshop of|circle of|follower of|manner of|studio of|attributed to|copy after)\b/gi, ' ')
        .replace(/\b(?:after|fluxus|skole|school|workshop|circle|follower|studio)\b/gi, ' ')
        .replace(/^dit\)\s*/i, ' ');

    let normalized = normalizeSearchText(stripped);

    const ignored = new Set(['and', 'the', 'der', 'van', 'de', 'di', 'le', 'la', 'von', 'active', 'france', 'lithuania']);
    const tokens = normalized.split(/[\s-]+/).filter(t => t.length > 2 && !ignored.has(t));

    for (let i = tokens.length - 1; i >= 0; i--) {
        const token = tokens[i];
        if (KNOWN_ARTIST_KEYS[token]) {
            const key = KNOWN_ARTIST_KEYS[token];
            if (CANONICAL_NAMES[key]) {
                return CANONICAL_NAMES[key];
            }
        }
    }
    
    // If not matched, fall back to cleaned version but without the noise words
    return stripped.replace(/\s+/g, ' ').trim();
};
