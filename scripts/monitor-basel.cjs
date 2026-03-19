const fs = require('fs');
const path = require('path');

const FILE = path.resolve(__dirname, '../public/data/basel-collection.json');
const LOG_FILE = path.resolve(__dirname, '../public/data/basel.log');

function check() {
    process.stdout.write('\x1Bc'); // Clear screen
    console.log('==========================================');
    console.log('   BASEL KUNSTMUSEUM SCRAPER DASHBOARD    ');
    console.log('==========================================');
    
    // Check Data
    if (fs.existsSync(FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
            console.log(`\n  Items Collected : ${data.length}`);
            if (data.length > 0) {
                const last = data[data.length - 1];
                console.log(`  Latest Item     : ${last.title} (${last.artist})`);
            }
        } catch (e) {
            console.log(`\n  Items Collected : (Error reading file)`);
        }
    } else {
        console.log(`\n  Items Collected : 0 (File not created yet)`);
    }

    // Check Log
    if (fs.existsSync(LOG_FILE)) {
        const logs = fs.readFileSync(LOG_FILE, 'utf-8').split('\n').filter(Boolean);
        console.log('\n  --- Recent Log Output ---');
        logs.slice(-5).forEach(line => console.log(`  > ${line}`));
    }
    
    console.log('\n==========================================');
    console.log('  Press Ctrl+C to exit');
}

check();
setInterval(check, 2000);
