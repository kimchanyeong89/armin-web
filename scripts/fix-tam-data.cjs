const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '../public/data/today-art-museum.json');

function clean() {
    if (!fs.existsSync(FILE)) {
        console.error("File not found:", FILE);
        return;
    }

    const raw = fs.readFileSync(FILE, 'utf8');
    let data;
    try {
        data = JSON.parse(raw);
    } catch (e) {
        console.error("Invalid JSON:", e.message);
        return;
    }

    console.log(`Processing ${data.length} items...`);
    let changed = 0;

    const cleanedData = data.map((item, idx) => {
        // 1. Fix Title
        // Current garbage: "Autumn ...\nArtist: Hong..."
        // Desired: "Autumn ..."
        let newTitle = item.title || 'Untitled';
        if (newTitle.includes('\n')) {
            newTitle = newTitle.split('\n')[0].trim();
        }
        if (newTitle.includes('Title：')) {
            newTitle = newTitle.replace('Title：', '').trim();
        }

        // 2. Fix Artist
        // Current garbage: "Hong Lei\nForm: ..." or "Artist: Hong Lei\n..."
        let newArtist = item.artist || 'Unknown';
        // Sometimes artist field starts with clean name, sometimes with "Artist:"
        newArtist = newArtist.split('\n')[0].trim();
        newArtist = newArtist.replace(/^Artist[:：]\s*/i, '').trim();

        // 3. Fix Year
        // Extract first 4 digit number from year or Creation field strings
        let yearStr = item.year || '';
        // If year is empty, look in the original "messy" title/artist strings for "Creation: YYYY"
        if (!yearStr || yearStr.length > 5) {
            const combined = (item.title + ' ' + item.artist).replace(/\n/g, ' ');
            const m = combined.match(/Creation[:：]\s*(\d{4})/i);
            if (m) yearStr = m[1];
        }
        // Fallback: try to find any 20xx or 19xx
        if (!yearStr || yearStr.length > 5) {
            const m = (item.year || '').match(/(\d{4})/);
            if (m) yearStr = m[1];
        }

        // 4. Fix Medium / Dimensions if they are messy
        let medium = item.medium || '';
        if (!medium) {
            // Try extract from original fields
            const combined = (item.title + ' ' + item.artist).replace(/\n/g, ' ');
            const m = combined.match(/(?:Form|Medium|Material)[:：]\s*([^Size]+)/i);
            if (m) medium = m[1].trim();
        }
        if (medium.includes('\n')) medium = medium.split('\n')[0];

        let dimensions = item.dimensions || '';
        if (!dimensions) {
            const combined = (item.title + ' ' + item.artist).replace(/\n/g, ' ');
            const m = combined.match(/(?:Size|Dimensions)[:：]\s*([^\n]+)/i);
            if (m) dimensions = m[1].trim();
        }

        // 5. Fix Image (HTTP -> HTTPS proxy)
        // Since the site is HTTP, valid HTTPS request from app will fail (Mixed Content).
        // We wrap it in wsrv.nl or images.weserv.nl
        let image = item.image || '';
        if (image.startsWith('http://')) {
            // Check if it's already proxied? No.
            // Use wsrv.nl which turns http image into https URL
            // Encoded URL:
            // image = `https://wsrv.nl/?url=${encodeURIComponent(image)}&w=800&output=webp`;
            // Actually, let's just keep the original valid URL but upgrading to https ONLY IF we knew it worked.
            // But we don't. So we rely on the Frontend's existing proxy logic OR we force it here.
            // The user said "lightbox image not displayed".
            // The lightbox likely just puts the `src`. If it's http, it fails.
            // Let's force a proxy here, it's safest for a static JSON.
            // image = `https://images.weserv.nl/?url=${encodeURIComponent(image.replace('http://', ''))}`;
            // Wait, best to leave raw URL and let frontend proxy? 
            // The User complained "images not showing". Frontend might NOT be proxying correctly.
            // I will Use `wsrv.nl` which is generally reliable for this.
            image = `https://wsrv.nl/?url=${encodeURIComponent(image)}`;
        }

        return {
            id: item.id || `tam-${idx}`,
            title: newTitle,
            artist: newArtist,
            year: yearStr,
            medium: medium,
            dimensions: dimensions,
            image: image, // Proxied
            originalImage: item.image, // Keep backup
            sourceUrl: item.sourceUrl
        };
    });

    fs.writeFileSync(FILE, JSON.stringify(cleanedData, null, 2));
    console.log(`Cleaned ${cleanedData.length} items.`);
}

clean();
