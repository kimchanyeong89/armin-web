import json
import time
import requests
from concurrent.futures import ThreadPoolExecutor

WORKER_UPSERT_URL = "https://armin-semantic-search.armin-art.workers.dev/upsert"
INPUT_FILE = "embedding_results/siglip_embeddings.jsonl"
STATE_FILE = "siglip_state.json"

# To avoid repeating already known 522k... wait, we don't know WHICH 522k uploaded.
# But we can just use a fast parallel upsert for all 579k items.

print("📦 Loading all vectors for Cloudflare Sync...")
batch_size = 200
batches = []
current_batch = []

with open(INPUT_FILE, "r") as f:
    for line in f:
        if not line.strip(): continue
        try:
            obj = json.loads(line)
            current_batch.append({
                "id": obj["id"],
                "values": obj["vector"],
                "metadata": {"e": obj.get("e", "unknown")}
            })
            if len(current_batch) >= batch_size:
                batches.append(current_batch)
                current_batch = []
        except:
            pass
if current_batch:
    batches.append(current_batch)

total_items = sum(len(b) for b in batches)
print(f"✅ Loaded {total_items} items into {len(batches)} batches.")

s = requests.Session()
success_count = 0

def upload_batch(b, batch_idx):
    global success_count
    payload = {"vectors": b}
    try:
        resp = s.post(WORKER_UPSERT_URL, json=payload, timeout=30)
        if resp.status_code == 200:
            success_count += len(b)
            if batch_idx % 50 == 0:
                print(f"☁️ Sync progress: {success_count}/{total_items} ({success_count/total_items*100:.1f}%)")
            return len(b)
        else:
            print(f"❌ Batch error: {resp.status_code} {resp.text[:100]}")
    except Exception as e:
         print(f"❌ Exception: {e}")
    return 0

print("🚀 Starting Cloudflare synchronization (15 threads)...")
with ThreadPoolExecutor(max_workers=15) as executor:
    futures = [executor.submit(upload_batch, b, i) for i, b in enumerate(batches)]
    for f in futures:
        f.result()

print(f"🎊 Sync Complete! Total successfully UPSERTED in this run: {success_count}/{total_items}")

with open(STATE_FILE, "r") as f:
    st = json.load(f)
st["stats"]["total_upserted"] = total_items
with open(STATE_FILE, "w") as f:
    json.dump(st, f, indent=2, ensure_ascii=False)
