import json
import requests
import time
from io import BytesIO

print("Testing environment...")

# 1. Test image download
try:
    manifest = json.load(open('public/data/search-manifest.json'))
    chunk_file = manifest['chunks'][0]
    data = json.load(open(f'public/data/{chunk_file}'))
    
    artworks = data[0] if isinstance(data[0], list) else data
    print(f"Loaded {len(artworks)} artworks from chunk 0.")
    
    success = 0
    failed = 0
    for art in artworks[:10]:
        img_url = art.get('i')
        if not img_url: continue
        try:
            resp = requests.get(img_url, timeout=10, verify=False, headers={"User-Agent": "Mozilla/5.0"})
            if resp.status_code == 200:
                print(f"✅ Success downloading: {img_url}")
                success += 1
            else:
                print(f"❌ HTTP {resp.status_code} for {img_url}")
                failed += 1
        except Exception as e:
            print(f"❌ Exception fetching {img_url}: {e}")
            failed += 1
except Exception as e:
    print(f"Error reading JSON: {e}")

# 2. Test Cloudflare Worker Upsert with dummy vector
WORKER_UPSERT_URL = "https://armin-semantic-search.armin-art.workers.dev/upsert"
dummy_batch = [
    {
        "id": "test-id-1",
        "values": [0.01] * 768,
        "metadata": {"e": "test-exhibition"}
    }
]

print("\nTesting Cloudflare Worker Upsert...")
try:
    resp = requests.post(WORKER_UPSERT_URL, json={"vectors": dummy_batch}, timeout=30)
    print(f"Worker status: {resp.status_code}")
    print(f"Worker response: {resp.text}")
except Exception as e:
    print(f"Worker post exception: {e}")
