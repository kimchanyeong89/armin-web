const { spawn } = require('child_process');
const fs = require('fs');

const targets = [
    { name: 'FAMSF', file: 'famsf-collections.json', script: 'scripts/upload-famsf-to-r2.cjs' },
    { name: 'Huntington', file: 'huntington-collection.json', script: 'scripts/upload-huntington-to-r2.cjs' },
    { name: 'LACMA', file: 'lacma-classification-22.json', script: 'scripts/upload-lacma-to-r2.cjs' }
];

const env = { ...process.env, RESUME: '1' };

const processes = targets.map(t => {
    if (!fs.existsSync(t.script)) {
         fs.writeFileSync(t.script, fs.readFileSync('scripts/upload-tepapa-to-r2.cjs', 'utf-8')
             .replace(/tepapa-collection\.json/g, t.file)
             .replace(/tepapa-collection/g, t.file.replace('.json', '')));
    }
    const proc = spawn('node', [t.script], { env });
    
    // progress format: [R2 Engine] Uploaded 15/1000 (ID: xxx)
    const pObj = { ...t, proc, latestLog: "Starting...", successes: 0, total: 0, skipped: 0, status: 'Running', errorCount: 0 };
    
    proc.stdout.on('data', d => {
        const lines = d.toString().split(/[\r\n]+/);
        for (const l of lines) {
            if (!l.trim()) continue;
            pObj.latestLog = l.trim();
            
            const matchUpload = l.match(/Uploaded (\d+)\/(\d+)/);
            if (matchUpload) {
                pObj.successes = parseInt(matchUpload[1], 10);
                pObj.total = parseInt(matchUpload[2], 10);
            }
            const matchInit = l.match(/Found (\d+) items to upload.*skipped (\d+)/);
            if (matchInit) {
                pObj.total = parseInt(matchInit[1], 10);
                pObj.skipped = parseInt(matchInit[2], 10);
            }
            const matchDone = l.match(/Finished! (\d+) new uploads, (\d+) skipped, (\d+) errors/);
            if (matchDone) {
                pObj.successes = parseInt(matchDone[1], 10);
                pObj.skipped = parseInt(matchDone[2], 10);
                pObj.errorCount = parseInt(matchDone[3], 10);
                pObj.status = 'Completed';
            }
        }
    });
    proc.stderr.on('data', d => {
        pObj.latestLog = "ERROR: " + d.toString().split('\n')[0];
        pObj.status = 'Error';
    });
    return pObj;
});

const interval = setInterval(() => {
    console.clear();
    console.log('🚀 R2 Uploader Real-Time Dashboard');
    console.log('========================================================================================');
    
    let allDone = true;
    processes.forEach(p => {
        if (p.proc.exitCode === null) allDone = false;
        else if (p.proc.exitCode !== 0) p.status = 'Failed';
        else if (p.status !== 'Completed') p.status = 'Completed';
        
        let progressStr = '';
        if (p.total > 0) {
            const pct = ((p.successes / p.total) * 100).toFixed(1);
            progressStr = `[${p.successes}/${p.total} (${pct}%)]`;
        } else {
            progressStr = '[Wait...]';
        }
        if (p.status === 'Completed') {
             progressStr = `[Done:${p.successes}]`;
        }
        
        let statusBadge = p.status === 'Completed' ? '✅' : (p.status === 'Failed' || p.status === 'Error' ? '❌' : '🔄');
        
        console.log(`${statusBadge} [${p.name.padEnd(12, ' ')}] ${p.status.padEnd(9, ' ')} | Skipped: ${p.skipped.toString().padStart(4, ' ')} | Prog: ${progressStr.padEnd(18, ' ')} | Err: ${p.errorCount} | Log: ${p.latestLog.slice(0, 50)}`);
    });
    
    console.log('========================================================================================');
    
    if (allDone) {
        clearInterval(interval);
        console.log('\n✅ All targeted uploads have finished processing!');
        process.exit(0);
    }
}, 500);