const { spawn } = require('child_process');
const fs = require('fs');

const targets = [
    { name: 'Tate', file: 'tate-artworks.json', script: 'scripts/upload-tate3-to-r2.cjs' },
    { name: 'Tate Modern', file: 'tate-modern-collection.json', script: 'scripts/upload-tatemodern-to-r2.cjs' },
    { name: 'V&A Permanent', file: 'vam-permanent-exhibitions.json', script: 'scripts/upload-vam-permanent-to-r2.cjs' }
];

const env = { ...process.env, RESUME: '1' };

const processes = targets.map(t => {
    if (!fs.existsSync(t.script)) {
         fs.writeFileSync(t.script, fs.readFileSync('scripts/upload-tepapa-to-r2.cjs', 'utf-8')
             .replace(/tepapa-collection\.json/g, t.file)
             .replace(/tepapa-collection/g, t.file.replace('.json', '')));
    }
    const proc = spawn('node', [t.script], { env });
    const pObj = { ...t, proc, latestLog: "Starting..." };
    proc.stdout.on('data', d => {
        const lines = d.toString().split(/[\r\n]+/);
        for (const l of lines) if (l.trim()) pObj.latestLog = l.trim();
    });
    proc.stderr.on('data', d => {
        pObj.latestLog = "ERROR: " + d.toString().split('\n')[0];
    });
    return pObj;
});

const interval = setInterval(() => {
    console.clear();
    console.log('🚀 R2 Upload Dashboard - Tate & V&A\n=========================================');
    let allDone = true;
    processes.forEach(p => {
        console.log(`[${p.name}] ${p.latestLog}`);
        if (p.proc.exitCode === null) allDone = false;
        else if (p.proc.exitCode !== 0) p.latestLog += ` (Exited with code ${p.proc.exitCode})`;
        else if (!p.latestLog.includes("Done")) p.latestLog = "✅ Completed.";
    });
    if (allDone) {
        clearInterval(interval);
        console.log('\n✅ All uploads completed!');
        process.exit(0);
    }
}, 500);
