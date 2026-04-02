import json
import os
from pathlib import Path
import shutil

embed_file = Path("embedding_results/siglip_embeddings.jsonl")
failed_file = Path("siglip_failed.jsonl")
processed_file = Path("siglip_processed_ids.txt")
state_file = Path("siglip_state.json")

print("1. Deduplicating embedding_results/siglip_embeddings.jsonl...")

seen_ids = set()
clean_success_lines = []

if embed_file.exists():
    with open(embed_file, "r") as f:
        for line in f:
            if not line.strip(): continue
            try:
                obj = json.loads(line)
                aid = obj.get("id")
                if aid and aid not in seen_ids:
                    seen_ids.add(aid)
                    clean_success_lines.append(line)
            except:
                pass

print(f"   -> Original had extra lines. Cleaned to exactly {len(seen_ids)} unique successes.")

with open(embed_file.with_name("siglip_embeddings.tmp"), "w") as f:
    for line in clean_success_lines:
        f.write(line)

os.replace(embed_file.with_name("siglip_embeddings.tmp"), embed_file)
clean_success_lines = None # free memory

print("2. Deduplicating siglip_failed.jsonl (ignoring already successful)...")
seen_fail_ids = set()
clean_fail_lines = []

if failed_file.exists():
    with open(failed_file, "r") as f:
        for line in f:
            if not line.strip(): continue
            try:
                obj = json.loads(line)
                aid = obj.get("id")
                # If it's not successful and we haven't tracked this fail yet
                if aid and aid not in seen_ids and aid not in seen_fail_ids:
                    seen_fail_ids.add(aid)
                    clean_fail_lines.append(line)
            except:
                pass

print(f"   -> Cleaned to exactly {len(seen_fail_ids)} unique failures.")

with open(failed_file.with_name("siglip_failed.tmp"), "w") as f:
    for line in clean_fail_lines:
        f.write(line)
os.replace(failed_file.with_name("siglip_failed.tmp"), failed_file)
clean_fail_lines = None

print("3. Rebuilding siglip_processed_ids.txt strictly matching successes + failures...")
with open(processed_file, "w") as f:
    for aid in seen_ids:
        f.write(str(aid) + "\n")
    for aid in seen_fail_ids:
        f.write(str(aid) + "\n")

print("4. Updating strict, deduplicated stats to siglip_state.json...")

state_success = {}
state_failed = {}

with open(embed_file, "r") as f:
    for line in f:
        if not line.strip(): continue
        try:
            obj = json.loads(line)
            e_id = obj.get("e", "unknown")
            state_success[e_id] = state_success.get(e_id, 0) + 1
        except: pass

with open(failed_file, "r") as f:
    for line in f:
        if not line.strip(): continue
        try:
            obj = json.loads(line)
            e_id = obj.get("e", "unknown")
            state_failed[e_id] = state_failed.get(e_id, 0) + 1
        except: pass

# Map CF to what it was securely last known: 522642
state = {
    "stats": {
        "total_success": len(seen_ids),
        "total_failed": len(seen_fail_ids),
        "total_upserted": 522642
    },
    "museum_processed": state_success, 
    "museum_failed": state_failed
}

with open(state_file, "w") as f:
    json.dump(state, f, indent=2, ensure_ascii=False)

print("✅ Data structurally sanitized and duplicates strictly erased.")
