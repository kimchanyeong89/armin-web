const { spawn } = require('child_process');

const MUSEUMS = [
  { name: 'Dulwich', file: 'dulwich-collection.json', prefix: 'dpg-1' },
  { name: 'Picasso BCN', file: 'picasso-bcn-collection.json', prefix: 'picasso-bcn-collection' },
  { name: 'Tate Artworks', file: 'tate-artworks.json', prefix: 'tm-perm-3' }
];

async function startUpload(m) {
  return new Promise((resolve) => {
    console.log(`Starting ${m.name}...`);
    // NOTE: generic-r2-upload.cjs expects: index 2: json file, index 3: r2 folder name
    const child = spawn('node', ['scripts/generic-r2-upload.cjs', m.file, m.prefix]);
    
    let stats = { processed: 0, skipped: 0, total: 0, uploaded: 0 };
    let interval = setInterval(() => {
        console.log(`[${m.name}] Total: ${stats.total}, Uploaded: ${stats.uploaded}, Skipped: ${stats.skipped} / Processed ${stats.processed}`);
    }, 5000);

    child.stdout.on('data', (data) => {
      const text = data.toString();
      const skipMatch = text.match(/Skipped (\d+) /);
      if (skipMatch) stats.skipped = parseInt(skipMatch[1]);
      
      const progMatch = text.match(/\[(\d+)\/(\d+)\]/);
      if (progMatch) {
         stats.processed = parseInt(progMatch[1]);
         stats.total = parseInt(progMatch[2]);
      }
      const upMatch = text.match(/Uploaded .* \((.+?)\)/g);
      if (upMatch) {
          stats.uploaded += upMatch.length;
      }
    });

    child.on('close', (code) => {
      clearInterval(interval);
      console.log(`Finished ${m.name} with code ${code}. Final stats: Total: ${stats.total}, Uploaded: ${stats.uploaded}, Skipped: ${stats.skipped}`);
      resolve();
    });
  });
}

async function run() {
    await Promise.all(MUSEUMS.map(m => startUpload(m)));
    console.log("All 3 completed.");
}

run();
