const { spawn } = require('child_process');
const fs = require('fs');

const targets = [
    { name: 'Te Papa', file: 'tepapa-collection.json', script: 'scripts/upload-tepapa-to-r2.cjs' },
    { name: 'Mucem', file: 'mucem-collection.json', script: 'scripts/upload-mucem-to-r2.cjs' },
    { name: 'HK Paintings', file: 'hamburger-kunsthalle-paintings.json', script: 'scripts/upload-hk-paintings-to-r2.cjs' }
];

const env = { ...process.env, RESUME: '1' };

const processes = targets.map(t => {
    if (!fs.existsSync(t.script)) {
         fs.writeFileSync(t.script, fs.readFileSync('scripts/upload-tepapa-to-r2.cjs', 'utf-8')
             .replace(/tepapa-collection\.json/g, t.file)
             .replace(/tepapa-collection/g, t.file.replace('.json', '')));
    }
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

const interval = setInterval(() => {
    console.clear();
    console.log('\x1b[36m%s\x1b[0m', '=============================================================');
    console.log('\x1b[1m\x1b[32m%s\x1b[0m', '   🚀  MULTI-MUSEUM R2 UPLOAD DASHBOARD (CLOUDFLARE) 🚀');
    console.log('\x1b[36m%s\x1b[0m', '=============================================================');
    console.log('');
    
    processes.forEach(p => {
        let totalCount = 0;
        let r2Count = 0;
        try {
            const data = JSON.parse(fs.readFileSync(`public/data/${p.file}`, 'utf8'));
            const items = Array.isArray(data) ? data : (data.items || data.artworks || data.objects || []);
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

        console.log(` 🏛️  \x1b[1m${p.name.padEnd(12)}\x1b[0m : ${visualBar} \x1b[33m${percentage.toString().padStart(5)}%\x1b[0m  (\x1b[32m${r2Count}\x1b[0m / ${totalCount})`);
        console.log(` 📡 \x1b[90mLog: ${p.proc.latestLog.substring(0, 60)}\x1b[0m`);
        console.log('');
    });
    console.log('\x1b[36m%s\x1b[0m', '=============================================================');
}, 500);
