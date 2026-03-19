const fs = require('fs');

async function compareFields() {
    const listUrl = "https://musee-matisse.opacweb.io/api/v2/notices/search?onlineFilter=online&items_per_page=2&page=1&query=&onlyHasImage=true";
    const res = await fetch(listUrl);
    const list = await res.json();
    const items = list['hydra:member'];

    for (const item of items) {
        // ID extraction: @id: "/api/v2/notices/XXX"
        const id = item['@id'].split('/').pop();
        const detailUrl = `https://musee-matisse.opacweb.io/api/v2/notices/${id}`;
        console.log(`Fetching ${detailUrl}...`);
        const dRes = await fetch(detailUrl);
        const detail = await dRes.json();
        console.log(`--- Item: ${item.title} ---`);
        console.log(JSON.stringify(detail.detail.content.fields, null, 2));
    }
}

compareFields();
