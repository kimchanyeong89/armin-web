
import json
import requests
import hashlib
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from tqdm import tqdm
import time

# === 설정 ===
WORKER_URL = "https://armin-semantic-search.armin-art.workers.dev/check-ids"
BATCH_SIZE = 20  # Vectorize limit
MAX_WORKERS = 10 # 병렬 요청 수

def create_safe_id(artwork):
    """64바이트 이하의 안전한 ID 생성 (generate-embeddings-local.py와 동일)"""
    raw_id = artwork.get("id") or f"{artwork.get('e', 'x')}-{artwork.get('n', 'unknown')}"
    safe_id = raw_id.replace(" ", "-").lower()
    safe_id = ''.join(c for c in safe_id if c.isalnum() or c == '-')
    
    if len(safe_id.encode('utf-8')) > 64:
        prefix = safe_id[:30]
        hash_part = hashlib.md5(raw_id.encode('utf-8')).hexdigest()[:32]
        safe_id = f"{prefix}-{hash_part}"
    
    return safe_id

def check_batch(ids):
    """서버에 ID 존재 여부 확인"""
    try:
        response = requests.post(
            WORKER_URL,
            json={"ids": ids},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            return data.get("foundIds", [])
        else:
            # print(f"Error {response.status_code}")
            return []
    except:
        return []

def main():
    print("🕵️‍♂️ 서버 데이터 전수 조사를 통한 진행 상황 복구 시작...")
    
    # 1. Manifest 로드 및 모든 후보 ID 생성
    manifest_path = Path("public/data/search-manifest.json")
    manifest = json.loads(manifest_path.read_text())
    data_dir = manifest_path.parent
    
    all_artworks = []
    print("📦 데이터 로딩 중...")
    for chunk_file in manifest['chunks']:
        chunk_path = data_dir / chunk_file
        if not chunk_path.exists(): continue
        
        chunk_data = json.loads(chunk_path.read_text())
        items = chunk_data if not isinstance(chunk_data[0], list) else [item for sublist in chunk_data for item in sublist]
        
        # 한국 박물관 제외
        for item in items:
            m = item.get('m', '').lower()
            if 'orea' in m or 'gyeongju' in m or 'buyeo' in m:
                continue
            all_artworks.append(item)
            
    print(f"🎯 총 대상 작품 수: {len(all_artworks):,}개")
    
    # ID 생성
    print("🔑 ID 생성 중...")
    id_map = {} # id -> item (나중에 필요할 수도)
    all_ids = []
    
    for item in all_artworks:
        sid = create_safe_id(item)
        all_ids.append(sid)
        # id_map[sid] = item
        
    print(f"📋 검사할 ID 수: {len(all_ids):,}개")
    
    # 2. 서버 조회 (병렬)
    recovered_ids = []
    batches = [all_ids[i:i + BATCH_SIZE] for i in range(0, len(all_ids), BATCH_SIZE)]
    
    print(f"🚀 서버 조회 시작 ({len(batches)} 배치, {MAX_WORKERS} 스레드)...")
    
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        results = list(tqdm(executor.map(check_batch, batches), total=len(batches), unit="batch"))
        
    for res in results:
        recovered_ids.extend(res)
        
    print("\n" + "=" * 50)
    print(f"✅ 복구 완료!")
    print(f"📊 서버에서 발견된 ID 수: {len(recovered_ids):,}개")
    
    # 3. 파일 저장 (복구)
    progress_path = Path(".embedding-progress-local.json")
    
    # 기존 파일 백업
    if progress_path.exists():
        backup_path = progress_path.with_suffix(".json.bak_recover")
        progress_path.rename(backup_path)
        print(f"📦 기존 파일 백업됨: {backup_path}")
    
    new_data = {
        "processed_ids": recovered_ids,
        "success": len(recovered_ids),
        "failed": 0 # 실패 카운터는 리셋
    }
    
    progress_path.write_text(json.dumps(new_data))
    print(f"💾 진행 상황 파일 복구됨: {progress_path}")
    print(f"   이제 'generate-embeddings-local.py'를 실행하면 복구된 지점부터 이어합니다.")

if __name__ == "__main__":
    main()
