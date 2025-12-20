#!/usr/bin/env python3
"""
Hayward Gallery Scraper - undetected-chromedriver
가장 강력한 봇 탐지 우회
"""

import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
import json
import time
import re
from pathlib import Path

BASE_URL = "https://artsandculture.google.com"
OUTPUT_PATH = Path(__file__).parent.parent / "public/data/hayward-gallery-collection.json"
MAX_ITEMS = 100

def create_driver():
    """undetected Chrome 드라이버 생성"""
    options = uc.ChromeOptions()
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_argument("--no-first-run")
    options.add_argument("--no-service-autorun")
    options.add_argument("--password-store=basic")
    # headless 모드 비활성화 (봇 탐지 우회), 버전 자동 감지
    driver = uc.Chrome(options=options, use_subprocess=True)
    return driver

def scroll_and_collect_links(driver):
    """스크롤하며 작품 링크 수집"""
    driver.get(f"{BASE_URL}/explore/collections/hayward-gallery?c=assets")
    time.sleep(3)
    
    # CAPTCHA 확인
    if '/sorry/' in driver.current_url or 'captcha' in driver.current_url.lower():
        print("\n⚠️  CAPTCHA 감지! 브라우저에서 수동으로 해결해주세요.")
        input("   해결 후 엔터를 누르세요...")
        driver.get(f"{BASE_URL}/explore/collections/hayward-gallery?c=assets")
        time.sleep(3)
    
    links = set()
    last_count = 0
    stall_count = 0
    
    while len(links) < MAX_ITEMS and stall_count < 5:
        # 현재 보이는 링크 수집
        elements = driver.find_elements(By.CSS_SELECTOR, 'a[href*="/asset/"]')
        for el in elements:
            href = el.get_attribute('href')
            if href and '/asset/' in href:
                links.add(href)
        
        print(f"  수집: {len(links)}개", end='\r')
        
        if len(links) == last_count:
            stall_count += 1
        else:
            stall_count = 0
            last_count = len(links)
        
        if len(links) >= MAX_ITEMS:
            break
            
        # 스크롤
        driver.execute_script("window.scrollBy(0, 800)")
        time.sleep(0.5)
    
    print(f"\n✅ 총 {len(links)}개 링크 수집")
    return list(links)[:MAX_ITEMS]

def scrape_artwork(driver, url, index):
    """개별 작품 페이지 스크래핑"""
    try:
        driver.get(url)
        time.sleep(2)  # 이미지 로딩 대기
        
        # 제목
        title = None
        try:
            h1 = driver.find_element(By.TAG_NAME, 'h1')
            title = h1.text.strip()
        except:
            pass
        
        if not title:
            return None
        
        # 작가/연도
        artist = "Unknown"
        year = None
        try:
            h2s = driver.find_elements(By.TAG_NAME, 'h2')
            for h2 in h2s:
                text = h2.text.strip()
                if 'Get the app' in text or 'Hayward' in text or len(text) > 100:
                    continue
                match = re.search(r'(\d{4})$', text)
                if match:
                    year = int(match.group(1))
                    artist = text.replace(match.group(1), '').strip()
                else:
                    artist = text
                if artist:
                    break
        except:
            pass
        
        # 이미지 - HTML에서 /ci/ URL 추출 (Playwright 방식)
        image = None
        try:
            html = driver.page_source
            url_matches = re.findall(r'https://lh3\.googleusercontent\.com/ci/[A-Za-z0-9_-]+', html)
            unique_urls = list(set(url_matches))
            
            if unique_urls:
                # 가장 긴 URL 선택
                image = max(unique_urls, key=len) + "=w800"
        except:
            pass
        
        if not image:
            return None
        
        return {
            "id": f"hayward-gac-{index + 1}",
            "title": title,
            "artist": artist,
            "year": year,
            "image": image,
            "sourceUrl": url
        }
    except Exception as e:
        return None

def main():
    print("=" * 50)
    print("🎨 Hayward Gallery - undetected-chromedriver")
    print("=" * 50)
    
    driver = create_driver()
    
    try:
        # 1. 링크 수집
        print("\n📡 작품 링크 수집 중...")
        links = scroll_and_collect_links(driver)
        
        # 2. 개별 페이지 스크래핑
        print(f"\n🖼️  {len(links)}개 작품 스크래핑 시작...")
        results = []
        
        for i, url in enumerate(links):
            result = scrape_artwork(driver, url, i)
            if result:
                results.append(result)
            
            if (i + 1) % 10 == 0:
                print(f"  진행: {i + 1}/{len(links)} | 성공: {len(results)}")
        
        # 3. 저장
        output = {
            "museum": "Hayward Gallery",
            "museumId": "hayward-gallery",
            "collectionName": "The Collection",
            "scrapedAt": time.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
            "totalObjects": len(results),
            "coverImage": results[0]["image"] if results else None,
            "objects": results
        }
        
        OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
            json.dump(output, f, ensure_ascii=False, indent=2)
        
        # 고유 이미지 통계
        unique_images = len(set(r["image"] for r in results))
        print(f"\n✅ 완료! {len(results)}개 저장 → {OUTPUT_PATH}")
        print(f"📊 고유 이미지: {unique_images}/{len(results)}")
        
    finally:
        driver.quit()

if __name__ == "__main__":
    main()
