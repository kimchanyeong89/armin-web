#!/usr/bin/env python3
"""Test Versailles image URLs to find real vs placeholder responses."""
import json
import subprocess
import sys

PLACEHOLDER_SIZE = 33918  # bytes - "IMAGE NON DISPONIBLE" at 800x800

with open('public/data/versailles-collection.json') as f:
    d = json.load(f)
items = d['objects']

n = int(sys.argv[1]) if len(sys.argv) > 1 else 30
print(f"Testing first {n} of {len(items)} items...")
placeholder_count = 0
real_count = 0

for item in items[:n]:
    url = item['image']
    r = subprocess.run(
        ['curl', '-sL', '--max-time', '10', '-o', '/dev/null', '-w', '%{http_code} %{size_download}', url],
        capture_output=True, text=True, timeout=15
    )
    parts = r.stdout.strip().split()
    status = parts[0] if parts else '?'
    size = int(parts[1]) if len(parts) > 1 else 0
    is_placeholder = (size == PLACEHOLDER_SIZE)
    inv = item.get('inventoryNumber', '')
    title = item.get('title', '')[:40]
    status_str = '(PLACEHOLDER)' if is_placeholder else '(REAL IMAGE)'
    print(f"  [{inv}] {title}: HTTP {status}, {size}b {status_str}")
    if is_placeholder:
        placeholder_count += 1
    else:
        real_count += 1

print(f"\nResult: REAL={real_count}, PLACEHOLDER={placeholder_count}")
