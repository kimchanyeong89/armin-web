const { spawn } = require('child_process');
const fs = require('fs');

const targets = [
    { name: 'Te Papa', file: 'tepapa-collection.json', script: 'scripts/upload-tepapa-to-r2.cjs' },
    { name: 'Mucem', file: 'mucem-collection.json', script: 'scripts/upload-mucem-to-r2.cjs' },
    { name: 'HK Paintings', file: 'hamburger-kunsthalle-paintings.json', script: 'scripts/upload-hk-paintings-to-r2.cjs' }
];

const env = { ...process.env, RESUME: '1' };

const processes = targets.map(t => {
    const proc = spawn('node', [t.script], { env });
    proc.latestLog = "Starting...";
    proc.stdout.on('data', d => {
        const lines = d.toString().split(/[\r\n]+/);
        for (const l of lines) if (l.trim()) proc.latestLog = l.trim();
    });
    proc.stderr.on('data', d => {
        proc.latestLog = "ERROR: " + d.toString().split('\n')[0];
    });
    return { ...t, proc };
});

const hideCursor = '\x1B[?25l';
const showCursor = '\x1B[?25h';
process.stdout.write(hideCursor);
console.clear();

const interval = setInterval(() => {
    let output = '';
    output += '\x1b[0;0H'; // Move cursor to top left unconditionally
    
    output += '\x1b[36m=============================================================\x1b[0m\n';
    output += '\x1b[1m\x1b[32m   🚀  MULTI-MUSEUM R2 UPLOAD DASHBOARD (CLOUDFLARE) 🚀\x1b[0m\n';
    output += '\x1b[36m=============================================================\x1b[0m\n\n';
    
    processes.forEach(p => {
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
        let visualBar = '[' + '█'.repeat(filledBar) + ' '.repeat(emptyBar) + ']';

        output += ` 🏛️  \x1b[1m${p.name.padEnd(12)}\x1b[0m : ${visualBar} \x1b[33m${percentage.toString().padStart(5)}%\x1b[0m  (\x1b[32m${r2Count}\x1b[0m / ${totalCount})          \n`;
        output += ` 📡 \x1b[90mLog: ${p.proc.latestLog.substring(0, 80).padEnd(80)}\x1b[0m\n\n`;
    });
    output += '\x1b[36m=============================================================\x1b[0m\n';
    output += '\x1b[33m ✨ Press Ctrl+C to exit dashboard (Uploads will be killed)\x1b[0m\n';

    process.stdout.write(output);
}, 1000);

process.on('SIGINT', () => {
    process.stdout.write(showCursor);
    process.stdout.write('\n\n\nExiting...\n');
    processes.forEach(p => p.proc.kill());
    process.exit();
});
