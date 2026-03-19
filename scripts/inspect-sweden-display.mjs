import fetch from 'node-fetch';

const BASE_URL = 'https://collection.nationalmuseum.se';
// A known item
const ITEM_ID = '214587'; 

async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.status}`);
    }
    return response.json();
}

async function main() {
    const itemUrl = `${BASE_URL}/_next/data/m_Ge927LpOLHuystKX3to/en/collection/item/${ITEM_ID}.json`;
    console.log(`Fetching ${itemUrl}...`);
    const data = await fetchJson(itemUrl);
    const item = data.pageProps.data.item;
    
    // Check for "On Display" related fields
    console.log("Keys:", Object.keys(item).filter(k => k.toLowerCase().includes('display') || k.toLowerCase().includes('location')));
    
    // Check current location
    console.log("Location:", item.OclLocation);
    // Check if there is a 'IsOnDisplay' flag
    console.log("IsOnDisplay:", item.IsOnDisplay);
    console.log("ObjPlacementCurrentText:", item.ObjPlacementCurrentText); // Often used in collections
}

main().catch(console.error);
