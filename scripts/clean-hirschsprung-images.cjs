const fs = require('fs');

const data = JSON.parse(fs.readFileSync('public/data/hirschsprung-collection.json', 'utf8'));

console.log('Total items before:', data.length);

const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tif', '.tiff'];

const cleaned = data.filter(item => {
    if (!item.image) return false;
    const url = item.image.trim();
    if (url === '') return false;

    // Check for spaces
    if (url.includes(' ')) {
        // Try to recover?
        // Example: "...foo.jpg. 123 metadata" -> "...foo.jpg"
        const parts = url.split(' ');
        const candidate = parts[0];
        // If candidate ends with a dot, remove it (UUID.)
        // But if it was "foo.jpg.", keeping "foo.jpg" is good.
        // If "foo.", it's bad.

        // Let's rely on extension check.
        // If the original URL had a space, it's already suspicious of being "caption text" rather than a URL.
        // Unless we can extract a clean URL ending in an extension.
        const cleanCandidate = candidate.replace(/\.$/, '');
        const hasExt = validExtensions.some(ext => cleanCandidate.toLowerCase().endsWith(ext));

        if (hasExt) {
            // It might be salvageable, but let's be safe and strict as per user request to "remove if missing/broken".
            // Actually, if we can salvage it, we should? 
            // The user said "if image is missing, delete it". Broken image = effectively missing.
            // But if I can fix it, I save the data.
            // However, the example "Lillebror" had "...952b. 3124...", which has NO extension. 
            // So that one is definitely dead.
            return false;
        }
        return false;
    }

    // Check header/extension validity?
    // Some valid URLs might not have extensions? 
    // The SLKS API seems to always use extensions based on the grep output.
    // "168d3616-8430-4917-b0b0-e94cd34a3543.JPG"
    // "f3f9c8dc-de1e-4617-ae29-a1bfb8f1808b.A" -> This ends in .A, likely invalid or weird.

    const hasExt = validExtensions.some(ext => url.toLowerCase().endsWith(ext));
    if (!hasExt) {
        // Log weird ones
        // console.log('Discarding URL without standard extension:', url);
        return false;
    }

    return true;
});

console.log('Total items after cleaning:', cleaned.length);
console.log('Removed:', data.length - cleaned.length);

// Save
fs.writeFileSync('public/data/hirschsprung-collection.json', JSON.stringify(cleaned, null, 2));
