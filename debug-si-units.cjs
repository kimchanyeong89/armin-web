const https = require('node:https');
const readline = require('node:readline');

const INDEX_URL = 'https://smithsonian-open-access.s3-us-west-2.amazonaws.com/metadata/edan/saam/index.txt';
// Check 20 files to catch more unit codes if they are mixed (though usually they are separated by prefix in S3, wait... the URL structure is .../edan/saam/index.txt).
// The URL I used was specific to SAAM!
// I need to find the index files for the OTHER museums.
// The root pattern is likely https://smithsonian-open-access.s3-us-west-2.amazonaws.com/metadata/edan/{UNIT_CODE}/index.txt

const MUSEUMS = [
    { name: 'Asian Art', codeCandidate: 'fsg' }, // Freer/Sackler
    { name: 'Portrait Gallery', codeCandidate: 'npg' },
    { name: 'Air and Space', codeCandidate: 'nasm' },
    { name: 'African Art', codeCandidate: 'nmafa' },
    { name: 'Cooper Hewitt', codeCandidate: 'chndm' } // Just in case
];

async function checkUrl(unitCode) {
    const url = `https://smithsonian-open-access.s3-us-west-2.amazonaws.com/metadata/edan/${unitCode}/index.txt`;
    return new Promise((resolve) => {
        const req = https.request(url, { method: 'HEAD' }, (res) => {
            resolve({ unitCode, status: res.statusCode, url });
        });
        req.on('error', () => resolve({ unitCode, status: 'ERR' }));
        req.end();
    });
}

async function main() {
    console.log('Checking Unit Codes...');
    const results = await Promise.all(MUSEUMS.map(m => checkUrl(m.codeCandidate)));
    console.table(results);
}

main();
