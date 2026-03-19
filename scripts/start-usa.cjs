const { spawn } = require('child_process');

const files = [
    'aic-collection.json',
    'nga-collection.json',
    'getty-collection.json',
    'famsf-collections.json',
    'huntington-collection.json',
    'sfmoma-collection.json',
    'whitney-collection.json'
];

console.log(`Starting USA migration for ${files.length} files...`);

const args = ['./scripts/migrate-all-images-to-r2-v2.cjs'].concat(files);

const child = spawn('node', args, {
    stdio: 'inherit',
    env: { ...process.env, NODE_TLS_REJECT_UNAUTHORIZED: '0' }
});

child.on('close', (code) => {
    console.log(`USA migration process exited with code ${code}`);
});
