const fs = require("fs");
const path = require("path");

const publicImagesDir = path.join(__dirname, "..", "public", "images");
const exhibitionsFile = path.join(__dirname, "..", "src", "data", "exhibitions.js");

async function downloadImage(url, destPath) {
    try {
        const res = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
                "Referer": "https://wikipedia.org/"
            }
        });
        if (!res.ok) {
            return false;
        }
        const buffer = await res.arrayBuffer();
        const textSample = Buffer.from(buffer.slice(0, 100)).toString();
        if (textSample.includes("<html") || textSample.includes("File not found")) {
            return false;
        }
        fs.writeFileSync(destPath, Buffer.from(buffer));
        return true;
    } catch (err) {
        return false;
    }
}

function generateTextLogo(name, destPath) {
    const words = name.split(" ");
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
    if (lines.length > 4) lines = lines.slice(0, 4);

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

    const moduleUrl = "file://" + exhibitionsFile.replace(/\\/g, "/");
    const imported = await import(moduleUrl);
    const exhibitions = imported.exhibitions;

    let changesMade = 0;

    for (let ex of exhibitions) {
        if (ex.country === "United Kingdom" || ex.country === "UK" || ex.country === "France") {
            const repImage = ex.representativeImage;

            if (repImage && repImage.startsWith("http")) {
                console.log(`Processing: ${ex.name}`);
                const slug = ex.slug || ex.id;
                let ext = ".jpg";
                if (repImage.includes(".svg")) ext = ".svg";
                else if (repImage.includes(".png")) ext = ".png";
                else if (repImage.includes(".webp")) ext = ".webp";

                const localFilename = `${slug}-logo${ext}`;
                const localPath = path.join(publicImagesDir, localFilename);

                let success = await downloadImage(repImage, localPath);

                let newRef = "";
                if (!success) {
                    console.log(`Fallback to text SVG for ${ex.name}`);
                    const fallbackFilename = `${slug}-logo.svg`;
                    const fallbackPath = path.join(publicImagesDir, fallbackFilename);
                    generateTextLogo(ex.name, fallbackPath);
                    newRef = `images/${fallbackFilename}`;
                } else {
                    console.log(`Successfully downloaded: ${localFilename}`);
                    newRef = `images/${localFilename}`;
                }

                content = content.replace(`representativeImage: "${repImage}"`, `representativeImage: "${newRef}"`);
                changesMade++;

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
