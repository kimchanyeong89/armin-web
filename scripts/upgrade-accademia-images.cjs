const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const JSON_PATH = path.join(__dirname, '../public/data/gallerie-accademia-venice-collection.json');
const PROGRESS_PATH = path.join(__dirname, '../downloads/upgrade-images-progress.json');

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function loadProgress() {
    if (fs.existsSync(PROGRESS_PATH)) {
        return JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf8'));
    }
    return { processedIds: [] };
}

function saveProgress(progress) {
    fs.writeFileSync(PROGRESS_PATH, JSON.stringify(progress, null, 2));
}

async function main() {
    const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
    const progress = loadProgress();
    
    console.log('=== Upgrading Images to High-Resolution ===\n');
    console.log(`Total artworks: ${data.objects.length}`);
    console.log(`Already processed: ${progress.processedIds.length}\n`);
    
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    });
    const page = await context.newPage();
    
    let updatedCount = 0;
    let errorCount = 0;
    
    // Process only artworks that haven't been processed yet
    for (let i = 0; i < data.objects.length; i++) {
        const artwork = data.objects[i];
        
        if (progress.processedIds.includes(artwork.id)) {
            continue;
        }
        
        console.log(`[${i+1}/${data.objects.length}] Processing: ${artwork.title.substring(0, 40)}...`);
        
        try {
            await page.goto(artwork.sourceUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await delay(1000);
            
            // Look for high-res gallery image links
            const highResImage = await page.evaluate(() => {
                // Look for gallery links with /repository/media/images/
                const galleryLinks = document.querySelectorAll('a[href*="/repository/media/images/"]');
                for (const link of galleryLinks) {
                    if (link.href && !link.href.includes('logo') && !link.href.includes('icon')) {
                        return link.href;
                    }
                }
                return null;
            });
            
            if (highResImage && highResImage !== artwork.image) {
                console.log(`  ✓ Found high-res: ${highResImage.substring(0, 60)}...`);
                artwork.image = highResImage;
                updatedCount++;
            } else {
                console.log(`  - No high-res found, keeping current image`);
            }
            
            progress.processedIds.push(artwork.id);
            
            // Save progress every 10 items
            if ((i + 1) % 10 === 0) {
                saveProgress(progress);
                fs.writeFileSync(JSON_PATH, JSON.stringify(data, null, 2));
                console.log(`  [Saved progress: ${progress.processedIds.length}/${data.objects.length}]`);
            }
            
        } catch (error) {
            console.log(`  ✗ Error: ${error.message}`);
            errorCount++;
        }
        
        await delay(300);
    }
    
    await browser.close();
    
    // Final save
    saveProgress(progress);
    fs.writeFileSync(JSON_PATH, JSON.stringify(data, null, 2));
    
    console.log('\n=== Summary ===');
    console.log(`Updated to high-res: ${updatedCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log(`Total processed: ${progress.processedIds.length}`);
    console.log('\n✅ Done!');
}

main().catch(console.error);
