#!/usr/bin/env node
/**
 * Hayward Gallery 전시 상세 정보 스크래핑 스크립트
 * 
 * 아카이브 규칙 준수:
 * - 전시명, 표지 이미지, 전시 기간 수집
 * - 전시 설명 (description) 수집
 * - 전시 페이지 이미지 수집
 * - R2에 이미지 업로드 (WebP 형식)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// R2 업로드를 위한 AWS SDK
let S3Client, PutObjectCommand;
try {
  const awsS3 = require('@aws-sdk/client-s3');
  S3Client = awsS3.S3Client;
  PutObjectCommand = awsS3.PutObjectCommand;
} catch (e) {
  console.log('⚠️  @aws-sdk/client-s3 not found - will skip R2 upload');
}

// Sharp for image processing
let sharp;
try {
  sharp = require('sharp');
} catch (e) {
  console.log('⚠️  sharp not found - will skip image processing');
}

const R2_PUBLIC_URL = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const OUTPUT_DIR = path.join(__dirname, '..', 'downloads', 'hayward');

// 기존에 수집한 전시 목록 (98개)
const exhibitions = [
  // 2025
  { id: "65720", title: "Yoshitomo Nara" },
  { id: "66729", title: "Ghazaleh Avarzamani and Ali Ahadi: Freudian Typo" },
  { id: "64916", title: "Linder: Danger Came Smiling" },
  { id: "64917", title: "Mickalene Thomas: All About Love" },
  { id: "64913", title: "Haegue Yang: Leap Year" },
  { id: "64914", title: "Huang Po-Chih: Waves" },
  
  // 2024
  { id: "64275", title: "Tavares Strachan: There Is Light Somewhere" },
  { id: "62951", title: "The Life of Forms" },
  { id: "62389", title: "Hiroshi Sugimoto" },
  
  // 2023
  { id: "61497", title: "Dear Earth: Art and Hope in a Time of Crisis" },
  { id: "60467", title: "Mike Nelson: Extinction Beckons" },
  { id: "59920", title: "Strange Clay: Ceramics in Contemporary Art" },
  
  // 2022
  { id: "60035", title: "Koestler Arts: Freedom" },
  { id: "59323", title: "In the Black Fantastic" },
  { id: "58472", title: "Louise Bourgeois: The Woven Child" },
  { id: "59237", title: "Anthea Hamilton Commission" },
  
  // 2021
  { id: "58251", title: "Mixing It Up: Painting Today" },
  { id: "58252", title: "Gerhard Richter: Drawings, 1999 – 2021" },
  { id: "57642", title: "Matthew Barney: Redoubt" },
  { id: "57643", title: "Igshaan Adams: Kicking Dust" },
  { id: "25037", title: "Winter Light" },
  
  // 2020
  { id: "25038", title: "Among the trees" },
  { id: "25040", title: "Nevin Aladağ: Fanfare" },
  { id: "25041", title: "Joo Yeon Park: Libation" },
  { id: "25042", title: "Bridget Riley" },
  
  // 2019
  { id: "25043", title: "Kiss My Genders" },
  { id: "25045", title: "Kader Attia: The Museum of Emotion" },
  { id: "25046", title: "diane arbus: in the beginning" },
  { id: "25044", title: "Aleksandra Mir: Presents the Pre-Presidential Library" },
  { id: "25048", title: "Space Shifters" },
  
  // 2018
  { id: "25047", title: "Emmanuelle Lainé" },
  { id: "25049", title: "DRAG: Self-portraits and Body Politics" },
  { id: "25050", title: "Lee Bul" },
  { id: "25051", title: "Andreas Gursky" },
  
  // 2015
  { id: "25052", title: "Dineo Seshee Bopape" },
  { id: "25055", title: "Carsten Höller: Decision" },
  { id: "25053", title: "Echoes & Reverberations" },
  { id: "25054", title: "Neha Choksi: Minds to lose" },
  { id: "25056", title: "History is Now: 7 artists take on Britain" },
  { id: "25057", title: "MIRRORCITY: London artists on fiction and reality" },
  
  // 2014
  { id: "25058", title: "The Human Factor" },
  { id: "25059", title: "Martin Creed: What's the point of it?" },
  
  // 2013
  { id: "25060", title: "Dayanita Singh: Go Away Closer" },
  { id: "25061", title: "Ana Mendieta: Traces" },
  { id: "25063", title: "The Alternative Guide to the Universe" },
  { id: "25062", title: "Aura Satz: Impulsive Synchronisation" },
  { id: "25064", title: "Light Show" },
  
  // 2012
  { id: "25065", title: "Art of Change: New Directions from China" },
  { id: "25067", title: "Invisible Art" },
  { id: "25066", title: "Wide Open School" },
  { id: "25069", title: "JEREMY DELLER: JOY IN PEOPLE" },
  { id: "25070", title: "DAVID SHRIGLEY: BRAIN ACTIVITY" },
  { id: "25068", title: "Hayward Project Space: Euan MacDonald" },
  { id: "25072", title: "George Condo: Mental States" },
  { id: "25073", title: "Pipilotti Rist" },
  
  // 2011
  { id: "25076", title: "Tracey Emin: Love is What You Want" },
  { id: "25077", title: "The Royal Family: Hayward Gallery Project Space" },
  { id: "25078", title: "British Art Show 7: In the Days of the Comet" },
  { id: "25081", title: "Move: Choreographing You" },
  
  // 2010
  { id: "25079", title: "Ron Terada: Who I Think I Am" },
  { id: "25080", title: "Jess Flood-Paddock: Gangsta's Paradise" },
  { id: "25083", title: "Silberkuppe: Rooms Without Walls" },
  { id: "25086", title: "Ed Ruscha: Fifty Years of Painting" },
  
  // 2009
  { id: "25084", title: "Victor Man: If Mind Were All There Was" },
  { id: "25085", title: "Martin Sastre" },
  { id: "25089", title: "Walking in My Mind" },
  { id: "25087", title: "Deceitful Moon" },
  { id: "25088", title: "Matthew Darbyshire: Funhouse" },
  { id: "25090", title: "PaulMart: Beton brut" },
  { id: "25092", title: "Annette Messager: The Messengers" },
  { id: "25093", title: "Mark Wallinger Curates: The Russian Linesman" },
  { id: "25091", title: "Ujino and the Rotators" },
  { id: "25094", title: "Andy Warhol: Other Voices, Other Rooms" },
  
  // 2008
  { id: "25095", title: "Robin Rhode: Who Saw Who" },
  { id: "25096", title: "Psycho Buildings: Artists take on Architecture" },
  { id: "25097", title: "Laughing in a Foreign Language" },
  { id: "25098", title: "alexander rodchenko: revolution in photography" },
  { id: "25099", title: "Klara Liden" },
  
  // 2007
  { id: "25101", title: "the painting of modern life" },
  { id: "25100", title: "kota ezawa: hotel california" },
  { id: "25102", title: "Antony Gormley: Blind Light" },
  
  // 2006
  { id: "25103", title: "How to Improve the World: British Art 1946 - 2006" },
  { id: "25104", title: "Undercover Surrealism" },
  
  // 2005
  { id: "25106", title: "Universal Experience: Art, Life and the Tourist's Eye" },
  { id: "25107", title: "Rebecca Horn: Bodylandscapes" },
  { id: "25108", title: "Africa Remix" },
  
  // 2004
  { id: "25109", title: "saved!" },
  
  // 2003
  { id: "25111", title: "douglas gordon what have i done" },
  
  // 2002
  { id: "25112", title: "william eggleston" },
  { id: "25113", title: "ansel adams at 100" },
  { id: "25114", title: "Gerhard Richter: Forty Years of Painting" },
  { id: "25115", title: "Paris Capital of the Arts 1900-1968" },
  { id: "25116", title: "Moving Targets" },
  { id: "25117", title: "Give and Take" },
  { id: "25118", title: "Bridget Riley" },
  { id: "25119", title: "Century City: Art and Culture in the Modern Metropolis" },
  { id: "25120", title: "Painting at the Edge of the World" },
  { id: "25121", title: "Here and Now" },
  { id: "25122", title: "Carlo Scarpa" },
];

// HTTP/HTTPS fetch helper
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, { 
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

// 이미지 다운로드
function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadImage(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

// HTML에서 전시 정보 추출
function parseExhibitionPage(html, id) {
  const result = {
    id: `hayward-${id}`,
    sourceUrl: `https://www.newexhibitions.com/e/${id}`,
    title: '',
    startDate: '',
    endDate: '',
    description: '',
    coverImage: '',
    galleryImages: []
  };
  
  // 제목 추출
  const titleMatch = html.match(/<h2[^>]*>([^<]+)<\/h2>/i) || 
                     html.match(/## ([^\n]+)/);
  if (titleMatch) {
    result.title = titleMatch[1].trim();
  }
  
  // 날짜 추출 (예: "10 Jun-31 Aug 2025")
  const dateMatch = html.match(/# (\d{1,2} \w{3})-(\d{1,2} \w{3} \d{4})/i) ||
                    html.match(/(\d{1,2} \w{3,})[–-](\d{1,2} \w{3,} \d{4})/i);
  if (dateMatch) {
    const endDateStr = dateMatch[2];
    const yearMatch = endDateStr.match(/\d{4}/);
    const year = yearMatch ? yearMatch[0] : new Date().getFullYear();
    
    // 시작일 파싱
    const startParts = dateMatch[1].match(/(\d{1,2}) (\w{3})/i);
    if (startParts) {
      const startMonth = parseMonth(startParts[2]);
      result.startDate = `${year}-${startMonth}-${startParts[1].padStart(2, '0')}`;
    }
    
    // 종료일 파싱
    const endParts = endDateStr.match(/(\d{1,2}) (\w{3}) (\d{4})/i);
    if (endParts) {
      const endMonth = parseMonth(endParts[2]);
      result.endDate = `${endParts[3]}-${endMonth}-${endParts[1].padStart(2, '0')}`;
    }
  }
  
  // 표지 이미지 추출
  const coverMatch = html.match(/!\[Image\]\((https:\/\/www\.newexhibitions\.com\/uploads\/[^)]+)\)/) ||
                     html.match(/<img[^>]+src="(https:\/\/www\.newexhibitions\.com\/uploads\/[^"]+)"/i) ||
                     html.match(/src="(\/uploads\/[^"]+)"/i);
  if (coverMatch) {
    let imgUrl = coverMatch[1];
    if (imgUrl.startsWith('/')) {
      imgUrl = 'https://www.newexhibitions.com' + imgUrl;
    }
    result.coverImage = imgUrl;
  }
  
  // 설명 추출 (Overview 섹션) - HTML 형식
  const overviewMatch = html.match(/<h3>Overview[\s\S]*?<\/h3>\s*([\s\S]*?)(?=<\/section>|<section|<h3)/i);
  if (overviewMatch) {
    // HTML 태그 제거 및 정리
    let desc = overviewMatch[1]
      .replace(/<strong>([\s\S]*?)<\/strong>/gi, '$1')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<p>/gi, '')
      .replace(/<\/p>/gi, '\n')
      .replace(/&rsquo;/g, "'")
      .replace(/&ldquo;/g, '"')
      .replace(/&rdquo;/g, '"')
      .replace(/&mdash;/g, '—')
      .replace(/&ndash;/g, '–')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&uuml;/g, 'ü')
      .replace(/&ouml;/g, 'ö')
      .replace(/&auml;/g, 'ä')
      .replace(/<[^>]+>/g, '') // 나머지 HTML 태그 제거
      // 불필요한 텍스트 제거
      .replace(/\n*\s*Book now\s*→?\s*$/i, '')
      .replace(/\n*\s*Visit official page\s*→?\s*$/i, '')
      .replace(/\n*\s*Visit the official page\s*→?\s*$/i, '')
      .replace(/\n*\s*Click here for more info\s*→?\s*$/i, '')
      .replace(/\n*\s*More information\s*→?\s*$/i, '')
      .replace(/\n{2,}/g, '\n\n')
      .replace(/[ \t]+/g, ' ')
      .trim();
    result.description = desc; // 전체 텍스트 유지
  }
  
  // 갤러리 이미지 추출
  const imageRegex = /https:\/\/www\.newexhibitions\.com\/uploads\/[^"'\s)]+/gi;
  const allImages = html.match(imageRegex) || [];
  const uniqueImages = [...new Set(allImages)].filter(img => 
    !img.includes('thumbnail') && 
    !img.includes('small') &&
    img !== result.coverImage
  );
  result.galleryImages = uniqueImages.slice(0, 10); // 최대 10개
  
  return result;
}

function parseMonth(monthStr) {
  const months = {
    'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
    'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
    'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
  };
  return months[monthStr.toLowerCase().substring(0, 3)] || '01';
}

// R2에 이미지 업로드
async function uploadToR2(buffer, key) {
  if (!S3Client) {
    console.log('    ⚠️  @aws-sdk/client-s3 not installed');
    return null;
  }
  
  // .env.local에서 환경변수 로드
  const envPath = path.join(__dirname, '..', '.env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const [key, value] = line.split('=');
      if (key && value) {
        process.env[key.trim()] = value.trim();
      }
    });
  }
  
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const accountId = process.env.R2_ACCOUNT_ID;
  const bucketName = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
  
  if (!accessKeyId || !secretAccessKey || !accountId) {
    console.log('    ⚠️  R2 credentials not configured');
    return null;
  }
  
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
  
  await client.send(new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: buffer,
    ContentType: 'image/webp',
  }));
  
  return `${R2_PUBLIC_URL}/${key}`;
}

// 이미지 처리 및 업로드
async function processImage(imageUrl, exhibitionId, index = 0) {
  try {
    console.log(`    📥 Downloading: ${imageUrl.substring(0, 60)}...`);
    const buffer = await downloadImage(imageUrl);
    
    if (!sharp) {
      console.log('    ⚠️  sharp not available, saving raw image');
      const localPath = path.join(OUTPUT_DIR, exhibitionId, `image-${index}.jpg`);
      fs.mkdirSync(path.dirname(localPath), { recursive: true });
      fs.writeFileSync(localPath, buffer);
      return { local: localPath, remote: null };
    }
    
    // WebP 변환
    const webpBuffer = await sharp(buffer)
      .resize(1200, null, { withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
    
    // 로컬 저장
    const localPath = path.join(OUTPUT_DIR, exhibitionId, `image-${index}.webp`);
    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    fs.writeFileSync(localPath, webpBuffer);
    
    // R2 업로드
    const r2Key = `hayward-gallery/${exhibitionId}/image-${index}.webp`;
    const r2Url = await uploadToR2(webpBuffer, r2Key);
    
    return { local: localPath, remote: r2Url || `${R2_PUBLIC_URL}/${r2Key}` };
  } catch (err) {
    console.log(`    ❌ Failed to process image: ${err.message}`);
    return null;
  }
}

// 메인 스크래핑 함수
async function scrapeExhibitions() {
  console.log('\n🎨 Hayward Gallery 전시 상세 정보 스크래핑 시작\n');
  console.log(`📊 총 ${exhibitions.length}개 전시 처리 예정\n`);
  
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  const results = [];
  let processed = 0;
  let failed = 0;
  
  for (const ex of exhibitions) {
    console.log(`\n[${processed + 1}/${exhibitions.length}] ${ex.title}`);
    
    try {
      const url = `https://www.newexhibitions.com/e/${ex.id}`;
      console.log(`  📡 Fetching: ${url}`);
      
      const html = await fetchUrl(url);
      const data = parseExhibitionPage(html, ex.id);
      data.title = data.title || ex.title;
      
      console.log(`  📅 Period: ${data.startDate} ~ ${data.endDate}`);
      console.log(`  📝 Description: ${data.description.substring(0, 80)}...`);
      
      // 표지 이미지 처리
      if (data.coverImage) {
        console.log(`  🖼️  Cover image found`);
        const coverResult = await processImage(data.coverImage, data.id, 0);
        if (coverResult) {
          data.coverImageR2 = coverResult.remote;
        }
      }
      
      // 갤러리 이미지 처리
      if (data.galleryImages.length > 0) {
        console.log(`  🖼️  ${data.galleryImages.length} gallery images found`);
        data.galleryImagesR2 = [];
        for (let i = 0; i < data.galleryImages.length; i++) {
          const result = await processImage(data.galleryImages[i], data.id, i + 1);
          if (result) {
            data.galleryImagesR2.push(result.remote);
          }
        }
      }
      
      results.push(data);
      processed++;
      console.log(`  ✅ Done`);
      
      // Rate limiting
      await new Promise(r => setTimeout(r, 500));
      
    } catch (err) {
      console.log(`  ❌ Failed: ${err.message}`);
      failed++;
    }
  }
  
  // 결과 저장
  const output = {
    museum: "Hayward Gallery",
    museumId: "hayward-gallery",
    scrapedAt: new Date().toISOString(),
    source: "https://www.newexhibitions.com/archive?year=all&searchAll=hayward",
    totalExhibitions: results.length,
    exhibitions: results
  };
  
  const outputPath = path.join(__dirname, '..', 'public', 'data', 'hayward-gallery-exhibitions.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf8');
  
  console.log(`\n${'='.repeat(50)}`);
  console.log(`✅ 완료: ${processed}개 성공, ${failed}개 실패`);
  console.log(`📁 저장: ${outputPath}`);
  console.log(`${'='.repeat(50)}\n`);
}

// 실행
scrapeExhibitions().catch(console.error);
