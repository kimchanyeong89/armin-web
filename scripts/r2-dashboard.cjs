const fs = require('fs');

function renderDashboard() {
    const logPath = '/tmp/r2-migration.log';
    if (!fs.existsSync(logPath)) {
        console.clear();
        console.log('R2 Migration log not found yet... waiting...');
        return;
    }

    const logContent = fs.readFileSync(logPath, 'utf8');
    const lines = logContent.split(/[\r\n]+/); // Handles \r and \n

    let totalFiles = 0;
    let currentFile = '';
    let pendingInCurrent = 0;
    let currentProgressMsg = '';
    let completedFiles = [];

    for (let rawLine of lines) {
        let line = rawLine.trim();
        if (line.startsWith('Found ') && line.includes('collection files mapped')) {
            totalFiles = parseInt(line.split(' ')[1]) || 0;
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

    // Calculate global stats
    const completedCount = completedFiles.length;
    const remainingCount = Math.max(0, totalFiles - completedCount);
    const percentComplete = totalFiles > 0 ? ((completedCount / totalFiles) * 100).toFixed(1) : 0;

    console.clear();
    console.log('======================================================');
    console.log('🚀 R2 CLOUD IMAGE MIGRATION - LIVE STATUS DASHBOARD 🚀');
    console.log('======================================================\n');

    console.log(`[Overall Progress]: ${completedCount} / ${totalFiles} Collections Finished (${percentComplete}%)`);

    console.log('\n------------------------------------------------------');
    console.log(`▶ CURRENTLY PROCESSING: ${currentFile || 'Scanning...'}`);
    if (pendingInCurrent > 0) {
        console.log(`  Target uploads in this collection: ${pendingInCurrent}`);
        console.log(`  ${currentProgressMsg}`);
    } else {
        console.log(`  Checking for missing images / Connecting to Storage...`);
    }
    console.log('------------------------------------------------------\n');

    if (completedFiles.length > 0) {
        console.log('📜 RECENTLY FINISHED:');
        const recent = completedFiles.slice(-5); // Show last 5
        for (let f of recent) {
            console.log(`   ✔️  ${f}`);
        }
    }

    console.log('\n(Press Ctrl+C to exit dashboard. Background upload will KEEP RUNNING!)');
    console.log(`Last updated: ${new Date().toLocaleTimeString()}`);
}

// Watch mode
setInterval(renderDashboard, 1500);
renderDashboard();
