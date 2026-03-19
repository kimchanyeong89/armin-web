
import json
import requests
import numpy as np
from pathlib import Path

# === 설정 ===
WORKER_URL = "https://armin-semantic-search.armin-art.workers.dev/check-ids"
PROGRESS_FILE = ".embedding-progress-local.json"

def main():
    print("🕵️‍♂️ 벡터 값 무결성 검증 시작...")
    
    # 1. 로컬 진행 상황 로드
    path = Path(PROGRESS_FILE)
    if not path.exists():
        print("❌ 진행 상황 파일이 없습니다.")
        return

    try:
        data = json.loads(path.read_text())
        processed_ids = data.get("processed_ids", [])
        
        # 최근 20개 추출
        if not processed_ids:
            print("No ids processed")
            return
            
        recent_ids = processed_ids[-20:]
        print(f"Checking {len(recent_ids)} recent IDs...")
        
    except Exception as e:
        print(f"❌ 파일 읽기 실패: {e}")
        return

    # 2. 서버에 질의
    try:
        response = requests.post(
            WORKER_URL,
            json={"ids": recent_ids},
            timeout=10
        )
        
        if response.status_code == 200:
            result = response.json()
            records = result.get("records", [])
            
            print(f"Received {len(records)} records from server.")
            
            zero_vectors = 0
            valid_vectors = 0
            
            for rec in records:
                vec = rec.get("values", [])
                if not vec:
                    print(f"⚠️ ID {rec['id']} has no values!")
                    continue
                
                # Check for zero vector
                arr = np.array(vec)
                if np.all(arr == 0):
                    print(f"🚨 ID {rec['id']} IS A ZERO VECTOR (0.000...)")
                    zero_vectors += 1
                elif np.std(arr) < 1e-6:
                    print(f"🚨 ID {rec['id']} HAS NEAR-ZERO VARIANCE (all same values?)")
                    zero_vectors += 1
                else:
                    valid_vectors += 1
                    # print stats for first one
                    if valid_vectors == 1:
                        print(f"✅ Sample Vector Stats (ID: {rec['id']}):")
                        print(f"   - Min: {np.min(arr):.6f}")
                        print(f"   - Max: {np.max(arr):.6f}")
                        print(f"   - Mean: {np.mean(arr):.6f}")
                        print(f"   - Std: {np.std(arr):.6f}")
                        print(f"   - First 5 values: {vec[:5]}")

            print("\n📊 Final Report:")
            if zero_vectors > 0:
                print(f"❌ Found {zero_vectors} INVALID (zero) vectors!")
            else:
                print(f"✅ All {valid_vectors} vectors look VALID (non-zero, distributed).")
                
        else:
            print(f"❌ 서버 통신 에러: {response.status_code} {response.text}")
            
    except Exception as e:
        print(f"❌ 요청 실패: {e}")

if __name__ == "__main__":
    main()
