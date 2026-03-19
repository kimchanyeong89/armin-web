
import json
import requests
from pathlib import Path

# === 설정 ===
WORKER_URL = "https://armin-semantic-search.armin-art.workers.dev/check-ids"
PROGRESS_FILE = ".embedding-progress-local.json"

def main():
    print("🕵️‍♂️ 최근 업로드 데이터 검증 시작...")
    
    # 1. 로컬 진행 상황 로드
    path = Path(PROGRESS_FILE)
    if not path.exists():
        print("❌ 진행 상황 파일이 없습니다.")
        return

    try:
        data = json.loads(path.read_text())
        processed_ids = data.get("processed_ids", [])
        total_count = len(processed_ids)
        
        print(f"📄 로컬 기록상 완료된 총 개수: {total_count:,}")
        
        if total_count == 0:
            print("❌ 완료된 ID가 없습니다.")
            return
            
        # 최근 10개 추출
        recent_ids = processed_ids[-10:]
        print(f"🔍 최근 기록된 10개 ID 확인:\n{recent_ids}")
        
    except Exception as e:
        print(f"❌ 파일 읽기 실패: {e}")
        return

    # 2. 서버에 질의
    print(f"\n🌐 서버(Cloudflare Vectorize)에 실제 존재 여부 조회 중...")
    
    try:
        response = requests.post(
            WORKER_URL,
            json={"ids": recent_ids},
            timeout=10
        )
        
        if response.status_code == 200:
            result = response.json()
            found_ids = result.get("foundIds", [])
            found_count = len(found_ids)
            
            print(f"\n✅ 검증 결과: {found_count} / {len(recent_ids)} 개 확인됨")
            
            if found_count == len(recent_ids):
                print("🎉 완벽합니다! 방금 작업한 데이터가 서버에 정상적으로 저장되고 있습니다.")
            elif found_count > 0:
                print("⚠️ 일부만 확인되었습니다. (인덱싱 지연일 수 있음)")
            else:
                print("❌ 서버에서 찾을 수 없습니다. 저장이 안 되고 있을 가능성이 높습니다.")
        else:
            print(f"❌ 서버 통신 에러: {response.status_code} {response.text}")
            
    except Exception as e:
        print(f"❌ 요청 실패: {e}")

if __name__ == "__main__":
    main()
