const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '../public/data/matisse-nice-collection.json');
const SEARCH_API = "https://musee-matisse.opacweb.io/api/v2/notices/search?onlineFilter=online&items_per_page=1000&page=1&query=&onlyHasImage=true";

async function main() {
    console.log('Fetching full list from API...');

    try {
        const res = await fetch(SEARCH_API);
        const data = await res.json();

        const items = data['hydra:member']; // Should get all since per_page=1000 and total is ~486
        console.log(`Found ${items.length} items (Total: ${data['hydra:totalItems']}). Processing all...`);

        const artworks = [];

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const id = item['@id'].split('/').pop();
            const detailUrl = `https://musee-matisse.opacweb.io/api/v2/notices/${id}`;

            console.log(`[${i + 1}/${items.length}] Fetching details for ${id}...`);

            try {
                const dRes = await fetch(detailUrl);
                const detail = await dRes.json();

                // Helper to extract field content
                const getField = (zoneLabel, fieldLabel) => {
                    const zones = detail.zones || [];
                    const zone = zones.find(z => z.label && z.label.toLowerCase() === zoneLabel.toLowerCase());
                    if (!zone) return null;

                    for (const occur of zone.occurZones || []) {
                        const field = occur.fields.find(f => f.label && f.label.toLowerCase() === fieldLabel.toLowerCase());
                        if (field) return field.content;
                    }
                    return null;
                };

                // Extract Fields
                const inventory = getField('Identification', "Numéro d'inventaire") || getField('Identification', 'Numero d\'inventaire');
                const title = getField('Désignation', 'Désignation du bien') || getField('Désignation', 'Notes') || item.title;
                const artist = getField('Création/Exécution', 'Auteur') || "Henri Matisse";
                const date = getField('Création/Exécution', 'Epoque, datation') || getField('Création/Exécution', 'Notes') || "";

                let medium = getField('Matière et technique', 'Matière et technique');
                if (!medium) {
                    const desig = getField('Désignation', 'Désignation du bien');
                    if (desig && !desig.toLowerCase().includes(title.toLowerCase())) medium = desig;
                }

                const dimension = getField('Mesures', 'Mesures') || "";

                // Category from Facets (Domaine)
                // We look for the facet related to "Domaine"
                let category = "Artwork";
                if (detail.facets) {
                    const domainFacet = detail.facets.find(f => f.content === 'Domaine');
                    if (domainFacet) {
                        const domainValue = detail.facets.find(f => f.rootId === domainFacet.id && f.id !== domainFacet.id);
                        if (domainValue) category = domainValue.content;
                    } else {
                        // Fallback: Check for constant ID 1140127 if text lookup fails (though text is safer if ID changes)
                        const domainValueLegacy = detail.facets.find(f => f.rootId === 1140127 && f.id !== 1140127);
                        if (domainValueLegacy) category = domainValueLegacy.content;
                    }
                }

                // Image
                let image = detail.mainImageLargeUrl || (detail.mainImage ? (detail.mainImage.url || "") : "");
                if (!image && item.images && item.images.large) image = item.images.large;

                artworks.push({
                    id: `matisse-nice-${inventory ? inventory.replace(/[^a-zA-Z0-9]/g, '-') : id}`,
                    title: title,
                    artist: artist,
                    year: date,
                    date: date,
                    medium: medium || "",
                    dimensions: dimension,
                    category: category,
                    image: image,
                    source: detail.url || `https://musee-matisse.opacweb.io/fr/notice/${detail.slug}`,
                    museum: "Musée Matisse Nice",
                    metadata: {
                        inventory: inventory,
                        raw_date: date
                    }
                });

            } catch (err) {
                console.error(`Error details for ${id}:`, err.message);
            }
        }

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(artworks, null, 2));
        console.log(`Saved ${artworks.length} items to ${OUTPUT_FILE}`);

    } catch (e) {
        console.error('Error in main scrape:', e);
    }
}

main();
