#!/usr/bin/env python3
"""Check carnavalet-collection.json for placeholder images"""
import json, urllib.request, sys

PLACEHOLDER_SIZES = set()  # bytes

def check_url(url, timeout=8):
    headers = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'}
    try:
        req = urllib.request.Request(url, headers=headers)
        r = urllib.request.urlopen(req, timeout=timeout)
        data = r.read()
        return len(data), r.headers.get('content-type', '')
    except Exception as e:
        return -1, str(e)

with open('public/data/carnavalet-collection.json') as f:
    d = json.load(f)

items = d if isinstance(d, list) else (d.get('objects') or d.get('artworks') or d.get('items') or [])
print(f"carnavalet-collection.json: {len(items)} items")

# Check image URL patterns
paris_imgs = [x for x in items if 'carnavalet.paris.fr' in (x.get('image','') or x.get('imageUrl','') or '')]
rmn_imgs = [x for x in items if 'grandpalaisrmn.fr' in (x.get('image','') or x.get('imageUrl','') or '')]
no_img = [x for x in items if not x.get('image') and not x.get('imageUrl')]

print(f"  carnavalet.paris.fr URLs: {len(paris_imgs)}")
print(f"  grandpalaisrmn.fr URLs: {len(rmn_imgs)}")
print(f"  No image: {len(no_img)}")

if paris_imgs:
    print("\n  Sample carnavalet.paris.fr URLs:")
    for x in paris_imgs[:5]:
        url = x.get('image') or x.get('imageUrl')
        print(f"    {x.get('id','')} | {url[:100]}")

# Test first few carnavalet.paris.fr images to see if they load or return placeholder
print("\n  Testing first 5 carnavalet.paris.fr URLs:")
for x in paris_imgs[:5]:
    url = x.get('image') or x.get('imageUrl') or ''
    size, ctype = check_url(url)
    print(f"    {size} bytes, {ctype[:30]} | {url[:80]}")
