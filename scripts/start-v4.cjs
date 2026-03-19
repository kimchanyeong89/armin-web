const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const targets = JSON.parse(fs.readFileSync(path.join(__dirname, 'v4-targets.json'), 'utf-8'));

const usaTargets = [
    'aic-collection.json',
    'nga-collection.json',
    'getty-collection.json',
    'famsf-collections.json',
    'huntington-collection.json',
    'sfmoma-collection.json',
    'whitney-collection.json'
];

let v3Targets = [];
try {
    v3Targets = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/data/v3-untouched-targets.json'), 'utf-8'));
} catch (e) { }

// Filter out those that we already know don't exist, AND those in USA or V3
const existingTargets = targets.filter(t =>
    fs.existsSync(path.join(__dirname, '../public/data', t)) &&
    !usaTargets.includes(t) &&
    !v3Targets.includes(t)
);

console.log(`Starting V4 migration for ${existingTargets.length} true untouched files...`);

// Save updated target count for dashboard
fs.writeFileSync(path.join(__dirname, 'v4-final-targets.json'), JSON.stringify(existingTargets, null, 2));

const args = ['./scripts/migrate-all-images-to-r2-v2.cjs'].concat(existingTargets);

const child = spawn('node', args, {
    stdio: 'inherit',
    env: { ...process.env, NODE_TLS_REJECT_UNAUTHORIZED: '0' }
});

child.on('close', (code) => {
    console.log(`V4 migration process exited with code ${code}`);
});
