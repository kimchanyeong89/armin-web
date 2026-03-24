const { spawn } = require('child_process');

const targets = [
    { script: 'generic-r2-upload.cjs', file: 'fine-arts-be-complete.json', prefix: 'fine-arts-be-collection' },
    { script: 'generic-r2-upload.cjs', file: 'mucem-collection.json', prefix: 'mucem-collection' },
    { script: 'generic-r2-upload.cjs', file: 'carnavalet-the-collection.json', prefix: 'carnavalet-the-collection' },
    { script: 'generic-r2-upload.cjs', file: 'musee-conde-collection.json', prefix: 'conde-paintings' },
    { script: 'generic-r2-upload.cjs', file: 'musee-grenoble-collection.json', prefix: 'grenoble-collection' },
    { script: 'generic-r2-upload.cjs', file: 'hamburger-kunsthalle-drawings.json', prefix: 'hamburger-kunsthalle-drawings' },
    { script: 'generic-r2-upload.cjs', file: 'tepapa-collection.json', prefix: 'tepapa-paintings' },
    { script: 'generic-r2-upload.cjs', file: 'munch-collection.json', prefix: 'munch-collection' },
    { script: 'generic-r2-upload.cjs', file: 'dali-foundation-collection.json', prefix: 'dali-foundation-collection' }
];

const stats = targets.map((t) => ({
    name: t.prefix,
    total: 0,
    current: 0,
    newly_uploaded: 0,
    skipped: 0,
    failed: 0,
    started: false,
    done: false
}));

function renderDashboard() {
    process.stdout.write('\x1B[2J\x1B[0f');
    const border = '=======================================================';
    console.log(border);
    console.log('   Multi-Upload Dashboard (9 Museums) - Fast Skip Mode');
    console.log(border);
    console.log();

    stats.forEach(st => {
        let statusText = 'WAITING';
        if (st.done) statusText = 'DONE';
        else if (st.started) statusText = 'UPLOADING';

        let r2Total = st.skipped + st.newly_uploaded;
        const ratio = st.total > 0 ? `(${r2Total}/${st.total})` : '(0/0)';
        let pct = 0;
        if (st.total > 0) {
            pct = Math.round((r2Total / st.total) * 100);
        }

        const barLen = 25;
        const filled = Math.round((pct / 100) * barLen);
        const bar = '[' + '#'.repeat(filled) + '-'.repeat(barLen - filled) + ']';

        console.log(`[${statusText.padEnd(9)}] ${st.name.padEnd(25)}`);
        console.log(`                 ${bar} ${pct}% ${ratio}`);
        console.log(`                 -> Up: ${st.newly_uploaded} | Skip: ${st.skipped} | Err: ${st.failed}`);
        console.log();
    });
}

function startScript(index) {
    const t = targets[index];
    const proc = spawn('node', ['scripts/' + t.script, t.file, t.prefix]);
    stats[index].started = true;

    proc.stdout.on('data', (data) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
            if (line.includes('Fetching existing keys')) {
                stats[index].skipped = 'Checking...';
            }
            if (line.match(/Found (\d+) existing items/)) {
                let m = line.match(/Found (\d+)/);
                if (m) stats[index].skipped = parseInt(m[1], 10);
            }
            let m1 = line.match(/\[(\d+)\/(\d+)\]/);
            if (m1) {
                stats[index].current = parseInt(m1[1], 10);
                stats[index].total = parseInt(m1[2], 10);
                if (line.includes('OK:')) stats[index].newly_uploaded++;
                if (line.includes('ERR:')) stats[index].failed++;
                if (line.includes('SKIPPED:')) stats[index].skipped++;
            }
            
            let m2 = line.match(/Uploaded (\d+), Skipped (\d+), Err (\d+) \(Total (\d+)\/(\d+)\)/);
            if (m2) {
                stats[index].newly_uploaded = parseInt(m2[1], 10);
                stats[index].skipped = parseInt(m2[2], 10);
                stats[index].failed = parseInt(m2[3], 10);
                stats[index].current = parseInt(m2[4], 10);
                stats[index].total = parseInt(m2[5], 10);
            }
        }
    });

    proc.stderr.on('data', () => {}); 

    proc.on('close', () => {
        stats[index].done = true;
    });
}

setInterval(renderDashboard, 1000);
targets.forEach((_, i) => startScript(i));
