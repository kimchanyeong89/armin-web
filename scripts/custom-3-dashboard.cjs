const { spawn } = require('child_process');
const blessed = require('blessed');

const MUSEUMS = [
  { name: 'Dulwich', file: 'dulwich-collection.json', prefix: 'dpg-1' },
  { name: 'Picasso BCN', file: 'picasso-bcn-collection.json', prefix: 'picasso-bcn-collection' },
  { name: 'Tate Artworks', file: 'tate-artworks.json', prefix: 'tm-perm-3' }
];

const screen = blessed.screen({ smartCSR: true, title: 'Upload Dashboard (3 Missing)' });

const grid = [];
const COLS = 3;
const BOX_WIDTH = Math.floor(100 / COLS);
const BOX_HEIGHT = 50;

MUSEUMS.forEach((m, i) => {
  const row = Math.floor(i / COLS);
  const col = i % COLS;

  const box = blessed.box({
    top: `${row * BOX_HEIGHT}%`, left: `${col * BOX_WIDTH}%`,
    width: `${BOX_WIDTH}%`, height: `${BOX_HEIGHT}%`,
    label: ` ${m.name} `, border: { type: 'line' },
    style: { border: { fg: 'yellow' } }, tags: true,
    content: '{yellow-fg}Queueing...{/}'
  });

  screen.append(box);
  grid.push({ box, museum: m });
});

screen.key(['escape', 'q', 'C-c'], () => process.exit(0));
screen.render();

function startUpload(index) {
  if (index >= MUSEUMS.length) return;
  const m = MUSEUMS[index];
  const box = grid[index].box;
  
  box.setContent('{cyan-fg}Starting...{/}');
  screen.render();

  const child = spawn('node', ['scripts/generic-r2-upload.cjs', m.prefix, m.file]);

  let totalStr = '?';
  let processedStr = '0';
  let skippedStr = '0';
  let uploadedStr = '0';
  let logs = [];

  child.stdout.on('data', (data) => {
    const text = data.toString();
    const lines = text.split('\n');

    for (let line of lines) {
      if(!line.trim()) continue;
      
      const skipMatch = line.match(/Skipped (\d+) /);
      if (skipMatch) skippedStr = skipMatch[1];
      
      const progMatch = line.match(/\[(\d+)\/(\d+)\]/);
      if (progMatch) {
         processedStr = progMatch[1];
         totalStr = progMatch[2];
      }
      
      const upMatch = line.match(/Uploaded .* \((.+?)\)/);
      if (upMatch) {
         uploadedStr = (parseInt(uploadedStr)||0) + 1;
      }
      
      const errMatch = line.match(/Error/i);
      if (errMatch) {
         logs.push(line.trim().substring(0, 40));
         if(logs.length > 5) logs.shift();
      }
    }

    const t = parseInt(totalStr)||0;
    const p = parseInt(processedStr)||0;
    const s = parseInt(skippedStr)||0;
    const u = parseInt(uploadedStr)||0;
    
    let color = 'cyan-fg';
    if (t > 0 && Math.max(p, s) >= t) color = 'green-fg';

    box.setContent(`{${color}}Total: ${t}\nProcessed: ${p}\nSkipped: ${s}\nUploaded: ${u}\nErrors: ${logs.length}{/}\n\nRecent Errors:\n${logs.join('\n')}`);
    screen.render();
  });

  child.on('close', (code) => {
    box.style.border.fg = code === 0 ? 'green' : 'red';
    box.setContent(box.getContent() + `\n\n{white-fg}Done: code ${code}{/}`);
    screen.render();
  });
}

for (let i = 0; i < grid.length; i++) {
  startUpload(i);
}
