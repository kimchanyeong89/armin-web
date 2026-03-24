const { spawn } = require('child_process');
const readline = require('readline');

const scripts = [
    { name: 'Carnavalet', cmd: 'node', args: ['scripts/generic-r2-upload.cjs', 'carnavalet-the-collection.json', 'carnavalet-the-collection'] },
    { name: 'Condé', cmd: 'node', args: ['scripts/generic-r2-upload.cjs', 'musee-conde-collection.json', 'conde-paintings'] },
    { name: 'Grenoble', cmd: 'node', args: ['scripts/generic-r2-upload.cjs', 'musee-grenoble-collection.json', 'grenoble-paintings'] }
];

const dashboard = {};
scripts.forEach(s => { dashboard[s.name] = { status: 'Starting...', logs: [] } });

function renderDashboard() {
    console.clear();
    console.log('==================================================');
    console.log('    Carnavalet, Condé, Grenoble R2 Dashboard       ');
    console.log('==================================================\n');
    Object.keys(dashboard).forEach(name => {
        const stats = dashboard[name];
        console.log(`[${name.padEnd(12, ' ')}] Status: ${stats.status}`);
        const recentLogs = stats.logs.slice(-5); // last 5 logs
        recentLogs.forEach(l => console.log(`   > ${l}`));
        console.log('');
    });
    console.log('--------------------------------------------------');
}

setInterval(renderDashboard, 1500);

scripts.forEach(script => {
    const child = spawn(script.cmd, script.args);
    
    readline.createInterface({ input: child.stdout }).on('line', (line) => {
        if (!line.trim()) return;
        dashboard[script.name].logs.push(line.trim());
        if (dashboard[script.name].logs.length > 50) dashboard[script.name].logs.shift();
        
        if (line.includes('Finished!')) {
             dashboard[script.name].status = 'Completed! ✅';
        } else if (line.includes('ERR')) {
             dashboard[script.name].status = 'Running 🏃 (has errors)';
        } else {
             dashboard[script.name].status = 'Running 🏃';
        }
    });

    readline.createInterface({ input: child.stderr }).on('line', (line) => {
        if (!line.trim()) return;
        dashboard[script.name].logs.push(`[ERR] ${line.trim()}`);
    });

    child.on('close', () => {
        if (dashboard[script.name].status !== 'Completed! ✅') {
            dashboard[script.name].status = 'Exited 🛑';
        }
    });
});
