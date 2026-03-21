const fs = require('fs');

async function run() {
  // We use regex to extract the exhibitions array correctly
  const dataPath = './src/data/exhibitions.js';
  let fileText = fs.readFileSync(dataPath, 'utf8');

  // Load current dynamically mapped
  const { exhibitions: museums } = await import(dataPath);
  
  const mappedFiles = new Set();
  const extractCollectionFiles = (exhibitionsList) => {
    exhibitionsList.forEach(exh => {
      if (exh.permanentExhibitions) {
        exh.permanentExhibitions.forEach(p => {
          if (p.collectionFile) mappedFiles.add(p.collectionFile);
        });
      }
      if (exh.temporaryExhibitions) {
        exh.temporaryExhibitions.forEach(t => {
          if (t.collectionFile) mappedFiles.add(t.collectionFile);
        });
      }
    });
  };
  extractCollectionFiles(museums);
  
  // Exclude uffizi because it's manually correctly linked
  mappedFiles.add('uffizi-collection.json');

  const allFiles = fs.readdirSync('public/data').filter(f => 
    f.endsWith('.json') && 
    f !== 'artists-data.json' && 
    f !== 'artists-global.json' && 
    f !== 'search-index.json' && 
    !f.includes('gallery-collection.json') &&
    !f.includes('.backup') &&
    !f.includes('-status') &&
    !f.includes('-failures') &&
    !f.includes('-codes') &&
    !f.includes('-counts') &&
    !f.includes('image-connectivity') &&
    !f.includes('search-index-part-') &&
    f !== 'search-manifest.json' &&
    f !== 'search-warm-prefix.json' &&
    f !== 'valid-artists.json' &&
    f !== 'video-embed-ids.json' &&
    f !== 'webp-size-estimate.json'
  );

  const missingFiles = allFiles.filter(f => !mappedFiles.has(f));
  
  console.log("Missing files to inject:", missingFiles);

  // We need to inject them at the very end. The file ends with `];`.
  // Let's find the last `];`
  const lastIndex = fileText.lastIndexOf('];');
  if (lastIndex === -1) {
     console.error("Could not find ];");
     return;
  }

  // Remove the old INJECTED MISSING FILES block and following ];
  const injectedIndex = fileText.indexOf('/* INJECTED MISSING FILES */');
  if (injectedIndex !== -1) {
    // we need to step back to the previous "},"
    const beforeInjected = fileText.substring(0, injectedIndex);
    const lastCommaBrace = beforeInjected.lastIndexOf('},');
    if (lastCommaBrace !== -1) {
        fileText = beforeInjected.substring(0, lastCommaBrace + 2) + "\n];\n";
    }
  }

  let extraBlock = "  /* INJECTED MISSING FILES */\n";
  for (let i = 0; i < missingFiles.length; i++) {
      const file = missingFiles[i];
      const id = file.replace('.json', '');
      const isLast = (i === missingFiles.length - 1);
      extraBlock += `  {
    id: "hidden-${id}",
    slug: "hidden-${id}",
    name: "Hidden - ${id}",
    country: "Various",
    city: "Various",
    location: "Various",
    representativeImage: "",
    permanentExhibitions: [
      { id: "collection-${id}", name: "${id}", title: "${id}", startDate: "Permanent", endDate: "Permanent", collectionFile: "${file}" }
    ],
    temporaryExhibitions: []
  }${isLast ? '' : ','}\n`;
  }

  // Find newly updated lastIndex
  const newLastIndex = fileText.lastIndexOf('];');
  
  // we do a safer replacing
  let finalFileText = fileText.substring(0, newLastIndex);
  // trim trailing whitespace and optionally remove the last comma so we can add one
  finalFileText = finalFileText.trimEnd();
  if (finalFileText.endsWith('}')) {
      finalFileText += ',';
  } else if (!finalFileText.endsWith(',')) {
      // it should ideally end with },
      finalFileText += ',';
  }
  
  finalFileText += "\n" + extraBlock + "\n];\n";

  fs.writeFileSync(dataPath, finalFileText, 'utf8');
  console.log("Successfully appended missing files.");
}
run();