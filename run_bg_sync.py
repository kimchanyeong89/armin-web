import json, time, os, requests

WORKER_UPSERT_URL = "https://armin-semantic-search.armin-art.workers.dev/upsert"
TARGET = 579230
SYNC_LOG = "sync_progress.txt"

s = requests.Session()
# Read current uploaded
success_upload = 522644
if os.path.exists("siglip_state.json"):
    with open("siglip_state.json", "r") as sf:
        success_upload = json.load(sf).get("stats", {}).get("total_upserted", 522644)

if os.path.exists(SYNC_LOG):
    try:
        success_upload = max(success_upload, int(open(SYNC_LOG).read().strip()))
    except: pass

def do_batch(b, idx):
    global success_upload
    try:
        resp = s.post(WORKER_UPSERT_URL, json={"vectors": b}, timeout=15)
        if resp.status_code == 200:
            success_upload += len(b)
            with open(SYNC_LOG, "w") as f:
                f.write(str(success_upload))
            with open("siglip_state.json", "r+") as sf:
                try:
                    js = json.load(sf)
                    js["stats"]["total_upserted"] = success_upload
                    sf.seek(0)
                    json.dump(js, sf, indent=2, ensure_ascii=False)
                    sf.truncate()
                except: pass
            if idx % 10 == 0:
                print(f"Sync: {success_upload} / {TARGET}")
    except Exception:
        pass

print("Sync bg started...")
with open("embedding_results/siglip_embeddings.jsonl", "r") as f:
    batch = []
    idx = 0
    for line in f:
        if not line.strip(): continue
        try:
            o = json.loads(line)
            batch.append({"id": o["id"], "values": o["vector"], "metadata": {"e": o.get("e", "x")}})
            if len(batch) >= 200:
                do_batch(batch, idx)
                batch = []
                idx += 1
                time.sleep(0.5)
        except: pass
    if batch:
        do_batch(batch, idx)
print("Sync complete!")
