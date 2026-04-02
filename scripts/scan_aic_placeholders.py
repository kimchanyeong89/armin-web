"""
scan_aic_placeholders.py
========================
AIC 컬렉션에서 "Image Restricted" 플레이스홀더 이미지를 HEAD 요청으로 검출.
- Content-Length = 8,078 → 플레이스홀더
- 동시 요청 3개 (R2 레이트리밋 방지)
- 진행상태 파일로 재시작 지원

사용:
  python scripts/scan_aic_placeholders.py
  python scripts/scan_aic_placeholders.py --reset   # 처음부터 재스캔
  python scripts/scan_aic_placeholders.py --apply   # 검출 완료 후 삭제 적용
"""

import json, time, os, sys, argparse
import urllib.request
import urllib.error
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock

AIC_JSON       = Path("public/data/aic-collection.json")
STATE_FILE     = Path("aic_placeholder_scan_state.json")
PLACEHOLDER_SIZE = 8078   # "Image Restricted" 파일 크기
CONCURRENCY    = 3        # 동시 요청 수 (R2 레이트리밋 방지)
TIMEOUT        = 30       # 요청 타임아웃
RETRY_MAX      = 3
SAVE_INTERVAL  = 100      # N개마다 상태 저장

print_lock = Lock()

def head_content_length(url: str) -> int | None:
    """HEAD 요청으로 Content-Length 반환. 실패 시 None."""
    for attempt in range(RETRY_MAX):
        try:
            req = urllib.request.Request(url, method='HEAD')
            req.add_header('User-Agent', 'Mozilla/5.0')
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                cl = resp.headers.get('Content-Length')
                if cl:
                    return int(cl)
                return None
        except urllib.error.HTTPError as e:
            if e.code in (404, 403):
                return -e.code   # 404 = 파일 없음, 403 = 접근 거부
            if attempt < RETRY_MAX - 1:
                time.sleep(2 ** attempt)
        except Exception:
            if attempt < RETRY_MAX - 1:
                time.sleep(2 ** attempt)
    return None


def check_item(item: dict) -> dict:
    url = item.get('imageUrl', '')
    item_id = str(item.get('id', ''))
    if not url or not url.startswith('https://pub-'):
        return {'id': item_id, 'status': 'no_r2_url', 'size': None}

    size = head_content_length(url)
    if size == PLACEHOLDER_SIZE:
        status = 'placeholder'
    elif size is None:
        status = 'error'
    elif size < 0:
        status = f'http_{-size}'
    else:
        status = 'ok'

    return {'id': item_id, 'status': status, 'size': size, 'url': url}


def load_state():
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text())
    return {'done_ids': [], 'placeholder_ids': [], 'error_ids': [], 'processed': 0}


def save_state(state: dict):
    STATE_FILE.write_text(json.dumps(state, ensure_ascii=False))


def run_scan(reset: bool = False):
    items = json.loads(AIC_JSON.read_text())
    print(f"📖 AIC 항목 총 {len(items):,}개 로드")

    if reset and STATE_FILE.exists():
        STATE_FILE.unlink()
        print("🔄 상태 초기화")

    state = load_state()
    done_set = set(state['done_ids'])
    placeholder_ids = list(state['placeholder_ids'])
    error_ids = list(state['error_ids'])

    # 미처리 항목만 필터링
    remaining = [it for it in items if str(it.get('id', '')) not in done_set]
    print(f"✅ 이미 처리: {len(done_set):,}개 | 남은: {len(remaining):,}개")
    print(f"   현재까지 플레이스홀더: {len(placeholder_ids)}개 | 에러: {len(error_ids)}개")
    print(f"   동시 요청: {CONCURRENCY}개, 타임아웃: {TIMEOUT}s")
    print()

    processed_since_save = 0
    start_time = time.time()
    total_processed = len(done_set)

    try:
        with ThreadPoolExecutor(max_workers=CONCURRENCY) as executor:
            futures = {executor.submit(check_item, it): it for it in remaining}
            for future in as_completed(futures):
                result = future.result()
                item_id = result['id']
                status = result['status']

                done_set.add(item_id)
                total_processed += 1
                processed_since_save += 1

                if status == 'placeholder':
                    placeholder_ids.append(item_id)
                    with print_lock:
                        print(f"  🚫 PLACEHOLDER: {item_id} ({result['url']})")
                elif status == 'error':
                    error_ids.append(item_id)

                # 진행 표시
                if total_processed % 500 == 0:
                    elapsed = time.time() - start_time
                    rate = total_processed / elapsed if elapsed > 0 else 0
                    remaining_count = len(items) - total_processed
                    eta = remaining_count / rate if rate > 0 else 0
                    with print_lock:
                        print(f"  [{total_processed:,}/{len(items):,}] 플레이스홀더={len(placeholder_ids)} | "
                              f"에러={len(error_ids)} | {rate:.1f}/s | ETA {eta/60:.1f}분")

                # 주기적으로 상태 저장
                if processed_since_save >= SAVE_INTERVAL:
                    state = {
                        'done_ids': list(done_set),
                        'placeholder_ids': placeholder_ids,
                        'error_ids': error_ids,
                        'processed': total_processed
                    }
                    save_state(state)
                    processed_since_save = 0

    except KeyboardInterrupt:
        print("\n⚠️  중단됨, 상태 저장 중...")
    finally:
        state = {
            'done_ids': list(done_set),
            'placeholder_ids': placeholder_ids,
            'error_ids': error_ids,
            'processed': total_processed
        }
        save_state(state)

    print(f"\n✅ 완료!")
    print(f"   총 처리: {total_processed:,}개")
    print(f"   플레이스홀더 (8,078B): {len(placeholder_ids)}개")
    print(f"   에러/타임아웃: {len(error_ids)}개")
    print(f"   플레이스홀더 IDs: {placeholder_ids[:20]}")
    return placeholder_ids


def apply_deletions(placeholder_ids: list):
    """AIC JSON, search-index에서 플레이스홀더 항목 삭제"""
    if not placeholder_ids:
        print("삭제할 플레이스홀더 없음.")
        return

    id_set = set(str(i) for i in placeholder_ids)

    # 1. aic-collection.json 수정
    items = json.loads(AIC_JSON.read_text())
    before = len(items)
    items = [it for it in items if str(it.get('id', '')) not in id_set]
    AIC_JSON.write_text(json.dumps(items, ensure_ascii=False, indent=2))
    print(f"  aic-collection.json: {before} → {len(items)} ({before - len(items)}개 삭제)")

    # 2. search-index 파일 수정
    data_dir = Path("public/data")
    manifest = json.loads((data_dir / "search-manifest.json").read_text())
    total_removed = 0
    for chunk_file in manifest.get("chunks", []):
        path = data_dir / chunk_file
        if not path.exists():
            continue
        chunk = json.loads(path.read_text())
        if isinstance(chunk, list):
            before_c = len(chunk)
            chunk = [x for x in chunk if str(x.get('id', '')) not in id_set]
            removed = before_c - len(chunk)
            if removed > 0:
                path.write_text(json.dumps(chunk, ensure_ascii=False))
                print(f"  {chunk_file}: {removed}개 삭제")
                total_removed += removed

    print(f"\n  search-index 총 삭제: {total_removed}개")
    print(f"  ⚠️  Vectorize /delete-ids 호출은 별도 필요 (총 {len(id_set)}개)")


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--reset', action='store_true', help='처음부터 재스캔')
    parser.add_argument('--apply', action='store_true', help='저장된 결과로 삭제 적용')
    args = parser.parse_args()

    os.chdir(Path(__file__).parent.parent)

    if args.apply:
        state = load_state()
        placeholder_ids = state.get('placeholder_ids', [])
        print(f"저장된 플레이스홀더 {len(placeholder_ids)}개 적용 중...")
        apply_deletions(placeholder_ids)
    else:
        placeholder_ids = run_scan(reset=args.reset)
        if placeholder_ids:
            print(f"\n🗑️  '{len(placeholder_ids)}개 삭제를 적용하려면:")
            print(f"   python scripts/scan_aic_placeholders.py --apply")
