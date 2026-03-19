const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const OUTPUT_FILE = path.join(__dirname, '../public/data/frida-timeline.json');

async function scrape() {
  console.log('Fetching Frida Timeline...');
  // We already have the file locally from our previous curl, let's use it if available, OR fetch fresh.
  // Using fetch for simplicity in this script.
  
  const response = await fetch('https://www.museofridakahlo.org.mx/frida/');
  const html = await response.text();
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const items = [];
  const timelineItems = doc.querySelectorAll('.timeline__item');

  timelineItems.forEach((item, index) => {
    // Only interest in items with images in the figure
    const imgEl = item.querySelector('.timeline__figure img');
    if (!imgEl) return;

    const titleEl = item.querySelector('.timeline__title');
    const summaryEl = item.querySelector('.timeline__info-summary');
    const textEl = item.querySelector('.timeline__text');
    const yearEl = item.querySelector('.timeline__info-year');

    const fullText = (textEl ? textEl.textContent : '') + ' ' + (summaryEl ? summaryEl.textContent : '');
    
    // Heuristic: Does it mention "pinta" (paints), "cuadro" (painting), "autorretrato" (self-portrait)?
    const isArtworkContext = /pinta|cuadro|autorretrato|obra|oleo|oil|canvas|portrait/i.test(fullText) || 
                             (titleEl && /pinta|cuadro|autorretrato/i.test(titleEl.textContent));

    // We want to capture things that look like artworks. 
    // However, the user said "If there are works here".
    // Many images are just photos. 
    // Let's be permissive but try to extract a title if possible.
    
    // Try to find an italicized title inside text, often formatted as <p><em>Title</em>, year...</p>
    let title = '';
    let date = yearEl ? yearEl.textContent.trim() : '';
    
    const em = item.querySelector('em');
    if (em) {
        title = em.textContent.trim();
    } else if (titleEl) {
        title = titleEl.textContent.trim();
    } else {
        title = `Timeline Image ${yearEl ? yearEl.textContent : index}`;
    }

    // Clean title: "Frida pinta su primer autorretrato." -> "Autorretrato" if possible?
    // Maybe best to just use the narrative title if no EM tag found.

    const src = imgEl.getAttribute('data-src') || imgEl.getAttribute('src');
    
    // Filter: User specifically asked for WORKS. 
    // We should probably only include items where we found an <em> tag (often used for titles) 
    // OR keywords like "Autorretrato".
    if (isArtworkContext || em) {
        items.push({
            id: 'frida-timeline-' + index,
            title: title,
            artist: 'Frida Kahlo',
            date: date,
            image: src,
            source: 'Museo Frida Kahlo',
            description: summaryEl ? summaryEl.textContent.trim() : ''
        });
    }
  });

  console.log(`Found ${items.length} potnetial artworks.`);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(items, null, 2));
  console.log(`Saved to ${OUTPUT_FILE}`);
}

scrape();
