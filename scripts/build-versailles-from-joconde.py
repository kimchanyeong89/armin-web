#!/usr/bin/env python3
"""
Build Versailles collection from Joconde data.
Uses the cached Joconde data (5762 paintings for M5077 Versailles).
Constructs CC imageproxy URLs from primary inventory numbers.
Creates a clean versailles-collection.json with full metadata.
"""
import json, re, time, os

JOCONDE_CACHE = '/tmp/joconde-versailles-cache.json'

def extract_year(millesime):
    if not millesime:
        return None
    m = re.search(r'\b(\d{4})\b', str(millesime))
    return int(m.group(1)) if m else None

def clean_artist(auteur):
    if not auteur:
        return ""
    name = str(auteur).strip()
    if not name or name.lower() in ('anonyme', 'anonymous', 'inconnu', 'unknown'):
        return ""
    
    # Joconde format: "LASTNAME Firstname" or "LASTNAME Firstname Secondname"
    # If the first word is all uppercase and there's more, flip to "Firstname LASTNAME" format
    parts = name.split()
    if not parts:
        return ""
    
    # Check if first token is all uppercase (LASTNAME pattern)
    if len(parts) >= 2 and parts[0].isupper() and len(parts[0]) > 1:
        # "SCHEFFER Henry" → "Henry Scheffer"
        lastname = parts[0].capitalize()
        firstnames = ' '.join(parts[1:])
        return f"{firstnames} {lastname}"
    elif name.isupper():
        # All-caps single name or two caps
        return ' '.join(p.capitalize() for p in parts)
    
    return name

def format_medium(materiaux):
    if not materiaux:
        return ""
    if isinstance(materiaux, list):
        return ', '.join(str(m) for m in materiaux)
    return str(materiaux)

def format_dimensions(mesures):
    if not mesures:
        return ""
    s = str(mesures).strip()
    # Convert "H. en m 0.5 ; L. en m 0.4" → "H 50 cm; L 40 cm"
    # or just keep as-is:
    return s

def primary_inv_number(numero_inventaire):
    """Extract the primary inventory number (first component before ';')."""
    if not numero_inventaire:
        return ''
    parts = re.split(r'\s*;\s*', str(numero_inventaire).strip())
    return parts[0].strip() if parts else ''

def format_title(titre):
    """Convert Joconde all-caps titles to proper capitalization."""
    if not titre:
        return ''
    # If already mixed case, keep as-is
    if not titre.isupper():
        return titre
    # French lowercase particles that shouldn't be title-cased
    lowercase_words = {'de', 'du', 'des', 'la', 'le', 'les', 'et', 'sur',
                       'en', 'au', 'aux', 'à', 'l', 'un', 'une', 'par', 'dans',
                       'avec', 'pour', 'sans', 'of', 'the', 'and', 'in', 'on', 'at'}
    words = titre.split()
    result = []
    for i, w in enumerate(words):
        # Handle hyphenated words
        if '-' in w:
            parts = w.split('-')
            result.append('-'.join(p.capitalize() if p.lower() not in lowercase_words or i == 0 else p.lower() for p in parts))
        elif w.lower() in lowercase_words and i > 0 and i < len(words) - 1:
            result.append(w.lower())
        else:
            result.append(w.capitalize())
    return ' '.join(result)

def build_cc_image_url(inv_num):
    """Build CC imageproxy URL from inventory number."""
    inv_encoded = inv_num.replace(' ', '%20').replace('/', '%2F').replace(';', '%3B')
    return f"https://collections.chateauversailles.fr/cc/imageproxy.aspx?filename=objectimages%2F{inv_encoded}_001.cci&width=800&height=800"

def build_source_url(inv_num):
    """Build CC collection source URL."""
    return f"https://collections.chateauversailles.fr/#id={inv_num}"

def main():
    print("Loading Joconde cache...")
    with open(JOCONDE_CACHE) as f:
        joconde_records = json.load(f)
    print(f"  Total records: {len(joconde_records)}")
    
    # Filter paintings only
    paintings = [
        rec for rec in joconde_records
        if isinstance(rec.get('domaine', []), list) 
        and any('peinture' in d.lower() for d in rec.get('domaine', []))
    ]
    print(f"  Paintings: {len(paintings)}")
    
    # Build items
    items = []
    seen_invs = set()
    
    for idx, rec in enumerate(paintings):
        inv_raw = rec.get('numero_inventaire', '')
        primary_inv = primary_inv_number(inv_raw)
        
        if not primary_inv:
            continue
        
        # Deduplicate by primary inventory number
        if primary_inv in seen_invs:
            continue
        seen_invs.add(primary_inv)
        
        titre = rec.get('titre', '') or ''
        auteur = rec.get('auteur', '') or ''
        millesime = rec.get('millesime_de_creation')
        millesime_used = rec.get('millesime_d_utilisation')
        millesime_final = millesime or millesime_used
        materiaux = rec.get('materiaux_techniques', '')
        mesures = rec.get('mesures', '')
        periode = rec.get('periode_de_creation', '')
        ecole = rec.get('ecole_pays', '')
        
        year = extract_year(millesime_final)
        
        item = {
            "id": f"versailles-{idx+1}",
            "inventoryNumber": primary_inv,
            "allInventoryNumbers": inv_raw.strip() if inv_raw else primary_inv,
            "title": format_title(titre) if titre else "Palace of Versailles Artwork",
            "artist": clean_artist(auteur),
            "year": year,
            "date": str(millesime_final) if millesime_final else (str(periode) if periode else ''),
            "medium": format_medium(materiaux),
            "dimensions": format_dimensions(mesures),
            "school": str(ecole) if ecole else '',
            "department": "Peintures",
            "category": "Painting",
            "image": build_cc_image_url(primary_inv),
            "sourceUrl": build_source_url(primary_inv),
            "museum": "Palace of Versailles",
            "type": "2D"
        }
        items.append(item)
    
    print(f"\nBuilt {len(items)} items")
    
    # Stats
    has_title = sum(1 for x in items if x['title'] != 'Palace of Versailles Artwork')
    has_artist = sum(1 for x in items if x['artist'])
    has_year = sum(1 for x in items if x['year'] and x['year'] > 0)
    has_medium = sum(1 for x in items if x['medium'])
    print(f"  Real title: {has_title}/{len(items)} ({100*has_title//len(items)}%)")
    print(f"  Artist: {has_artist}/{len(items)} ({100*has_artist//len(items)}%)")
    print(f"  Year: {has_year}/{len(items)} ({100*has_year//len(items)}%)")
    print(f"  Medium: {has_medium}/{len(items)} ({100*has_medium//len(items)}%)")
    
    # Sample
    print("\nSample items:")
    for x in items[:3]:
        print(f"  [{x['inventoryNumber']}] {x['title'][:50]} | artist={x['artist']} | year={x['year']} | medium={x['medium'][:40] if x['medium'] else ''}")
    
    # Write
    collection = {
        "collection": "Palace of Versailles",
        "museum": "Palace of Versailles",
        "scrapedAt": "2026-02-21T00:00:00.000Z",
        "enrichedAt": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        "source": "Joconde (data.culture.gouv.fr) + CC imageproxy",
        "totalItems": len(items),
        "objects": items
    }
    
    output_path = '/Users/kietzsche/armin-web-main/public/data/versailles-collection.json'
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(collection, f, ensure_ascii=False, indent=2)
    print(f"\nWrote {len(items)} items to versailles-collection.json")

if __name__ == '__main__':
    main()
