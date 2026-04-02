"""
scan_ng_placeholders.py — National Gallery London 플레이스홀더 검출
Solid gray WebP 이미지(< 15KB) → 플레이스홀더로 판정
"""
import json, urllib.request, urllib.error, time, argparse
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

NG_JSON    = Path("public/data/national-gallery-permanent.json")
STATE_FILE = Path("ng_placeholder_scan_state.json")
SIZE_THRESHOLD = 15000   # 15KB 미만 = 솔리드 그레이 플레이스홀더
CONCURRENCY = 4
TIMEOUT = 20

def head_size(url):
    for attempt in range(3):
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
            if attempt < 2: time.sleep(2 ** attempt)
        except Exception:
            if attempt < 2: time.sleep(2 ** attempt)
    return None

def check(item):
    url = item.get('image', '')
    if not url or not url.startswith('https://pub-'):
        return item.get('id'), None, 'no_r2'
    size = head_size(url)
    if size is not None and size >= 0 and size < SIZE_THRESHOLD:
        return item.get('id'), size, 'placeholder'
    elif size is None:
        return item.get('id'), None, 'error'
    else:
        return item.get('id'), size, 'ok'

def load_state():
    return json.loads(STATE_FILE.read_text()) if STATE_FILE.exists() else {'done_ids': [], 'placeholder_ids': []}

def save_state(state):
    STATE_FILE.write_text(json.dumps(state, ensure_ascii=False))

def run_scan():
    data = json.loads(NG_JSON.read_text())
    items = data.get('items', data) if isinstance(data, dict) else data
    print(f"NG items: {len(items)}")

    state = load_state()
    done_set = set(state['done_ids'])
    placeholder_ids = list(state['placeholder_ids'])

    remaining = [x for x in items if isinstance(x, dict) and x.get('id') not in done_set]
    print(f"Remaining: {len(remaining)}, done: {len(done_set)}, placeholders so far: {len(placeholder_ids)}")

    processed = len(done_set)
    total = len(items)

    try:
        with ThreadPoolExecutor(max_workers=CONCURRENCY) as ex:
            futures = {ex.submit(check, it): it for it in remaining}
            for f in as_completed(futures):
                item_id, size, status = f.result()
                done_set.add(item_id)
                processed += 1
                if status == 'placeholder':
                    placeholder_ids.append(item_id)
                    print(f"  🚫 {item_id}: {size}B")
                if processed % 200 == 0:
                    print(f"  [{processed}/{total}] placeholders={len(placeholder_ids)}")
                    save_state({'done_ids': list(done_set), 'placeholder_ids': placeholder_ids})
    except KeyboardInterrupt:
        print("Interrupted")
    finally:
        save_state({'done_ids': list(done_set), 'placeholder_ids': placeholder_ids})

    print(f"\n✅ Complete! Placeholders: {len(placeholder_ids)}")
    print("IDs:", placeholder_ids[:20])
    return placeholder_ids

def apply_deletions(placeholder_ids):
    if not placeholder_ids:
        print("No placeholders to delete.")
        return
    id_set = set(str(i) for i in placeholder_ids)

    data = json.loads(NG_JSON.read_text())
    items = data.get('items', data) if isinstance(data, dict) else data
    before = len(items)
    items = [x for x in items if isinstance(x, dict) and x.get('id') not in id_set]
    if isinstance(data, dict):
        data['items'] = items
        NG_JSON.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    else:
        NG_JSON.write_text(json.dumps(items, ensure_ascii=False, indent=2))
    print(f"  national-gallery-permanent.json: {before} → {len(items)} ({before-len(items)} deleted)")

    data_dir = Path("public/data")
    manifest = json.loads((data_dir / "search-manifest.json").read_text())
    total_removed = 0
    for chunk_file in manifest.get("chunks", []):
        path = data_dir / chunk_file
        if not path.exists(): continue
        chunk = json.loads(path.read_text())
        if isinstance(chunk, list):
            before_c = len(chunk)
            chunk = [x for x in chunk if str(x.get('id', '')) not in id_set]
            removed = before_c - len(chunk)
            if removed > 0:
                path.write_text(json.dumps(chunk, ensure_ascii=False))
                print(f"  {chunk_file}: {removed} deleted")
                total_removed += removed

    print(f"  Total search-index removed: {total_removed}")
    print(f"  ⚠️  Vectorize /delete-ids needed for {len(id_set)} IDs")

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--reset', action='store_true')
    args = parser.parse_args()

    import os
    os.chdir(Path(__file__).parent.parent)

    if args.reset and STATE_FILE.exists():
        STATE_FILE.unlink()
        print("State reset")

    if args.apply:
        state = load_state()
        apply_deletions(state.get('placeholder_ids', []))
    else:
        run_scan()
