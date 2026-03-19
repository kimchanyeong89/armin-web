const fs = require('fs');
const path = require('path');

// 1. Parse Exhibitions Data
const exhibitionsContent = fs.readFileSync('src/data/exhibitions.js', 'utf8');

// Heuristic regex to match objects. 
// We want to capture: country, name, id, and permanentExhibitions block.
// Since JS object parsing via regex is flaky, we'll try to execute the file in a limited scope or parse conservatively.
// Actually, let's just use regex to find "country:" and "permanentExhibitions:" proximity for a rough audit.

// A better approach for the USER's specific request "check by country":
// Let's rely on the structure:
// {
//   id: "...",
//   ...
//   country: "...",
//   ...
//   permanentExhibitions: [ ... { collectionFile: "..." } ... ]
// }

// To robustly parse this without `eval`, we can use a small parser logic or just text processing.
// Given the file is standard JS export, let's try a regex state machine in Python or simple JS text processing.

const lines = exhibitionsContent.split('\n');
let currentCountry = 'Unknown';
let currentMuseumId = null;
let currentMuseumName = null;

const report = {}; // { Country: [ { museum: "...", exhibitions: [ { id, file, status } ] } ] }

// Helper to add report entry
function addEntry(country, mName, mId, exId, exFile) {
  if (!report[country]) report[country] = [];
  let mEntry = report[country].find(m => m.id === mId);
  if (!mEntry) {
    mEntry = { name: mName, id: mId, exhibitions: [] };
    report[country].push(mEntry);
  }
  
  const filePath = path.join('public/data', exFile);
  const exists = fs.existsSync(filePath);
  
  mEntry.exhibitions.push({
    id: exId,
    file: exFile,
    exists: exists
  });
}

for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  
  if (line.startsWith('country:')) {
    const match = line.match(/country:\s*["']([^"']+)["']/);
    if (match) currentCountry = match[1];
  }
  
  if (line.startsWith('id:') && !line.includes('{')) { 
    // Top level ID usually starts on its own line like 'id: "museo-prado",'
    const match = line.match(/id:\s*["']([^"']+)["']/);
    if (match) currentMuseumId = match[1];
  }
  
  if (line.startsWith('name:')) {
    const match = line.match(/name:\s*["']([^"']+)["']/);
    if (match) currentMuseumName = match[1];
  }

  // Detect permanent exhibition block
  if (line.includes('collectionFile:')) {
    // Usually one line: { id: "...", ... collectionFile: "..." }
    const idMatch = line.match(/id:\s*["']([^"']+)["']/);
    const fileMatch = line.match(/collectionFile:\s*["']([^"']+)["']/);
    
    if (idMatch && fileMatch) {
      addEntry(currentCountry, currentMuseumName, currentMuseumId, idMatch[1], fileMatch[1]);
    }
  }
}

// 2. Output Report
console.log('=== EXHIBITION DATA AUDIT BY COUNTRY ===\n');

Object.keys(report).sort().forEach(country => {
  const museums = report[country];
  const missing = [];
  
  museums.forEach(m => {
    m.exhibitions.forEach(ex => {
      if (!ex.exists) {
        missing.push({ museum: m.name, exId: ex.id, file: ex.file });
      }
    });
  });

  if (missing.length > 0) {
    console.log(`[${country}] ❌ ISSUES FOUND`);
    missing.forEach(m => {
       console.log(`  - ${m.museum} (Exhibition ID: ${m.exId})`);
       console.log(`    MISSING FILE: ${m.file}`);
    });
  } else {
    // console.log(`[${country}] ✅ All files present`);
  }
});

