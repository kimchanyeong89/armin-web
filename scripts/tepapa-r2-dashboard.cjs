const { spawn } = require('child_process');
const fs = require('fs');

const env = { ...process.env, RESUME: '1' };
const uploader = spawn('node', ['scripts/upload-tepapa-to-r2.cjs'], { env });

let latestLog = "Starting R2 migration engine...";

uploader.stdout.on('data', (data) => {
    const lines = data.toString().split(/[\r\n]+/);
    for (const line of lines) {
        if (line.trim()) latestLog = line.trim();
    }
});

uploader.stderr.on('data', (data) => {
    latestLog = "ERROR: " + data.toString().trim();
});

const interval = setInterval(() => {
    console.clear();
    console.log('\x1b[36m%s\x1b[0m', '=====================================================');
    console.log('\x1b[1m\x1b[32m%s\x1b[0m', '   ☁️  TE PAPA R2 UPLOAD DASHBOARD (CLOUDFLARE) ☁️');
    console.log('\x1b[36m%s\x1b[0m', '=====================================================');
    console.log('');
    
    let totalCount = 0;
    let r2Count = 0;
    try {
        const fileContent = fs.readFileSync('public/data/tepapa-collection.json', 'utf8');
        const data = JSON.parse(fileContent);
        totalCount = data.length;
        r2Count = data.filter(item => {
            const url = item.image_url || item.image || item.imageUrl || "";
            return (typeof url === 'string' && (url.includes('.r2.dev') || url.includes('.r2.cloudflarestorage.com')));
        }).length;
    } catch(e) {
        totalCount = 'Parsing...';
        r2Count = 'Parsing...';
    }
    
    let percentage = typeof totalCount === 'number' && totalCount > 0 ? ((r2Count / totalCount) * 100).toFixed(1) : 0;
    const barWidth = 30;
    const filledBar = Math.round((percentage / 100) * barWidth);
    const emptyBar = barWidth - filledBar;
    let visualBar = '[' + '█'.repeat(filledBar) + ' '.repeat(emptyBar) + ']';

    console.log(` 📦 \x1b[1mR2 Upload Progress:\x1b[0m ${visualBar} \x1b[33m${percentage}%\x1b[0m`);
    console.log(` 📊 \x1b[1mItems Migrated to R2:\x1b[0m \x1b[32m${r2Count}\x1b[0m / ${totalCount}`);
    console.log('');
    console.log(' 📡 \x1b[1mR2 Engine Log:\x1b[0m');
    console.log(`    ${latestLog}`);
    console.log('');
    console.log('\x1b[36m%s\x1b[0m', '=====================================================');
    console.log(' Press Ctrl+C to exit dashboard (Upload will be killed).');
}, 500);

uploader.on('close', (code) => {
    clearInterval(interval);
    console.clear();
    console.log('\x1b[32m%s\x1b[0m', '✅ R2 Upload completed successfully!');
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