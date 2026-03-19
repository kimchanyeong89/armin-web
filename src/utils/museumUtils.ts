export const normalizeToken = (token: string | undefined): string | null => {
    if (!token) return null;
    return token.toLowerCase().trim()
        .replace(/[^a-z0-9]/g, ''); // remove all non-alphanumeric chars
};

export const getExhibitionTokens = (exhibition: any): Set<string> => {
    const tokens = new Set<string>();
    if (exhibition.id) tokens.add(normalizeToken(exhibition.id) || '');
    if (exhibition.name) {
        const norm = normalizeToken(exhibition.name);
        if (norm) tokens.add(norm);
    }
    // Also add collection file name without extension as token
    if (exhibition.collectionFile) {
        const fileToken = normalizeToken(exhibition.collectionFile.replace('.json', ''));
        if (fileToken) tokens.add(fileToken);
    }
    return tokens;
};

// Global cache for museum tokens to avoid exponential complexity
const museumTokensCache = new Map<any[], any[]>();

const getMemoizedMuseumTokens = (museums: any[]) => {
    if (museumTokensCache.has(museums)) {
        return museumTokensCache.get(museums)!;
    }
    const memo = museums.map(m => {
        const nameToken = normalizeToken(m.name);
        const idToken = normalizeToken(m.id);
        const permTokens = (m.permanentExhibitions || []).map((pe: any) => ({
            tokens: getExhibitionTokens(pe),
            fileToken: pe.collectionFile ? normalizeToken(pe.collectionFile.replace('.json', '')) : null,
            idToken: normalizeToken(pe.id)
        }));
        return { museum: m, nameToken, idToken, permTokens };
    });
    museumTokensCache.set(museums, memo);
    return memo;
};

export const findMuseumForArtwork = (artworkItem: any, museums: any[]) => {
    const memo = getMemoizedMuseumTokens(museums);
    
    const artExhibitionToken = normalizeToken(artworkItem.exhibitionId);
    if (artExhibitionToken) {
        const match = memo.find(m => m.permTokens.some((pt: any) => pt.tokens.has(artExhibitionToken)));
        if (match) return match.museum;
    }

    const artMuseumToken = normalizeToken(artworkItem.museumName || artworkItem.museum || artworkItem.source);
    if (artMuseumToken) {
        // Direct exact match
        let match = memo.find(m => m.nameToken === artMuseumToken);
        if (match) return match.museum;

        // Partial match with stricter rules
        match = memo.find(m => {
            if (!m.nameToken) return false;
            // Prevent short tokens from causing false positives (e.g "M+")
            if (artMuseumToken.length < 4 || m.nameToken.length < 4) return m.nameToken === artMuseumToken;
            return m.nameToken.includes(artMuseumToken) || artMuseumToken.includes(m.nameToken);
        });
        if (match) return match.museum;
    }

    // Check artwork ID prefix against collection file names
    const artId = artworkItem.id || artworkItem.artworkId || '';
    if (artId) {
        // Extract possible prefixes from artwork ID (e.g., "smb-..." → "smb", "alte-pinakothek-123" → "alte-pinakothek")
        const prefixMatch = artId.match(/^([a-zA-Z][a-zA-Z0-9-]*?)-[A-Z0-9]+/i) || artId.match(/^([a-zA-Z][a-zA-Z0-9-]*?)_/);
        const artIdPrefix = prefixMatch ? normalizeToken(prefixMatch[1]) : normalizeToken(artId.split('-')[0]) || normalizeToken(artId.split('_')[0]);

        if (artIdPrefix && artIdPrefix.length >= 3) {
            // Check against museum ID
            const byMuseumId = memo.find(m => m.idToken?.includes(artIdPrefix) || artIdPrefix.includes(m.idToken || ''));
            if (byMuseumId) return byMuseumId.museum;

            // Check against permanent exhibition collection file names
            for (const m of memo) {
                for (const pt of m.permTokens) {
                    if (pt.fileToken && (pt.fileToken.includes(artIdPrefix) || artIdPrefix.includes(pt.fileToken))) {
                        return m.museum;
                    }
                    if (pt.idToken && (pt.idToken.includes(artIdPrefix) || artIdPrefix.includes(pt.idToken))) {
                        return m.museum;
                    }
                }
            }
        }
    }

    return undefined;
};

