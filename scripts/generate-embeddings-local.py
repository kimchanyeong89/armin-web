#!/usr/bin/env python3
"""
로컬 CLIP 임베딩 생성 스크립트 v2

이미지를 로컬에서 CLIP 모델로 임베딩 → Cloudflare Worker를 통해 Vectorize에 저장
완전 무료! (API 비용 없음)

개선사항:
- 이미지 다운로드 재시도
- 실패 원인 로깅
- R2 이미지 우선 처리

사용법: python3 scripts/generate-embeddings-local.py
"""

import os
import json
import time
import hashlib
import requests
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
from io import BytesIO
from pathlib import Path
from tqdm import tqdm
from concurrent.futures import ThreadPoolExecutor
import threading

# CLIP 관련 임포트
import torch
from PIL import Image
from transformers import CLIPProcessor, CLIPModel

# === 설정 ===
WORKER_URL = "https://armin-semantic-search.armin-art.workers.dev/upsert"
BATCH_SIZE = 20  # Worker에 한 번에 업로드할 개수
MAX_IMAGES = 100000  # 처리할 최대 이미지 수
SAVE_INTERVAL = 20  # 진행 상황 저장 간격 (더 자주 저장)
IMAGE_TIMEOUT = 15  # 이미지 다운로드 타임아웃 (초)
MAX_RETRIES = 2  # 이미지 다운로드 재시도 횟수

# === 전역 변수 ===
device = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
print(f"🖥️  Using device: {device}")

# 모델 로드 (처음 한 번만)
print("📦 Loading CLIP model (openai/clip-vit-base-patch32)...")
model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32").to(device)
processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")
model.eval()
print("✅ Model loaded! (512 dimensions)")

# 실패 원인 카운터
fail_reasons = {
    "download_timeout": 0,
    "download_error": 0,
    "invalid_image": 0,
    "embedding_error": 0,
    "upload_error": 0,
}
fail_lock = threading.Lock()


def create_safe_id(artwork):
    """64바이트 이하의 안전한 ID 생성"""
    raw_id = artwork.get("id") or f"{artwork.get('e', 'x')}-{artwork.get('n', 'unknown')}"
    safe_id = raw_id.replace(" ", "-").lower()
    safe_id = ''.join(c for c in safe_id if c.isalnum() or c == '-')
    
    if len(safe_id.encode('utf-8')) > 64:
        prefix = safe_id[:30]
        hash_part = hashlib.md5(raw_id.encode('utf-8')).hexdigest()[:32]
        safe_id = f"{prefix}-{hash_part}"
    
    return safe_id


def download_image(url, timeout=IMAGE_TIMEOUT, retries=MAX_RETRIES):
    """이미지 다운로드 (재시도 포함)"""
    for attempt in range(retries + 1):
        try:
            response = requests.get(url, timeout=timeout, verify=False, headers={
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
            })
            if response.status_code == 200:
                img = Image.open(BytesIO(response.content)).convert("RGB")
                return img, None
            else:
                return None, f"HTTP {response.status_code}"
        except requests.exceptions.Timeout:
            if attempt < retries:
                time.sleep(1)
                continue
            return None, "timeout"
        except Exception as e:
            return None, str(e)[:50]
    return None, "max_retries"


def get_image_embedding(image):
    """이미지에서 CLIP 임베딩 추출 (512차원)"""
    try:
        inputs = processor(images=image, return_tensors="pt").to(device)
        with torch.no_grad():
            image_features = model.get_image_features(**inputs)
        image_features = image_features / image_features.norm(dim=-1, keepdim=True)
        return image_features.squeeze().cpu().numpy().tolist(), None
    except Exception as e:
        return None, str(e)[:50]


def upload_to_worker(vectors):
    """Worker를 통해 Vectorize에 벡터 업로드"""
    try:
        response = requests.post(
            WORKER_URL,
            headers={"Content-Type": "application/json"},
            json={"vectors": vectors},
            timeout=60
        )
        if response.status_code == 200:
            data = response.json()
            return data.get("success", False), data.get("count", 0), None
        else:
            return False, 0, f"HTTP {response.status_code}: {response.text[:100]}"
    except Exception as e:
        return False, 0, str(e)[:50]


def load_search_index():
    """검색 인덱스에서 작품 목록 로드 (한국 박물관 제외, R2/서양 미술관 우선)"""
    manifest_path = Path(__file__).parent.parent / "public" / "data" / "search-manifest.json"
    
    if not manifest_path.exists():
        print(f"❌ 매니페스트 파일을 찾을 수 없습니다: {manifest_path}")
        return []
    
    manifest = json.loads(manifest_path.read_text())
    print(f"📊 총 작품 수: {manifest['c']:,}")
    print(f"📦 청크 수: {len(manifest['chunks'])}")
    
    all_artworks = []
    data_dir = manifest_path.parent
    
    # 한국 박물관 키워드
    KOREAN_MUSEUMS = ["국립중앙박물관", "국립경주박물관", "국립부여박물관", "National Museum of Korea", "Gyeongju National Museum", "Buyeo National Museum"]
    
    print("loading chunks...")
    for chunk_file in manifest['chunks']:
        chunk_path = data_dir / chunk_file
        if chunk_path.exists():
            chunk_data = json.loads(chunk_path.read_text())
            artworks = chunk_data if not isinstance(chunk_data[0], list) else [item for sublist in chunk_data for item in sublist]
            
            # 한국 박물관 제외
            filtered = [
                a for a in artworks 
                if a.get('m') not in KOREAN_MUSEUMS and 
                not any(k in a.get('m', '') for k in KOREAN_MUSEUMS)
            ]
            all_artworks.extend(filtered)
    
    print(f"🧹 한국 박물관 제외 후: {len(all_artworks):,}개")
    
    # R2 우선 처리 로직 제거 - 그냥 순서대로 반환
    return all_artworks


def main():
    print("\n🎨 로컬 CLIP 임베딩 생성 스크립트 v2")
    print("=" * 50)
    
    # 진행 상황 로드
    progress_path = Path(__file__).parent.parent / ".embedding-progress-local.json"
    progress = {"processed_ids": [], "success": 0, "failed": 0}
    
    if progress_path.exists():
        try:
            data = json.loads(progress_path.read_text())
            progress["processed_ids"] = data.get("processed_ids", [])
            progress["success"] = data.get("success", 0)
            progress["failed"] = data.get("failed", 0)
            print(f"📌 이전 진행 상황: {progress['success']:,}개 완료")
        except:
            pass
    
    processed_set = set(progress["processed_ids"])
    
    # 작품 로드
    artworks = load_search_index()
    print(f"🎯 처리할 작품: {len(artworks):,}개")
    
    # 이미 처리된 것 제외
    remaining = []
    for a in artworks:
        art_id = create_safe_id(a)
        if art_id not in processed_set:
            remaining.append((art_id, a))
    
    print(f"⏳ 남은 작품: {len(remaining):,}개\n")
    
    if len(remaining) == 0:
        print("✅ 모든 작품이 이미 처리되었습니다!")
        return
    
    # 배치 처리
    vectors_batch = []
    batch_ids = []
    upload_count = 0
    
    processed_count = 0  # 처리한 총 개수 (성공+실패)
    
    with tqdm(total=len(remaining), desc="Embedding", unit="img") as pbar:
        for art_id, artwork in remaining:
            image_url = artwork.get("i")
            
            if not image_url:
                progress["failed"] += 1
                progress["processed_ids"].append(art_id)
                processed_count += 1
                pbar.update(1)
                
                # 100개마다 강제 저장
                if processed_count % 100 == 0:
                    save_progress(progress, progress_path)
                    tqdm.write(f"💾 강제 저장: success={progress['success']}, failed={progress['failed']}")
                continue
            
            # 이미지 다운로드
            image, err = download_image(image_url)
            if not image:
                with fail_lock:
                    if err == "timeout":
                        fail_reasons["download_timeout"] += 1
                    else:
                        fail_reasons["download_error"] += 1
                progress["failed"] += 1
                progress["processed_ids"].append(art_id)
                processed_count += 1
                
                # 처음 10개 실패에 대해 상세 출력
                if progress["failed"] <= 10:
                    tqdm.write(f"⚠️ 다운로드 실패 #{progress['failed']}: {err} - URL: {image_url[:60]}...")
                
                pbar.update(1)
                
                # 100개마다 강제 저장
                if processed_count % 100 == 0:
                    save_progress(progress, progress_path)
                    tqdm.write(f"💾 강제 저장: success={progress['success']}, failed={progress['failed']}")
                continue
            
            # 임베딩 생성
            embedding, err = get_image_embedding(image)
            if not embedding or len(embedding) != 512:
                with fail_lock:
                    fail_reasons["embedding_error"] += 1
                progress["failed"] += 1
                progress["processed_ids"].append(art_id)
                processed_count += 1
                pbar.update(1)
                
                # 100개마다 강제 저장
                if processed_count % 100 == 0:
                    save_progress(progress, progress_path)
                    tqdm.write(f"💾 강제 저장: success={progress['success']}, failed={progress['failed']}")
                continue
            
            # 배치에 추가
            vectors_batch.append({
                "id": art_id,
                "values": embedding,
                "metadata": {
                    "name": artwork.get("n", "")[:100],
                    "artist": artwork.get("a", "")[:100],
                    "museum": artwork.get("m", "")[:100],
                    "url": image_url,
                }
            })
            batch_ids.append(art_id)
            
            # 배치 업로드
            if len(vectors_batch) >= BATCH_SIZE:
                success, count, err = upload_to_worker(vectors_batch)
                if success:
                    upload_count += count
                    progress["success"] += count
                    progress["processed_ids"].extend(batch_ids)
                    tqdm.write(f"✅ 배치 업로드 성공: {count}개")
                else:
                    with fail_lock:
                        fail_reasons["upload_error"] += len(vectors_batch)
                    progress["failed"] += len(vectors_batch)
                    # 업로드 실패해도 ID는 기록 (중복 작업 방지)
                    progress["processed_ids"].extend(batch_ids)
                    tqdm.write(f"❌ 배치 업로드 실패: {err}")
                
                vectors_batch = []
                batch_ids = []
                
                # 배치 처리 후 무조건 저장 (성공/실패 관계없이)
                save_progress(progress, progress_path)
                tqdm.write(f"💾 저장 완료: success={progress['success']}, failed={progress['failed']}")
                
                pbar.set_postfix({
                    "💾saved": progress["success"], 
                    "❌fail": progress["failed"]
                })
            
            # 진행 상황 저장
            if (progress["success"] + progress["failed"]) % SAVE_INTERVAL == 0:
                save_progress(progress, progress_path)
            
            pbar.update(1)
    
    # 남은 배치 업로드
    if vectors_batch:
        success, count, err = upload_to_worker(vectors_batch)
        if success:
            upload_count += count
            progress["success"] += count
            progress["processed_ids"].extend(batch_ids)
        else:
            progress["failed"] += len(vectors_batch)
    
    # 최종 저장
    save_progress(progress, progress_path)
    
    print("\n" + "=" * 50)
    print("🎉 완료!")
    print(f"   ✅ 성공: {progress['success']:,}")
    print(f"   ❌ 실패: {progress['failed']:,}")
    print(f"   📤 업로드: {upload_count:,}")
    print("\n📊 실패 원인:")
    for reason, count in fail_reasons.items():
        if count > 0:
            print(f"   - {reason}: {count:,}")


def save_progress(progress, path):
    """진행 상황 저장"""
    data = {
        "processed_ids": progress["processed_ids"],
        "success": progress["success"],
        "failed": progress["failed"]
    }
    path.write_text(json.dumps(data))


if __name__ == "__main__":
    main()
