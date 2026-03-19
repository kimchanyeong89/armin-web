
const fs = require('fs');

async function fetchWithRetry(url) {
    console.log("Fetching:", url);
    try {
        const res = await fetch(url + "&origin=*", {
            headers: { 'User-Agent': 'ArminWebBot/1.0 (armin@example.com)' }
        });
        if (!res.ok) {
            console.log("Error status:", res.status);
            return null;
        }
        return await res.json();
    } catch (e) {
        console.error("Fetch error:", e);
        return null;
    }
}

async function debugArtist(name) {
    console.log(`Debugging: ${name}`);

    // 1. Search
    const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name)}&language=en&limit=1&format=json`;
    const searchRes = await fetchWithRetry(searchUrl);

    if (!searchRes || !searchRes.search || searchRes.search.length === 0) {
        console.log("Search failed or no results:", JSON.stringify(searchRes));
        return;
    }

    const hit = searchRes.search[0];
    console.log("Found entity:", hit.id, hit.label);

    // 2. Claims
    const claimsUrl = `https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=${hit.id}&property=P569|P570|P18&format=json`;
    const claimsRes = await fetchWithRetry(claimsUrl);

    if (!claimsRes || !claimsRes.claims) {
        console.log("No claims found:", JSON.stringify(claimsRes));
        return;
    }

    console.log("Birth:", JSON.stringify(claimsRes.claims.P569?.[0]?.mainsnak?.datavalue));
    console.log("Death:", JSON.stringify(claimsRes.claims.P570?.[0]?.mainsnak?.datavalue));
}

debugArtist("Edvard Munch");
