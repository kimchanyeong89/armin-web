const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '../downloads/leopold-museum-v2.log');

console.log('📡 Leopold Museum Scraper Monitor');
console.log('=================================');

if (!fs.existsSync(LOG_FILE)) {
    console.log(`Waiting for log file to be created at: ${LOG_FILE}...`);
    // Wait for file
    const checkInterval = setInterval(() => {
        if (fs.existsSync(LOG_FILE)) {
            clearInterval(checkInterval);
            startMonitoring();
        }
    }, 1000);
} else {
    startMonitoring();
}

function startMonitoring() {
    console.log('✅ Log file found. Monitoring progress...\n');
    let lastSize = 0;

    // Initial read
    const stats = fs.statSync(LOG_FILE);
    readLogs(0, stats.size);
    lastSize = stats.size;

    setInterval(() => {
        try {
            const stats = fs.statSync(LOG_FILE);
            if (stats.size > lastSize) {
                readLogs(lastSize, stats.size);
                lastSize = stats.size;
            }
        } catch (e) {
            // ignore
        }
    }, 500);
}

function readLogs(start, end) {
    const stream = fs.createReadStream(LOG_FILE, { start, end });
    stream.on('data', (chunk) => {
        const lines = chunk.toString().split('\n');
        lines.forEach(processLine);
    });
}

let phase = 'Initializing';
let totalLinks = 0;
let scrapedCount = 0;
let savedCount = 0;
let lastUrl = '';

function processLine(line) {
    if (!line) return;

    const cleanLine = line.replace(/^\[.*?\] /, ''); // Remove timestamp

    // Phase 1 Detection
    if (cleanLine.includes('Phase 1:')) phase = 'Collecting URLs';
    if (cleanLine.includes('Total collected:')) {
        phase = 'Collecting URLs';
        const match = cleanLine.match(/Total collected: (\d+)/);
        if (match) totalLinks = parseInt(match[1]);
        printStatus();
    }

    // Phase 2 Detection
    if (cleanLine.includes('Phase 2:') || cleanLine.includes('Total URLs to process:')) {
        phase = 'Scraping Details';
        const match = cleanLine.match(/Total URLs to process: (\d+)/);
        if (match) totalLinks = parseInt(match[1]);
        printStatus();
    }

    // Scraping Progress
    // Pattern: [i/N] Scraping URL
    if (cleanLine.includes('] Scraping')) {
        phase = 'Scraping Details';
        const match = cleanLine.match(/\[(\d+)\/(\d+)\] Scraping (.*)/);
        if (match) {
            scrapedCount = parseInt(match[1]);
            totalLinks = parseInt(match[2]);
            lastUrl = match[3];
            printStatus();
        }
    }

    // Saved Progress
    if (cleanLine.includes('Saved progress')) {
        const match = cleanLine.match(/Total: (\d+)/);
        if (match) savedCount = parseInt(match[1]);
        // Don't reprint for this, implicitly updated next step
    }

    if (cleanLine.includes('Completed!')) {
        console.log('\n\n✅ Job Finished Successfully!');
        console.log(`Final Count: ${totalLinks} Artworks Collected.`);
        process.exit(0);
    }
}

function printStatus() {
    process.stdout.clearLine();
    process.stdout.cursorTo(0);

    if (phase === 'Collecting URLs') {
        process.stdout.write(`🔍 [Collecting URLs] Found: ${totalLinks} artworks...`);
    } else if (phase === 'Scraping Details') {
        const pct = totalLinks > 0 ? ((scrapedCount / totalLinks) * 100).toFixed(1) : 0;
        const id = lastUrl.split('/').pop() || '...';
        process.stdout.write(`🎨 [Scraping] ${scrapedCount}/${totalLinks} (${pct}%) | Processing ID: ${id}`);
    } else {
        process.stdout.write(`⏳ [${phase}]...`);
    }
}
