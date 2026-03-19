#!/usr/bin/env python3
"""
Scan ALL carnavalet painting + print URLs for 403 / non-image responses.
Removes bad items and rewrites the JSON files.
Uses thread pool for speed.
"""
import json, urllib.request, ssl, concurrent.futures, time

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

PLACEHOLDER_SIZE = 89097
BATCH_SIZE = 20

def test_url(url):
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 Chrome/120'})
        r = urllib.request.urlopen(req, timeout=12, context=ctx)
        data = r.read()
        ctype = r.headers.get('content-type', '')
        if len(data) == PLACEHOLDER_SIZE:
            return 'placeholder', len(data)
        if not ctype.startswith('image/'):
            return 'not_image', len(data)
        return 'ok', len(data)
    except urllib.error.HTTPError as e:
        return f'http_{e.code}', 0
    except Exception as e:
        return f'error_{str(e)[:30]}', 0

def process_file(fn):
    with open(fn) as f:
        d = json.load(f)
    items = d if isinstance(d, list) else (d.get('objects') or d.get('artworks') or d.get('items') or [])
    
    print(f"\nScanning {fn.split('/')[-1]} ({len(items)} items)...")
    start = time.time()
    
    # Check all URLs in parallel
    urls = [(i, item.get('image') or item.get('imageUrl') or '') for i, item in enumerate(items)]
    
    bad_indices = []
    ok_count = 0
    status_counts = {}
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=BATCH_SIZE) as pool:
        futures = {pool.submit(test_url, url): (idx, url) for idx, url in urls if url}
        for future in concurrent.futures.as_completed(futures):
            idx, url = futures[future]
            try:
                status, size = future.result()
                status_counts[status] = status_counts.get(status, 0) + 1
                if status != 'ok':
                    bad_indices.append(idx)
                    print(f"  BAD [{status}] item {idx}: {items[idx].get('title','?')[:50]}")
                else:
                    ok_count += 1
            except Exception as e:
                bad_indices.append(idx)
                print(f"  ERROR item {idx}: {e}")
    
    elapsed = time.time() - start
    print(f"\n  Results ({elapsed:.0f}s):")
    for status, count in sorted(status_counts.items()):
        print(f"    {status}: {count}")
    print(f"  Total bad: {len(bad_indices)}")
    
    if not bad_indices:
        print("  Nothing to remove.")
        return
    
    # Remove bad items
    bad_set = set(bad_indices)
    good_items = [item for i, item in enumerate(items) if i not in bad_set]
    print(f"  Kept: {len(good_items)} / {len(items)}")
    
    # Write back
    if isinstance(d, list):
        with open(fn, 'w', encoding='utf-8') as f:
            json.dump(good_items, f, ensure_ascii=False, indent=2)
    else:
        key = 'objects' if 'objects' in d else ('artworks' if 'artworks' in d else 'items')
        d[key] = good_items
        with open(fn, 'w', encoding='utf-8') as f:
            json.dump(d, f, ensure_ascii=False, indent=2)
    
    print(f"  Wrote {fn}")

process_file('public/data/carnavalet-paintings.json')
process_file('public/data/carnavalet-prints.json')
print("\nDone.")
