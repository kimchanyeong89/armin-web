const fs = require('fs');
const readline = require('readline');
const path = require('path');

const OBJECTS_CSV = 'downloads/nga-opendata/objects.csv';
const IMAGES_CSV = 'downloads/nga-opendata/published_images.csv';

async function analyze() {
  // 1. Load Image Status (Open Access or not)
  console.log('Loading Images...');
  const imageStatus = new Map(); // objectId -> { count, hasOpenAccess }
  
  const imgStream = fs.createReadStream(IMAGES_CSV);
  const imgRl = readline.createInterface({ input: imgStream, crlfDelay: Infinity });
  
  let imgHeader = null;
  for await (const line of imgRl) {
    if (!imgHeader) {
        imgHeader = line.split(','); 
        continue;
    }
    // Simple CSV split (imperfect but usually ok for IDs/maxpixels which don't have commas)
    // Actually published_images.csv is well structured.
    // uuid,iiifurl,iiifthumburl,viewtype,sequence,width,height,maxpixels,created,modified,depictstmsobjectid,assistivetext
    // depictstmsobjectid is index 10 (usually)
    // maxpixels is index 7
    
    // Better split handling for safety:
    const cols = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [];
    // Actually standard split might be safer if we trust no commas in numbers
    const p = line.split(',');
    // maxpixels is at 7
    // depictstmsobjectid is at 10
    
    const objId = p[10];
    const maxpixels = p[7];
    
    if (objId) {
        if (!imageStatus.has(objId)) imageStatus.set(objId, { count: 0, hasOpenAccess: false });
        const st = imageStatus.get(objId);
        st.count++;
        // Check open access (empty or 0)
        // Note: CSV empty field might be just nothing between commas
        // e.g. ,,,
        if (!maxpixels || maxpixels === '0' || maxpixels === '""') {
            st.hasOpenAccess = true;
        }
    }
  }
  
  console.log(`Loaded images for ${imageStatus.size} objects.`);
  
  // 2. Analyze Objects
  console.log('Analyzing Objects...');
  const stats = {
    totalDrawing: 0,
    withImages: 0,
    openAccess: 0,
    byVizClass: {},
    bySubClass: {},
    byCredit: {} // Check top credit lines
  };
  
  const objStream = fs.createReadStream(OBJECTS_CSV);
  const objRl = readline.createInterface({ input: objStream, crlfDelay: Infinity });
  
  let objHeader = null;
  let colMap = {};
  
  for await (const line of objRl) {
    if (!objHeader) {
        objHeader = line.toLowerCase().split(',');
        objHeader.forEach((h, i) => colMap[h] = i);
        continue;
    }
    
    // We need robust CSV parsing here because titles/credits have commas
    // minimal parser:
    const row = [];
    let inQuote = false;
    let token = '';
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
            inQuote = !inQuote;
        } else if (c === ',' && !inQuote) {
            row.push(token);
            token = '';
        } else {
            token += c;
        }
    }
    row.push(token);
    
    const classification = row[colMap['classification']];
    
    if (classification === 'Drawing') {
        stats.totalDrawing++;
        const objId = row[colMap['objectid']];
        const imgSt = imageStatus.get(objId);
        
        if (imgSt) {
            stats.withImages++;
            if (imgSt.hasOpenAccess) {
                stats.openAccess++;
                
                // Analyze breakdown of these "Open Access Drawings"
                const viz = row[colMap['visualbrowserclassification']] || '(none)';
                const sub = row[colMap['subclassification']] || '(none)';
                const credit = row[colMap['creditline']] || '(none)';
                
                stats.byVizClass[viz] = (stats.byVizClass[viz] || 0) + 1;
                stats.bySubClass[sub] = (stats.bySubClass[sub] || 0) + 1;
                
                // Group credit lines (e.g. Rosenwald)
                let creditKey = 'Other';
                if (credit.includes('Rosenwald')) creditKey = 'Rosenwald Collection';
                else if (credit.includes('Index of American Design')) creditKey = 'Index of American Design';
                else if (credit.includes('Gift')) creditKey = 'Gift';
                else creditKey = credit.substring(0, 20);
                
                stats.byCredit[creditKey] = (stats.byCredit[creditKey] || 0) + 1;
            }
        }
    }
  }
  
  console.log('--- Analysis Result ---');
  console.log('Total Objects with classification="Drawing":', stats.totalDrawing);
  console.log('.. with images:', stats.withImages);
  console.log('.. with Open Access (maxpixels=0/empty):', stats.openAccess);
  console.log('Discrepancy (We have 8264, target ~6663): diff ~', stats.openAccess - 6663);
  
  console.log('\nBreakdown by VisualBrowserClassification (top 10):');
  Object.entries(stats.byVizClass)
    .sort((a,b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([k,v]) => console.log(`  ${k}: ${v}`));
    
  console.log('\nBreakdown by SubClassification (top 10):');
  Object.entries(stats.bySubClass)
    .sort((a,b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([k,v]) => console.log(`  ${k}: ${v}`));
    
  console.log('\nBreakdown by CreditLine type (top 10):');
  Object.entries(stats.byCredit)
    .sort((a,b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([k,v]) => console.log(`  ${k}: ${v}`));

}

analyze().catch(console.error);
