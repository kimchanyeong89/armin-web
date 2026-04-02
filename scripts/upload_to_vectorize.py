"""
Armin Gallery - SigLIP 임베딩 → Cloudflare Vectorize 업로드
siglip_embeddings.jsonl 파일을 읽어서 Cloudflare Vectorize에 배치 업로드합니다.

사용법:
  python upload_to_vectorize.py \
    --jsonl siglip_embeddings.jsonl \
    --worker https://armin-semantic-search.armin-art.workers.dev

참고:
  - Vectorize 인덱스가 768차원으로 미리 생성되어 있어야 합니다.
  - Worker의 /upsert 엔드포인트를 사용합니다.
  - 중단 후 재실행하면 이어서 업로드합니다.
"""

import json
import time
import os
import argparse
import requests

# ============================================================
# 설정
# ============================================================
DEFAULT_WORKER_URL = "https://armin-semantic-search.armin-art.workers.dev"
UPLOAD_BATCH_SIZE  = 100    # Vectorize API: 최대 1000개 (안전하게 100)
UPLOAD_PROGRESS    = "upload_progress.json"  # 업로드 진행 파일
RETRY_MAX          = 3
RETRY_DELAY        = 5      # 초
REQUEST_TIMEOUT    = 60     # 초


def load_upload_progress():
    if os.path.exists(UPLOAD_PROGRESS):
        with open(UPLOAD_PROGRESS) as f:
            return json.load(f)
    return {"uploaded_ids": [], "last_offset": 0, "total_uploaded": 0}

def save_upload_progress(progress):
    with open(UPLOAD_PROGRESS, "w") as f:
        json.dump(progress, f, indent=2)


def upload_batch(worker_url: str, batch: list, retry: int = RETRY_MAX) -> bool:
    """배치를 Worker /upsert 엔드포인트로 전송"""
    payload = {
        "vectors": [
            {
                "id": item["id"],
                "values": item["vector"],
                "metadata": {
                    "n": item.get("n", ""),  # name
                    "a": item.get("a", ""),  # artist
                    "m": item.get("m", ""),  # museum
                    "i": item.get("i", ""),  # image url
                    "u": item.get("u", ""),  # source url
                    "e": item.get("e", ""),  # exhibition
                }
            }
            for item in batch
        ]
    }

    for attempt in range(retry):
        try:
            resp = requests.post(
                f"{worker_url}/upsert",
                json=payload,
                timeout=REQUEST_TIMEOUT,
                headers={"Content-Type": "application/json"}
            )
            if resp.status_code == 200:
                data = resp.json()
                if data.get("success"):
                    return True
                else:
                    print(f"\n   ⚠️ Worker 오류: {data.get('error', 'unknown')}")
            else:
                print(f"\n   ⚠️ HTTP {resp.status_code}: {resp.text[:200]}")
        except Exception as e:
            print(f"\n   ⚠️ 요청 실패 (시도 {attempt+1}/{retry}): {e}")

        if attempt < retry - 1:
            print(f"   재시도 중... ({RETRY_DELAY}초 후)")
            time.sleep(RETRY_DELAY)

    return False


def main():
    parser = argparse.ArgumentParser(description="SigLIP 임베딩 Vectorize 업로드")
    parser.add_argument("--jsonl",   default="./siglip_embeddings.jsonl", help="임베딩 JSONL 파일 경로")
    parser.add_argument("--worker",  default=DEFAULT_WORKER_URL, help="Worker URL")
    parser.add_argument("--dry-run", action="store_true", help="실제 업로드 없이 파일만 검증")
    args = parser.parse_args()

    if not os.path.exists(args.jsonl):
        # Colab Drive 경로도 시도
        alt = f"/content/drive/MyDrive/armin_siglip/siglip_embeddings.jsonl"
        if os.path.exists(alt):
            args.jsonl = alt
        else:
            print(f"❌ JSONL 파일 없음: {args.jsonl}")
            return

    print(f"📂 JSONL: {args.jsonl}")
    print(f"🌐 Worker: {args.worker}")

    # 기존 진행 상태 복원
    progress = load_upload_progress()
    uploaded_ids = set(progress.get("uploaded_ids", []))
    total_uploaded = progress.get("total_uploaded", 0)
    print(f"📋 이전 업로드: {total_uploaded:,}개")

    # JSONL 전체 읽기
    print("📖 파일 읽는 중...")
    all_records = []
    with open(args.jsonl, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
                if rec.get("id") and rec.get("vector") and len(rec["vector"]) == 768:
                    all_records.append(rec)
            except json.JSONDecodeError:
                pass

    print(f"✅ 총 {len(all_records):,}개 유효 레코드")

    # 이미 업로드된 항목 제외
    pending = [r for r in all_records if r["id"] not in uploaded_ids]
    print(f"📤 업로드 대기: {len(pending):,}개 (이미 완료: {len(uploaded_ids):,}개)")

    if args.dry_run:
        print("🔍 Dry-run 모드: 파일 검증 완료. 실제 업로드 없음.")
        return

    if not pending:
        print("🎉 모든 항목이 이미 업로드되어 있습니다!")
        return

    # 배치 업로드
    success_count = 0
    fail_count = 0
    start = time.time()

    for i in range(0, len(pending), UPLOAD_BATCH_SIZE):
        batch = pending[i:i + UPLOAD_BATCH_SIZE]
        ok = upload_batch(args.worker, batch)

        if ok:
            for r in batch:
                uploaded_ids.add(r["id"])
            success_count += len(batch)
            total_uploaded += len(batch)
        else:
            fail_count += len(batch)
            print(f"\n   ❌ 배치 실패 (offset {i})")

        # 진행 저장
        progress["uploaded_ids"] = list(uploaded_ids)
        progress["total_uploaded"] = total_uploaded
        save_upload_progress(progress)

        elapsed = time.time() - start
        speed = success_count / elapsed if elapsed > 0 else 0
        remaining_count = len(pending) - (i + len(batch))
        remaining_time = remaining_count / speed / 60 if speed > 0 else 0
        print(
            f"\r✓ {success_count:,} / {len(pending):,} | "
            f"실패: {fail_count} | "
            f"속도: {speed:.1f}/s | "
            f"잔여: {remaining_time:.1f}분",
            end=""
        )

        # Rate limit 방지 (Vectorize는 관대하지만 안전하게)
        time.sleep(0.1)

    print(f"\n\n🎉 업로드 완료!")
    print(f"   성공: {success_count:,}개")
    print(f"   실패: {fail_count}개")
    print(f"   총 Vectorize에 저장된 수: {total_uploaded:,}개")

if __name__ == "__main__":
    main()
