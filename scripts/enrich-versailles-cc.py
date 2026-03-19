#!/usr/bin/env python3
"""
Enrich the Versailles CC-scraped collection with Joconde metadata.
- Fetches all Versailles records from Joconde (MUSEO=M5020, up to 6500)
- Builds a lookup: INV → {title, artist, year, date, medium, description}
- Enriches public/data/versailles-collection.json with this metadata
"""

import json, urllib.request, ssl, time, re, sys, os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COLLECTION_FILE = os.path.join(BASE_DIR, "public/data/versailles-collection.json")
JOCONDE_URL = "https://data.culture.gouv.fr/api/explore/v2.1/catalog/datasets/base-joconde-extrait/records"
CACHE_FILE = "/tmp/joconde-versailles-cc-cache.json"

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

def fetch_all_joconde():
    """Fetch all Versailles (M5077) records from Joconde using curl."""
    if os.path.exists(CACHE_FILE):
        print(f"✅ Using cached Joconde data from {CACHE_FILE}")
        with open(CACHE_FILE) as f:
            return json.load(f)

    print("🔄 Fetching Versailles records from Joconde...")
    import subprocess
    all_records = []
    limit = 100
    offset = 0

    while True:
        url = f"{JOCONDE_URL}?where=code_museofile%3D%22M5077%22&limit={limit}&offset={offset}"
        result = subprocess.run(
            ['curl', '-s', '-L', '--compressed', '-H', 'Accept: application/json',
             '-H', 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
             url],
            capture_output=True, text=True, timeout=30
        )
        try:
            d = json.loads(result.stdout)
        except Exception as e:
            print(f"  Parse error at offset={offset}: {e}")
            print(f"  Response: {result.stdout[:200]}")
            break

        records = d.get('results', [])
        total = d.get('total_count', 0)
        all_records.extend(records)
        print(f"  Fetched {len(all_records)}/{total} records (offset={offset})")
        if len(all_records) >= total or not records:
            break
        offset += limit
        time.sleep(0.2)

    print(f"✅ Total Joconde records: {len(all_records)}")
    with open(CACHE_FILE, 'w') as f:
        json.dump(all_records, f, ensure_ascii=False, indent=2)
    return all_records


def normalize_inv(inv):
    """Normalize inventory number for matching."""
    if not inv:
        return ''
    return inv.strip().upper()


def parse_year(datation):
    """Extract a year from a datation string like '1680', 'vers 1680', '17e siècle'."""
    if not datation:
        return 0
    # Extract 4-digit year
    m = re.search(r'\b(1[0-9]{3}|20[0-2][0-9])\b', str(datation))
    if m:
        return int(m.group(1))
    return 0


def build_lookup(records):
    """Build a lookup dict: normalized INV → metadata. Joconde uses lowercase field names."""
    lookup = {}
    for rec in records:
        # API returns flat record (no nested 'fields' wrapper in v2.1)
        inv_raw = rec.get('numero_inventaire', '')
        if not inv_raw:
            continue
        # numero_inventaire is a semicolon-separated string like "MV 110 ; INV 6496 ; LP 2295"
        inv_parts = re.split(r'\s*;\s*', str(inv_raw))

        auteur = rec.get('auteur', '') or ''
        titre = rec.get('titre', '') or ''
        datation = rec.get('periode_de_creation', '') or rec.get('millesime_de_creation', '') or ''
        matiere = rec.get('materiaux_techniques', '') or ''
        description = rec.get('description', '') or rec.get('sujet_represente', '') or ''
        domaine = rec.get('domaine', '') or ''

        if isinstance(auteur, list):
            auteur = '; '.join(str(a) for a in auteur if a)
        if isinstance(matiere, list):
            matiere = ', '.join(str(m) for m in matiere if m)
        if isinstance(domaine, list):
            domaine = ', '.join(str(d) for d in domaine if d)
        if isinstance(description, list):
            description = '; '.join(str(d) for d in description if d)

        meta = {
            'title': str(titre).strip() if titre else '',
            'artist': str(auteur).strip() if auteur else '',
            'date': str(datation).strip() if datation else '',
            'year': parse_year(datation),
            'medium': str(matiere).strip() if matiere else '',
            'description': str(description)[:500].strip() if description else '',
            'department': str(domaine).strip() if domaine else '',
        }

        for inv in inv_parts:
            key = normalize_inv(inv)
            if key and key not in lookup:
                lookup[key] = meta

    print(f"✅ Built lookup with {len(lookup)} Joconde INV keys")
    return lookup


def enrich():
    """Load CC collection and enrich with Joconde metadata."""
    # Load Joconde
    records = fetch_all_joconde()
    lookup = build_lookup(records)

    # Load versailles collection
    with open(COLLECTION_FILE) as f:
        data = json.load(f)

    objects = data.get('objects', [])
    print(f"\n📦 Versailles CC collection: {len(objects)} items")

    matched = 0
    still_default = 0

    for item in objects:
        inv_raw = item.get('inventoryNumber', '')
        key = normalize_inv(inv_raw)

        meta = lookup.get(key)

        # Also try without leading zeros or with minor normalization
        if not meta and key:
            # Try stripping trailing spaces
            key2 = key.rstrip()
            meta = lookup.get(key2)

        # For MV numbers: try "MV XXXX" vs "MV.XXXX" etc.
        if not meta and inv_raw.upper().startswith('MV'):
            # Try variants
            for v in [
                key.replace('MV ', 'MV.'),
                key.replace('MV.', 'MV '),
                key.replace('MV ', 'MV'),
            ]:
                meta = lookup.get(v)
                if meta:
                    break

        if meta:
            matched += 1
            if meta.get('title'):
                item['title'] = meta['title']
            if meta.get('artist'):
                item['artist'] = meta['artist']
            if meta.get('year'):
                item['year'] = meta['year']
            if meta.get('date'):
                item['date'] = meta['date']
            if meta.get('medium'):
                item['medium'] = meta['medium']
            if meta.get('description'):
                item['description'] = meta['description']
            if meta.get('department'):
                item['department'] = meta['department']
        else:
            still_default += 1

    print(f"✅ Matched: {matched}/{len(objects)}")
    print(f"⚠️  No match found: {still_default}")

    # Show some samples
    with_meta = [o for o in objects if o.get('title','') not in ['', 'Palace of Versailles Artwork']][:5]
    print("\n📋 Sample enriched items:")
    for item in with_meta:
        print(f"  [{item.get('inventoryNumber','')}] {item.get('title','')} — {item.get('artist','')} ({item.get('year','')})")

    # Update metadata
    data['totalItems'] = len(objects)
    data['scrapedAt'] = data.get('scrapedAt', '')
    data['enrichedAt'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())

    with open(COLLECTION_FILE, 'w') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"\n💾 Saved {len(objects)} items to {COLLECTION_FILE}")
    print("✅ Done!")


if __name__ == '__main__':
    enrich()
