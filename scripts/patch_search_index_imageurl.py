"""
patch_search_index_imageurl.py
==============================
search-index-part-*.json의 `i` 필드가 비어있거나 R2 URL이 아닌 항목을
컬렉션 JSON의 `imageUrl` 필드(R2 URL)로 업데이트.

대상 컬렉션:
  - hamburger-kunsthalle-drawings   (imageUrl = R2, i = 박물관 URL)
  - hamburger-kunsthalle-paintings  (imageUrl = R2, i = 박물관 URL)
  - hamburger-kunsthalle-video      (imageUrl = R2)
  - ngs-all                         (imageUrl = R2, i = 없음)
  - saam-paintings-full             (imageUrl = R2, i = 없음)
  - nmwa-collection                 (imageUrl = R2, i = 없음)
  - kroller-muller-permanent        (imageUrl = R2, i = 없음)
  - bruecke-museum-collection       (imageUrl = R2, i = 없음)
  - tepapa-collection               (image = R2(일부), i = 없음)

실행:
  python scripts/patch_search_index_imageurl.py
  python scripts/patch_search_index_imageurl.py --dry-run
"""

import json, argparse
from pathlib import Path

DATA_DIR = Path("public/data")

# 컬렉션 파일별 최적 이미지 필드 우선순위
COLLECTION_IMAGE_FIELDS = {
    "hamburger-kunsthalle-drawings":  ["imageUrl"],
    "hamburger-kunsthalle-paintings": ["imageUrl"],
    "hamburger-kunsthalle-video":     ["imageUrl"],
    "ngs-collection-all":             ["imageUrl", "image"],
    "saam":                           ["imageUrl", "image"],
    "nmwa":                           ["imageUrl", "image"],
    "kroller-muller":                 ["imageUrl", "image"],
    "bruecke":                        ["imageUrl"],
    "tepapa":                         ["image", "imageUrl"],
}

# 전시관 ID prefix → 컬렉션 파일명 매핑
EXHIBITION_TO_FILE = {
    "hamburger-kunsthalle-drawings":  "hamburger-kunsthalle-drawings.json",
    "hamburger-kunsthalle-paintings": "hamburger-kunsthalle-paintings.json",
    "hamburger-kunsthalle-video":     "hamburger-kunsthalle-video.json",
    "ngs-collection-all":             "ngs-all.json",
    "saam-paintings":                 "saam-paintings-full.json",
    "nmwa-collection":                "nmwa-collection.json",
    "kroller-muller-collection":      "kroller-muller-permanent.json",
    "bruecke-museum-collection":      "bruecke-museum-collection.json",
    "tepapa-paintings":               "tepapa-collection.json",
    "tepapa-collection":              "tepapa-collection.json",
}

def get_image_url_from_item(item: dict, preferred_fields=("imageUrl", "image")) -> str:
    """아이템에서 최적 이미지 URL 추출 (R2 우선)"""
    # R2 URL 우선
    for field in preferred_fields:
        val = item.get(field, "")
        if val and "r2.dev" in val:
            return val
    # R2 없으면 아무 URL이라도
    for field in preferred_fields:
        val = item.get(field, "")
        if val:
            return val
    return ""


def build_collection_lookup(file_path: Path, preferred_fields: list) -> dict:
    """컬렉션 파일에서 id → 이미지URL 매핑"""
    lookup = {}
    try:
        raw = json.loads(file_path.read_text(encoding="utf-8"))
        items = raw if isinstance(raw, list) else None
        if items is None:
            for v in raw.values():
                if isinstance(v, list) and len(v) > 0:
                    items = v
                    break
        if not items:
            return lookup
        for item in items:
            aid = item.get("id")
            if not aid:
                continue
            url = get_image_url_from_item(item, preferred_fields)
            if url:
                lookup[aid] = url
    except Exception as e:
        print(f"  ⚠️ 컬렉션 로드 실패 {file_path.name}: {e}")
    return lookup


def needs_update(current_url: str) -> bool:
    """현재 URL이 업데이트가 필요한지 (비어있거나 R2가 아닌 경우)"""
    if not current_url:
        return True
    if "r2.dev" in current_url:
        return False  # 이미 R2 URL → 유지
    return True  # 박물관 원본 URL → 업데이트 필요


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    # 컬렉션 lookup 빌드
    print("📂 컬렉션 데이터 로딩...")
    collection_lookups: dict[str, dict] = {}
    for exh_prefix, fname in EXHIBITION_TO_FILE.items():
        fpath = DATA_DIR / fname
        if not fpath.exists():
            print(f"  ⚠️ 파일 없음: {fname}")
            continue
        # 최적 필드 결정
        preferred = ["imageUrl", "image"]
        for k, v in COLLECTION_IMAGE_FIELDS.items():
            if k in exh_prefix or exh_prefix.startswith(k):
                preferred = v
                break
        lookup = build_collection_lookup(fpath, preferred)
        collection_lookups[exh_prefix] = lookup
        r2_count = sum(1 for u in lookup.values() if "r2.dev" in u)
        print(f"  {fname}: {len(lookup)} 항목, {r2_count} R2 URL")

    # search-index 패치
    manifest = DATA_DIR / "search-manifest.json"
    chunk_files = json.loads(manifest.read_text()).get("chunks", [])

    total_updated = 0
    total_checked = 0
    total_missing  = 0

    for cf in chunk_files:
        part_path = DATA_DIR / cf
        if not part_path.exists():
            continue
        data = json.loads(part_path.read_text(encoding="utf-8"))
        items = data if isinstance(data, list) else (data.get("artworks") or [])

        updated = 0
        for item in items:
            total_checked += 1
            e_id = item.get("e", "")
            current_i = item.get("i", "")

            if not needs_update(current_i):
                continue

            # 매칭되는 컬렉션 lookup 찾기
            lookup = None
            for exh_prefix in collection_lookups:
                if e_id.startswith(exh_prefix) or e_id == exh_prefix:
                    lookup = collection_lookups[exh_prefix]
                    break

            if lookup is None:
                total_missing += 1
                continue

            art_id = item.get("id", "")
            new_url = lookup.get(art_id, "")
            if not new_url:
                total_missing += 1
                continue

            if not args.dry_run:
                item["i"] = new_url
            updated += 1

        total_updated += updated

        if not args.dry_run and updated > 0:
            # 파일 저장
            if isinstance(data, list):
                part_path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')))
            else:
                data["artworks"] = items
                part_path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')))
            print(f"  ✓ {cf}: {updated}개 업데이트")
        elif updated > 0:
            print(f"  [Dry-run] {cf}: {updated}개 업데이트 예정")

    print(f"\n{'[Dry-run] ' if args.dry_run else ''}총 업데이트: {total_updated:,}개 / 검사: {total_checked:,}개")
    if total_missing > 0:
        print(f"컬렉션 매핑 없음: {total_missing:,}개 (해당 컬렉션 파일에서 ID 못 찾음)")


if __name__ == "__main__":
    main()
