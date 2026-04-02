const fs = require('fs');
const { spawn } = require('child_process');

let args = process.argv.slice(2);
if (args.length === 0) {
    if (fs.existsSync('missing_targets.txt')) {
        args = fs.readFileSync('missing_targets.txt', 'utf-8')
                 .split('\n')
                 .map(line => line.trim())
                 .filter(line => line.length > 0);
    }
}

const targets = args.map(arg => {
    let [file, prefix] = arg.split('|');
    if (file.startsWith('public/data/')) file = file.replace('public/data/', '');
    if (file.startsWith('data/')) file = file.replace('data/', '');
    return { script: 'generic-r2-upload.cjs', file, prefix };
});

if (targets.length === 0) {
    console.log("No targets specified. Exiting.");
    process.exit(0);
}

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

// Max UI display items (we only print those that are active or failed to fit on screen)
// But for 100 items, let's print up to 30 visible
function renderDashboard() {
    process.stdout.write('\x1B[2J\x1B[0f');
    const border = '=======================================================';
    console.log(border);
    console.log(`   MEGA UPLOAD DASHBOARD (${targets.length} Museums) - Fast Skip Mode `);
    console.log(border);
    console.log(`   Running: ${running}/${MAX_CONCURRENT} | Completed: ${targets.length - queueIndex}/${targets.length}`);
    console.log();

    // Show currently running and recently finished
    const visibleStats = stats.map((st, idx) => ({st, idx})).filter(({st}) => {
        return st.started && (!st.done || (st.done && st.failed > 0) || (st.done && st.newly_uploaded > 0));
    });

    // If too many, slice
    const displaySt = visibleStats.slice(-25); // show last 25 active

    displaySt.forEach(({st, idx}) => {
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
        
        console.log(`[${statusText.padEnd(9)}] ID ${idx+1}: ${st.name.padEnd(25)}`);
        console.log(`                 ${bar} ${pct}% ${ratio}`);
        console.log(`                 -> Up: ${st.newly_uploaded} | Skip: ${st.skipped} | Err: ${st.failed}`);
        console.log();
    });
}

let running = 0;
let queueIndex = 0;
const MAX_CONCURRENT = 5;

function checkQueue() {
    while (running < MAX_CONCURRENT && queueIndex < targets.length) {
        running++;
        const idx = queueIndex++;
        const t = targets[idx];
        const proc = spawn('node', ['scripts/' + t.script, t.file, t.prefix]);
        stats[idx].started = true;
        
        proc.stdout.on('data', (data) => {
            const lines = data.toString().split('\n');
            for (const line of lines) {
                if (line.match(/Found (\d+) existing items/)) {
                    let m = line.match(/Found (\d+)/);
                    if (m) stats[idx].skipped = parseInt(m[1], 10);
                }
                let m1 = line.match(/\[(\d+)\/(\d+)\]/);
                if (m1) {
                    stats[idx].current = parseInt(m1[1], 10);
                    stats[idx].total = parseInt(m1[2], 10);
                    if (line.includes('OK:')) stats[idx].newly_uploaded++;
                    if (line.includes('ERR:')) stats[idx].failed++;
                    if (line.includes('SKIPPED:')) stats[idx].skipped++;
                }
                let m2 = line.match(/Uploaded (\d+), Skipped (\d+), Err (\d+) \(Total (\d+)\/(\d+)\)/);
                if (m2) {
                    stats[idx].newly_uploaded = parseInt(m2[1], 10);
                    stats[idx].skipped = parseInt(m2[2], 10);
                    stats[idx].failed = parseInt(m2[3], 10);
                    stats[idx].current = parseInt(m2[4], 10);
                    stats[idx].total = parseInt(m2[5], 10);
                }
            }
        });

        proc.on('close', () => {
            stats[idx].done = true;
            running--;
            setTimeout(checkQueue, 500); // small delay before picking next
        });
    }
}

setInterval(renderDashboard, 1000);
checkQueue();
