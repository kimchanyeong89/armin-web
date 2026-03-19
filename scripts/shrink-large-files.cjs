const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '../public/data');

function shrinkFile(file) {
    const filePath = path.join(dir, file);
    try {
        const stats = fs.statSync(filePath);
        const sizeMB = stats.size / (1024 * 1024);

        if (sizeMB > 24) {
            console.log(`Shrinking ${file} (${sizeMB.toFixed(2)} MB)...`);
            const content = fs.readFileSync(filePath, 'utf8');
            let data;
            try {
                data = JSON.parse(content);
            } catch (e) {
                console.log('Not valid JSON, skipping');
                return;
            }

            if (Array.isArray(data)) {
                if (data.length > 300) {
                    // Keep roughly 20MB worth? 
                    // Simple approach: keep first 500 items or so if generic, or check avg size.
                    // 31MB for how many items?
                    const newLen = Math.floor(data.length * (20 / sizeMB));
                    console.log(`Reducing array from ${data.length} to ${newLen}`);
                    data = data.slice(0, newLen);
                    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
                    console.log('Shrunk.');
                }
            } else if (data.objects && Array.isArray(data.objects)) {
                if (data.objects.length > 300) {
                    const newLen = Math.floor(data.objects.length * (20 / sizeMB));
                    console.log(`Reducing objects from ${data.objects.length} to ${newLen}`);
                    data.objects = data.objects.slice(0, newLen);
                    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
                    console.log('Shrunk.');
                }
            }
        }
    } catch (e) {
        console.error(`Error processing ${file}:`, e.message);
    }
}

if (fs.existsSync(dir)) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
        if (file.endsWith('.json')) shrinkFile(file);
    });
}
