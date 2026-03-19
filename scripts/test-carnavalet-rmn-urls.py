#!/usr/bin/env python3
"""Test if grandpalaisrmn.fr thumbnail URLs are accessible from different request contexts"""
import json, urllib.request, ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

with open('public/data/carnavalet-prints.json') as f:
    d = json.load(f)
items = d if isinstance(d, list) else d.get('objects') or d.get('artworks') or d.get('items') or []

# Test first 10 items
print("Testing grandpalaisrmn.fr URLs (first 10 prints):")
fail_count = 0
for item in items[:10]:
    url = item.get('image') or item.get('imageUrl') or ''
    if not url:
        print(f"  NO URL: {item.get('id')}")
        continue
    
    try:
        # Try with browser-like headers
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120',
            'Referer': 'https://www.carnavalet.paris.fr/',
            'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
        })
        r = urllib.request.urlopen(req, timeout=10, context=ctx)
        data = r.read()
        print(f"  OK {len(data):,} bytes | {item.get('id')} | {url[-40:]}")
        if len(data) == 89097:
            print(f"    *** PLACEHOLDER SIZE (89097 bytes)! ***")
            fail_count += 1
    except Exception as e:
        print(f"  FAIL: {str(e)[:60]} | {item.get('id')} | {url[-60:]}")
        fail_count += 1

print(f"\nFailed/placeholder: {fail_count}/10")

# Also test with empty referer (what browser does when opening page directly)
print("\n\nTesting same URLs with no Referer header:")
for item in items[:3]:
    url = item.get('image') or item.get('imageUrl') or ''
    if not url:
        continue
    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 Chrome/120',
        })
        r = urllib.request.urlopen(req, timeout=10, context=ctx)
        data = r.read()
        print(f"  OK {len(data):,} bytes | {url[-40:]}")
    except Exception as e:
        print(f"  FAIL: {str(e)[:80]} | {url[-60:]}")
