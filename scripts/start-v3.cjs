const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const targetsPath = path.join(__dirname, '../public/data/v3-untouched-targets.json');
const targets = JSON.parse(fs.readFileSync(targetsPath, 'utf-8'));

console.log(`Starting V3 migration for ${targets.length} untouched files...`);

const args = ['scripts/migrate-all-images-to-r2-v2.cjs', ...targets];
const child = spawn('node', args, {
    stdio: 'inherit',
    env: { ...process.env, NODE_TLS_REJECT_UNAUTHORIZED: '0' }
});

child.on('exit', (code) => {
    console.log(`V3 migration finished with code ${code}`);
});
