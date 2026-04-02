"""
scan_hamburger_placeholders.py
================================
Hamburger Kunsthalle 컬렉션에서 플레이스홀더 이미지를 HEAD 요청으로 검출.
- 발견: 32,680B (MD5=ead5855040ccb859820212b7b841ff46) → placeholder
사용:
  python scripts/scan_hamburger_placeholders.py
  python scripts/scan_hamburger_placeholders.py --apply
"""

import json, time, urllib.request, urllib.error, argparse
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock

COLLECTIONS = [
    "hamburger-kunsthalle-paintings.json",
    "hamburger-kunsthalle-drawings.json",
    "hamburger-kunsthalle-video.json",
]
DATA_DIR    = Path("public/data")
STATE_FILE  = Path("hamburger_placeholder_scan_state.json")
PLACEHOLDER_SIZE = 32680
CONCURRENCY = 4
TIMEOUT     = 30
RETRY_MAX   = 3

print_lock = Lock()

def head_content_length(url: str):
    for attempt in range(RETRY_MAX):
        try:
            req = urllib.request.Request(url, method='HEAD')
            req.add_header('User-Agent', 'Mozilla/5.0')
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                cl = resp.headers.get('Content-Length')
                return int(cl) if cl else None
        except urllib.error.HTTPError as e:
            if e.code in (404, 403):
                return -e.code
            if attempt < RETRY_MAX - 1:
                time.sleep(2 ** attempt)
        except Exception:
            if attempt < RETRY_MAX - 1:
                time.sleep(2 ** attempt)
    return None

def check_item(item, collection):
    url = item.get('imageUrl', '')
    item_id = str(item.get('id', ''))
    if not url or not url.startswith('https://pub-'):
        return {'id': item_id, 'collection': collection, 'status': 'no_r2_url', 'size': None}
    size = head_content_length(url)
    status = 'placeholder' if size == PLACEHOLDER_SIZE else ('error' if size is None else 'ok')
    return {'id': item_id, 'collection': collection, 'status': status, 'size': size, 'url': url}

def load_state():
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text())
    return {'done_ids': [], 'placeholder_ids': [], 'error_ids': []}

def save_state(state):
    STATE_FILE.write_text(json.dumps(state, ensure_ascii=False))

def run_scan():
    # Load all items from all collections
    all_items = []
    for fname in COLLECTIONS:
        path = DATA_DIR / fname
        if not path.exists():
            continue
        data = json.loads(path.read_text())
        items = data if isinstance(data, list) else data.get('artworks', [])
        for item in items:
            if isinstance(item, dict):
                item['_collection'] = fname
                all_items.append(item)

    print(f"📖 Hamburger Kunsthalle 총 {len(all_items):,}개 로드")

    state = load_state()
    done_set = set(state['done_ids'])
    placeholder_ids = list(state['placeholder_ids'])
    error_ids = list(state['error_ids'])

    remaining = [it for it in all_items if str(it.get('id', '')) not in done_set]
    print(f"✅ 이미 처리: {len(done_set):,}개 | 남은: {len(remaining):,}개")
    print(f"   플레이스홀더 크기: {PLACEHOLDER_SIZE}B | 동시: {CONCURRENCY}개\n")

    total = len(all_items)
    processed = len(done_set)

    try:
        with ThreadPoolExecutor(max_workers=CONCURRENCY) as executor:
            futures = {executor.submit(check_item, it, it.get('_collection', '')): it for it in remaining}
            for future in as_completed(futures):
                result = future.result()
                item_id = result['id']
                done_set.add(item_id)
                processed += 1

                if result['status'] == 'placeholder':
                    placeholder_ids.append({'id': item_id, 'collection': result['collection']})
                    with print_lock:
                        print(f"  🚫 PLACEHOLDER: {item_id} ({result['collection']}) {result['url']}")
                elif result['status'] == 'error':
                    error_ids.append(item_id)

                if processed % 1000 == 0:
                    with print_lock:
                        print(f"  [{processed:,}/{total:,}] 플레이스홀더={len(placeholder_ids)} 에러={len(error_ids)}")

                if processed % 200 == 0:
                    save_state({'done_ids': list(done_set), 'placeholder_ids': placeholder_ids, 'error_ids': error_ids})

    except KeyboardInterrupt:
        print("\n⚠️  중단됨")
    finally:
        save_state({'done_ids': list(done_set), 'placeholder_ids': placeholder_ids, 'error_ids': error_ids})

    print(f"\n✅ 완료!")
    print(f"   플레이스홀더: {len(placeholder_ids)}개  에러: {len(error_ids)}개")
    for p in placeholder_ids:
        print(f"   🚫 {p}")
    return placeholder_ids

def apply_deletions(placeholder_items):
    if not placeholder_items:
        print("삭제할 플레이스홀더 없음.")
        return

    # Group by collection
    by_collection = {}
    for p in placeholder_items:
        c = p.get('collection', '')
        by_collection.setdefault(c, set()).add(str(p['id']))

    all_ids = set()
    for ids in by_collection.values():
        all_ids.update(ids)

    # 1. Delete from each collection file
    for fname, ids in by_collection.items():
        path = DATA_DIR / fname
        if not path.exists():
            continue
        data = json.loads(path.read_text())
        items = data if isinstance(data, list) else data.get('artworks', [])
        before = len(items)
        items = [x for x in items if isinstance(x, dict) and str(x.get('id', '')) not in ids]
        if isinstance(data, list):
            path.write_text(json.dumps(items, ensure_ascii=False, indent=2))
        else:
            data['artworks'] = items
            path.write_text(json.dumps(data, ensure_ascii=False, indent=2))
        print(f"  {fname}: {before} → {len(items)} ({before - len(items)}개 삭제)")

    # 2. Delete from search-index
    manifest = json.loads((DATA_DIR / "search-manifest.json").read_text())
    total_removed = 0
    for chunk_file in manifest.get("chunks", []):
        path = DATA_DIR / chunk_file
        if not path.exists():
            continue
        chunk = json.loads(path.read_text())
        if isinstance(chunk, list):
            before_c = len(chunk)
            chunk = [x for x in chunk if str(x.get('id', '')) not in all_ids]
            removed = before_c - len(chunk)
            if removed > 0:
                path.write_text(json.dumps(chunk, ensure_ascii=False))
                print(f"  {chunk_file}: {removed}개 삭제")
                total_removed += removed

    print(f"\n  search-index 총 삭제: {total_removed}개")
    print(f"  ⚠️  Vectorize /delete-ids 필요: {list(all_ids)[:10]}... (총 {len(all_ids)}개)")

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()

    import os
    os.chdir(Path(__file__).parent.parent)

    if args.apply:
        state = load_state()
        apply_deletions(state.get('placeholder_ids', []))
    else:
        run_scan()
