const { fetch } = require('undici');

const API_URL = "https://samlinger.slks.dk/api/es_artworks";
const MUSEUM_NAME = "Den Hirschsprungske Samling";

async function test() {
    const url = new URL(API_URL);
    url.searchParams.append('museum', MUSEUM_NAME);
    url.searchParams.append('hasReproductions', 'true');
    url.searchParams.append('objectNames', 'Maleri');
    url.searchParams.append('lang', 'da');
    url.searchParams.append('size', 1);

    console.log(`Fetching... ${url.toString()}`);
    const res = await fetch(url.toString());
    const data = await res.json();
    const hits = data['hydra:member'] || data.items || data;

    if (hits.length > 0) {
        console.log(JSON.stringify(hits[0], null, 2));
    } else {
        console.log("No hits found.");
    }
}

test();
