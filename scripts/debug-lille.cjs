const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  console.log('=== Lille 미술관 사이트 구조 분석 ===\n');
  
  // 16th-20th century Paintings 카테고리 페이지
  await page.goto('https://pba.lille.fr/en/Collections/Highlights/16th-20th-century-Paintings', { 
    waitUntil: 'networkidle', 
    timeout: 60000 
  });
  await page.waitForTimeout(3000);
  
  const data = await page.evaluate(() => {
    // 모든 링크 중 작품으로 보이는 것들
    const allLinks = [...document.querySelectorAll('a[href]')].map(a => ({
      text: a.textContent?.trim().slice(0, 60),
      href: a.href
    })).filter(l => l.href.includes('16th-20th-century-Paintings/'));
    
    // 이미지들
    const images = [...document.querySelectorAll('img')].map(img => ({
      src: img.src?.slice(0, 100),
      alt: img.alt?.slice(0, 50)
    })).filter(i => i.src && !i.src.includes('logo') && !i.src.includes('icon'));
    
    // 페이지네이션 확인
    const paginationLinks = [...document.querySelectorAll('a')].filter(a => 
      a.textContent?.match(/^[0-9]+$/) || 
      a.href?.includes('page=') ||
      a.href?.includes('offset=') ||
      a.className?.includes('pag')
    ).map(a => ({ text: a.textContent?.trim(), href: a.href, class: a.className }));
    
    // 본문 HTML 일부
    const mainContent = document.querySelector('main, .content, body')?.innerHTML.slice(0, 5000);
    
    return { 
      artworkLinks: allLinks.slice(0, 30),
      images: images.slice(0, 10),
      paginationLinks: paginationLinks.slice(0, 10),
      mainContent
    };
  });
  
  console.log('=== 작품 링크들 ===');
  data.artworkLinks.forEach((l, i) => console.log(`${i+1}. ${l.text} -> ${l.href}`));
  
  console.log('\n=== 페이지네이션 ===');
  console.log(data.paginationLinks);
  
  console.log('\n=== 이미지들 ===');
  data.images.forEach(img => console.log(img));
  
  // 작품 상세 페이지 확인
  if (data.artworkLinks.length > 0) {
    const firstArtwork = data.artworkLinks.find(l => l.href.split('/').length > 7);
    if (firstArtwork) {
      console.log('\n=== 첫 번째 작품 상세 페이지 확인 ===');
      console.log('URL:', firstArtwork.href);
      
      await page.goto(firstArtwork.href, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(2000);
      
      const artworkData = await page.evaluate(() => {
        const title = document.querySelector('h1, .title, [class*=title]')?.textContent?.trim();
        const artist = document.querySelector('[class*=artist], .author, .creator')?.textContent?.trim();
        const images = [...document.querySelectorAll('img')].map(img => img.src).filter(s => s && !s.includes('logo'));
        const bodyText = document.body.innerText.slice(0, 2000);
        
        return { title, artist, images: images.slice(0, 5), bodyText };
      });
      
      console.log('Title:', artworkData.title);
      console.log('Artist:', artworkData.artist);
      console.log('Images:', artworkData.images);
      console.log('\n본문:\n', artworkData.bodyText.slice(0, 1000));
    }
  }
  
  await browser.close();
})();
