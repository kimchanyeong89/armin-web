import json
import glob
from pathlib import Path

# Load true totals from manifest
manifest_path = Path("public/data/search-manifest.json")
if not manifest_path.exists():
    print("No manifest found!")
    exit(1)

manifest = json.loads(manifest_path.read_text())
true_totals = {}
grouped_ids = set()

# Sum up genuine original collection counts
for chunk_file in manifest.get("chunks", []):
    cpath = Path("public/data") / chunk_file
    if cpath.exists():
        data = json.loads(cpath.read_text())
        arts = data[0] if isinstance(data[0], list) else data
        for art in arts:
            e_id = art.get("e", "unknown")
            art_id = art.get("id") or f"{e_id}-{art.get('n', 'x')}"
            grouped_ids.add(art_id)
            if e_id not in true_totals:
                true_totals[e_id] = 0
            true_totals[e_id] += 1

print(f"Total authentic items in manifest: {len(grouped_ids)}")

# Track true successes globally
success_ids_by_e = {}
all_success_ids = set()

for embed_file in glob.glob("embedding_results/siglip_embeddings*.jsonl"):
    with open(embed_file, "r") as f:
        for line in f:
            if not line.strip(): continue
            try:
                obj = json.loads(line)
                e_id = obj.get("e", "unknown")
                aid = obj.get("id")
                
                if aid not in all_success_ids:
                    all_success_ids.add(aid)
                    if e_id not in success_ids_by_e:
                        success_ids_by_e[e_id] = set()
                    success_ids_by_e[e_id].add(aid)
            except:
                pass

print(f"Total UNIQUE successes in SSD: {len(all_success_ids)}")

# failures
fail_ids_by_e = {}
failed_ids = set()
if Path("siglip_failed.jsonl").exists():
    with open("siglip_failed.jsonl", "r") as f:
        for line in f:
            if not line.strip(): continue
            try:
                obj = json.loads(line)
                e_id = obj.get("e", "unknown")
                aid = obj.get("id")
                # If it eventually succeeded, it's NOT a failure anymore
                if aid not in all_success_ids and aid not in failed_ids:
                    failed_ids.add(aid)
                    if e_id not in fail_ids_by_e:
                        fail_ids_by_e[e_id] = set()
                    fail_ids_by_e[e_id].add(aid)
            except:
                pass

print(f"Total TRUE failures (not succeeded later): {len(failed_ids)}")

# Prepare strictly accurate state
museum_success = {e_id: len(ids) for e_id, ids in success_ids_by_e.items()}
museum_failed = {e_id: len(ids) for e_id, ids in fail_ids_by_e.items()}

# Compare with true totals
for e_id, c in museum_success.items():
    tot = true_totals.get(e_id, 0)
    if c > tot:
        print(f"OVER 100% DETECTED: {e_id} -> Successes: {c} / True Total: {tot}")

# Fix state logic
state = {
    "stats": {
        "total_success": len(all_success_ids),
        "total_failed": len(failed_ids),
        # We preserve total_upserted if it exists
        "total_upserted": 522642 
    },
    "museum_processed": museum_success,
    "museum_failed": museum_failed
}

if Path("siglip_state.json").exists():
    old_state = json.loads(Path("siglip_state.json").read_text())
    state["stats"]["total_upserted"] = old_state.get("stats", {}).get("total_upserted", 522642)

with open("siglip_state.json", "w", encoding="utf-8") as f:
    json.dump(state, f, indent=2, ensure_ascii=False)

print("Safely overwrote siglip_state.json with STRICT UNIQUE COUNTS.")

# rewrite dashboard renderer using true_totals to show the user exactly why
with open("EMBEDDING_PROGRESS_TEST.md", "w") as f:
    f.write(f"Total authentic items: {sum(true_totals.values())}\n")
    f.write(f"Unique Successes: {state['stats']['total_success']}\n")
