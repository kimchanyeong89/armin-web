const fs = require('fs');
const readline = require('readline');

const V5_LOG = '/tmp/r2-austria.log';

function extractStatus(logPath) {
    if (!fs.existsSync(logPath)) return { currentFile: '[Not Started]', progressStr: '', success: 0, fail: 0, lastFinished: '' };
    
    try {
        const content = fs.readFileSync(logPath, 'utf8');
        const lines = content.split(/[\r\n]+/).filter(l => l.trim().length > 0);

        let currentFile = 'Scanning...';
        let progressStr = '';
        let success = 0;
        let fail = 0;
        let lastFinished = '';

        for (const line of lines) {
            if (line.includes('Finished ')) {
                const m = line.match(/Finished (.*\.json)/);
                if (m) lastFinished = m[1];
            } else if (line.includes('Processing ')) {
                const m = line.match(/Processing (.*\.json)/);
                if (m) currentFile = m[1];
            } else if (line.includes('Progress: ')) {
                // e.g. "Progress: 120/531 | Success: 85 | Fail: 12"
                progressStr = line.trim();
            } else if (line.includes('Found ')) {
                progressStr = line.trim();
            }
        }

        return { currentFile, progressStr, success, fail, lastFinished };
    } catch (e) {
        return { currentFile: 'Error reading log', progressStr: '', success: 0, fail: 0, lastFinished: '' };
    }
}

function updateDashboard() {
    process.stdout.write('\x1Bc'); // Clear screen

    console.log('========================================================================');
    console.log('               A U S T R I A   R 2   M I G R A T I O N               ');
    console.log('========================================================================');
    console.log('');

    const austria = extractStatus(V5_LOG);

    const lFinished = austria.lastFinished ? `[Last: ${austria.lastFinished}]` : '';
    console.log(`CURRENT:  ${austria.currentFile}  ${lFinished}`);
    console.log(`PROGRESS: ${austria.progressStr || 'Waiting...'}`);

    console.log('');
    console.log('------------------------------------------------------------------------');
    console.log(' To stop dashboard: Ctrl+C  |  Process runs in background (/tmp/r2-austria.log)');
    console.log('========================================================================');
}

setInterval(updateDashboard, 1000);
updateDashboard();
