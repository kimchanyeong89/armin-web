const { spawn } = require('child_process');
const readline = require('readline');

const scripts = [
    { name: 'NGA', cmd: 'node', args: ['scripts/upload-nga-to-r2.cjs'] },
    { name: 'Whitney', cmd: 'node', args: ['scripts/upload-whitney-to-r2.cjs'] }
];

const dashboard = {};
scripts.forEach(s => { dashboard[s.name] = { status: 'Starting...', logs: [] } });

function renderDashboard() {
    console.clear();
    console.log('==================================================');
    console.log('       NGA & Whitney R2 Upload Dashboard          ');
    console.log('==================================================\n');
    Object.keys(dashboard).forEach(name => {
        const stats = dashboard[name];
        console.log(`[${name.padEnd(10, ' ')}] Status: ${stats.status}`);
        const recentLogs = stats.logs.slice(-5); // last 5 logs
        recentLogs.forEach(l => console.log(`   > ${l}`));
        console.log('');
    });
    console.log('--------------------------------------------------');
}

scripts.forEach(script => {
    const child = spawn(script.cmd, script.args);
    
    readline.createInterface({ input: child.stdout }).on('line', (line) => {
        if (!line.trim()) return;
        dashboard[script.name].logs.push(line.trim());
        if (dashboard[script.name].logs.length > 50) dashboard[script.name].logs.shift();
        
        if (line.includes('Finished!')) {
             dashboard[script.name].status = 'Completed! ✅';
        } else if (line.includes('errors')) {
             // We can extract if needed, but keeping simple
             dashboard[script.name].status = 'Running 🏃';
        } else {
             dashboard[script.name].status = 'Running 🏃';
        }
    });

    readline.createInterface({ input: child.stderr }).on('line', (line) => {
        if (!line.trim()) return;
        dashboard[script.name].logs.push(`[ERR] ${line.trim()}`);
    });

    child.on('close', (code) => {
        if (dashboard[script.name].status !== 'Completed! ✅') {
            dashboard[script.name].status = `Exited with code ${code}`;
        }
    });
});

const interval = setInterval(renderDashboard, 1000);
