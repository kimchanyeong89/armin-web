#!/usr/bin/env python3
"""NGA (National Gallery of Art) Open Data → filtered dataset dump

Goal
- Efficiently collect *all available factual metadata* for the NGA collection from
  the official Open Data dump (CC0) instead of scraping www.nga.gov (Cloudflare).
- Replicate the user-provided filter:
  https://www.nga.gov/artwork-search?images=1&f[]=awtype:107231
  The UI shows this as classification "Painting" + images present.

What this script produces
- Writes a single JSON file under public/data with:
  - object core fields (objects.csv)
  - image records (published_images.csv)
  - on-view / location info (locations.csv + preferred_locations mapping)
  - dimensions table (objects_dimensions.csv)
  - terms table (objects_terms.csv)
  - text entries (objects_text_entries.csv)
  - historical data (objects_historical_data.csv)
  - artist relationships + constituent metadata (objects_constituents.csv + constituents.csv)

Open Access / Download Available
- NGA Open Data does not include an explicit open-access boolean per image.
- We include the raw image fields (incl. `maxpixels`) and compute a best-effort
  heuristic:
    openAccessLikely = any(image.maxpixels is empty)
  because the data dictionary states `maxpixels` is used to enforce fair-use limits.

Usage
- npm run scrape:nga:awtype107231
- Or:
  CLASSIFICATION=Painting IMAGES_ONLY=1 python3 scripts/scrape-nga-opendata-awtype-107231.py

Env vars
- CLASSIFICATION: default "Painting"
- IMAGES_ONLY: default "1" (requires at least one published image)
- OPEN_ACCESS_ONLY: default "0" (if enabled, keep only images with maxpixels empty/0 and require at least one)
- LIMIT: optional integer to stop after N matched objects
- FORCE_DOWNLOAD: "1" to re-download CSVs even if cached
- CACHE_DIR: default "downloads/nga-opendata"
- OUT_FILE: default "public/data/nga-awtype-107231-images.json"
- ORIGINAL_URL: default "https://www.nga.gov/artwork-search?images=1&f%5B%5D=awtype:107231"

"""

from __future__ import annotations

import csv
import json
import os
import re
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Pattern, Set, Tuple

from urllib.request import Request, urlopen


OPENDATA_BASE = "https://raw.githubusercontent.com/NationalGalleryOfArt/opendata/main/data"


@dataclass
class Config:
    classification: str
    images_only: bool
    open_access_only: bool
    limit: Optional[int]
    force_download: bool
    cache_dir: Path
    out_file: Path
    original_url: str
    exclude_subclassifications: Set[str]
    min_year: Optional[int]
    max_year: Optional[int]
    medium_regex: Optional[Pattern[str]]
    subclassification_regex: Optional[Pattern[str]]


def env_bool(name: str, default: bool) -> bool:
    v = os.getenv(name)
    if v is None:
        return default
    return v.strip().lower() in {"1", "true", "yes", "y", "on"}


def env_int(name: str) -> Optional[int]:
    v = os.getenv(name)
    if not v:
        return None
    try:
        return int(v)
    except ValueError:
        raise SystemExit(f"Invalid {name}={v!r} (expected integer)")


def env_regex(name: str) -> Optional[Pattern[str]]:
    v = os.getenv(name)
    if not v:
        return None
    try:
        return re.compile(v, re.IGNORECASE)
    except re.error as exc:
        raise SystemExit(f"Invalid {name} regex {v!r}: {exc}")


def log(msg: str) -> None:
    sys.stdout.write(msg + "\n")
    sys.stdout.flush()


def http_download(url: str, dest: Path, force: bool) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and not force:
        return

    tmp = dest.with_suffix(dest.suffix + ".tmp")
    if tmp.exists():
        tmp.unlink()

    req = Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; armin-web scraper; +https://github.com/NationalGalleryOfArt/opendata)",
            "Accept": "text/csv,application/octet-stream;q=0.9,*/*;q=0.8",
        },
    )

    started = time.time()
    with urlopen(req, timeout=120) as r:
        total = r.headers.get("Content-Length")
        total_int = int(total) if total and total.isdigit() else None

        downloaded = 0
        last_print = 0.0
        with tmp.open("wb") as f:
            while True:
                chunk = r.read(1024 * 1024)
                if not chunk:
                    break
                f.write(chunk)
                downloaded += len(chunk)
                now = time.time()
                if now - last_print > 1.0:
                    last_print = now
                    if total_int:
                        pct = downloaded * 100.0 / total_int
                        log(f"  ... {downloaded/1024/1024:.1f}MB / {total_int/1024/1024:.1f}MB ({pct:.1f}%)")
                    else:
                        log(f"  ... {downloaded/1024/1024:.1f}MB")

    tmp.replace(dest)
    log(f"  saved {dest} ({(time.time()-started):.1f}s)")


def open_csv(path: Path) -> Iterable[Dict[str, str]]:
    # newline='' is important for csv module.
    with path.open("r", encoding="utf-8", errors="replace", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            yield row


def safe_int(v: Optional[str]) -> Optional[int]:
    if v is None:
        return None
    s = v.strip()
    if s == "":
        return None
    try:
        return int(s)
    except ValueError:
        return None


def norm(s: Optional[str]) -> str:
    return (s or "").strip()


def pick_preferred_location(
    location_id: Optional[int],
    tms_to_pref: Dict[int, List[str]],
    pref_locations: Dict[str, Dict[str, str]],
) -> Optional[Dict[str, Any]]:
    if not location_id:
        return None
    keys = tms_to_pref.get(location_id)
    if not keys:
        return None
    # Prefer the first key; in practice there may be 1.
    key = keys[0]
    pref = pref_locations.get(key)
    if not pref:
        return {"locationKey": key}
    out = {"locationKey": key}
    out.update(pref)
    return out


def compute_open_access(images: List[Dict[str, Any]]) -> Dict[str, Any]:
    # Heuristic: if any image has no maxpixels, it's likely Open Access.
    # We keep the raw maxpixels per image regardless.
    any_unlimited = False
    for img in images:
        mp = img.get("maxpixels")
        if mp is None:
            any_unlimited = True
            break
        if isinstance(mp, str) and mp.strip() == "":
            any_unlimited = True
            break
        if isinstance(mp, int) and mp == 0:
            any_unlimited = True
            break
    return {
        "openAccessLikely": any_unlimited,
        "imageDownloadAvailableLikely": any_unlimited,
        "openAccessHeuristic": "published_images.maxpixels is empty/0 => likely not fair-use constrained",
    }


def is_open_access_image(img: Dict[str, Any]) -> bool:
    mp = img.get("maxpixels")
    if mp is None:
        return True
    if isinstance(mp, int) and mp <= 0:
        return True
    if isinstance(mp, str) and mp.strip() == "":
        return True
    return False


def select_primary_image(images: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not images:
        return None
    prim = [im for im in images if norm(str(im.get("viewtype", ""))).lower() == "primary"]
    candidates = prim if prim else images

    def key(im: Dict[str, Any]) -> Tuple[int, int, int]:
        seq = safe_int(str(im.get("sequence", "")))
        w = safe_int(str(im.get("width", "")))
        h = safe_int(str(im.get("height", "")))
        # sequence: smaller is earlier; if missing, push later
        # prefer larger images as tie-breaker
        return (
            seq if seq is not None else 10**9,
            -(w or 0),
            -(h or 0),
        )

    return sorted(candidates, key=key)[0]


def iiif_full_download_url(iiif_base_url: str) -> str:
    # IIIF Image API: /full/full/0/default.jpg yields the largest size.
    return iiif_base_url.rstrip("/") + "/full/full/0/default.jpg"


def main() -> None:
    cfg = Config(
        classification=os.getenv("CLASSIFICATION", "Painting").strip(),
        images_only=env_bool("IMAGES_ONLY", True),
        open_access_only=env_bool("OPEN_ACCESS_ONLY", False),
        limit=env_int("LIMIT"),
        force_download=env_bool("FORCE_DOWNLOAD", False),
        cache_dir=Path(os.getenv("CACHE_DIR", "downloads/nga-opendata")).resolve(),
        out_file=Path(os.getenv("OUT_FILE", "public/data/nga-awtype-107231-images.json")).resolve(),
        original_url=os.getenv(
            "ORIGINAL_URL",
            "https://www.nga.gov/artwork-search?images=1&f%5B%5D=awtype:107231",
        ).strip(),
        exclude_subclassifications={
            s.strip().lower()
            for s in os.getenv("EXCLUDE_SUBCLASSIFICATIONS", "").split(",")
            if s.strip()
        },
        min_year=env_int("MIN_YEAR"),
        max_year=env_int("MAX_YEAR"),
        medium_regex=env_regex("MEDIUM_REGEX"),
        subclassification_regex=env_regex("SUBCLASSIFICATION_REGEX"),
    )

    files = {
        "objects": "objects.csv",
        "published_images": "published_images.csv",
        "locations": "locations.csv",
        "preferred_locations": "preferred_locations.csv",
        "preferred_locations_tms_locations": "preferred_locations_tms_locations.csv",
        "objects_dimensions": "objects_dimensions.csv",
        "objects_terms": "objects_terms.csv",
        "objects_text_entries": "objects_text_entries.csv",
        "objects_historical_data": "objects_historical_data.csv",
        "objects_constituents": "objects_constituents.csv",
        "constituents": "constituents.csv",
    }

    log("Downloading NGA Open Data CSVs (cached)...")
    local: Dict[str, Path] = {}
    for key, fname in files.items():
        url = f"{OPENDATA_BASE}/{fname}"
        dest = cfg.cache_dir / fname
        log(f"- {fname}")
        http_download(url, dest, force=cfg.force_download)
        local[key] = dest

    log("Loading location lookups...")
    locations: Dict[int, Dict[str, str]] = {}
    for row in open_csv(local["locations"]):
        lid = safe_int(row.get("locationid"))
        if lid is None:
            continue
        locations[lid] = row

    pref_locations: Dict[str, Dict[str, str]] = {}
    for row in open_csv(local["preferred_locations"]):
        key = norm(row.get("locationkey"))
        if key:
            pref_locations[key] = row

    tms_to_pref: Dict[int, List[str]] = {}
    for row in open_csv(local["preferred_locations_tms_locations"]):
        tms_id = safe_int(row.get("tmslocationid"))
        pref_key = norm(row.get("preferredlocationkey"))
        if tms_id is None or not pref_key:
            continue
        tms_to_pref.setdefault(tms_id, []).append(pref_key)

    log("Loading images (published_images.csv)...")
    images_by_object: Dict[int, List[Dict[str, Any]]] = {}
    for row in open_csv(local["published_images"]):
        oid = safe_int(row.get("depictstmsobjectid"))
        if oid is None:
            continue
        # Keep only needed fields + preserve raw maxpixels
        images_by_object.setdefault(oid, []).append(
            {
                "uuid": norm(row.get("uuid")),
                "iiifurl": norm(row.get("iiifurl")),
                "iiifthumburl": norm(row.get("iiifthumburl")),
                "viewtype": norm(row.get("viewtype")),
                "sequence": norm(row.get("sequence")),
                "width": safe_int(row.get("width")),
                "height": safe_int(row.get("height")),
                "maxpixels": safe_int(row.get("maxpixels")) if norm(row.get("maxpixels")) else None,
                "created": norm(row.get("created")),
                "modified": norm(row.get("modified")),
                "assistivetext": norm(row.get("assistivetext")),
            }
        )

    log(f"Images mapped to {len(images_by_object):,} objects.")

    log("Filtering objects (objects.csv)...")
    wanted: Dict[int, Dict[str, Any]] = {}
    want_ids: Set[int] = set()
    classification_norm = cfg.classification.strip().lower()

    for row in open_csv(local["objects"]):
        oid = safe_int(row.get("objectid"))
        if oid is None:
            continue

        classification = norm(row.get("classification")).lower()
        if classification != classification_norm:
            continue

        sub_class = norm(row.get("subclassification")).lower()
        if sub_class in cfg.exclude_subclassifications:
            continue

        if cfg.subclassification_regex and not cfg.subclassification_regex.search(sub_class):
            continue

        medium_text = norm(row.get("medium"))
        if cfg.medium_regex and not cfg.medium_regex.search(medium_text):
            continue

        # Year filter (start year)
        if cfg.min_year is not None or cfg.max_year is not None:
            # Use beginyear as the primary "creation date" proxy
            # Some objects might be missing beginyear/endyear, filtering those out if strict range is set
            byear = safe_int(row.get("beginyear"))
            eyear = safe_int(row.get("endyear"))
            
            # Heuristic: if either range boundary is violated by the object's range
            # Or simpler: if object is strictly "within" 
            # Or: overlap?
            # User query usually implies "created between".
            # If I say 1850-2026, I generally want items where the creation year is >= 1850.
            # If the item is 1849-1850, does it count?
            # Let's use the object's START year must be >= MIN_YEAR (if set)
            # AND object's END year (or start if missing) <= MAX_YEAR (if set)
            # This is conservative.
            
            check_year = byear if byear is not None else eyear
            if check_year is None:
                continue

            if cfg.min_year is not None and check_year < cfg.min_year:
                continue
            if cfg.max_year is not None and check_year > cfg.max_year:
                continue

        imgs = images_by_object.get(oid, [])
        if cfg.images_only and not imgs:
            continue

        loc_id = safe_int(row.get("locationid"))
        loc = locations.get(loc_id) if loc_id is not None else None
        on_view = bool(loc_id is not None and loc and safe_int(loc.get("publicaccess")) == 1)

        pref = pick_preferred_location(loc_id, tms_to_pref, pref_locations)

        images = imgs
        if cfg.open_access_only:
            images = [im for im in images if is_open_access_image(im)]
            if not images:
                continue
        primary = select_primary_image(images)
        open_access = compute_open_access(images)

        record: Dict[str, Any] = {
            "id": f"nga-{oid}",
            "objectID": oid,
            "source": {
                "openDataRepo": "https://github.com/NationalGalleryOfArt/opendata",
                "openDataBase": OPENDATA_BASE,
                "classificationFilter": cfg.classification,
                "imagesOnly": cfg.images_only,
            },
            # Stable-ish URLs (note: www.nga.gov is Cloudflare protected for bots)
            "urls": {
                "artworkPage": f"https://www.nga.gov/artworks/{oid}",
                "legacyCollectionPage": f"https://www.nga.gov/collection/art-object-page.{oid}.html",
            },
            "title": norm(row.get("title")),
            "attribution": norm(row.get("attribution")),
            "attributionInverted": norm(row.get("attributioninverted")),
            "displayDate": norm(row.get("displaydate")),
            "beginYear": safe_int(row.get("beginyear")),
            "endYear": safe_int(row.get("endyear")),
            "medium": norm(row.get("medium")),
            "dimensions": norm(row.get("dimensions")),
            "creditLine": norm(row.get("creditline")),
            "classification": norm(row.get("classification")),
            "subClassification": norm(row.get("subclassification")),
            "visualBrowserClassification": norm(row.get("visualbrowserclassification")),
            "accessionNum": norm(row.get("accessionnum")),
            "provenanceText": norm(row.get("provenancetext")),
            "inscription": norm(row.get("inscription")),
            "markings": norm(row.get("markings")),
            "portfolio": norm(row.get("portfolio")),
            "series": norm(row.get("series")),
            "volume": norm(row.get("volume")),
            "watermarks": norm(row.get("watermarks")),
            "departmentAbbr": norm(row.get("departmentabbr")),
            "wikidataId": norm(row.get("wikidataid")),
            "customPrintUrl": norm(row.get("customprinturl")),
            "lastDetectedModification": norm(row.get("lastdetectedmodification")),
            "parentID": safe_int(row.get("parentid")),
            "isVirtual": safe_int(row.get("isvirtual")) == 1,
            "location": {
                "onView": on_view,
                "locationID": loc_id,
                "tmsLocation": loc,
                "preferredLocation": pref,
            },
            "images": images,
            "primaryImage": {
                "uuid": primary.get("uuid") if primary else None,
                "iiifUrl": primary.get("iiifurl") if primary else None,
                "iiifThumbUrl": primary.get("iiifthumburl") if primary else None,
                "iiifFull": iiif_full_download_url(primary.get("iiifurl")) if primary and primary.get("iiifurl") else None,
                "width": primary.get("width") if primary else None,
                "height": primary.get("height") if primary else None,
                "maxpixels": primary.get("maxpixels") if primary else None,
                "assistiveText": primary.get("assistivetext") if primary else None,
            },
        }
        record.update(open_access)

        wanted[oid] = record
        want_ids.add(oid)

        if cfg.limit and len(wanted) >= cfg.limit:
            break

    log(f"Matched {len(wanted):,} objects (classification={cfg.classification!r}, images_only={cfg.images_only}).")

    if not wanted:
        raise SystemExit("No objects matched. Check CLASSIFICATION or download success.")

    log("Enriching: objects_dimensions.csv (structured dimensions)...")
    for row in open_csv(local["objects_dimensions"]):
        oid = safe_int(row.get("objectid"))
        if oid is None or oid not in want_ids:
            continue
        rec = wanted[oid]
        rec.setdefault("dimensionsStructured", []).append(
            {
                "element": norm(row.get("element")),
                "dimensionType": norm(row.get("dimensiontype")),
                "dimension": norm(row.get("dimension")),
                "unitName": norm(row.get("unitname")),
            }
        )

    log("Enriching: objects_terms.csv (terms)...")
    for row in open_csv(local["objects_terms"]):
        oid = safe_int(row.get("objectid"))
        if oid is None or oid not in want_ids:
            continue
        rec = wanted[oid]
        rec.setdefault("terms", []).append(
            {
                "termID": safe_int(row.get("termid")),
                "termType": norm(row.get("termtype")),
                "term": norm(row.get("term")),
                "visualBrowserTheme": norm(row.get("visualbrowsertheme")),
                "visualBrowserStyle": norm(row.get("visualbrowserstyle")),
            }
        )

    log("Enriching: objects_text_entries.csv (long text entries)...")
    for row in open_csv(local["objects_text_entries"]):
        oid = safe_int(row.get("objectid"))
        if oid is None or oid not in want_ids:
            continue
        rec = wanted[oid]
        rec.setdefault("textEntries", []).append(
            {
                "textType": norm(row.get("texttype")),
                "year": norm(row.get("year")),
                "text": norm(row.get("text")),
            }
        )

    log("Enriching: objects_historical_data.csv (historical titles/attributions)...")
    for row in open_csv(local["objects_historical_data"]):
        oid = safe_int(row.get("objectid"))
        if oid is None or oid not in want_ids:
            continue
        rec = wanted[oid]
        rec.setdefault("historicalData", []).append(
            {
                "dataType": norm(row.get("datatype")),
                "displayOrder": safe_int(row.get("displayorder")),
                "forwardText": norm(row.get("forwardtext")),
                "invertedText": norm(row.get("invertedtext")),
                "remarks": norm(row.get("remarks")),
                "effectiveDate": norm(row.get("effectivedate")),
            }
        )

    log("Enriching: objects_constituents.csv + constituents.csv (artists)...")
    artist_links_by_object: Dict[int, List[Dict[str, Any]]] = {}
    needed_constituent_ids: Set[int] = set()

    for row in open_csv(local["objects_constituents"]):
        oid = safe_int(row.get("objectid"))
        if oid is None or oid not in want_ids:
            continue
        if norm(row.get("roletype")).lower() != "artist":
            continue
        cid = safe_int(row.get("constituentid"))
        if cid is None:
            continue
        needed_constituent_ids.add(cid)
        artist_links_by_object.setdefault(oid, []).append(
            {
                "constituentID": cid,
                "displayOrder": safe_int(row.get("displayorder")),
                "role": norm(row.get("role")),
                "prefix": norm(row.get("prefix")),
                "suffix": norm(row.get("suffix")),
                "displayDate": norm(row.get("displaydate")),
                "beginYear": safe_int(row.get("beginyear")),
                "endYear": safe_int(row.get("endyear")),
                "country": norm(row.get("country")),
            }
        )

    constituents_by_id: Dict[int, Dict[str, Any]] = {}
    for row in open_csv(local["constituents"]):
        cid = safe_int(row.get("constituentid"))
        if cid is None or cid not in needed_constituent_ids:
            continue
        constituents_by_id[cid] = {
            "constituentID": cid,
            "preferredDisplayName": norm(row.get("preferreddisplayname")),
            "forwardDisplayName": norm(row.get("forwarddisplayname")),
            "displayDate": norm(row.get("displaydate")),
            "beginYear": safe_int(row.get("beginyear")),
            "endYear": safe_int(row.get("endyear")),
            "nationality": norm(row.get("nationality")),
            "constituentType": norm(row.get("constituenttype")),
            "ulanId": norm(row.get("ulanid")),
            "wikidataId": norm(row.get("wikidataid")),
        }

    for oid, links in artist_links_by_object.items():
        rec = wanted.get(oid)
        if not rec:
            continue
        enriched: List[Dict[str, Any]] = []
        for link in sorted(links, key=lambda x: (x.get("displayOrder") or 10**9, x.get("constituentID") or 0)):
            c = constituents_by_id.get(link["constituentID"], {})
            enriched.append({**link, **({"constituent": c} if c else {})})
        rec["artists"] = enriched

    # Final output
    out_dir = cfg.out_file.parent
    out_dir.mkdir(parents=True, exist_ok=True)

    items = list(wanted.values())
    items.sort(key=lambda x: x.get("objectID", 0))

    out = {
        "scrapedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "source": {
            "note": "Generated from NGA Open Data CSVs (CC0). www.nga.gov HTML is Cloudflare-protected.",
            "openDataRepo": "https://github.com/NationalGalleryOfArt/opendata",
            "openDataFiles": dict(files),
        },
        "filter": {
            "originalUrl": cfg.original_url,
            "classification": cfg.classification,
            "imagesOnly": cfg.images_only,
            "openAccessOnly": cfg.open_access_only,
            "limit": cfg.limit,
        },
        "total": len(items),
        "items": items,
    }

    cfg.out_file.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    log(f"Wrote {cfg.out_file} ({len(items):,} items)")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        raise
