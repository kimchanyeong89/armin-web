#!/usr/bin/env python3
"""Check Carnavalet for ALL placeholder images (both grandpalaisrmn and carnavalet patterns)"""
import json, urllib.request, sys

results = {}
for fn in ['public/data/carnavalet-paintings.json', 'public/data/carnavalet-prints.json']:
    with open(fn) as f:
        d = json.load(f)
    items = d if isinstance(d, list) else (d.get('objects') or d.get('artworks') or d.get('items') or [])
    
    same_id = {}
    no_img = []
    for item in items:
        img = item.get('image') or item.get('imageUrl') or ''
        if not img:
            no_img.append(item.get('id', ''))
            continue
        # Track duplicates by URL (exact same URL = placeholder)
        if img not in same_id:
            same_id[img] = []
        same_id[img].append(item.get('id', ''))
    
    dup = {k: v for k, v in same_id.items() if len(v) > 1}
    print(f"\n{fn.split('/')[-1]}:")
    print(f"  Total: {len(items)}")
    print(f"  No image: {len(no_img)}")
    print(f"  Duplicate image URLs: {len(dup)} distinct URLs shared by multiple items")
    for url, ids in list(dup.items())[:5]:
        print(f"    {url[:80]} -> {len(ids)} items")
    
    # Sample 3 image URLs to understand the pattern
    sample_imgs = list(same_id.keys())[:5]
    print(f"  Sample image URLs:")
    for u in sample_imgs:
        print(f"    {u[:100]}")
    
    results[fn] = {'items': items, 'dups': dup}

# Now check if the blue-arrow icon (carnavalet.paris.fr placeholder) appears
print("\n\nChecking for carnavalet.paris.fr placeholder pattern...")
for fn in ['public/data/carnavalet-paintings.json', 'public/data/carnavalet-prints.json']:
    with open(fn) as f:
        d = json.load(f)
    items = d if isinstance(d, list) else (d.get('objects') or d.get('artworks') or d.get('items') or [])
    carnavalet_imgs = [x for x in items if 'carnavalet.paris.fr' in (x.get('image','') or x.get('imageUrl',''))]
    rmn_imgs = [x for x in items if 'grandpalaisrmn.fr' in (x.get('image','') or x.get('imageUrl',''))]
    print(f"\n{fn.split('/')[-1]}: carnavalet.paris.fr={len(carnavalet_imgs)}, grandpalaisrmn.fr={len(rmn_imgs)}")
