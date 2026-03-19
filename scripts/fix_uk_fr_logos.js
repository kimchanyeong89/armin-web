const fs = require("fs");
const path = require("path");

const publicImagesDir = path.join(__dirname, "public", "images");
const exhibitionsFile = path.join(__dirname, "src", "data", "exhibitions.js");

async function downloadImage(url, destPath) {
    try {
        const res = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
                "Referer": "https://wikipedia.org/"
            }
        });
        if (!res.ok) {
            console.log(`Failed to fetch ${url} - Status ${res.status}`);
            return false;
        }
        const buffer = await res.arrayBuffer();
        // Some SVGs from Wikimedia might be 404 pages disguised as SVGs if the path is wrong.
        // Check if it's an HTML page disguised as SVG
        const textSample = Buffer.from(buffer.slice(0, 100)).toString();
        if (textSample.includes("<html") || textSample.includes("File not found")) {
            console.log(`Failed: ${url} returned HTML/Error instead of image`);
            return false;
        }
        fs.writeFileSync(destPath, Buffer.from(buffer));
        return true;
    } catch (err) {
        console.error(`Error downloading ${url}: ${err.message}`);
        return false;
    }
}

function generateTextLogo(name, destPath) {
    const words = name.split(" ");
    // Simple grouping to avoid too many lines:
    let lines = [];
    let currentStr = "";
    for (let w of words) {
        if ((currentStr + " " + w).length > 15) {
            if (currentStr) lines.push(currentStr.trim());
            currentStr = w;
        } else {
            currentStr += " " + w;
        }
    }
    if (currentStr) lines.push(currentStr.trim());
    if (lines.length > 4) lines = lines.slice(0, 4); // Max 4 lines

    const yStart = 400 / 2 - (lines.length * 50) / 2 + 35;
    const textEls = lines.map((l, i) => `<text x="400" y="${yStart + i * 50}" font-family="Helvetica, Arial, sans-serif" font-weight="900" font-size="44" fill="#000000" text-anchor="middle" letter-spacing="2">${l}</text>`).join("\n      ");
    const content = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 400" width="800" height="400">
      <rect width="800" height="400" fill="#f4f4f5"/>
      <rect width="780" height="380" x="10" y="10" fill="none" stroke="#ddd" stroke-width="2"/>
      ${textEls}
    </svg>`;
    fs.writeFileSync(destPath, content);
}

async function fixLogos() {
    let content = fs.readFileSync(exhibitionsFile, "utf8");

    // We'll read the array from the running app context to get the data, 
    // but to replace it precisely in the source code, we will construct replacements.
    // Actually, let's just use regex to parse the objects out locally!

    // Quick dynamic import to parse the data structure without modifying it
    const { exhibitions } = await import("file://" + exhibitionsFile.replace(/\\/g, "/"));

    let changesMade = 0;

    for (let ex of exhibitions) {
        if (ex.country === "United Kingdom" || ex.country === "UK" || ex.country === "France") {
            const repImage = ex.representativeImage;

            // Only process HTTP/HTTPS URLs, skip local images
            if (repImage && repImage.startsWith("http")) {
                console.log(`Processing: ${ex.name}`);
                const slug = ex.slug || ex.id;
                let ext = ".jpg";
                if (repImage.includes(".svg")) ext = ".svg";
                else if (repImage.includes(".png")) ext = ".png";
                else if (repImage.includes(".webp")) ext = ".webp";

                const localFilename = `${slug}-logo${ext}`;
                const localPath = path.join(publicImagesDir, localFilename);
                const newRef = `images/${localFilename}`;

                let success = await downloadImage(repImage, localPath);

                if (!success) {
                    console.log(`Fallback to text SVG for ${ex.name}`);
                    const fallbackFilename = `${slug}-logo.svg`;
                    const fallbackPath = path.join(publicImagesDir, fallbackFilename);
                    generateTextLogo(ex.name, fallbackPath);
                    console.log(`Generated basic text SVG: ${fallbackPath}`);
                    content = content.replace(`representativeImage: "${repImage}"`, `representativeImage: "images/${fallbackFilename}"`);
                    changesMade++;
                } else {
                    console.log(`Successfully downloaded: ${localFilename}`);
                    content = content.replace(`representativeImage: "${repImage}"`, `representativeImage: "${newRef}"`);
                    changesMade++;
                }

                // Let's not hammer the api, delay a little
                await new Promise(r => setTimeout(r, 200));
            }
        }
    }

    if (changesMade > 0) {
        fs.writeFileSync(exhibitionsFile, content, "utf8");
        console.log(`\nUpdated ${changesMade} URLs in exhibitions.js!`);
    } else {
        console.log("No changeable URLs found or all are already local.");
    }
}

fixLogos().catch(console.error);
