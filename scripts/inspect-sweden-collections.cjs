const fs = require('fs');

try {
    const data = JSON.parse(fs.readFileSync('debug-sweden-all.json', 'utf8'));
    if (data.pageProps && data.pageProps.collections) {
        console.log("Found collections:");
        data.pageProps.collections.forEach(c => {
            console.log(`- ${c.OclTitleTxt} (ID: ${c.Id})`);
        });
    }
} catch (e) {
    console.error(e);
}
