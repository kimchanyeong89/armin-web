const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../public/data/albertina-drawings-prints-100.json');

try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (data.objects && data.objects.length > 50) {
        console.log(`Original count: ${data.objects.length}`);
        data.objects = data.objects.slice(0, 50);
        console.log(`New count: ${data.objects.length}`);
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        console.log('File truncated successfully.');
    }
} catch (e) {
    console.error('Error truncating file:', e);
}
