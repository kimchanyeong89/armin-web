import json
import requests

WORKER_UPSERT_URL = "https://armin-semantic-search.armin-art.workers.dev/upsert"

batch = []
# generate a batch of 50 dimensions of 768
for i in range(50):
    batch.append({
        "id": f"test_id_{i}",
        "values": [0.1]*768,
        "metadata": {"e": "test_e"}
    })

print("payload size:", len(json.dumps(batch).encode('utf-8')))

resp = requests.post(WORKER_UPSERT_URL, json={"vectors": batch}, timeout=30)
print(resp.status_code)
print(resp.text)
