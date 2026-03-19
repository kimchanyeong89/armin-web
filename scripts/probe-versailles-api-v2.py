#!/usr/bin/env python3
"""Probe Versailles collections API - with SSL fix"""
import urllib.request, json, urllib.parse, ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

BASE_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Referer': 'https://collections.chateauversailles.fr/',
    'Origin': 'https://collections.chateauversailles.fr',
}

def get(url, extra_headers=None, parse_json=True):
    req = urllib.request.Request(url, headers={**BASE_HEADERS, **(extra_headers or {})})
    try:
        r = urllib.request.urlopen(req, timeout=15, context=ctx)
        raw = r.read().decode('utf-8', errors='replace')
        if parse_json:
            try:
                return json.loads(raw), None
            except:
                return None, raw[:600]
        return None, raw[:600]
    except Exception as e:
        return None, f"ERROR: {e}"

# Known inventory number
inv = "MV 5046"
inv_enc = urllib.parse.quote(inv)

# The Versailles CC system typically has these endpoints:
endpoints = [
    f"https://collections.chateauversailles.fr/cc/search?keyword={inv_enc}&start=0&count=1",
    f"https://collections.chateauversailles.fr/cc/search?inventoryNumber={inv_enc}",
    f"https://collections.chateauversailles.fr/cc/record/{inv_enc}",
    f"https://collections.chateauversailles.fr/cc/object?id={inv_enc}",
    # Try the imageproxy to understand API
    f"https://collections.chateauversailles.fr/cc/imageproxy.aspx?filename=objectimages%2FMV%205046_037.cci&width=1&height=1&borderwidth=0",
]

for url in endpoints:
    print(f"\n=== {url[:100]} ===")
    data, raw = get(url)
    if data:
        print("JSON:", json.dumps(data, ensure_ascii=False)[:400])
    else:
        print("RAW:", raw[:400] if raw else "empty")

# Try a broader search approach - the CC system uses specific query format
print("\n\n=== Broader search test ===")
# Try the main search with no filter to see the format
url_broad = "https://collections.chateauversailles.fr/cc/search?keyword=&start=0&count=2"
data, raw = get(url_broad)
if data:
    print("JSON keys:", list(data.keys()) if isinstance(data, dict) else type(data).__name__)
    print("Data:", json.dumps(data, ensure_ascii=False)[:1000])
else:
    print("RAW:", raw[:600] if raw else "empty")
