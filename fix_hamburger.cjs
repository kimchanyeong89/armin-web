const fs = require('fs');
const path = require('path');

const types = ['paintings', 'drawings', 'video'];
types.forEach(type => {
    let filename = `hamburger-kunsthalle-${type}.json`;
    let file = path.join(__dirname, 'public', 'data', filename);
    if (fs.existsSync(file)) {
        let content = JSON.parse(fs.readFileSync(file, 'utf8'));
        let fixed = 0;
        content.forEach(item => {
            if (item.imageUrl && item.imageUrl.includes('r2.dev')) {
                // If it's r2.dev anime girl, revert to original wrapper
                if (item.original_imageUrl || item.thumbnailUrl) {
                    item.imageUrl = "https://wsrv.nl/?url=" + encodeURIComponent(item.original_imageUrl || item.thumbnailUrl);
                    fixed++;
                }
            } else if (item.imageUrl && !item.imageUrl.includes('wsrv.nl') && !item.imageUrl.includes('r2.dev')) {
                item.imageUrl = "https://wsrv.nl/?url=" + encodeURIComponent(item.imageUrl);
                fixed++;
            }
        });
        fs.writeFileSync(file, JSON.stringify(content, null, 2));
        console.log(`Fixed ${fixed} items in ${filename}`);
    }
});
