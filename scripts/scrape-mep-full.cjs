/**
 * MEP Full Collection Scraper
 * Maison Européenne de la Photographie - 전체 사진 콜렉션
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = 'downloads/mep-photography-collection.json';
const PROGRESS_FILE = 'downloads/mep-progress.json';

// 설정
const DELAY = 3000;        // 페이지 간 딜레이
const RETRIES = 2;         // 재시도 횟수
const SAVE_INTERVAL = 5;   // 몇 작가마다 저장할지

async function getArtistUrls(browser) {
  console.log('\n📋 Collecting artist URLs...');
  
  const page = await browser.newPage();
  await page.goto('https://www.mep-fr.org/les-collections/photographies/', {
    waitUntil: 'networkidle',
    timeout: 30000
  });
  await page.waitForTimeout(2000);
  
  const urls = await page.evaluate(() => {
    const links = document.querySelectorAll('a[href*="/les-collections/"]');
    const artistUrls = [];
    const seen = new Set();
    
    links.forEach(link => {
      const href = link.href;
      // 작가 페이지만 (photographies, video 등 제외)
      if (href.includes('/les-collections/') && 
          !href.endsWith('/photographies/') &&
          !href.endsWith('/photographies') &&
          !href.includes('/la-collection-video') &&
          !href.includes('/livres-documents') &&
          !href.endsWith('/les-collections/') &&
          !href.endsWith('/les-collections') &&
          !seen.has(href)) {
        seen.add(href);
        artistUrls.push(href);
      }
    });
    
    return artistUrls;
  });
  
  await page.close();
  console.log(`   Found ${urls.length} artist pages`);
  return urls;
}

async function scrapeArtistPage(browser, artistUrl, retries = RETRIES) {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  const page = await context.newPage();
  
  try {
    await page.goto(artistUrl, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(3000);
    
    // 쿠키 배너
    try {
      const btn = await page.$('button:has-text("OK"), .accept');
      if (btn) await btn.click();
    } catch (e) {}
    
    const data = await page.evaluate(() => {
      const result = {
        artistName: '',
        artistBio: '',
        artworks: []
      };
      
      // 작가 이름 (h1)
      const h1 = document.querySelector('h1');
      result.artistName = h1?.textContent?.trim() || '';
      
      // 작가 소개
      const intro = document.querySelector('.intro p, article p');
      result.artistBio = intro?.textContent?.trim()?.substring(0, 500) || '';
      
      // 이미지들
      const images = document.querySelectorAll('img');
      
      images.forEach((img) => {
        const src = img.src || '';
        if (!src || src.includes('logo') || src.includes('icon') || src.includes('.gif')) return;
        if (!src.includes('mep-fr.org/wp-content')) return;
        
        // 캡션 찾기
        let captionText = '';
        let parent = img.parentElement;
        
        for (let i = 0; i < 4 && parent; i++) {
          const text = parent.textContent?.trim();
          if (text && text.includes(',') && (text.includes('cm') || text.match(/\d{4}/))) {
            captionText = text;
            break;
          }
          parent = parent.parentElement;
        }
        
        if (!captionText) return;
        
        // 캡션 파싱
        let title = '';
        let artist = '';
        let year = '';
        let dimensions = '';
        let medium = '';
        
        const lines = captionText.split('\n').map(l => l.trim()).filter(Boolean);
        
        if (lines.length > 0) {
          const firstLine = lines[0];
          const match = firstLine.match(/^([^,]+),\s*(.+),\s*(\d{4}(?:-\d{4})?)/);
          
          if (match) {
            artist = match[1].trim();
            title = match[2].trim();
            year = match[3].trim();
          } else {
            const parts = firstLine.split(',').map(p => p.trim());
            if (parts.length >= 2) {
              artist = parts[0];
              title = parts[1];
              const yearMatch = firstLine.match(/(\d{4}(?:-\d{4})?)/);
              if (yearMatch) year = yearMatch[1];
            }
          }
        }
        
        // 치수 찾기
        for (const line of lines) {
          const dimMatch = line.match(/(\d+\s*x\s*\d+(?:\s*x\s*\d+)?\s*cm)/i);
          if (dimMatch) dimensions = dimMatch[1];
          
          if (line.toLowerCase().includes('tirage') || 
              line.toLowerCase().includes('print') ||
              line.toLowerCase().includes('épreuve')) {
            medium = line.split(';')[0].trim();
          }
        }
        
        const exists = result.artworks.some(a => a.image === src);
        if (!exists && title) {
          result.artworks.push({
            image: src,
            title: title,
            artist: artist,
            year: year,
            dimensions: dimensions,
            medium: medium
          });
        }
      });
      
      return result;
    });
    
    await context.close();
    return data;
    
  } catch (err) {
    await context.close();
    
    if (retries > 0) {
      console.log(`   ⚠️ Retry: ${err.message}`);
      await new Promise(r => setTimeout(r, 2000));
      return scrapeArtistPage(browser, artistUrl, retries - 1);
    }
    
    return null;
  }
}

function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
    }
  } catch (e) {}
  return { completedUrls: [], artists: [] };
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

function saveOutput(artists) {
  const output = {
    museum: 'Maison Européenne de la Photographie',
    museumId: 'mep',
    collectionName: 'Photography Collection',
    scrapedAt: new Date().toISOString(),
    totalArtists: artists.length,
    totalWorks: artists.reduce((sum, a) => sum + (a.artworks?.length || 0), 0),
    artists: artists
  };
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
}

async function main() {
  console.log('🏛️ MEP Full Collection Scraper\n');
  console.log('================================\n');
  
  const browser = await chromium.launch({ headless: true });
  
  // 작가 URL 수집
  const allUrls = await getArtistUrls(browser);
  
  // 진행 상황 로드
  const progress = loadProgress();
  const completedSet = new Set(progress.completedUrls);
  const remainingUrls = allUrls.filter(url => !completedSet.has(url));
  
  console.log(`\n📊 Progress: ${progress.completedUrls.length}/${allUrls.length} artists completed`);
  console.log(`   Remaining: ${remainingUrls.length} artists\n`);
  
  let artists = progress.artists;
  let processed = 0;
  
  for (const url of remainingUrls) {
    const artistSlug = url.split('/').filter(Boolean).pop();
    process.stdout.write(`📸 ${artistSlug}... `);
    
    const data = await scrapeArtistPage(browser, url);
    
    if (data && data.artworks.length > 0) {
      artists.push({
        name: data.artistName,
        bio: data.artistBio,
        url: url,
        artworks: data.artworks
      });
      progress.completedUrls.push(url);
      console.log(`✅ ${data.artworks.length} works`);
    } else if (data) {
      progress.completedUrls.push(url);
      console.log(`⚠️ No artworks found`);
    } else {
      console.log(`❌ Failed`);
    }
    
    processed++;
    
    // 주기적 저장
    if (processed % SAVE_INTERVAL === 0) {
      progress.artists = artists;
      saveProgress(progress);
      saveOutput(artists);
      console.log(`\n   💾 Saved progress (${artists.length} artists)\n`);
    }
    
    await new Promise(r => setTimeout(r, DELAY));
  }
  
  await browser.close();
  
  // 최종 저장
  saveOutput(artists);
  
  // 통계
  const totalWorks = artists.reduce((sum, a) => sum + (a.artworks?.length || 0), 0);
  
  console.log('\n================================');
  console.log('🎉 MEP Scraping Complete!\n');
  console.log(`📊 Statistics:`);
  console.log(`   - Artists: ${artists.length}`);
  console.log(`   - Total works: ${totalWorks}`);
  console.log(`\n📄 Output: ${OUTPUT_FILE}`);
  
  // public/data로 복사
  const publicPath = 'public/data/mep-photography-collection.json';
  if (!fs.existsSync('public/data')) fs.mkdirSync('public/data', { recursive: true });
  fs.copyFileSync(OUTPUT_FILE, publicPath);
  console.log(`📄 Copied to: ${publicPath}`);
}

main().catch(console.error);
