#!/usr/bin/env python3
"""
Hayward Gallery - 내부 API 직접 호출 (브라우저 없음!)
매우 빠름: 100개 작품을 10초 이내에 수집
"""

import requests
import json
import re
import time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

OUTPUT_PATH = Path(__file__).parent.parent / "public/data/hayward-gallery-collection.json"
COOKIE_PATH = Path(__file__).parent.parent / ".gac-cookies.json"
MAX_ITEMS = 100

# 세션 설정
session = requests.Session()
session.headers.update({
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Referer': 'https://artsandculture.google.com/',
})

# 저장된 쿠키 로드
if COOKIE_PATH.exists():
    with open(COOKIE_PATH) as f:
        cookies = json.load(f)
        for c in cookies:
            session.cookies.set(c['name'], c['value'], domain=c.get('domain', '.artsandculture.google.com'))

def get_asset_links():
    """컬렉션 페이지에서 작품 링크 추출"""
    print("📡 작품 링크 수집 중...")
    
    url = "https://artsandculture.google.com/partner/hayward-gallery"
    resp = session.get(url, timeout=30)
    
    if resp.status_code != 200:
        print(f"❌ 페이지 로드 실패: {resp.status_code}")
        return []
    
    # HTML에서 asset 링크 추출
    links = re.findall(r'/asset/[^"\'>\s]+', resp.text)
    unique_links = list(set(links))
    
    # 전체 URL로 변환
    full_links = [f"https://artsandculture.google.com{link}" for link in unique_links]
    
    print(f"✅ {len(full_links)}개 링크 발견")
    return full_links[:MAX_ITEMS]

def scrape_artwork(url, index):
    """개별 작품 스크래핑"""
    try:
        resp = session.get(url, timeout=15)
        if resp.status_code != 200:
            return None
        
        html = resp.text
        
        # 제목 추출
        title_match = re.search(r'<h1[^>]*>([^<]+)</h1>', html)
        title = title_match.group(1).strip() if title_match else None
        
        if not title:
            return None
        
        # 작가/연도 추출 (메타데이터에서)
        artist = "Unknown"
        year = None
        
        # og:description에서 작가 추출 시도
        og_desc = re.search(r'<meta property="og:description" content="([^"]+)"', html)
        if og_desc:
            desc = og_desc.group(1)
            # 첫 부분이 보통 작가명
            parts = desc.split(',')
            if parts:
                artist = parts[0].strip()
        
        # 연도 추출
        year_match = re.search(r'\b(1[89]\d{2}|20[0-2]\d)\b', html[:5000])
        if year_match:
            year = int(year_match.group(1))
        
        # 이미지 URL 추출 - /ci/ 패턴
        image_matches = re.findall(r'https://lh3\.googleusercontent\.com/ci/[A-Za-z0-9_-]+', html)
        if image_matches:
            image = max(set(image_matches), key=len) + "=w800"
        else:
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
    print("🚀 Hayward Gallery - API 직접 호출 (초고속!)")
    print("=" * 50)
    
    start_time = time.time()
    
    # 1. 링크 수집
    links = get_asset_links()
    
    if not links:
        print("❌ 링크를 찾을 수 없습니다")
        return
    
    # 2. 병렬로 스크래핑 (10개 동시)
    print(f"\n🖼️  {len(links)}개 작품 병렬 스크래핑...")
    results = []
    
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = {executor.submit(scrape_artwork, url, i): i for i, url in enumerate(links)}
        
        done = 0
        for future in as_completed(futures):
            done += 1
            result = future.result()
            if result:
                results.append(result)
            
            if done % 20 == 0:
                print(f"  진행: {done}/{len(links)} | 성공: {len(results)}")
    
    # ID 순서대로 정렬
    results.sort(key=lambda x: int(x["id"].split("-")[-1]))
    
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
    
    elapsed = time.time() - start_time
    unique_images = len(set(r["image"] for r in results))
    
    print(f"\n✅ 완료! {len(results)}개 저장")
    print(f"📊 고유 이미지: {unique_images}/{len(results)}")
    print(f"⏱️  소요 시간: {elapsed:.1f}초")

if __name__ == "__main__":
    main()
