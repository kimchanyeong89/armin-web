
import requests
import json

WORKER_URL = "https://armin-semantic-search.armin-art.workers.dev/search-by-vector"
vector = [0.001] * 512 # Non-zero small vector to avoid issues

try:
    print("Querying worker for sample IDs...")
    resp = requests.post(WORKER_URL, json={"vector": vector, "limit": 10}, timeout=10)
    if resp.status_code == 200:
        data = resp.json()
        results = data.get("results", [])
        print(f"Got {len(results)} results.")
        for r in results:
            print(f"ID: {r.get('id')} / Score: {r.get('score')}")
    else:
        print(f"Error {resp.status_code}: {resp.text}")

except Exception as e:
    print(f"Exception: {e}")
