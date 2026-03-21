const fs = require('fs');
const path = require('path');

const scriptPath = path.join(__dirname, 'scripts/generate-valid-artists.cjs');
let scriptContent = fs.readFileSync(scriptPath, 'utf8');

const regex = /const files = fs\.readdirSync.*?\n/s;
const newCode = `let files = [];
async function run() {
    console.log("Loading mapping...");
    const { exhibitions } = await import('../src/data/exhibitions.js');
    const validFilesSet = new Set();
    exhibitions.forEach(m => {
        (m.permanentExhibitions || []).forEach(e => e.collectionFile && validFilesSet.add(e.collectionFile));
        (m.temporaryExhibitions || []).forEach(e => e.collectionFile && validFilesSet.add(e.collectionFile));
        (m.pastExhibitions || []).forEach(e => e.collectionFile && validFilesSet.add(e.collectionFile));
    });
    files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json') && validFilesSet.has(f));
`;

scriptContent = scriptContent.replace(regex, newCode);
scriptContent += `\n}\nrun().catch(console.error);`;

fs.writeFileSync(scriptPath, scriptContent);
