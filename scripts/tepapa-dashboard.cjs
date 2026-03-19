const { spawn } = require('child_process');
const fs = require('fs');

const env = { ...process.env, RESUME: '1' };
const scraper = spawn('node', ['scripts/scrape-tepapa-complete.cjs'], { env });

let latestLog = "Starting...";

scraper.stdout.on('data', (data) => {
    const lines = data.toString().split(/[\r\n]+/);
    for (const line of lines) {
        if (line.trim()) latestLog = line.trim();
    }
});

scraper.stderr.on('data', (data) => {
    latestLog = "ERROR: " + data.toString().trim();
});

const interval = setInterval(() => {
    console.clear();
    console.log('\x1b[36m%s\x1b[0m', '=====================================================');
    console.log('\x1b[1m\x1b[32m%s\x1b[0m', '   🏛️  TE PAPA MUSEUM (NEW ZEALAND) DATA COLLECTOR');
    console.log('\x1b[36m%s\x1b[0m', '=====================================================');
    console.log('');
    
    let count = 0;
    try {
        const fileContent = fs.readFileSync('public/data/tepapa-collection.json', 'utf8');
        const data = JSON.parse(fileContent);
        count = data.length;
    } catch(e) {
        count = 'Parsing...';
    }

    console.log(` 📊 \x1b[1mCurrent Items Collected:\x1b[0m \x1b[33m${count.toLocaleString ? count.toLocaleString() : count}\x1b[0m`);
    console.log('');
    console.log(' 📡 \x1b[1mLatest Activity:\x1b[0m');
    console.log(`    ${latestLog}`);
    console.log('');
    console.log('\x1b[36m%s\x1b[0m', '=====================================================');
    console.log(' Press Ctrl+C to exit dashboard (Scraper will be killed).');
}, 500);

scraper.on('close', (code) => {
    clearInterval(interval);
    console.clear();
    console.log('\x1b[32m%s\x1b[0m', '✅ Scraping completed successfully!');
    console.log(`Exit code: ${code}`);
    
    // Regenerate the final table automatically
    console.log('Regenerating final Markdown table...');
    const tableCmd = spawn('node', ['table_script_v4.cjs']);
    tableCmd.stdout.pipe(fs.createWriteStream('perm_table_final.md'));
    tableCmd.on('close', () => {
        console.log('\x1b[32m%s\x1b[0m', '✅ perm_table_final.md updated. All done!');
        process.exit(0);
    });
});
