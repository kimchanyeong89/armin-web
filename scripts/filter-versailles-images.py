#!/usr/bin/env python3
"""
Filter Versailles collection to only keep items whose CC imageproxy URL
returns a REAL painting image (not the 33918-byte 'IMAGE NON DISPONIBLE' placeholder).
"""
import json
import urllib.request
import ssl
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed

INPUT_FILE = 'public/data/versailles-collection.json'
OUTPUT_FILE = 'public/data/versailles-collection.json'

# The placeholder JPEG is returned for any missing image — confirmed by testing
# both MV 981 (no image in CC system) and MV 50000 (non-existent), both returned
# exactly 33918 bytes identical files at 800x800.
PLACEHOLDER_SIZES = {33918}

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

def check_image(item):
    """Returns (item, is_real) where is_real=True means the image is a real painting."""
    url = item.get('image', '')
    if not url:
        return (item, False)
    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        })
        with urllib.request.urlopen(req, timeout=12, context=ssl_ctx) as resp:
            data = resp.read()
            size = len(data)
            is_real = size not in PLACEHOLDER_SIZES
            return (item, is_real, size)
    except Exception as e:
        return (item, False, 0)

def main():
    print('Loading Versailles collection...')
    with open(INPUT_FILE) as f:
        d = json.load(f)

    items = d.get('objects', [])
    print(f'Total items: {len(items)}')
    print('Testing all image URLs (50 workers in parallel)...')

    real_items = []
    placeholder_items = []
    error_items = []

    with ThreadPoolExecutor(max_workers=50) as executor:
        futures = {executor.submit(check_image, item): item for item in items}
        done = 0
        for future in as_completed(futures):
            result = future.result()
            item = result[0]
            is_real = result[1]
            size = result[2] if len(result) > 2 else 0
            done += 1
            if done % 200 == 0 or done == len(items):
                print(f'  Progress: {done}/{len(items)} (real={len(real_items)}, placeholder={len(placeholder_items)}, error={len(error_items)})')
            if size == 0:
                error_items.append(item)
            elif is_real:
                real_items.append(item)
            else:
                placeholder_items.append(item)

    print(f'\nResults:')
    print(f'  Real images: {len(real_items)}')
    print(f'  Placeholder: {len(placeholder_items)}')
    print(f'  Error/timeout: {len(error_items)}')
    print(f'  Total kept: {len(real_items)}')

    # Show sample of items with real images
    print(f'\nSample real items:')
    for item in real_items[:5]:
        print(f'  [{item.get("inventoryNumber","")}] {item.get("title","")[:50]} | {item.get("artist","")[:30]}')

    # Write output with only real items
    output = {
        **{k: v for k, v in d.items() if k != 'objects'},
        'totalItems': len(real_items),
        'filteredAt': __import__('datetime').datetime.now().isoformat(),
        'filterNote': f'Filtered from {len(items)} items to {len(real_items)} items with confirmed real images. Removed {len(placeholder_items)} placeholder items + {len(error_items)} error items.',
        'objects': real_items
    }

    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f'\n✅ Written {len(real_items)} items to {OUTPUT_FILE}')

if __name__ == '__main__':
    main()
