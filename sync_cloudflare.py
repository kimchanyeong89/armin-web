import json
import requests
from pathlib import Path

WORKER_UPSERT_URL = "https://armin-semantic-search.armin-art.workers.dev/upsert"
session = requests.Session()

# Get processed ids to avoid re-uploading
processed_ids = set()
with open("siglip_processed.txt", "r") as f:
    for line in f:
        processed_ids.add(line.strip())

# But wait, Cloudflare might be missing things that ARE in processed_ids if the script exited?
# If the script appended to processed_ids only on CF success, then processed_ids exactly matches CF!
# Let's check `run_siglip_fast.py`: it appended to `PROCESSED_FILE` only if `cf_ok`! 
# So anything NOT in `siglip_processed.txt` hasn't been uploaded. Wait. Fails append too.
# The ultimate truth is just pushing the whole JSONL if they conflict, but CF handles upsert (overwrite) gracefully!
