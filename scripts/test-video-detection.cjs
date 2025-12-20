/**
 * Google Arts & Culture 영상 감지 테스트
 * 
 * GAC에서 영상은 YouTube 임베드로 제공됩니다.
 * 페이지에서 YouTube iframe 또는 video 태그를 찾아서 영상 여부를 판단합니다.
 */

const { chromium } = require('playwright');
const readline = require('readline');

const TEST_URLS = [
  // 실제 영상으로 추정되는 항목들
  'https://artsandculture.google.com/asset/the-new-ra-in-90-seconds/RwF5hDzHWtaWuQ',
  'https://artsandculture.google.com/asset/the-summer-exhibition-in-60-seconds/oQGMeq8f28ROtw',
  'https://artsandculture.google.com/asset/a-movie-filmed-by-dezeen-at-the-unveiling-of-the-2013-serpentine-gallery-pavilion/BwG5M68-iQ40lQ',
  // 일반 이미지 (비교용)
  'https://artsandculture.google.com/asset/colour/hwHNaKrI9aT5Dg',
];

function waitForEnter(message) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise(resolve => {
    rl.question(message, () => {
      rl.close();
      resolve();
    });
  });
}

async function testVideoDetection() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  console.log('영상 감지 테스트 시작...\n');
  
  // 첫 페이지 열기
  await page.goto(TEST_URLS[0], { waitUntil: 'domcontentloaded', timeout: 30000 });
  
  console.log('========================================');
  console.log('브라우저가 열렸습니다.');
  console.log('CAPTCHA가 있으면 풀어주세요.');
  console.log('준비되면 터미널에서 Enter를 누르세요.');
  console.log('========================================\n');
  
  await waitForEnter('>>> Enter를 눌러 계속...');
  
  for (const url of TEST_URLS) {
    console.log('URL:', url);
    
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      await new Promise(r => setTimeout(r, 2000)); // 추가 대기
      
      // 스크롤로 컨텐츠 로드 트리거
      await page.evaluate(() => window.scrollTo(0, 500));
      await new Promise(r => setTimeout(r, 2000));
      
      const result = await page.evaluate(() => {
        // 1. YouTube iframe 찾기 (모든 형태)
        const allIframes = document.querySelectorAll('iframe');
        const youtubeIframes = [...allIframes].filter(f => 
          f.src?.includes('youtube') || f.getAttribute('data-src')?.includes('youtube')
        );
        
        // 2. Video 태그 찾기
        const videoTags = document.querySelectorAll('video');
        
        // 3. YouTube 링크 찾기
        const youtubeLinks = document.querySelectorAll('a[href*="youtube.com"], a[href*="youtu.be"]');
        
        // 4. 전체 HTML에서 YouTube ID 패턴 찾기
        const html = document.documentElement.innerHTML;
        const ytPatterns = [
          /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
          /youtu\.be\/([a-zA-Z0-9_-]{11})/,
          /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
          /videoId['":\s]+['"]([a-zA-Z0-9_-]{11})['"]/,
          /video_id['":\s]+['"]([a-zA-Z0-9_-]{11})['"]/,
        ];
        let youtubeId = null;
        for (const pattern of ytPatterns) {
          const match = html.match(pattern);
          if (match) {
            youtubeId = match[1];
            break;
          }
        }
        
        // 5. 플레이 버튼 요소 찾기 (영상 인디케이터)
        const playButtons = document.querySelectorAll('[aria-label*="play"], [aria-label*="Play"], .play-button, [class*="play"]');
        
        // 6. 메타 태그에서 영상 정보 찾기
        const ogVideo = document.querySelector('meta[property="og:video"]')?.content;
        const ogType = document.querySelector('meta[property="og:type"]')?.content;
        
        // 7. 제목 찾기
        let title = document.querySelector('h1')?.textContent?.trim();
        if (!title) {
          title = document.querySelector('[data-test-id="asset-title"]')?.textContent?.trim();
        }
        if (!title) {
          title = document.querySelector('meta[property="og:title"]')?.content;
        }
        
        return {
          allIframeCount: allIframes.length,
          youtubeIframeCount: youtubeIframes.length,
          youtubeIframeSrc: youtubeIframes[0]?.src || youtubeIframes[0]?.getAttribute('data-src'),
          videoTagCount: videoTags.length,
          videoTagSrc: videoTags[0]?.src || videoTags[0]?.querySelector('source')?.src,
          youtubeLinkCount: youtubeLinks.length,
          youtubeLinkHref: youtubeLinks[0]?.href,
          youtubeId,
          playButtonCount: playButtons.length,
          ogVideo,
          ogType,
          title,
        };
      });
      
      console.log('  Title:', result.title);
      console.log('  All iframes:', result.allIframeCount);
      console.log('  YouTube iframes:', result.youtubeIframeCount, result.youtubeIframeSrc || '');
      console.log('  Video tags:', result.videoTagCount, result.videoTagSrc || '');
      console.log('  YouTube links:', result.youtubeLinkCount, result.youtubeLinkHref || '');
      console.log('  YouTube ID:', result.youtubeId);
      console.log('  Play buttons:', result.playButtonCount);
      console.log('  og:video:', result.ogVideo);
      console.log('  og:type:', result.ogType);
      
      const isVideo = result.youtubeIframeCount > 0 || result.videoTagCount > 0 || 
                      result.youtubeId || result.ogVideo || result.ogType?.includes('video');
      console.log('  Is Video:', isVideo ? '✅ YES' : '❌ NO');
      console.log();
      
    } catch (e) {
      console.log('  Error:', e.message);
      console.log();
    }
  }
  
  await browser.close();
  console.log('테스트 완료');
}

testVideoDetection().catch(console.error);
