#!/usr/bin/env python3
"""Fix the 3 Mauritshuis items with wrong/cropped images (height=10, staff photo)."""
import json

FIXES = {
    '406-diana-and-her-nymphs': 'https://www.mauritshuis.nl/media/lungzu4d/0406_repro.jpg?rxy=0.51248049921996874,0.30005585576125587&width=2000&height=0&quality=70&v=1d82a2fa99bf730',
    '151-vase-with-flowers': 'https://www.mauritshuis.nl/media/ftzd24l2/0151_repro.jpg?width=2000&height=0&quality=70&v=1d73222b6b8f310',
    'l190-rest-on-the-flight-into-egypt-c-1550': 'https://www.mauritshuis.nl/media/syzhflg5/l190.jpg?rxy=0.38095238095238093,0.18459103279836545&width=2000&height=0&quality=70&v=1d82ee645be8820',
}

with open('public/data/mauritshuis-collection.json') as f:
    d = json.load(f)
items = d.get('items', [])

fixed = 0
for item in items:
    item_id = item.get('id', '')
    if item_id in FIXES:
        old_url = item.get('imageUrl', '')
        item['imageUrl'] = FIXES[item_id]
        print(f"Fixed: {item['title']}")
        print(f"  Old: {old_url[:80]}")
        print(f"  New: {FIXES[item_id][:80]}")
        fixed += 1

print(f"\nFixed {fixed} items")

d['items'] = items
with open('public/data/mauritshuis-collection.json', 'w', encoding='utf-8') as f:
    json.dump(d, f, ensure_ascii=False, indent=2)
print(f"Wrote {len(items)} items")
