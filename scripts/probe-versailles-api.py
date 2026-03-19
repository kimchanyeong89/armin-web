#!/usr/bin/env python3
"""Probe Versailles collections API to get full metadata for an item"""
import urllib.request, json, urllib.parse

headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Referer': 'https://collections.chateauversailles.fr/',
    'Origin': 'https://collections.chateauversailles.fr',
}

def get(url, extra_headers=None):
    req = urllib.request.Request(url, headers={**headers, **(extra_headers or {})})
    try:
        r = urllib.request.urlopen(req, timeout=15)
        return r.read().decode('utf-8', errors='replace')
    except Exception as e:
        return f"ERROR: {e}"

# Known inventory number from current data
inv = "MV 5046"
inv_enc = urllib.parse.quote(inv)

print("=== Test 1: CC API detail endpoint ===")
url1 = f"https://collections.chateauversailles.fr/cc/object/{inv_enc}"
r1 = get(url1)
print(url1)
print(r1[:500])

print("\n=== Test 2: CC API search endpoint ===")
url2 = f"https://collections.chateauversailles.fr/cc/search?query={inv_enc}&limit=1"
r2 = get(url2)
print(url2)
print(r2[:600])

print("\n=== Test 3: CC API with different path ===")
url3 = f"https://collections.chateauversailles.fr/cc/notice/{inv_enc}"
r3 = get(url3)
print(url3)
print(r3[:500])

print("\n=== Test 4: Direct JSON API ===")
url4 = f"https://collections.chateauversailles.fr/api/v1/object/{inv_enc}"
r4 = get(url4)
print(url4)
print(r4[:500])

print("\n=== Test 5: Query-based search ===")
# This is the CC EMuseum-style API
url5 = "https://collections.chateauversailles.fr/cc/search?query=&filter[]=objectnumber%3A" + inv_enc + "&limit=1&offset=0"
r5 = get(url5)
print(url5)
print(r5[:600])

print("\n=== Test 6: The internal CC API format ===")
# Typically CC uses /en/object/INVNUM format
url6 = f"https://collections.chateauversailles.fr/en/object/{inv_enc}"
r6 = get(url6, {'Accept': 'text/html'})
print(url6)
print(r6[:800])
