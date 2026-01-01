#!/usr/bin/env node
/**
 * Wallace Collection HTML 구조 분석
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    await page.goto('https://wallacelive.wallacecollection.org/eMP/eMuseumPlus?service=ExternalInterface&module=room&viewType=detailList', {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    await page.waitForTimeout(3000);
    
    // West Gallery I 클릭
    const roomLink = await page.$('.filterItem a:has-text("West Gallery I")');
    if (roomLink) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle' }),
        roomLink.click(),
      ]);
      await page.waitForTimeout(3000);
    }
    
    // HTML 저장
    const html = await page.content();
    fs.writeFileSync(path.join(__dirname, '../downloads/wallace-list-debug.html'), html);
    console.log('HTML 저장됨');
    
    // 모든 img 태그 확인
    const images = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('img')).map(img => ({
        src: img.src?.substring(0, 80),
        alt: img.alt,
        parentClass: img.parentElement?.className,
        parentTag: img.parentElement?.tagName,
      }));
    });
    
    console.log('\n이미지들:');
    images.filter(img => img.src && !img.src.includes('spacer') && img.src.includes('http')).forEach((img, i) => {
      if (i < 10) console.log(`  ${i}: ${img.src}`);
    });
    
    // li 구조 확인
    const liStructure = await page.evaluate(() => {
      const lis = document.querySelectorAll('li');
      const samples = [];
      
      lis.forEach((li, idx) => {
        if (idx > 5) return;
        const links = Array.from(li.querySelectorAll('a')).map(a => ({
          text: a.textContent?.trim().substring(0, 30),
          href: a.getAttribute('href')?.substring(0, 50),
        }));
        const imgs = Array.from(li.querySelectorAll('img')).map(img => ({
          src: img.src?.substring(0, 60),
        }));
        if (links.length > 0 || imgs.length > 0) {
          samples.push({ links, imgs, text: li.textContent?.substring(0, 50) });
        }
      });
      return samples;
    });
    
    console.log('\nLI 구조:');
    liStructure.forEach((li, i) => {
      console.log(`\n[${i}] 링크: ${li.links.length}, 이미지: ${li.imgs.length}`);
      li.links.forEach(l => console.log(`  링크: ${l.text} -> ${l.href}`));
      li.imgs.forEach(img => console.log(`  이미지: ${img.src}`));
    });
    
  } catch (err) {
    console.error('오류:', err.message);
  } finally {
    await browser.close();
  }
}

main();
