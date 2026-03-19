"""
Enrich Versailles collection using the CC API (showtype=record)
- Loads versailles-collection.json
- For each item without metadata, queries the CC API
- Saves enriched results back

Usage: python3 scripts/enrich-versailles-cc2.py [--limit N] [--test]
"""
import json, re, ssl, urllib.request, sys, time, argparse
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
COLLECTION_PATH = SCRIPT_DIR.parent / "public" / "data" / "versailles-collection.json"
CHECKPOINT_PATH = Path("/tmp/versailles-enrich-cc-checkpoint.json")
BASE_SPEC_PATH = Path("/tmp/versailles-base-spec.json")

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE


def http_post(path, body_obj):
    data = json.dumps(body_obj).encode("utf-8")
    req = urllib.request.Request(
        f"https://collections.chateauversailles.fr{path}",
        data=data,
        headers={
            "Content-Type": "application/json; charset=utf-8",
            "X-Requested-With": "XMLHttpRequest",
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            "Referer": "https://collections.chateauversailles.fr/",
        },
    )
    with urllib.request.urlopen(req, context=ctx, timeout=20) as r:
        return json.load(r)


def clean_html(html):
    text = re.sub(r"<script[\s\S]*?</script>", "", html, flags=re.IGNORECASE)
    text = (
        text.replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
    )
    text = re.sub(r"&#(\d+);", lambda m: chr(int(m.group(1))), text)
    text = re.sub(r"&[a-z]+;", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def parse_record_html(html):
    title_match = re.search(
        r"attr\('title',\s*'Les collections [^']*- ([^']+)'\)", html
    )
    text = clean_html(html)
    result = {}

    if title_match:
        result["title"] = title_match.group(1).strip()
    else:
        retour_idx = text.find("RETOUR A LA LISTE")
        if retour_idx > 0:
            candidate = text[:retour_idx].strip()
            segs = [s.strip() for s in candidate.split("\n") if s.strip()]
            if segs:
                result["title"] = segs[-1]

    field_patterns = [
        ("designation", ["Désignation :"]),
        ("inventoryNumber", ["N° d'inventaire :"]),
        ("artist", ["Auteur :"]),
        ("date", ["Date de création :"]),
        ("medium", ["Matière et technique :"]),
        ("department", ["Domaine :"]),
        ("location", ["Emplacement :"]),
        ("dimensions", ["Dimensions :"]),
    ]
    end_markers = [
        "N° d'inventaire :",
        "Auteur :",
        "Date de création :",
        "Matière",
        "Domaine :",
        "Emplacement :",
        "Dimensions :",
        "Désignation :",
        "Titre :",
        "RETOUR",
        "Précédente",
        "Suivante",
        "résultat",
        "Autre(s)",
        "Personne représentée :",
        "Commentaire",
        "Provenance",
    ]

    for key, patterns in field_patterns:
        for pattern in patterns:
            idx = text.find(pattern)
            if idx != -1:
                after = text[idx + len(pattern) :].strip()
                end_idx = len(after)
                for ep in end_markers:
                    if ep == pattern:
                        continue
                    ei = after.find(ep)
                    if 0 < ei < end_idx:
                        end_idx = ei
                value = after[:end_idx].strip()
                if value and 0 < len(value) < 500:
                    result[key] = value
                    break

    if not result.get("title") and result.get("designation"):
        result["title"] = result["designation"]

    return result


def fetch_item_meta(inv_num, base_spec, auth_token):
    svs = json.loads(json.dumps(base_spec["searchValues"]))
    for sv in svs:
        if sv.get("id") == 3 or sv.get("tag") == "Object number":
            sv["value"] = inv_num
            break
    spec = {
        **base_spec,
        "first": 1,
        "numPerPage": 1,
        "showtype": "record",
        "searchValues": svs,
    }
    d = http_post(
        "/cc/ccConnector.asmx/search",
        {"authToken": auth_token, "searchSpec": spec},
    )
    inner = d.get("d", {})
    if not inner or inner.get("resultCount", 0) == 0:
        return None
    html = inner.get("result", "")
    if not html:
        return None
    return parse_record_html(html)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--test", action="store_true", help="Test 10 items")
    args = parser.parse_args()
    if args.test:
        args.limit = 10

    with open(COLLECTION_PATH) as f:
        coll_data = json.load(f)
    objects = coll_data["objects"]
    print(f"Total: {len(objects)}")

    no_meta = [
        o
        for o in objects
        if not o.get("title") or o["title"] in ["Palace of Versailles Artwork", ""]
    ]
    print(f"Without metadata: {len(no_meta)}")

    checkpoint = {}
    if CHECKPOINT_PATH.exists():
        with open(CHECKPOINT_PATH) as f:
            checkpoint = json.load(f)
        print(f"Checkpoint: {len(checkpoint)} entries")

    with open(BASE_SPEC_PATH) as f:
        base_data = json.load(f)
    auth_token = base_data.get("authToken") or ""
    base_spec = base_data["searchSpec"]

    enriched = 0
    no_access = 0
    errors = 0
    processed = 0

    obj_by_inv = {
        o["inventoryNumber"]: i
        for i, o in enumerate(objects)
        if o.get("inventoryNumber")
    }

    limit = args.limit or len(no_meta)

    for item in no_meta[:limit]:
        inv_num = item.get("inventoryNumber", "")
        if not inv_num:
            continue

        if inv_num in checkpoint:
            cached = checkpoint[inv_num]
            if cached in ("no_access", "error"):
                no_access += 1
                continue
            if isinstance(cached, dict) and cached.get("title"):
                idx = obj_by_inv.get(inv_num)
                if idx is not None:
                    o = objects[idx]
                    if cached.get("title"):
                        o["title"] = cached["title"]
                    if cached.get("artist"):
                        o["artist"] = cached["artist"]
                    if cached.get("date"):
                        o["date"] = cached["date"]
                    if cached.get("department"):
                        o["department"] = cached["department"]
                enriched += 1
                continue

        processed += 1
        if processed % 50 == 0 or processed == 1:
            print(f"[{processed}/{limit}] enriched={enriched} no_access={no_access}")
            with open(CHECKPOINT_PATH, "w") as f:
                json.dump(checkpoint, f, indent=2, ensure_ascii=False)
            with open(COLLECTION_PATH, "w") as f:
                json.dump(coll_data, f, indent=2, ensure_ascii=False)

        try:
            meta = fetch_item_meta(inv_num, base_spec, auth_token)
            if (
                meta
                and meta.get("title")
                and meta["title"] not in ["Palace of Versailles Artwork", ""]
            ):
                idx = obj_by_inv.get(inv_num)
                if idx is not None:
                    o = objects[idx]
                    if meta.get("title"):
                        o["title"] = meta["title"]
                    if meta.get("artist"):
                        o["artist"] = meta["artist"]
                    if meta.get("date"):
                        o["date"] = meta["date"]
                    if meta.get("department"):
                        o["department"] = meta["department"]
                checkpoint[inv_num] = meta
                enriched += 1
                if args.test:
                    print(
                        f"  OK {inv_num}: {meta.get('title','')[:70]} | {meta.get('artist','')[:30]}"
                    )
            else:
                checkpoint[inv_num] = "no_access"
                no_access += 1
                if args.test:
                    print(f"  -- {inv_num}: no access")
        except Exception as e:
            print(f"  ERROR {inv_num}: {str(e)[:80]}")
            checkpoint[inv_num] = "error"
            errors += 1

        time.sleep(0.2)

    print(f"\n=== DONE: enriched={enriched} no_access={no_access} errors={errors} ===")

    with open(COLLECTION_PATH, "w") as f:
        json.dump(coll_data, f, indent=2, ensure_ascii=False)
    with open(CHECKPOINT_PATH, "w") as f:
        json.dump(checkpoint, f, indent=2, ensure_ascii=False)

    after = sum(
        1
        for o in objects
        if o.get("title") and o["title"] not in ["Palace of Versailles Artwork", ""]
    )
    print(f"Items with metadata: {after}/{len(objects)}")


if __name__ == "__main__":
    main()
