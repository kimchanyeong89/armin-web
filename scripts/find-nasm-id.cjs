const https = require('https');
const readline = require('readline');
const fs = require('fs');

const indexUrl = 'https://smithsonian-open-access.s3-us-west-2.amazonaws.com/metadata/edan/nasm/index.txt';
const targetId = 'A19960098000'; // The ID we know exists (Boeing 747 drawing)

console.log('Fetching index...');
https.get(indexUrl, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        const parts = data.trim().split('\n');
        console.log('Found', parts.length, 'parts.');
        
        let checked = 0;
        const checkNext = () => {
            if (checked >= parts.length) {
                console.log('Finished scanning all parts. Target not found.');
                return;
            }
            if (checked % 10 === 0) console.log('Checking part', checked);
            
            const partUrl = parts[checked];
            https.get(partUrl, (partRes) => {
                let foundInPart = false;
                const rl = readline.createInterface({ input: partRes, crlfDelay: Infinity });
                
                rl.on('line', (line) => {
                    if (line.includes(targetId)) {
                        console.log('FOUND TARGET!');
                        console.log(line);
                        foundInPart = true;
                        process.exit(0);
                    }
                });
                
                rl.on('close', () => {
                    checked++;
                    checkNext();
                });
            }).on('error', err => {
                console.error('Error fetching part', partUrl, err);
                checked++;
                checkNext();
            });
        };
        
        // Start scanning (maybe parallelize slightly if too slow)
        // For speed, let's scan random 20 files first, if not found, scan linearly?
        // Actually, just linear is predictable.
        checkNext();
    });
});
