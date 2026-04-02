import json
from pathlib import Path

def run_recovery():
    print("1. Loading specific JSON files from manifest to map IDs exactly like run_siglip_fast...")
    DATA_DIR = Path('public/data')
    manifest_path = DATA_DIR / "search-manifest.json"
    
    mapping = {}
    total_target_counts = {}
    
    if not manifest_path.exists():
        print("❌ manifest.json not found.")
        return
        
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    
    for chunk_file in manifest.get("chunks", []):
        chunk_path = DATA_DIR / chunk_file
        if not chunk_path.exists(): continue
        
        data = json.loads(chunk_path.read_text(encoding="utf-8"))
        artworks = data[0] if isinstance(data[0], list) else data
        for art in artworks:
            if not art.get("i"): continue # Same filter as run_siglip_fast!
            
            e_id = art.get("e", "unknown")
            
            # museum_counts tally (matching what pipeline does)
            if e_id not in total_target_counts:
                total_target_counts[e_id] = 0
            total_target_counts[e_id] += 1
            
            # ID calc
            item_id = art.get("id") or f"{e_id}-{art.get('n', 'x')}"
            mapping[item_id] = e_id

    print(f"Loaded {sum(total_target_counts.values())} total valid target items.")

    print("2. Reading PROCESSED_FILE...")
    processed_path = Path("siglip_processed_ids.txt")
    if not processed_path.exists():
        print("No processed file found.")
        return
        
    lines = processed_path.read_text().splitlines()
    unique_ids = set()
    for line in lines:
        l = line.strip()
        if l: unique_ids.add(l)
    
    print(f"Original processed length: {len(lines)}, Unique: {len(unique_ids)}")
    
    processed_path.write_text("\n".join(sorted(unique_ids)) + "\n")

    print("4. Deduplicating FAILED_FILE...")
    failed_path = Path("siglip_failed.jsonl")
    unique_failures = {} # item_id -> full dict
    if failed_path.exists():
        for line in failed_path.read_text().splitlines():
            if not line.strip(): continue
            try:
                j = json.loads(line)
                i_id = j.get("id")
                unique_failures[i_id] = j
            except: pass
            
    print(f"Unique failures: {len(unique_failures)}")
    
    print("6. Recalculating state...")
    processed_tally = {}
    for i_id in unique_ids:
        # Cross reference the exact mapping we built
        e = mapping.get(i_id)
        if not e:
            # Maybe it is from an older run? Guess the e_id
            for possible_e in total_target_counts.keys():
                if i_id.startswith(possible_e):
                    e = possible_e
                    break
            if not e: e = "unknown"
        
        if e not in processed_tally:
            processed_tally[e] = 0
        processed_tally[e] += 1

    total_failures = len(unique_failures)
    total_processed = len(unique_ids)
    total_success = total_processed - total_failures

    new_state = {
        "stats": {
            "total_success": total_success,
            "total_failed": total_failures,
            "total_upserted": total_success # approx
        },
        "museum_counts": dict(total_target_counts),
        "museum_processed": processed_tally
    }

    print("7. Saving state to siglip_state.json...")
    Path("siglip_state.json").write_text(json.dumps(new_state))

    print("Recovery complete. State untangled and accurate.")

if __name__ == "__main__":
    run_recovery()
