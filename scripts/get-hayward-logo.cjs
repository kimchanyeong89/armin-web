const { chromium } = require('playwright');
const readline = require('readline');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  console.log('Opening Hayward Gallery explore page...');
  console.log('CAPTCHA가 나오면 직접 풀어주세요.');
  console.log('준비되면 터미널에서 Enter를 눌러주세요.\n');
  
  await page.goto('https://artsandculture.google.com/explore/collections/hayward-gallery?c=assets', { waitUntil: 'domcontentloaded', timeout: 60000 });
  
  // Wait for user to press Enter after solving CAPTCHA
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise(resolve => rl.question('CAPTCHA 풀고 페이지 로드되면 Enter...', resolve));
  rl.close();
  
  console.log('\n이미지 찾는 중...');
  await page.waitForTimeout(2000);
  
  // Find all lh3 images
  const imgs = await page.$$eval('img', imgs => 
    imgs.map(i => ({ 
      src: i.src, 
      alt: i.alt || '', 
      width: i.naturalWidth || i.width, 
      height: i.naturalHeight || i.height 
    })).filter(i => i.src && i.src.includes('lh3.googleusercontent.com'))
  );
  
  console.log('\nFound images:', imgs.length);
  imgs.slice(0, 10).forEach((img, i) => {
    console.log(`${i}: ${img.width}x${img.height} - ${img.alt || '(no alt)'}`);
    console.log(`   ${img.src}`);
  });
  
  // Find the logo/header (usually first image or one with gallery name)
  const logoImg = imgs.find(i => i.alt.toLowerCase().includes('hayward') && i.alt.toLowerCase().includes('gallery')) 
    || imgs[0];
  
  if (logoImg) {
    console.log('\n\nBest candidate for logo:');
    console.log(logoImg.src);
  }
  
  await browser.close();
})();
