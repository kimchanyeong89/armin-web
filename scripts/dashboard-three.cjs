const fs = require('fs');

const targets = [
    { name: 'Pushkin', file: 'pushkin-paintings.json' },
    { name: 'Dumoak', file: 'dumoak-kim-work-all.json' },
    { name: 'Bilbao', file: 'guggenheim-bilbao-collection.json' }
];

const hideCursor = '\x1B[?25l';
const showCursor = '\x1B[?25h';
process.stdout.write(hideCursor);
console.clear();

const interval = setInterval(() => {
    let output = '';
    output += '\x1b[0;0H';
    
    output += '\x1b[36m=============================================================\x1b[0m\n';
    output += '\x1b[1m\x1b[32m   🚀  PUSHKIN, DUMOAK & BILBAO R2 UPLOAD DASHBOARD  🚀\x1b[0m\n';
    output += '\x1b[36m=============================================================\x1b[0m\n\n';
    
    targets.forEach(p => {
        let totalCount = 0;
        let r2Count = 0;
        try {
            const raw = JSON.parse(fs.readFileSync(`public/data/${p.file}`, 'utf8'));
            const items = raw.artworks || (Array.isArray(raw) ? raw : raw.items || raw.objects || []);
            totalCount = items.length;
            r2Count = items.filter(item => {
                const keys = ['image', 'imageUrl', 'Image', 'image_url', 'url', 'r2_url', 'img', 'src', 'file'];
                for (const k of keys) {
                    if (typeof item[k] === 'string' && (item[k].includes('.r2.dev') || item[k].includes('.r2.cloudflarestorage.com'))) return true;
                }
                return false;
            }).length;
        } catch(e) {
            totalCount = '...';
            r2Count = '...';
        }
        
        let percentage = typeof totalCount === 'number' && totalCount > 0 ? ((r2Count / totalCount) * 100).toFixed(1) : 0;
        const barWidth = 20;
        const filledBar = Math.round((percentage / 100) * barWidth);
        const emptyBar = barWidth - filledBar;
        let visualBar = '[' + '█'.repeat(Math.max(0, filledBar)) + ' '.repeat(Math.max(0, emptyBar)) + ']';
        
        output += ` 🏛️  \x1b[1m${p.name.padEnd(12)}\x1b[0m : ${visualBar} \x1b[33m${percentage.toString().padStart(5)}%\x1b[0m  (\x1b[32m${r2Count}\x1b[0m / ${totalCount})          \n\n`;
    });
    
    output += '\x1b[36m=============================================================\x1b[0m\n';
    output += '\x1b[33m ✨ Background upload is running! Press Ctrl+C to exit dashboard\x1b[0m\n';
    
    process.stdout.write(output);
}, 1000);

process.on('SIGINT', () => {
    process.stdout.write(showCursor);
    process.stdout.write('\n\n\nExiting Dashboard...\n');
    process.exit();
});