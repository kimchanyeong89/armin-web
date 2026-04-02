"""
cleanup_no_image.py
===================
영구 전시 컬렉션 JSON 및 search-index에서 이미지 없는 항목 삭제.

대상:
  1. 이미지 URL 완전히 없는 항목 (image/imageUrl/thumbnailUrl/i 모두 없음)
  2. 플레이스홀더 이름 패턴 (예: "Palace of Versailles Artwork" + Unknown artist)

삭제 범위:
  - public/data/*-collection.json, *-artworks.json 등 컬렉션 파일
  - public/data/search-index-part-*.json

실행:
  python scripts/cleanup_no_image.py --dry-run    # 삭제 예정 항목 통계
  python scripts/cleanup_no_image.py              # 실제 삭제
  python scripts/cleanup_no_image.py --report     # museum별 상세 리포트
"""

import json, re, argparse
from pathlib import Path
from collections import defaultdict

DATA_DIR = Path("public/data")

# ── 이미지 필드 우선순위 ──────────────────────────────────────────────────────
IMAGE_FIELDS = [
    "image", "i", "imageUrl", "thumbnailUrl", "img", "imageurl",
    "image_url", "thumbnail", "imageurl",
    # NGA / 비표준 필드
    "primaryImage", "images", "primaryimageurl", "webImageUrl",
    "small_image_url", "large_image_url", "medium_image_url",
]

def extract_url_from_value(v) -> str:
    """다양한 타입(str/dict/list)에서 URL 추출"""
    if not v:
        return ""
    if isinstance(v, str):
        return v if v.startswith("http") else ""
    if isinstance(v, dict):
        # NGA primaryImage: {"iiifUrl": "...", "uuid": "..."}
        for k in ["iiifUrl", "url", "src", "href", "imageUrl", "image"]:
            sub = v.get(k, "")
            if sub and isinstance(sub, str) and sub.startswith("http"):
                return sub
        return ""
    if isinstance(v, list) and v:
        # images 배열: [{"iiifurl": "..."}, ...]
        first = v[0]
        if isinstance(first, dict):
            for k in ["iiifurl", "iiifUrl", "url", "src", "imageUrl"]:
                sub = first.get(k, "")
                if sub and isinstance(sub, str) and sub.startswith("http"):
                    return sub
        if isinstance(first, str) and first.startswith("http"):
            return first
    return ""

def get_best_image(item: dict) -> str:
    """아이템에서 사용 가능한 이미지 URL 반환 (R2 우선)"""
    # R2 URL 먼저
    for f in IMAGE_FIELDS:
        v = item.get(f)
        url = extract_url_from_value(v)
        if url and "r2.dev" in url:
            return url
    # R2 없으면 아무 URL이라도
    for f in IMAGE_FIELDS:
        v = item.get(f)
        url = extract_url_from_value(v)
        if url:
            return url
    return ""


def is_placeholder_name(name, artist) -> bool:
    """박물관 이름 + 'Artwork' 패턴의 제네릭 플레이스홀더인지"""
    if isinstance(name, list): name = " ".join(str(x) for x in name)
    if isinstance(artist, list): artist = " ".join(str(x) for x in artist)
    name = (str(name) if name else "").strip()
    artist = (str(artist) if artist else "").strip()
    if re.search(r'\bArtwork\b$', name, re.IGNORECASE) and (not artist or artist == "Unknown"):
        return True
    return False


def should_keep_collection_item(item: dict) -> tuple[bool, str]:
    """컬렉션 아이템 유지 여부. (keep, reason)"""
    img = get_best_image(item)
    name = item.get("title") or item.get("name") or item.get("n") or ""
    artist = item.get("artist") or item.get("a") or ""
    if not img:
        return False, "no-image"
    if is_placeholder_name(name, artist):
        return False, "placeholder-name"
    return True, ""


def should_keep_index_item(item: dict) -> tuple[bool, str]:
    """search-index 아이템 유지 여부"""
    img = item.get("i", "")
    name = item.get("n", "")
    artist = item.get("a", "")
    if not img:
        return False, "no-image"
    if is_placeholder_name(name, artist):
        return False, "placeholder-name"
    return True, ""


# ── 컬렉션 파일 대상 목록 ──────────────────────────────────────────────────────
EXCLUDE_FILES = {
    "search-manifest.json", "search-warm-prefix.json",
    "video-embed-ids.json", "valid-artists.json",
    "gac-image-refresh-failures.json", "image-connectivity-sample.json",
    "fine-arts-be-urls-temp.json",
}

def is_collection_file(fname: str) -> bool:
    if fname in EXCLUDE_FILES:
        return False
    if fname.startswith("search-"):
        return False
    if not fname.endswith(".json"):
        return False
    return True


def load_items(raw) -> tuple[list, str]:
    """JSON 데이터에서 항목 배열과 배열 키 반환"""
    if isinstance(raw, list):
        return raw, "_list"
    for key in ["objects", "artworks", "items", "paintings", "drawings", "collections"]:
        if isinstance(raw.get(key), list) and raw[key]:
            return raw[key], key
    # 값 중 가장 큰 배열
    best = max(
        ((k, v) for k, v in raw.items() if isinstance(v, list)),
        key=lambda kv: len(kv[1]),
        default=(None, [])
    )
    if best[0]:
        return best[1], best[0]
    return [], ""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="삭제 없이 통계만")
    parser.add_argument("--report",  action="store_true", help="상세 리포트 출력")
    args = parser.parse_args()

    is_dry = args.dry_run or args.report

    # ── 1. 컬렉션 파일 정리 ─────────────────────────────────────────────────────
    print("=" * 60)
    print("1단계: 컬렉션 파일 정리")
    print("=" * 60)

    collection_stats = defaultdict(lambda: {"total": 0, "removed": 0, "reasons": defaultdict(int)})
    total_col_removed = 0

    col_files = sorted(DATA_DIR.glob("*.json"), key=lambda p: p.name)
    for fpath in col_files:
        if not is_collection_file(fpath.name):
            continue
        try:
            raw = json.loads(fpath.read_text(encoding="utf-8"))
        except Exception:
            continue

        items, key = load_items(raw)
        if not items:
            continue

        kept = []
        removed_count = 0
        reasons = defaultdict(int)
        for item in items:
            keep, reason = should_keep_collection_item(item)
            if keep:
                kept.append(item)
            else:
                removed_count += 1
                reasons[reason] += 1

        collection_stats[fpath.name] = {
            "total": len(items),
            "removed": removed_count,
            "reasons": dict(reasons)
        }
        total_col_removed += removed_count

        if removed_count > 0:
            print(f"  {fpath.name}: {len(items)} → {len(kept)} (-{removed_count}) | {dict(reasons)}")

            if not is_dry:
                # 파일 저장
                if key == "_list":
                    out = kept
                else:
                    raw[key] = kept
                    out = raw
                fpath.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')))

    print(f"\n  컬렉션 파일 총 삭제 예정: {total_col_removed:,}개")

    # ── 2. search-index 정리 ─────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("2단계: search-index 정리")
    print("=" * 60)

    manifest = DATA_DIR / "search-manifest.json"
    chunk_files = json.loads(manifest.read_text()).get("chunks", [])

    index_stats = {}
    total_idx_removed = 0

    for cf in chunk_files:
        part_path = DATA_DIR / cf
        if not part_path.exists():
            continue
        data = json.loads(part_path.read_text(encoding="utf-8"))
        items = data if isinstance(data, list) else (data.get("artworks") or [])

        kept = []
        removed_count = 0
        reasons = defaultdict(int)
        for item in items:
            keep, reason = should_keep_index_item(item)
            if keep:
                kept.append(item)
            else:
                removed_count += 1
                reasons[reason] += 1

        index_stats[cf] = {"total": len(items), "removed": removed_count, "reasons": dict(reasons)}
        total_idx_removed += removed_count

        if removed_count > 0:
            print(f"  {cf}: {len(items)} → {len(kept)} (-{removed_count}) | {dict(reasons)}")

            if not is_dry:
                if isinstance(data, list):
                    part_path.write_text(json.dumps(kept, ensure_ascii=False, separators=(',', ':')))
                else:
                    data["artworks"] = kept
                    part_path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')))

    print(f"\n  search-index 총 삭제 예정: {total_idx_removed:,}개")

    # ── 3. 최종 요약 ────────────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("요약")
    print("=" * 60)
    print(f"  컬렉션 파일: {total_col_removed:,}개 삭제{'(예정)' if is_dry else ''}")
    print(f"  search-index: {total_idx_removed:,}개 삭제{'(예정)' if is_dry else ''}")
    print(f"  총: {total_col_removed + total_idx_removed:,}개")

    if args.report:
        print("\n[상세 리포트 - search-index, museum별]")
        museum_counts = defaultdict(lambda: {"total": 0, "removed": 0})
        for cf in chunk_files:
            part_path = DATA_DIR / cf
            if not part_path.exists():
                continue
            data = json.loads(part_path.read_text(encoding="utf-8"))
            items = data if isinstance(data, list) else (data.get("artworks") or [])
            for item in items:
                m = item.get("m", "Unknown")
                museum_counts[m]["total"] += 1
                keep, _ = should_keep_index_item(item)
                if not keep:
                    museum_counts[m]["removed"] += 1
        top = sorted(museum_counts.items(), key=lambda x: -x[1]["removed"])[:25]
        for museum, stats in top:
            if stats["removed"] > 0:
                pct = stats["removed"] / stats["total"] * 100
                print(f"    {museum}: {stats['removed']}/{stats['total']} ({pct:.0f}%)")

    if is_dry:
        print(f"\n[Dry-run 모드: 실제 삭제 없음. 삭제하려면 --dry-run 없이 실행]")
    else:
        print(f"\n✅ 완료! 삭제 후 브라우저에서 확인하세요.")


if __name__ == "__main__":
    main()
