
const https = require('https');

function getCount(deptId) {
    const url = `https://collectionapi.metmuseum.org/public/collection/v1/objects?departmentIds=${deptId}`;
    https.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
            try {
                const json = JSON.parse(data);
                console.log(`Dept ${deptId}: ${json.total} objects`);
            } catch (e) {
                console.error(`Dept ${deptId} error:`, e.message);
            }
        });
    }).on('error', (err) => {
        console.error(`Dept ${deptId} error:`, err.message);
    });
}

// Check European Paintings (11), Modern Art (21), Drawings (9)
getCount(11);
getCount(21);
getCount(9);
