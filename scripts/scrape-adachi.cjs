const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

async function fetchHtml(url) {
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Safari/605.1.15'
  ];
  const agent = userAgents[Math.floor(Math.random() * userAgents.length)];
  const res = await fetch(url, { headers: { 'User-Agent': agent } });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.text();
}

function normalizeStr(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function scrapeAdachi() {
  const startUrl = 'https://www.adachi-museum.or.jp/en/main_building'; 
  console.log('Fetching main structure...');
  const mainHtml = await fetchHtml(startUrl);
  const $ = cheerio.load(mainHtml);
  
  const artistLinks = [];
  const exhibitionLinks = new Set();
  
  // 1. Find Artist Links (Permanent Collection)
  $('.menu_contents__5 .artists_header').each((i, header) => {
    const catName = $(header).text().trim().replace(/\s+/g, ' ');
    const $ul = $(header).next('ul');
    
    if ($ul.length) {
      $ul.find('a').each((j, link) => {
        const href = $(link).attr('href');
        if (href && href.includes('/archives/collection/')) {
          artistLinks.push({
            url: href,
            category: catName,
            artistName: $(link).text().trim()
          });
        }
      });
    }
  });

  // 2. Find Exhibition Links
  $('a').each((i, link) => {
      const href = $(link).attr('href');
      if (href && href.includes('/archives/exhibition/')) {
          let fullUrl = href;
          if (!fullUrl.startsWith('http')) {
             fullUrl = new URL(href, 'https://www.adachi-museum.or.jp').href;
          }
          exhibitionLinks.add(fullUrl);
      }
  });
  
  // Ensure seed URLs
  const seedUrls = [
      'https://www.adachi-museum.or.jp/en/archives/exhibition/winter2025',
      'https://www.adachi-museum.or.jp/en/archives/exhibition/spring2026',
      'https://www.adachi-museum.or.jp/en/archives/exhibition/annex-2025-11-19'
  ];
  seedUrls.forEach(u => exhibitionLinks.add(u));

  console.log(`Found ${artistLinks.length} artist pages.`);
  console.log(`Found ${exhibitionLinks.size} exhibition pages.`);
  
  const allItems = [];
  const seenKeys = new Set(); // Key: normalized_artist + normalized_title

  const addItem = (item) => {
      if (!item.imageUrl) return;
      
      const nTitle = normalizeStr(item.title);
      const nArtist = normalizeStr(item.artist);
      
      // Use Title and Artist for deduplication
      let key = `${nArtist}|${nTitle}`;
      
      // Skip if already seen (Priority: Collection items processed first)
      if (seenKeys.has(key)) {
          // console.log(`Duplicate skipped: ${item.title} by ${item.artist}`);
          return;
      }
      seenKeys.add(key);
      allItems.push(item);
  };

  // --- Scrape Artists (Permanent Collection) - PRIORITY 1 ---
  for (const { url, category, artistName } of artistLinks) {
    console.log(`Scraping Artist: ${artistName} - ${path.basename(url)}`);
    
    try {
      const pageHtml = await fetchHtml(url);
      const $page = cheerio.load(pageHtml);
      const artistTitle = $page('.artist h1').text().trim() || artistName;
      
      $page('.swiper-slide').each((k, slide) => {
        const $slide = $page(slide);
        const imgRel = $slide.find('.photo img').attr('src');
        if (!imgRel) return;
        
        let imageUrl = imgRel.startsWith('http') ? imgRel : new URL(imgRel, 'https://www.adachi-museum.or.jp').href;
        const title = $slide.find('.caption .works_name').text().trim();
        
        // Parsing description/caption
        let captionText = '';
        $slide.find('.caption p').each((_, el) => {
            const t = $page(el).text().trim();
            if (t.length > captionText.length) captionText = t;
        });
        if (!captionText) {
            captionText = $slide.find('.caption').text().replace(title, '').replace(/\s+/g, ' ').trim();
        }
        captionText = captionText.replace(/\u3000/g, ' ');

        const yearMatch = captionText.match(/^(\d{4}(?:-\d{4})?)/);
        const year = yearMatch ? yearMatch[1] : '';
        const dimMatch = captionText.match(/(\d+(?:\.\d+)?\s*[×x]\s*\d+(?:\.\d+)?\s*cm)/i);
        const dimensions = dimMatch ? dimMatch[1] : '';
        
        const id = `adachi-col-${path.basename(url)}-${k + 1}`;
        
        let medium = '';
        if (category.includes('Japanese Painting')) medium = 'Japanese Painting';
        else if (category.includes('Ceramic')) medium = 'Ceramics';
        else if (category.includes('Wood Carving')) medium = 'Wood Carving';
        // else medium = category; 

        addItem({
          id,
          title: title || 'Untitled',
          artist: artistTitle,
          imageUrl,
          year,
          dimensions,
          medium, 
          category: category,
          description: captionText,
          source: 'Adachi Museum of Art',
          link: url
        });
      });
      
    } catch (err) {
      console.error(`Failed to scrape ${url}:`, err.message);
    }
  }

  // --- Scrape Exhibitions - PRIORITY 2 ---
  let exCount = 0;
  for (const url of exhibitionLinks) {
      exCount++;
      // console.log(`Scraping Exhibition: ${path.basename(url)}`);
      
      try {
          const pageHtml = await fetchHtml(url);
          const $page = cheerio.load(pageHtml);
          const exTitle = $page('title').text();

          const processExItem = (title, artist, imageUrl, id, extraYear = '') => {
             // CLEAN user request: Empty medium for exhibition items if invalid
             addItem({
                 id,
                 title,
                 artist,
                 imageUrl,
                 medium: '', // Explicitly empty
                 year: extraYear,
                 description: exTitle,
                 source: 'Adachi Museum of Art',
                 link: url,
                 category: 'Exhibition Highlight'
             });
          };

          // A. Hero Slider (Title | Artist)
          $page('.exhibition_hero_slider .swiper-slide').each((k, slide) => {
             const $slide = $page(slide);
             const imgRel = $slide.find('img').attr('src');
             if (!imgRel) return;

             let imageUrl = imgRel.startsWith('http') ? imgRel : new URL(imgRel, 'https://www.adachi-museum.or.jp').href;
             const captionRaw = $slide.find('.capton').text().trim(); 
             const parts = captionRaw.split('|').map(s=>s.trim());
             
             let title = parts[0] || 'Untitled';
             let artist = parts[1] || 'Unknown Artist';
             
             processExItem(title, artist, imageUrl, `adachi-ex-hero-${exCount}-${k}`);
          });

          // B. Body Images (.exhibition_info__img .works)
          $page('.exhibition_info__img .works').each((k, work) => {
              const $work = $page(work);
              const imgRel = $work.find('.img img').attr('src');
              if (!imgRel) return;

              let imageUrl = imgRel.startsWith('http') ? imgRel : new URL(imgRel, 'https://www.adachi-museum.or.jp').href;

              const captionHtml = $work.find('.caption').html() || '';
              const lines = captionHtml.split(/<br\s*\/?>/i).map(l => {
                  return cheerio.load(l).text().trim();
              }).filter(Boolean);

              let artist = 'Unknown';
              let title = 'Untitled';
              let year = '';

              if (lines.length >= 1) artist = lines[0];
              if (lines.length >= 2) title = lines[1].replace(/^["“](.*)["”]$/, '$1');
              if (lines.length >= 3) year = lines[2].replace(/[()]/g, '');

              processExItem(title, artist, imageUrl, `adachi-ex-body-${exCount}-${k}`, year);
          });

      } catch (err) {
          console.error(`Failed to scrape exhibition ${url}:`, err.message);
      }
  }

  // Save results
  const outputPath = path.join(__dirname, '../public/data/adachi-collection.json');
  fs.writeFileSync(outputPath, JSON.stringify(allItems, null, 2));
  console.log(`Saved ${allItems.length} items to ${outputPath}`);
}

scrapeAdachi();
