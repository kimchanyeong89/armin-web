const fs = require('fs');

const logFile = 'scripts/mfab-scrape.log';

function parseLog() {
    if (!fs.existsSync(logFile)) {
        console.clear();
        console.log('Log file not found yet...');
        return;
    }
    
    const content = fs.readFileSync(logFile, 'utf-8');
    const lines = content.split('\n');
    
    let totalLinks = 0;
    let lastPage = 0;
    let phase = 'Initializing';
    let errors = 0;
    
    lines.forEach(line => {
        if (line.includes('Phase 1:')) phase = 'Phase 1 - Harvesting URLs';
        if (line.includes('Phase 2:')) phase = 'Phase 2 - Scraping Details';
        
        const pageMatch = line.match(/Scraping page (\d+):/);
        if (pageMatch) {
            lastPage = parseInt(pageMatch[1]);
        }
        
        const countMatch = line.match(/Valid ID links: (\d+)/);
        if (countMatch) {
            totalLinks += parseInt(countMatch[1]);
        }

        if (line.includes('Error')) {
            errors++;
        }
    });
    
    // Formatting with ANSI colors for better visibility
    console.clear();
    console.log('\x1b[36m%s\x1b[0m', '=== MFAB Scraping Monitor ===');
    console.log(`Time: ${new Date().toLocaleTimeString()}`);
    console.log(`Status: \x1b[33m${phase}\x1b[0m`);
    console.log('-----------------------------');
    
    if (phase.includes('Phase 1')) {
        console.log(`Current Page: \x1b[32m${lastPage}\x1b[0m`);
        console.log(`Total Artworks Found: \x1b[32m${totalLinks}\x1b[0m`);
    } else {
        console.log(`Total Artworks to Scrape: \x1b[32m${totalLinks}\x1b[0m`);
        // We can't track exact progress in Phase 2 with current logs, but we can show it's active
    }
    
    if (errors > 0) {
        console.log(`Errors logged: \x1b[31m${errors}\x1b[0m`);
    }
    
    console.log('\n(Press Ctrl+C to stop monitoring)');
}

// Update every 1 second
setInterval(parseLog, 1000);
parseLog();
