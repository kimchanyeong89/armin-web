#!/usr/bin/env python3
"""
Enrich Versailles collection from Joconde open data API.
Downloads all 6487 Versailles records from base-joconde-extrait,
builds a lookup by inventory number, then merges metadata into
public/data/versailles-collection.json.

Also adds any paintings from Joconde NOT already in our collection.
"""
import json, urllib.request, ssl, time, re, sys

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

BASE_URL = "https://data.culture.gouv.fr/api/explore/v2.1/catalog/datasets/base-joconde-extrait/records"
PARAMS = "where=code_museofile%3D%22M5077%22&limit=100&select=*"

def fetch_all():
    """Download all Versailles records from Joconde."""
    records = []
    offset = 0
    total = None

    while True:
        url = f"{BASE_URL}?{PARAMS}&offset={offset}"
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
    return records

def normalize_inv(inv_str):
    """Return all possible inventory number variations from a Joconde multi-value string."""
    if not inv_str:
        return []
    # Split on " ; " or "; " or ";"
    parts = re.split(r'\s*;\s*', str(inv_str))
    normalized = []
    for p in parts:
        p = p.strip().rstrip(',').strip()
        if p:
            normalized.append(p)
            # also add variant with consolidated spaces
            normalized.append(re.sub(r'\s+', ' ', p))
    return list(set(normalized))

def extract_year(millesime):
    """Extract first 4-digit year from millesime string."""
    if not millesime:
        return 0
    m = re.search(r'\b(\d{4})\b', str(millesime))
    return int(m.group(1)) if m else 0

def format_artist(auteur):
    """Format artist name from Joconde."""
    if not auteur:
        return ""
    name = str(auteur).strip()
    if name.lower() in ('anonyme', 'anonymous', 'inconnu', 'unknown', ''):
        return ""
    # Joconde sometimes has "LASTNAME Firstname" — convert to "Firstname Lastname"
    # But many are already set. Keep as-is for now, just title case
    # Don't change if it's already mixed case
    if name.isupper():
        # Try to split into parts and title case
        parts = name.split()
        return ' '.join(p.capitalize() for p in parts)
    return name

def format_medium(materiaux):
    """Format medium from Joconde list."""
    if not materiaux:
        return ""
    if isinstance(materiaux, list):
        return ', '.join(str(m) for m in materiaux)
    return str(materiaux)

def format_dimensions(mesures):
    """Format dimensions from Joconde."""
    if not mesures:
        return ""
    return str(mesures).strip()

def main():
    print("=== Step 1: Download Joconde Versailles data ===")
    joconde_records = fetch_all()

    print("\n=== Step 2: Build inventory lookup ===")
    # Map from inventory number string → record
    lookup = {}
    paintings_lookup = {}
    
    for rec in joconde_records:
        inv = rec.get('numero_inventaire', '')
        variants = normalize_inv(inv)
        domaine = rec.get('domaine', [])
        is_painting = isinstance(domaine, list) and any('peinture' in d.lower() for d in domaine)
        
        for v in variants:
            lookup[v] = rec
            if is_painting:
                paintings_lookup[v] = rec

    print(f"  Lookup keys: {len(lookup)}")
    print(f"  Paintings lookup keys: {len(paintings_lookup)}")

    print("\n=== Step 3: Load Versailles collection ===")
    with open('public/data/versailles-collection.json') as f:
        collection = json.load(f)
    items = collection.get('objects', [])
    print(f"  Current items: {len(items)}")

    print("\n=== Step 4: Enrich existing items ===")
    enriched = 0
    not_found = 0
    
    for item in items:
        inv = item.get('inventoryNumber', '').strip()
        
        # Try exact match first
        rec = lookup.get(inv)
        # Try variants: "MV 5046" might be stored as "MV5046" or vice versa
        if not rec:
            inv_no_space = re.sub(r'\s+', '', inv)
            inv_with_space = re.sub(r'([A-Za-z]+)(\d)', r'\1 \2', inv)
            rec = lookup.get(inv_no_space) or lookup.get(inv_with_space)
        # Try partial match: our "MV 5046" vs Joconde "MV 5046 ; INV ..."
        if not rec:
            for key in lookup:
                if key.startswith(inv + ' ') or key.startswith(inv + ';') or key == inv:
                    rec = lookup[key]
                    break
        
        if rec:
            enriched += 1
            titre = rec.get('titre', '')
            auteur = rec.get('auteur', '')
            millesime = rec.get('millesime_de_creation', '')
            materiaux = rec.get('materiaux_techniques', '')
            mesures = rec.get('mesures', '')
            domaine = rec.get('domaine', [])
            
            item['title'] = titre if titre else item.get('title', 'Palace of Versailles Artwork')
            item['artist'] = format_artist(auteur)
            item['year'] = extract_year(millesime)
            item['date'] = str(millesime) if millesime else ''
            item['medium'] = format_medium(materiaux)
            item['dimensions'] = format_dimensions(mesures)
            item['category'] = 'Painting'
            
            # Keep existing department, or derive from domaine
            if not item.get('department'):
                item['department'] = 'Peintures'
        else:
            not_found += 1

    print(f"  Enriched: {enriched}")
    print(f"  Not found in Joconde: {not_found}")

    print("\n=== Step 5: Add missing paintings from Joconde ===")
    # Find paintings in Joconde that are NOT in our collection
    our_invs = set()
    for item in items:
        inv = item.get('inventoryNumber', '').strip()
        our_invs.add(inv)

    # Build a unique-per-inv list of Joconde paintings
    seen_invs = set()
    new_items = []
    auto_id = len(items) + 1
    
    for rec in joconde_records:
        domaine = rec.get('domaine', [])
        is_painting = isinstance(domaine, list) and any('peinture' in d.lower() for d in domaine)
        if not is_painting:
            continue
        
        inv_raw = rec.get('numero_inventaire', '')
        variants = normalize_inv(inv_raw)
        
        # Check if any variant is in our collection
        if any(v in our_invs for v in variants):
            continue
        
        # Dedup by primary inventory number
        primary_inv = variants[0] if variants else inv_raw
        if primary_inv in seen_invs:
            continue
        seen_invs.add(primary_inv)
        
        titre = rec.get('titre', '')
        auteur = rec.get('auteur', '')
        millesime = rec.get('millesime_de_creation', '')
        materiaux = rec.get('materiaux_techniques', '')
        mesures = rec.get('mesures', '')
        
        # Build image URL using primary_inv → try standard imageproxy format
        inv_url = primary_inv.replace(' ', '%20').replace('/', '%2F')
        image = f"https://collections.chateauversailles.fr/cc/imageproxy.aspx?filename=objectimages%2F{inv_url}_001.cci&width=800&height=800"
        source_url = f"https://collections.chateauversailles.fr/#id={primary_inv}"
        
        new_item = {
            "id": f"versailles-{auto_id}",
            "inventoryNumber": primary_inv,
            "title": titre if titre else "Palace of Versailles Artwork",
            "artist": format_artist(auteur),
            "year": extract_year(millesime),
            "date": str(millesime) if millesime else '',
            "medium": format_medium(materiaux),
            "dimensions": format_dimensions(mesures),
            "department": "Peintures",
            "category": "Painting",
            "image": image,
            "sourceUrl": source_url,
            "museum": "Palace of Versailles",
            "type": "2D"
        }
        new_items.append(new_item)
        auto_id += 1

    print(f"  New paintings from Joconde (not in collection): {len(new_items)}")

    # Merge
    all_items = items + new_items
    print(f"  Total after merge: {len(all_items)}")

    # Update collection metadata
    collection['objects'] = all_items
    collection['totalItems'] = len(all_items)
    collection['scrapedAt'] = collection.get('scrapedAt', '')
    collection['enrichedAt'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())

    print("\n=== Step 6: Write updated collection ===")
    with open('public/data/versailles-collection.json', 'w', encoding='utf-8') as f:
        json.dump(collection, f, ensure_ascii=False, indent=2)
    print(f"  Wrote {len(all_items)} items to public/data/versailles-collection.json")

    # Stats
    has_title = sum(1 for x in all_items if x.get('title') and x['title'] != 'Palace of Versailles Artwork')
    has_artist = sum(1 for x in all_items if x.get('artist'))
    has_year = sum(1 for x in all_items if x.get('year', 0) > 0)
    has_medium = sum(1 for x in all_items if x.get('medium'))
    print(f"\n  Metadata coverage:")
    print(f"    Has real title: {has_title}/{len(all_items)}")
    print(f"    Has artist: {has_artist}/{len(all_items)}")
    print(f"    Has year: {has_year}/{len(all_items)}")
    print(f"    Has medium: {has_medium}/{len(all_items)}")

if __name__ == '__main__':
    main()
