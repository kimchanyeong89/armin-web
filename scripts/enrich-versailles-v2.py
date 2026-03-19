#!/usr/bin/env python3
"""
Improved enrichment of Versailles collection:
1. Restores original 4634 CC items (from backup)
2. Downloads all 6487 Joconde records
3. Builds lookup that maps ALL inv number components (MV, INV, LP) to records
4. The CC system uses "MV XXXX" or "LP XXXX" as item IDs - try both as keys
5. Also saves Joconde data locally so we can reprocess without re-downloading
"""
import json, urllib.request, ssl, time, re, sys, os

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

BASE_URL = "https://data.culture.gouv.fr/api/explore/v2.1/catalog/datasets/base-joconde-extrait/records"
JOCONDE_CACHE = '/tmp/joconde-versailles-cache.json'

def fetch_all():
    """Download all Versailles records from Joconde (or use cache)."""
    if os.path.exists(JOCONDE_CACHE):
        print(f"  Using cached Joconde data from {JOCONDE_CACHE}")
        with open(JOCONDE_CACHE) as f:
            return json.load(f)
    
    records = []
    offset = 0
    total = None
    params = "where=code_museofile%3D%22M5077%22&limit=100&select=*"

    while True:
        url = f"{BASE_URL}?{params}&offset={offset}"
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            r = urllib.request.urlopen(req, timeout=30, context=ctx)
            d = json.loads(r.read())
        except Exception as e:
            print(f"  Error at offset {offset}: {e}", file=sys.stderr)
            time.sleep(2)
            continue

        if total is None:
            total = d.get('total_count', 0)
            print(f"  Total Joconde records for M5077: {total}")

        batch = d.get('results', [])
        if not batch:
            break
        records.extend(batch)
        offset += len(batch)
        print(f"  Fetched {offset}/{total}...", end='\r', flush=True)
        if offset >= total:
            break
        time.sleep(0.3)

    print(f"\n  Done. Downloaded {len(records)} records.")
    with open(JOCONDE_CACHE, 'w') as f:
        json.dump(records, f)
    return records

def build_lookup(records):
    """
    Build a lookup from any inventory number component to Joconde record.
    Joconde format: "MV 981 ; INV 7872 ; LP 480" → keys: "MV 981", "INV 7872", "LP 480"
    Also add numeric-only variants for cross-prefix matching.
    """
    lookup = {}
    all_nums = {}  # plain number → list of records (for ambiguity)
    
    for rec in records:
        inv_str = rec.get('numero_inventaire', '')
        if not inv_str:
            continue
        # Split on " ; "
        parts = re.split(r'\s*;\s*', str(inv_str).strip())
        for p in parts:
            p = p.strip()
            if not p:
                continue
            lookup[p] = rec
            # Also store number-only key (strip prefix letters)
            num_match = re.search(r'\d[\d.]+', p)
            if num_match:
                num = num_match.group(0)
                # Store prefix+num → rec
                prefix_match = re.match(r'([A-Z]+\s*)', p)
                prefix = prefix_match.group(1).strip() if prefix_match else ''
                all_nums.setdefault(num, []).append((prefix, rec))
    
    return lookup, all_nums

def find_match(inv, lookup, all_nums):
    """Try to find a Joconde record for an inventory number."""
    inv = inv.strip()
    
    # 1. Exact match
    if inv in lookup:
        return lookup[inv]
    
    # 2. Try consolidating spaces: "MV5046" → "MV 5046"
    inv_spaced = re.sub(r'([A-Za-z]+)(\d)', r'\1 \2', inv)
    if inv_spaced in lookup:
        return lookup[inv_spaced]
    inv_nospace = re.sub(r'\s+', '', inv)
    if inv_nospace in lookup:
        return lookup[inv_nospace]
    
    # 3. Try with different prefix:
    # CC "MV 5046" might correspond to Joconde "LP 5046" (same number, different prefix code)
    num_match = re.search(r'(\d[\d.]+)', inv)
    if num_match:
        num = num_match.group(1)
        if num in all_nums:
            candidates = all_nums[num]
            # If only one candidate, return it
            if len(candidates) == 1:
                return candidates[0][1]
            # Prefer peinture domain
            for prefix, rec in candidates:
                domaine = rec.get('domaine', [])
                if isinstance(domaine, list) and any('peinture' in d.lower() for d in domaine):
                    return rec
            # Return first
            return candidates[0][1]
    
    # 4. Try without leading zeros or with leading zeros
    # "2009.00.001" → not in Joconde (modern acquisitions typically not listed)
    
    return None

def extract_year(millesime):
    if not millesime:
        return 0
    m = re.search(r'\b(\d{4})\b', str(millesime))
    return int(m.group(1)) if m else 0

def format_artist(auteur):
    if not auteur:
        return ""
    name = str(auteur).strip()
    if name.lower() in ('anonyme', 'anonymous', 'inconnu', 'unknown', ''):
        return ""
    if name.isupper():
        parts = name.split()
        return ' '.join(p.capitalize() for p in parts)
    return name

def format_medium(materiaux):
    if not materiaux:
        return ""
    if isinstance(materiaux, list):
        return ', '.join(str(m) for m in materiaux)
    return str(materiaux)

def main():
    print("=== Step 1: Load original CC data (backup) ===")
    # Try bak2 first (original), then bak
    backup_files = [
        'public/data/versailles-collection.bak2.json',
        'public/data/versailles-collection.bak.json',
    ]
    original = None
    for bf in backup_files:
        if os.path.exists(bf):
            with open(bf) as f:
                try:
                    original = json.load(f)
                    print(f"  Using backup: {bf}")
                    break
                except:
                    continue
    
    if not original:
        print("  No backup found. Loading current file (already enriched).")
        with open('public/data/versailles-collection.json') as f:
            original = json.load(f)
    
    items = original.get('objects', [])
    # If already enriched (has 9000+ items), filter to only original CC items
    # Original items have IDs versailles-1 through versailles-4634
    if len(items) > 5000:
        print(f"  Warning: {len(items)} items. Filtering to original CC items (ID number <= 4634).")
        def orig_id_num(item):
            m = re.search(r'versailles-(\d+)$', item.get('id',''))
            return int(m.group(1)) if m else 999999
        items = [x for x in items if orig_id_num(x) <= 4634]
        print(f"  After filter: {len(items)} items")
    else:
        print(f"  Items: {len(items)}")

    print("\n=== Step 2: Download Joconde data ===")
    joconde_records = fetch_all()

    print("\n=== Step 3: Build lookup ===")
    lookup, all_nums = build_lookup(joconde_records)
    print(f"  Exact lookup keys: {len(lookup)}")
    print(f"  Numeric lookup keys: {len(all_nums)}")

    print("\n=== Step 4: Enrich items ===")
    enriched = 0
    not_found = 0
    match_methods = {}
    
    for item in items:
        inv = item.get('inventoryNumber', '').strip()
        
        rec = find_match(inv, lookup, all_nums)
        
        if rec:
            enriched += 1
            titre = rec.get('titre', '')
            auteur = rec.get('auteur', '')
            millesime = rec.get('millesime_de_creation', '')
            materiaux = rec.get('materiaux_techniques', '')
            mesures = rec.get('mesures', '')
            domaine = rec.get('domaine', [])
            
            if titre:
                item['title'] = titre
            item['artist'] = format_artist(auteur)
            item['year'] = extract_year(millesime)
            item['date'] = str(millesime) if millesime else ''
            item['medium'] = format_medium(materiaux)
            item['dimensions'] = format_dimensions(mesures)
            item['category'] = 'Painting'
            if not item.get('department'):
                item['department'] = 'Peintures'
        else:
            not_found += 1
            # Still mark as painting
            item['category'] = 'Painting'
            if not item.get('department'):
                item['department'] = 'Peintures'

    print(f"  Enriched: {enriched}/{len(items)}")
    print(f"  Not found in Joconde: {not_found}")

    print("\n=== Step 5: Write updated collection ===")
    # Keep the original CC items only (don't add Joconde-only items)
    original['objects'] = items
    original['totalItems'] = len(items)
    original['enrichedAt'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    
    with open('public/data/versailles-collection.json', 'w', encoding='utf-8') as f:
        json.dump(original, f, ensure_ascii=False, indent=2)
    print(f"  Wrote {len(items)} items")

    has_title = sum(1 for x in items if x.get('title') and x['title'] != 'Palace of Versailles Artwork')
    has_artist = sum(1 for x in items if x.get('artist'))
    has_year = sum(1 for x in items if x.get('year', 0) > 0)
    has_medium = sum(1 for x in items if x.get('medium'))
    print(f"\n  Coverage:")
    print(f"    Real title: {has_title}/{len(items)} ({100*has_title//len(items)}%)")
    print(f"    Artist: {has_artist}/{len(items)} ({100*has_artist//len(items)}%)")
    print(f"    Year: {has_year}/{len(items)} ({100*has_year//len(items)}%)")
    print(f"    Medium: {has_medium}/{len(items)} ({100*has_medium//len(items)}%)")

def format_dimensions(mesures):
    if not mesures:
        return ""
    return str(mesures).strip()

if __name__ == '__main__':
    main()
