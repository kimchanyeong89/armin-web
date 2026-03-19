#!/usr/bin/env python3
import json, re

with open('public/data/mauritshuis-collection.json') as f:
    d = json.load(f)
items = d.get('items', [])

bad_height = []
suspect_images = []

for x in items:
    img = x.get('imageUrl','')
    m = re.search(r'[?&]height=(\d+)', img)
    if m and int(m.group(1)) > 0 and int(m.group(1)) < 200:
        bad_height.append({'title': x['title'], 'img': img, 'h': m.group(1), 'id': x.get('id','')})
    # Check for non-repro / non-standard artwork images
    if img:
        fname = img.split('/')[-1].split('?')[0]
        if (not re.match(r'^\d{4}', fname) and 'repro' not in fname.lower() 
            and 'detail' not in fname.lower() and fname.endswith(('.jpg','.jpeg','.png'))):
            suspect_images.append({'title': x['title'], 'fname': fname, 'id': x.get('id','')})

print(f"Items with height<200 and height>0: {len(bad_height)}")
for item in bad_height[:20]:
    print(f"  h={item['h']}: {item['title'][:50]}")
    print(f"    {item['img'][:100]}")

print(f"\nSuspect image filenames (not repro/XXXX_repro pattern): {len(suspect_images)}")
for item in suspect_images[:20]:
    print(f"  {item['title'][:50]} | {item['fname']}")
