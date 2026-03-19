#!/usr/bin/env python3
import json

print('=== VERSAILLES ===')
d = json.load(open('public/data/versailles-collection.json'))
items = d.get('objects', [])
print(f'Total: {len(items)}')
if items:
    print(f'Sample: {items[5]["title"][:60]} | artist={items[5]["artist"]} | year={items[5]["year"]}')
    print(f'Image: {items[5]["image"][:80]}')

print()
print('=== CARNAVALET PAINTINGS ===')
p = json.load(open('public/data/carnavalet-paintings.json'))
pp = p if isinstance(p, list) else p.get('objects', [])
print(f'Total: {len(pp)}')

print()
print('=== CARNAVALET PRINTS ===')
pr = json.load(open('public/data/carnavalet-prints.json'))
prp = pr if isinstance(pr, list) else pr.get('objects', [])
print(f'Total: {len(prp)}')

print()
print('=== MAURITSHUIS ===')
m = json.load(open('public/data/mauritshuis-collection.json'))
items_m = m.get('items', [])
diana = [x for x in items_m if 'Diana and her Nymphs' in x.get('title', '')]
if diana:
    print(f'Diana image: {diana[0]["imageUrl"][:80]}')
height_10 = [x for x in items_m if 'height=10' in x.get('imageUrl', '')]
print(f'Items with height=10: {len(height_10)} (should be 0)')

print()
print('=== NGP PRAGUE ===')
ngp = json.load(open('public/data/ngprague-collection.json'))
ngp_items = ngp if isinstance(ngp, list) else ngp.get('objects', ngp.get('artworks', []))
print(f'Total: {len(ngp_items)}')
if ngp_items:
    print(f'Sample sourceUrl: {ngp_items[0].get("sourceUrl", "(empty)")}')
