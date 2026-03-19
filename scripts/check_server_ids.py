
import json
import requests
import hashlib
from pathlib import Path

def create_safe_id(artwork):
    """64바이트 이하의 안전한 ID 생성 (generate-embeddings-local.py와 동일 로직)"""
    # 1. ID가 있으면 사용, 없으면 전시ID-이름
    raw_id = artwork.get("id") or f"{artwork.get('e', 'x')}-{artwork.get('n', 'unknown')}"
    
    # 2. 소문자, 공백 -> 대시
    safe_id = raw_id.replace(" ", "-").lower()
    
    # 3. 허용된 문자(알파벳, 숫자, -)만 남김
    safe_id = ''.join(c for c in safe_id if c.isalnum() or c == '-')
    
    # 4. 길이 제한 (64바이트)
    if len(safe_id.encode('utf-8')) > 64:
        prefix = safe_id[:30]
        hash_part = hashlib.md5(raw_id.encode('utf-8')).hexdigest()[:32]
        safe_id = f"{prefix}-{hash_part}"
    
    return safe_id

def main():
    print("🔎 Checking server for missing 35,000 items...")
    
    # 1. Load progress
    progress_path = Path(".embedding-progress-local.json")
    if progress_path.exists():
        progress = json.loads(progress_path.read_text())
        processed_ids = set(progress.get("processed_ids", []))
    else:
        processed_ids = set()
    
    print(f"📋 Local processed IDs: {len(processed_ids)}")
    
    # 2. Load manifest and find candidates
    manifest_path = Path("public/data/search-manifest.json")
    if not manifest_path.exists():
        print("No manifest found")
        return

    manifest = json.loads(manifest_path.read_text())
    data_dir = manifest_path.parent
    
    candidates = []
    
    # Collect up to 50 IDs that are NOT in the local processed list
    # These represent the "35,000" that might be missing locally but present on server
    
    for chunk_file in manifest['chunks']:
        chunk_path = data_dir / chunk_file
        if not chunk_path.exists(): continue
        
        chunk_data = json.loads(chunk_path.read_text())
        # Flatten
        chunk_items = chunk_data if not isinstance(chunk_data[0], list) else [item for sublist in chunk_data for item in sublist]
        
        for item in chunk_items:
            # Exclude Korean museums from check
            m_name = item.get('m', '').lower()
            if 'orea' in m_name or 'gyeongju' in m_name or 'buyeo' in m_name:
                continue

            sid = create_safe_id(item)
            if sid not in processed_ids:
                candidates.append(sid)
                if len(candidates) >= 20:
                    break
        if len(candidates) >= 20:
            break
            
    print(f"🤔 Found {len(candidates)} candidate IDs that are missing from local file.")
    if not candidates:
        print("No candidates found? Then everything is processed locally!")
        return

    print("🌐 Querying Cloudflare Worker /check-ids ...")
    
    WORKER_URL = "https://armin-semantic-search.armin-art.workers.dev/check-ids"
    try:
        resp = requests.post(WORKER_URL, json={"ids": candidates}, timeout=30)
        if resp.status_code != 200:
            print(f"Error HTTP {resp.status_code}: {resp.text}")
            return
            
        data = resp.json()
        found_ids = data.get("foundIds", [])
        found_count = len(found_ids)
        
        print(f"\n📊 Result: {found_count} out of {len(candidates)} candidates exist on server.")
        
        if found_count > 0:
            print("✅ SUCCESS: Found traces of embedded data on server!")
            print(f"   Example found ID: {found_ids[0]}")
            print("   -> This proves that data WAS uploaded but local file failed to save.")
        else:
            print("❌ FAILURE: None of the candidates were found on server.")
            print("   -> The data is likely not uploaded or IDs generate differently.")
            
    except Exception as e:
        print(f"Request Error: {e}")

if __name__ == "__main__":
    main()
