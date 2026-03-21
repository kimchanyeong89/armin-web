const fs = require('fs');
const path = require('path');
const DATA_DIR = path.join(__dirname, 'public/data');
const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));

const keywords = ['painting', 'drawing', 'sculpture', 'photograph', 'graphic', 'test', 'sample', 'urls', 'status', 'complete'];
files.forEach(f => {
    const lower = f.toLowerCase();
    for (const kw of keywords) {
        if (lower.includes('-' + kw) || lower.includes(kw + '-')) {
            console.log(`Potential derivative/test: ${f}`);
            break;
        }
    }
});
