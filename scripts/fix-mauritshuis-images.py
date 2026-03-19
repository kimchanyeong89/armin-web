#!/usr/bin/env python3
"""
Fix Mauritshuis items with wrong/cropped images.
1. Fix items with height=10 and wrong image (carol-pottasch staff photo)
2. Uses the artwork ID from the `url` field to construct correct repro image URL
3. Verifies by fetching the actual artwork page to get the real image URL
"""
import json, re, urllib.request, ssl, time

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

with open('public/data/mauritshuis-collection.json') as f:
    d = json.load(f)
items = d.get('items', [])

# Find the 3 bad items
bad_items = [x for x in items if 'height=10' in x.get('imageUrl','')]
print(f"Found {len(bad_items)} items with height=10:")
for x in bad_items:
    print(f"  {x['title']} | url: {x.get('url','')}")

def get_artwork_image(art_url):
    """Fetch artwork page and extract correct image URL."""
    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
    }
    try:
        req = urllib.request.Request(art_url, headers=headers)
        r = urllib.request.urlopen(req, timeout=15, context=ctx)
        html = r.read().decode('utf-8', errors='ignore')
        
        # Look for repro image in og:image or __NEXT_DATA__
        og_match = re.search(r'<meta[^>]+property="og:image"[^>]+content="([^"]+mauritshuis\.nl/media[^"]+)"', html)
        if og_match:
            return og_match.group(1)
        
        # Look for any media URL with repro
        repro_match = re.search(r'(https://www\.mauritshuis\.nl/media/[^"\']+repro[^"\'?]*)', html)
        if repro_match:
            return repro_match.group(1) + '?width=2000&height=0&quality=70'
        
        # Look in next data
        next_data_match = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.DOTALL)
        if next_data_match:
            try:
                nd = json.loads(next_data_match.group(1))
                # Look for image URL in data
                nd_str = json.dumps(nd)
                img_match = re.search(r'https://www\.mauritshuis\.nl/media/[^"]+repro[^"?]*', nd_str)
                if img_match:
                    return img_match.group(0) + '?width=2000&height=0&quality=70'
            except:
                pass
        
        return None
    except Exception as e:
        print(f"  Error fetching {art_url}: {e}")
        return None

print("\nFetching correct images...")
fixes = {}
for item in bad_items:
    art_url = item.get('url', '')
    if not art_url:
        continue
    print(f"  Fetching: {art_url}")
    img = get_artwork_image(art_url)
    if img:
        print(f"  → Found: {img[:80]}")
        fixes[item['id']] = img
    else:
        print(f"  → Not found")
    time.sleep(1)

if not fixes:
    print("No fixes found. Trying artwork ID approach...")
    for item in bad_items:
        art_url = item.get('url', '')
        # Extract artwork number from URL
        m = re.match(r'.*/(\d+)-', art_url.split('/')[-1])
        if m:
            artwork_id = m.group(1).zfill(4)
            # Try standard repro pattern by searching Mauritshuis collection search
            # Since we can't guess the media slug, let's try via their collection search
            search_url = f"https://www.mauritshuis.nl/api/collection/search?q={urllib.parse.quote(item['title'])}&limit=5"
            print(f"  Try search for: {item['title']}")

print(f"\nFixed {len(fixes)} items")

# Apply fixes
for item in items:
    if item['id'] in fixes:
        print(f"  Fixing: {item['title']}")
        item['imageUrl'] = fixes[item['id']]

d['items'] = items
with open('public/data/mauritshuis-collection.json', 'w', encoding='utf-8') as f:
    json.dump(d, f, ensure_ascii=False, indent=2)
print(f"Written {len(items)} items")
