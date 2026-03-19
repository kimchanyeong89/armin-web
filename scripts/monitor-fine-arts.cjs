const fs = require('fs');
const path = require('path');

const STATUS_FILE = 'public/data/fine-arts-be-status.json';

const LOG_FILE = 'scripts/mfab-scrape.log';

function formatTime(iso) {
    return new Date(iso).toLocaleTimeString();
}

console.clear();
console.log("Waiting for scraper stats...");

setInterval(() => {
    let hasStats = false;
    
    // Clear screen
    console.clear();
    console.log("==========================================");
    console.log("   FINE ARTS BELGIUM SCRAPER DASHBOARD    ");
    console.log("==========================================");

    if (fs.existsSync(STATUS_FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
            hasStats = true;
            console.log("");
            console.log(`  Items Collected : ${data.count}`);
            console.log(`  Current Page    : ${data.page}`);
            console.log(`  Last Update     : ${formatTime(data.timestamp)}`);
            console.log("");
            console.log("------------------------------------------");
            console.log(`  Latest Item:`);
            console.log(`  [${data.last_type}] ${data.last_item}`);
            console.log("------------------------------------------");
        } catch (e) {}
    } 

    if (!hasStats) {
        console.log("\n  [Status: Initializing / No Data Yet]");
    }

    if (fs.existsSync(LOG_FILE)) {
        console.log("\n  --- Recent Log Output ---");
        try {
            const logs = fs.readFileSync(LOG_FILE, 'utf8').trim().split('\n').slice(-5);
            logs.forEach(l => console.log(`  > ${l.substring(0, 80)}`));
        } catch(e) {}
    }
}, 2000);
