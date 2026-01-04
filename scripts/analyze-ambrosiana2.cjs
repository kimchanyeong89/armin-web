const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    console.log('페이지 로드 중...');
    await page.goto('https://www.ambrosiana.it/en/pinacoteca-collections/#/category', { 
      waitUntil: 'networkidle', 
      timeout: 60000 
    });
    await new Promise(r => setTimeout(r, 8000));
    
    // 작품 카드 구조 분석
    const cards = await page.evaluate(() => {
      const items = [];
      document.querySelectorAll('.photo-item').forEach((el, i) => {
        if (i >= 5) return;
        const link = el.querySelector('a');
        const img = el.querySelector('img');
        items.push({
          class: el.className,
          html: el.innerHTML.slice(0, 300),
          link: link ? link.href : null,
          img: img ? img.src : null
        });
      });
      return items;
    });
    
    console.log('=== Photo Items ===');
    console.log(JSON.stringify(cards, null, 2));
    
    // 첫 번째 상세 페이지 방문
    if (cards.length > 0 && cards[0].link) {
      console.log('\n=== 상세 페이지 ===');
      console.log('URL:', cards[0].link);
      await page.goto(cards[0].link, { waitUntil: 'networkidle', timeout: 30000 });
      await new Promise(r => setTimeout(r, 3000));
      
      const detail = await page.evaluate(() => {
        return {
          title: document.querySelector('h1, h2')?.textContent?.trim(),
          text: document.body.innerText.slice(0, 2000)
        };
      });
      
      console.log('Title:', detail.title);
      console.log('Text:', detail.text);
    }
    
  } catch (e) {
    console.log('Error:', e.message);
  } finally {
    await browser.close();
  }
})();
