#!/usr/bin/env node
/**
 * Test script to find alternative ways to download Museum Ludwig images
 * Tests various methods: screenshot, base64 extraction, different URLs, etc.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://museum-ludwig.kulturelles-erbe-koeln.de';
const TEST_ARTWORK_URL = 'https://museum-ludwig.kulturelles-erbe-koeln.de/documents/obj/05016026';

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testImageDownloadMethods() {
  console.log('🧪 Testing Museum Ludwig Image Download Methods\n');
  console.log(`Test artwork URL: ${TEST_ARTWORK_URL}\n`);

  const browser = await chromium.launch({ headless: false }); // headless: false to see what's happening
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();

  try {
    console.log('1️⃣ Navigating to artwork detail page...');
    await page.goto(TEST_ARTWORK_URL, { waitUntil: 'networkidle', timeout: 60000 });
    await delay(3000);

    console.log('2️⃣ Analyzing page content...\n');

    // Method 1: Check all image sources on the page
    console.log('📸 Method 1: Extract all image URLs from page...');
    const imageUrls = await page.evaluate(() => {
      const images = Array.from(document.querySelectorAll('img'));
      return images.map(img => ({
        src: img.src,
        dataSrc: img.getAttribute('data-src'),
        currentSrc: img.currentSrc,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        className: img.className,
        id: img.id
      })).filter(img => img.src && img.src.includes('kekmedien'));
    });

    console.log(`Found ${imageUrls.length} kekmedien images:`);
    imageUrls.forEach((img, i) => {
      console.log(`  ${i + 1}. ${img.src.substring(0, 80)}...`);
      console.log(`     Size: ${img.naturalWidth}x${img.naturalHeight}`);
      if (img.dataSrc) console.log(`     data-src: ${img.dataSrc.substring(0, 80)}...`);
    });
    console.log('');

    // Method 2: Try to fetch image via page.evaluate (browser context)
    if (imageUrls.length > 0) {
      const testImageUrl = imageUrls[0].src;
      console.log('🔄 Method 2: Try fetch in browser context...');
      try {
        const imageData = await page.evaluate(async (url) => {
          try {
            const response = await fetch(url, { credentials: 'include', mode: 'no-cors' });
            if (response.ok) {
              const blob = await response.blob();
              const reader = new FileReader();
              return new Promise((resolve) => {
                reader.onloadend = () => resolve({
                  success: true,
                  size: blob.size,
                  type: blob.type,
                  data: reader.result
                });
                reader.readAsDataURL(blob);
              });
            }
            return { success: false, status: response.status };
          } catch (e) {
            return { success: false, error: e.message };
          }
        }, testImageUrl);

        if (imageData.success) {
          console.log(`  ✅ Success! Image size: ${imageData.size} bytes, type: ${imageData.type}`);
          // Save test image
          const base64Data = imageData.data.split(',')[1];
          fs.writeFileSync('test-ludwig-image-from-fetch.jpg', Buffer.from(base64Data, 'base64'));
          console.log('  💾 Saved to: test-ludwig-image-from-fetch.jpg');
        } else {
          console.log(`  ❌ Failed: ${imageData.error || `Status ${imageData.status}`}`);
        }
      } catch (e) {
        console.log(`  ❌ Error: ${e.message}`);
      }
      console.log('');
    }

    // Method 3: Screenshot of image element
    if (imageUrls.length > 0) {
      console.log('📷 Method 3: Screenshot of image element...');
      try {
        const imgSelector = 'img[src*="kekmedien"]';
        const imgElement = await page.$(imgSelector);
        if (imgElement) {
          const box = await imgElement.boundingBox();
          if (box && box.width > 100 && box.height > 100) {
            await imgElement.screenshot({ path: 'test-ludwig-image-screenshot.png' });
            console.log(`  ✅ Screenshot saved: test-ludwig-image-screenshot.png (${Math.round(box.width)}x${Math.round(box.height)})`);
          } else {
            console.log('  ⚠️  Image element too small for screenshot');
          }
        } else {
          console.log('  ⚠️  Image element not found');
        }
      } catch (e) {
        console.log(`  ❌ Error: ${e.message}`);
      }
      console.log('');
    }

    // Method 4: Check network requests
    console.log('🌐 Method 4: Analyzing network requests...');
    const requests = [];
    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('kekmedien') && (url.match(/\.(jpg|jpeg|png|webp)$/i) || response.headers()['content-type']?.includes('image'))) {
        requests.push({
          url: url,
          status: response.status(),
          contentType: response.headers()['content-type'],
          headers: response.headers()
        });
      }
    });

    // Reload page to capture requests
    await page.reload({ waitUntil: 'networkidle' });
    await delay(2000);

    console.log(`Found ${requests.length} image requests:`);
    requests.forEach((req, i) => {
      console.log(`  ${i + 1}. ${req.url.substring(0, 80)}...`);
      console.log(`     Status: ${req.status}, Content-Type: ${req.contentType}`);
    });
    console.log('');

    // Method 5: Check for alternative image sources (CDN, thumbnails, etc.)
    console.log('🔍 Method 5: Looking for alternative image sources...');
    const pageContent = await page.content();
    const urlPatterns = [
      /https:\/\/[^"'\s]+kekmedien[^"'\s]+\.(jpg|jpeg|png|webp)/gi,
      /https:\/\/[^"'\s]+museum-ludwig[^"'\s]+\.(jpg|jpeg|png|webp)/gi,
      /https:\/\/[^"'\s]+kulturelles-erbe[^"'\s]+\.(jpg|jpeg|png|webp)/gi
    ];

    const allUrls = new Set();
    urlPatterns.forEach(pattern => {
      const matches = pageContent.match(pattern);
      if (matches) matches.forEach(url => allUrls.add(url));
    });

    console.log(`Found ${allUrls.size} potential image URLs in page source:`);
    Array.from(allUrls).slice(0, 10).forEach((url, i) => {
      console.log(`  ${i + 1}. ${url}`);
    });
    console.log('');

    // Method 6: Try to get image via page.goto
    if (imageUrls.length > 0) {
      const testImageUrl = imageUrls[0].src;
      console.log('🚀 Method 6: Try page.goto to image URL...');
      try {
        const newPage = await context.newPage();
        const response = await newPage.goto(testImageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        if (response && response.ok()) {
          const buffer = await response.body();
          if (buffer && buffer.length > 5000) {
            fs.writeFileSync('test-ludwig-image-from-goto.jpg', buffer);
            console.log(`  ✅ Success! Image saved: test-ludwig-image-from-goto.jpg (${buffer.length} bytes)`);
          } else {
            console.log(`  ❌ Invalid image buffer: ${buffer?.length || 0} bytes`);
          }
        } else {
          console.log(`  ❌ Failed: Status ${response?.status() || 'unknown'}`);
        }
        await newPage.close();
      } catch (e) {
        console.log(`  ❌ Error: ${e.message}`);
      }
      console.log('');
    }

    console.log('✅ Test completed! Check generated test image files.');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await browser.close();
  }
}

testImageDownloadMethods().catch(console.error);
