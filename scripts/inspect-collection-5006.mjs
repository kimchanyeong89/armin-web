import fetch from 'node-fetch';

const BASE_URL = 'https://collection.nationalmuseum.se';

async function inspectCollection(id) {
    const listUrl = `${BASE_URL}/_next/data/m_Ge927LpOLHuystKX3to/en/collection.json?lng=en&f=${id}&v=2`;
    const response = await fetch(listUrl);
    const data = await response.json();
    
    // Find the collection with this ID (or look for it in the list)
    // The collection.json returns a list of ALL collections. We need to find the specific object in that array.
    const targetCollection = data.pageProps.collections.find(c => c.Id === id);
    
    if (targetCollection) {
        console.log(`Collection: ${targetCollection.OclTitleTxt} (${targetCollection.Id})`);
        const items = targetCollection.OclObjectRef.Items;
        console.log(`Item Count: ${items.length}`);
        
        if (items.length > 0) {
            const firstItemId = items[0].ReferencedId;
            console.log(`Inspecting Item ${firstItemId}...`);
            
            const itemUrl = `${BASE_URL}/_next/data/m_Ge927LpOLHuystKX3to/en/collection/item/${firstItemId}.json`;
            const itemResp = await fetch(itemUrl);
            const itemData = await itemResp.json();
            const item = itemData.pageProps.data.item;
            
            console.log("ObjTitle:", item.ObjTitleMainTxt || item.ObjTitleMainTxt_sv);
            console.log("ObjCategoryTxt:", item.ObjCategoryTxt);
            console.log("ObjCollectionTxt:", item.ObjCollectionTxt);
        }
    } else {
        console.log(`Collection ${id} not found in listing.`);
    }
}

inspectCollection('5005');
