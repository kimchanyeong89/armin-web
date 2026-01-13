const fs = require('fs');
const path = require('path');

const inputFile = path.join(__dirname, '../public/data/national-museum-korea.json');
const outputDir = path.join(__dirname, '../public/data');
const CHUNK_SIZE = 10000; // items per file

try {
    if (!fs.existsSync(inputFile)) {
        console.error(`Input file not found: ${inputFile}`);
        process.exit(1);
    }

    console.log('Reading input file...');
    const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

    if (!Array.isArray(data)) {
        console.error('Input data is not an array');
        process.exit(1);
    }

    console.log(`Total items: ${data.length}`);
    const totalChunks = Math.ceil(data.length / CHUNK_SIZE);
    console.log(`Splitting into ${totalChunks} chunks...`);

    for (let i = 0; i < totalChunks; i++) {
        const chunk = data.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        const outputFilename = `national-museum-korea-part${i + 1}.json`;
        const outputPath = path.join(outputDir, outputFilename);
        fs.writeFileSync(outputPath, JSON.stringify(chunk));
        console.log(`Written ${outputFilename} (${chunk.length} items)`);
    }

    console.log('Done.');

} catch (err) {
    console.error('Error:', err);
    process.exit(1);
}
