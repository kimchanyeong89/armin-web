#!/usr/bin/env python3
"""Get full image URLs and test them for specific carnavalet items"""
import json, urllib.request, ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

with open('public/data/carnavalet-paintings.json') as f:
    d = json.load(f)
items = d if isinstance(d, list) else (d.get('objects') or d.get('artworks') or d.get('items') or [])

# Get items 26-30 (around item 28)
print("Items 26-30 in carnavalet-paintings.json:")
for i, item in enumerate(items[25:30], start=26):
    img = item.get('image') or item.get('imageUrl') or 'NO IMAGE'
    print(f"\nItem {i}: {item.get('title','?')[:60]}")
    print(f"  Artist: {item.get('artist','')[:40]}")
    print(f"  Full URL: {img}")
    
    if img != 'NO IMAGE':
        try:
            req = urllib.request.Request(img, headers={'User-Agent': 'Mozilla/5.0 Chrome/120'})
            r = urllib.request.urlopen(req, timeout=10, context=ctx)
            data = r.read()
            print(f"  Size: {len(data):,} bytes | Content-Type: {r.headers.get('content-type','?')}")
            if len(data) == 89097:
                print(f"  *** PLACEHOLDER IMAGE (89097 bytes) ***")
        except Exception as e:
            print(f"  FETCH ERROR: {str(e)[:80]}")

# Also check items 125-130 and 176-180
for range_name, start, end in [("Items 126-128", 125, 128), ("Items 177-179", 176, 179)]:
    print(f"\n\n{range_name}:")
    for i, item in enumerate(items[start:end], start=start+1):
        img = item.get('image') or item.get('imageUrl') or 'NO IMAGE'
        print(f"\nItem {i}: {item.get('title','?')[:60]}")
        print(f"  Artist: {item.get('artist','')[:40]}")
        print(f"  Full URL: {img}")
        if img != 'NO IMAGE':
            try:
                req = urllib.request.Request(img, headers={'User-Agent': 'Mozilla/5.0 Chrome/120'})
                r = urllib.request.urlopen(req, timeout=10, context=ctx)
                data = r.read()
                print(f"  Size: {len(data):,} bytes {'*** PLACEHOLDER ***' if len(data) == 89097 else ''}")
            except Exception as e:
                print(f"  FETCH ERROR: {str(e)[:80]}")
