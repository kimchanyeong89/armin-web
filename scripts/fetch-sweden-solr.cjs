const fs = require('fs');

async function run() {
    const baseUrl = "https://collection.nationalmuseum.se/solr/published/select";
    const params = new URLSearchParams();
    params.append('facet.sort', 'index');
    params.append('facet', 'true');
    params.append('facet.mincount', '0');
    params.append('json.nl', 'arrarr');
    params.append('facet.limit', '-1');
    params.append('fl', '*,score');
    params.append('fq', 'exhibited_s:Yes');
    params.append('fq', 'has_picture_s:Yes');
    params.append('fq', 'type:Object');
    params.append('fq', '{!tag=et_new_collection_en_s}new_collection_en_s:*'); // Fetch all collections
    // The previous specific filter was: params.append('fq', '{!tag=et_new_collection_en_s}new_collection_en_s:(#Paintings#* OR #Drawings#*)');
    params.append('q', '*:*');
    params.append('rows', '10000');
    params.append('sort', 'highlights_sml asc');
    params.append('start', '0');

    const url = `${baseUrl}?${params.toString()}`;
    console.log('Fetching:', url);

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        
        console.log(`Found ${data.response.numFound} items.`);
        
        fs.writeFileSync('sweden-solr-raw-full.json', JSON.stringify(data, null, 2));
        console.log('Saved raw data to sweden-solr-raw-full.json');
        
        /* 
           Processing moved to process-sweden-solr.cjs to avoid errors and handle complexity.
           The raw file contains everything we need.
        */

    } catch (error) {
        console.error('Error:', error);
    }
}

run();
