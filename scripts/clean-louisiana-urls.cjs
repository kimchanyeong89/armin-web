const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '../public/data/louisiana-test.json');
const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));

let count = 0;
const cleaned = data.map(item => {
    if (item.image) {
        try {
            const url = new URL(item.image);
            url.searchParams.delete('awp-session-id');
            // url.searchParams.delete('r'); // 'r' seems like a cache buster, let's keep it or remove it? curl test worked without it too. keeping it is safer for uniqueness.
            // But wait, my curl test REMOVED 'r' because I was lazy typing.
            // Let's remove 'r' too to be clean.
            url.searchParams.delete('r');
            
            item.image = url.toString();
            // Source seems to be just text "Louisiana...", not a URL.
            // But if it was a URL, I'd clean it too.
            count++;
        } catch (e) {
            console.error('Invalid URL:', item.image);
        }
    }
    return item;
});

fs.writeFileSync(FILE, JSON.stringify(cleaned, null, 2));
console.log(`Cleaned ${count} URLs in ${FILE}`);
