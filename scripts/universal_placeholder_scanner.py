"""
universal_placeholder_scanner.py
=================================
모든 컬렉션 JSON의 R2 이미지를 전수조사하여 플레이스홀더를 검출.

전략:
  1. HEAD 요청으로 파일 크기 수집
  2. 같은 크기가 2개 이상이거나, 크기가 비정상적으로 작은 경우 → "의심"
  3. 의심 항목은 실제 다운로드 → PIL로 픽셀 다양성 검사
  4. unique_colors < UNIQUE_THRESHOLD 이면 플레이스홀더 확정

사용:
  python scripts/universal_placeholder_scanner.py           # 전체 스캔
  python scripts/universal_placeholder_scanner.py --apply  # 삭제 적용
  python scripts/universal_placeholder_scanner.py --reset  # 처음부터 재시작
"""

import json, time, os, sys, argparse, io
import urllib.request, urllib.error
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock
from collections import defaultdict

# ── 설정 ──────────────────────────────────────────────────────────────────────
DATA_DIR         = Path("public/data")
STATE_FILE       = Path("universal_placeholder_state.json")

# 파일 크기 기준 (이 이하면 무조건 의심)
SMALL_THRESHOLD  = 20_000   # 20KB 이하 = 의심 대상
# 픽셀 다양성 기준 (unique colors < N 이면 플레이스홀더)
UNIQUE_THRESHOLD = 20
# 동시 HEAD 요청 수
CONCURRENCY_HEAD = 6
# 동시 다운로드 수 (픽셀 검사용)
CONCURRENCY_DL   = 3
TIMEOUT          = 25
RETRY_MAX        = 3

print_lock = Lock()

# ── 모든 컬렉션 JSON에서 R2 이미지 URL 수집 ─────────────────────────────────
def collect_all_items():
    """모든 public/data/*.json 파일에서 R2 imageUrl/image 필드를 가진 항목 수집"""
    all_items = []
    skip_files = {
        'search-manifest.json', 'museums.json', 'search-index.json',
        'collection-summary.json',
    }
    r2_prefix = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/'

    for json_file in sorted(DATA_DIR.glob('*.json')):
        if json_file.name in skip_files:
            continue
        if 'search-index-part' in json_file.name:
            continue
        if 'backup' in json_file.name or '.bak' in json_file.name:
            continue

        try:
            raw = json.loads(json_file.read_text(encoding='utf-8'))
        except Exception:
            continue

        # 다양한 JSON 구조 처리
        if isinstance(raw, list):
            items = raw
        elif isinstance(raw, dict):
            items = (raw.get('items') or raw.get('artworks') or
                     raw.get('data') or raw.get('works') or [])
        else:
            continue

        for item in items:
            if not isinstance(item, dict):
                continue
            # 이미지 URL 필드 시도
            url = (item.get('imageUrl') or item.get('image') or
                   item.get('i') or item.get('thumbnail') or '')
            if not url or not str(url).startswith(r2_prefix):
                continue
            item_id = str(item.get('id') or item.get('_id') or '')
            if not item_id:
                continue
            all_items.append({
                'id':         item_id,
                'collection': json_file.name,
                'url':        str(url),
            })

    return all_items


# ── HEAD 요청 ────────────────────────────────────────────────────────────────
def head_size(url: str) -> int | None:
    for attempt in range(RETRY_MAX):
        try:
            req = urllib.request.Request(url, method='HEAD')
            req.add_header('User-Agent', 'Mozilla/5.0')
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                cl = r.headers.get('Content-Length')
                return int(cl) if cl else None
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(5 * (attempt + 1))
            elif e.code in (404, 403):
                return -e.code
            if attempt < RETRY_MAX - 1:
                time.sleep(2 ** attempt)
        except Exception:
            if attempt < RETRY_MAX - 1:
                time.sleep(1)
    return None


# ── 픽셀 다양성 검사 ─────────────────────────────────────────────────────────
def check_pixels(url: str) -> tuple[bool, int]:
    """
    이미지를 다운로드해 픽셀 다양성 검사.
    반환: (is_placeholder, unique_color_count)
    """
    try:
        from PIL import Image
    except ImportError:
        return False, 999  # PIL 없으면 스킵

    for attempt in range(RETRY_MAX):
        try:
            req = urllib.request.Request(url)
            req.add_header('User-Agent', 'Mozilla/5.0')
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                data = r.read()
            img = Image.open(io.BytesIO(data)).convert('RGB')
            # 중앙 100x100 픽셀 샘플
            w, h = img.size
            cx, cy = w // 2, h // 2
            box = (max(0, cx - 50), max(0, cy - 50),
                   min(w, cx + 50), min(h, cy + 50))
            crop = img.crop(box)
            pixels = list(crop.getdata())
            # 8-bit 양자화로 unique 색상 수 계산
            quantized = set((r >> 4, g >> 4, b >> 4) for r, g, b in pixels)
            return len(quantized) < UNIQUE_THRESHOLD, len(quantized)
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(5 * (attempt + 1))
            if attempt < RETRY_MAX - 1:
                time.sleep(2 ** attempt)
        except Exception:
            if attempt < RETRY_MAX - 1:
                time.sleep(1)
    return False, -1


# ── 메인 스캔 ────────────────────────────────────────────────────────────────
def run_scan(reset: bool = False):
    if reset and STATE_FILE.exists():
        STATE_FILE.unlink()
        print("🔄 상태 초기화")

    # 기존 상태 로드
    if STATE_FILE.exists():
        state = json.loads(STATE_FILE.read_text())
    else:
        state = {'done_ids': [], 'placeholder_ids': [], 'size_map': {}, 'error_ids': []}

    done_set       = set(state['done_ids'])
    placeholder_ids = list(state['placeholder_ids'])
    size_map        = dict(state['size_map'])   # id → size
    error_ids       = list(state['error_ids'])

    # 전체 항목 수집
    all_items = collect_all_items()
    print(f"📖 전체 R2 항목: {len(all_items):,}개 (컬렉션 파일 기반)")

    # ── PHASE 1: HEAD 요청으로 크기 수집 ────────────────────────────────────
    remaining_head = [it for it in all_items if it['id'] not in size_map and it['id'] not in done_set]
    print(f"\n🔍 Phase 1: HEAD 요청 ({len(remaining_head):,}개)")
    print(f"   이미 완료: {len(size_map):,}개")

    processed_head = len(size_map)
    total = len(all_items)

    def do_head(item):
        return item, head_size(item['url'])

    try:
        with ThreadPoolExecutor(max_workers=CONCURRENCY_HEAD) as ex:
            futures = {ex.submit(do_head, it): it for it in remaining_head}
            for f in as_completed(futures):
                item, size = f.result()
                processed_head += 1
                if size is not None and size > 0:
                    size_map[item['id']] = size
                elif size is None or size < 0:
                    error_ids.append(item['id'])
                    done_set.add(item['id'])

                if processed_head % 1000 == 0:
                    with print_lock:
                        print(f"   HEAD [{processed_head:,}/{total:,}]")
                    # 중간 저장
                    _save_state(state, done_set, placeholder_ids, size_map, error_ids)
    except KeyboardInterrupt:
        print("\n⚠️ 중단")
        _save_state(state, done_set, placeholder_ids, size_map, error_ids)
        return

    _save_state(state, done_set, placeholder_ids, size_map, error_ids)
    print(f"   → 크기 수집 완료: {len(size_map):,}개, 에러: {len(error_ids)}개")

    # ── PHASE 2: 의심 항목 픽셀 검사 ────────────────────────────────────────
    # 1) 크기가 같은 URL이 2개 이상 → 동일 파일 (플레이스홀더 가능성 높음)
    # 2) 파일 크기 < SMALL_THRESHOLD
    size_to_ids = defaultdict(list)
    for item_id, sz in size_map.items():
        size_to_ids[sz].append(item_id)

    # id → url 역매핑
    id_to_item = {it['id']: it for it in all_items}

    suspicious = set()
    # 동일 크기 그룹 (2개 이상)
    for sz, ids in size_to_ids.items():
        if len(ids) >= 2:
            suspicious.update(ids)
    # 소형 파일
    for item_id, sz in size_map.items():
        if sz < SMALL_THRESHOLD:
            suspicious.add(item_id)

    # 이미 판정된 항목 제외
    suspicious -= done_set
    suspicious -= set(placeholder_ids)

    print(f"\n🔬 Phase 2: 픽셀 검사 ({len(suspicious):,}개 의심 항목)")

    confirmed_placeholders = []
    checked = 0

    def do_pixel(item_id):
        item = id_to_item.get(item_id)
        if not item:
            return item_id, False, -1
        is_ph, unique = check_pixels(item['url'])
        return item_id, is_ph, unique

    try:
        with ThreadPoolExecutor(max_workers=CONCURRENCY_DL) as ex:
            futures = {ex.submit(do_pixel, iid): iid for iid in suspicious}
            for f in as_completed(futures):
                item_id, is_ph, unique = f.result()
                done_set.add(item_id)
                checked += 1

                if is_ph:
                    item = id_to_item.get(item_id, {})
                    confirmed_placeholders.append({
                        'id':         item_id,
                        'collection': item.get('collection', '?'),
                        'url':        item.get('url', ''),
                        'size':       size_map.get(item_id, -1),
                        'unique':     unique,
                    })
                    placeholder_ids.append(item_id)
                    sz = size_map.get(item_id, '?')
                    with print_lock:
                        print(f"  🚫 PLACEHOLDER: {item_id} ({item.get('collection')}) "
                              f"size={sz}B unique={unique}")

                if checked % 100 == 0:
                    with print_lock:
                        print(f"  Pixel [{checked}/{len(suspicious)}] confirmed={len(confirmed_placeholders)}")
                    _save_state(state, done_set, placeholder_ids, size_map, error_ids)

    except KeyboardInterrupt:
        print("\n⚠️ 중단")
    finally:
        _save_state(state, done_set, placeholder_ids, size_map, error_ids)

    print(f"\n✅ 스캔 완료!")
    print(f"   전체 항목: {len(all_items):,}")
    print(f"   의심 검사: {len(suspicious):,}")
    print(f"   확정 플레이스홀더: {len(placeholder_ids)}개")

    # 컬렉션별 집계
    by_col = defaultdict(list)
    for p in state.get('confirmed_details', confirmed_placeholders):
        by_col[p.get('collection', '?')].append(p['id'])
    for col, ids in sorted(by_col.items()):
        print(f"   {col}: {len(ids)}개")

    return placeholder_ids


def _save_state(state, done_set, placeholder_ids, size_map, error_ids):
    state.update({
        'done_ids':       list(done_set),
        'placeholder_ids': placeholder_ids,
        'size_map':       size_map,
        'error_ids':      error_ids,
    })
    STATE_FILE.write_text(json.dumps(state, ensure_ascii=False))


# ── 삭제 적용 ────────────────────────────────────────────────────────────────
def apply_deletions():
    state = json.loads(STATE_FILE.read_text()) if STATE_FILE.exists() else {}
    placeholder_ids = state.get('placeholder_ids', [])
    if not placeholder_ids:
        print("삭제할 플레이스홀더 없음.")
        return

    id_set = set(str(i) for i in placeholder_ids)
    print(f"🗑️  {len(id_set)}개 플레이스홀더 삭제 적용 중...")

    # 1. 컬렉션 JSON 수정
    r2_prefix = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/'
    skip_files = {'search-manifest.json', 'museums.json', 'search-index.json', 'collection-summary.json'}
    total_removed_col = 0

    for json_file in sorted(DATA_DIR.glob('*.json')):
        if json_file.name in skip_files or 'search-index-part' in json_file.name:
            continue
        if 'backup' in json_file.name or '.bak' in json_file.name:
            continue
        try:
            raw = json.loads(json_file.read_text(encoding='utf-8'))
        except Exception:
            continue

        is_list = isinstance(raw, list)
        items = raw if is_list else (raw.get('items') or raw.get('artworks') or raw.get('data') or raw.get('works') or [])

        before = len(items)
        new_items = [x for x in items if isinstance(x, dict) and str(x.get('id') or x.get('_id') or '') not in id_set]
        removed = before - len(new_items)
        if removed > 0:
            if is_list:
                json_file.write_text(json.dumps(new_items, ensure_ascii=False, indent=2))
            else:
                key = 'items' if 'items' in raw else ('artworks' if 'artworks' in raw else 'data')
                raw[key] = new_items
                json_file.write_text(json.dumps(raw, ensure_ascii=False, indent=2))
            print(f"  {json_file.name}: -{removed}개 (→{len(new_items)})")
            total_removed_col += removed

    # 2. 검색 인덱스 수정
    manifest = json.loads((DATA_DIR / "search-manifest.json").read_text())
    total_removed_idx = 0
    for chunk_file in manifest.get("chunks", []):
        path = DATA_DIR / chunk_file
        if not path.exists():
            continue
        chunk = json.loads(path.read_text())
        if isinstance(chunk, list):
            before_c = len(chunk)
            chunk = [x for x in chunk if str(x.get('id', '')) not in id_set]
            removed = before_c - len(chunk)
            if removed > 0:
                path.write_text(json.dumps(chunk, ensure_ascii=False))
                print(f"  {chunk_file}: -{removed}개")
                total_removed_idx += removed

    print(f"\n  컬렉션 총 삭제: {total_removed_col}개")
    print(f"  search-index 총 삭제: {total_removed_idx}개")
    print(f"\n  ⚠️  Vectorize /delete-ids 호출 필요: {len(id_set)}개")
    print(f"  IDs (처음 20개): {list(id_set)[:20]}")

    return list(id_set)


# ── 엔트리포인트 ─────────────────────────────────────────────────────────────
if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true', help='저장된 결과로 삭제 적용')
    parser.add_argument('--reset', action='store_true', help='상태 초기화 후 재스캔')
    args = parser.parse_args()

    os.chdir(Path(__file__).parent.parent)

    if args.apply:
        apply_deletions()
    else:
        run_scan(reset=args.reset)
