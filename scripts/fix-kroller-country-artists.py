#!/usr/bin/env python3
"""Fix remaining bad artist names from nationality-based slugs in paintings."""
import json

# Maps item id -> correct artist
ID_FIXES = {
    "china-scroll-painting": "Unknown (Chinese)",
    "china-scroll-painting-1": "Unknown (Chinese)",
    "china-white-eagle": "Unknown (Chinese)",
    "china-grazing-horses": "Unknown (Chinese)",
    "china-plants-with-butterfly-and-cricket": "Unknown (Chinese)",
    "japan-head-of-a-buddha": "Unknown (Japanese)",
    "japan-sitting-priest": "Unknown (Japanese)",
    "italie-the-adoration-of-the-kings": "Unknown (Italian)",
    "engeland-portrait-sketch-of-a-young-man": "Unknown (English)",
    "europa-portrait-of-a-lady": "Unknown (European)",
    "nederland-hurdy-gurdy-player-and-woman": "Unknown (Dutch)",
    "oceanie-oceania-masi-with-geometrical-pattern-polynesia-fiji": "Unknown (Polynesian)",
    "anoniem-flower-still-life": "Unknown",
    "anoniem-st-francis-receiving-the-stigmata": "Unknown",
}

# Also fix artists that still have bad nationality-slug extractions
# Pattern: "<Country> <Title words>" -> should be "Unknown (<Country>)"
COUNTRY_PREFIXES = {
    "China ": "Unknown (Chinese)",
    "Japan ": "Unknown (Japanese)",
    "Italie ": "Unknown (Italian)",
    "Engeland ": "Unknown (English)",
    "Europa ": "Unknown (European)",
    "Nederland ": "Unknown (Dutch)",
    "Oceanie ": "Unknown (Polynesian)",
    "Belgie ": "Unknown (Belgian)",
    "Frankrijk ": "Unknown (French)",
    "Giovanni Di Paolo The": "Giovanni di Paolo",
    "Sano Di Pietro": "Sano di Pietro",
}

fn = "public/data/kroller-muller-paintings.json"
with open(fn) as f:
    data = json.load(f)

changed = 0
for item in data["items"]:
    item_id = item.get("id", "")
    artist = item.get("artist", "")
    
    # Direct ID-based fix
    if item_id in ID_FIXES:
        new_artist = ID_FIXES[item_id]
        if new_artist != artist:
            item["artist"] = new_artist
            changed += 1
            print(f"  ID fix: {item_id} -> {new_artist}")
        continue
    
    # Pattern-based fix for remaining bad extractions
    for prefix, replacement in COUNTRY_PREFIXES.items():
        if artist.startswith(prefix) or artist == prefix.strip():
            item["artist"] = replacement
            changed += 1
            print(f"  Pattern fix: '{artist}' -> '{replacement}'")
            break

print(f"\nTotal changed: {changed}")

with open(fn, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

# Final verify
with open(fn) as f:
    data = json.load(f)
remaining = [x for x in data["items"] if not x.get("artist") or 
             any(x.get("artist","").startswith(p) for p in ["China ", "Japan ", "Italie ", "Engeland ", "Europa ", "Nederland ", "Oceanie ", "Belgie "])]
print(f"Still suspicious: {len(remaining)}")
for x in remaining[:5]:
    print(f"  {x.get('id','')} | {x.get('artist','')}")
