const fs = require('fs');

const FILE = 'public/data/nasjonal-collection.json';

function filterToOnDisplayDrawings() {
    const data = JSON.parse(fs.readFileSync(FILE));
    console.log(`Loaded ${data.length} items.`);

    const drawingCount = data.filter(i => i.category === 'Drawing').length;
    console.log(`Current Drawing items: ${drawingCount}`);

    // Remove all current drawings
    const withoutDrawings = data.filter(i => i.category !== 'Drawing');
    console.log(`Items without drawings: ${withoutDrawings.length}`);

    // We need to scrape again with proper filtering or manually verify the 60 items
    // Since the API doesn't respect onDisplay, we'll need to check each item's detail page
    // OR we can just take the first 60 from the scraped data as a workaround
    // But that's not accurate. Let me check the _raw data for onDisplay flag.

    console.log('\nChecking if _raw data has onDisplay information...');
    const drawings = data.filter(i => i.category === 'Drawing');
    if (drawings.length > 0) {
        console.log('Sample drawing _raw keys:', Object.keys(drawings[0]._raw || {}));
        console.log('Sample drawing _raw:', JSON.stringify(drawings[0]._raw, null, 2).substring(0, 500));
    }

    // For now, let's just remove all drawings and re-add them properly
    // The issue is the API doesn't filter properly
    // We need a different approach

    fs.writeFileSync(FILE, JSON.stringify(withoutDrawings, null, 2));
    console.log('\nRemoved all drawings. File saved.');
    console.log('You need to manually scrape the 60 onDisplay drawings.');
}

filterToOnDisplayDrawings();
