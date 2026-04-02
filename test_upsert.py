import requests
WORKER_UPSERT_URL = "https://armin-semantic-search.armin-art.workers.dev/upsert"
batch = [{"id": "test_1", "values": [0.1]*768, "metadata": {"e": "test"}}]
payload = {"vectors": batch}
resp = requests.post(WORKER_UPSERT_URL, json=payload, timeout=20)
print(resp.status_code)
print(resp.text)
