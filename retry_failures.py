import json
import os
import time

STATE_FILE = "siglip_state.json"
FAILED_LOG = "siglip_failed.jsonl"
PROCESSED_FILE = "siglip_processed_ids.txt"
EMBED_FILE = "embedding_results/siglip_embeddings.jsonl"

print("1. 백업 중...")
if os.path.exists(FAILED_LOG):
    os.rename(FAILED_LOG, f"siglip_failed_backup_{int(time.time())}.jsonl")

success_ids = set()
if os.path.exists(EMBED_FILE):
    with open(EMBED_FILE, "r") as f:
        for line in f:
            if not line.strip(): continue
            try:
                success_ids.add(json.loads(line)["id"])
            except: pass

print(f"2. 성공 ID 추출 완료: {len(success_ids)}개")

with open(PROCESSED_FILE, "w") as f:
    for sid in success_ids:
        f.write(str(sid) + "\n")

print("3. state.json 내 실패 카운트 리셋...")
if os.path.exists(STATE_FILE):
    with open(STATE_FILE, "r") as f:
        st = json.load(f)
    if "stats" in st:
        st["stats"]["total_failed"] = 0
    if "museum_failed" in st:
        st["museum_failed"] = {}

    with open(STATE_FILE, "w") as f:
        json.dump(st, f, indent=2, ensure_ascii=False)

print("✅ 초기화 완료. 곧바로 재시도를 시작할 수 있습니다!")
