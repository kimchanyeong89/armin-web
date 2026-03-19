const fs = require('fs');

function parseLog(logPath) {
    if (!fs.existsSync(logPath)) return null;

    const logContent = fs.readFileSync(logPath, 'utf8');
    const lines = logContent.split(/[\r\n]+/);

    let totalFiles = 0;
    let currentFile = '';
    let pendingInCurrent = 0;
    let currentProgressMsg = '';
    let completedFiles = [];

    for (let rawLine of lines) {
        let line = rawLine.trim();
        if (line.startsWith('Found ') && line.includes('collection files mapped') || line.startsWith('Retry mode: scanning')) {
            totalFiles = parseInt(line.replace(/[^0-9]/g, '')) || 175;
        }
        if (line.startsWith('--- Loading ')) {
            currentFile = line.replace('--- Loading ', '').replace(' ---', '').trim();
        }
        if (line.startsWith('Found ') && line.includes('pending images to migrate in')) {
            pendingInCurrent = parseInt(line.split(' ')[1]) || 0;
        }
        if (line.startsWith('Progress:')) {
            currentProgressMsg = line;
        }
        if (line.startsWith('Finished ')) {
            completedFiles.push(line);
        }
    }

    const completedCount = completedFiles.length;
    const percentComplete = totalFiles > 0 ? ((completedCount / totalFiles) * 100).toFixed(1) : 0;

    return {
        totalFiles,
        completedCount,
        percentComplete,
        currentFile,
        pendingInCurrent,
        currentProgressMsg,
        completedFiles
    };
}

function renderDashboard() {
    const v1 = parseLog('/tmp/r2-migration.log');
    const v2 = parseLog('/tmp/r2-migration-v2.log');

    console.clear();
    console.log('========================================================================');
    console.log('🚀 R2 CLOUD IMAGE MIGRATION - DUAL LIVE DASHBOARD 🚀');
    console.log('========================================================================\n');

    // Rendering V1
    if (v1) {
        console.log(`[V1 (Original) Progress]: ${v1.completedCount} / 175 Collections Finished (${v1.percentComplete}%)`);
        console.log(`▶ CURRENT: ${v1.currentFile || 'Scanning...'}`);
        if (v1.pendingInCurrent > 0) {
            console.log(`  Target: ${v1.pendingInCurrent} | ${v1.currentProgressMsg || 'Connecting...'}`);
        } else {
            console.log(`  Checking for missing images / Connecting to Storage...`);
        }
        if (v1.completedFiles.length > 0) {
            console.log(`  Recent V1: ✔️  ${v1.completedFiles[v1.completedFiles.length - 1]}`);
        }
    } else {
        console.log('[V1] Log not found...');
    }

    console.log('\n------------------------------------------------------------------------\n');

    // Rendering V2
    if (v2) {
        console.log(`[V2 (Retry) Progress]: ${v2.completedCount} / 175 Collections Finished (${v2.percentComplete}%)`);
        console.log(`▶ CURRENT: ${v2.currentFile || 'Scanning...'}`);
        if (v2.pendingInCurrent > 0) {
            console.log(`  Target: ${v2.pendingInCurrent} | ${v2.currentProgressMsg || 'Connecting...'}`);
        } else {
            console.log(`  Checking for missing images / Connecting to Storage...`);
        }
        if (v2.completedFiles.length > 0) {
            console.log(`  Recent V2: ✔️  ${v2.completedFiles[v2.completedFiles.length - 1]}`);
        }
    } else {
        console.log('[V2] Log not found...');
    }

    console.log('\n========================================================================');
    console.log('(Press Ctrl+C to exit dashboard. Background uploads will KEEP RUNNING!)');
    console.log(`Last updated: ${new Date().toLocaleTimeString()}`);
}

setInterval(renderDashboard, 1500);
renderDashboard();
