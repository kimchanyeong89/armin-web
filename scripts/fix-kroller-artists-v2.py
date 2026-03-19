#!/usr/bin/env python3
"""
Fix bad artist name extractions in Kröller-Müller JSON files.
Also verify film-video.json was fixed by the previous script.
"""
import json
import re

# Manual corrections for known bad slug extractions
# Maps (partial) current artist value -> correct value
ARTIST_CORRECTIONS = {
    # Country/nationality slugs → clear
    "China Ancestor": "",
    "China Seated": "",
    "China Head": "",
    "China Fu": "",
    "China Vase": "",
    "China Bowl": "",
    "China Plate": "",
    "China Dish": "",
    "China Jar": "",
    "China Panel": "",
    "China Screen": "",
    "China Saucer": "",
    "China Cup": "",
    "China Teapot": "",
    "China Tiger": "",
    "China Dragon": "",
    "China Figure": "",
    "China Calligraphy": "",
    "China Album": "",
    "China Scholar": "",
    
    # Multi-word artist slug issues
    "Gilbert George": "Gilbert & George",
    "Richard Long A": "Richard Long",
    "Richard Long W": "Richard Long",
    "Richard Long S": "Richard Long",
    "Richard Long T": "Richard Long",
    "Richard Long F": "Richard Long",
    "Richard Long B": "Richard Long",
    "Richard Long C": "Richard Long",
    "Richard Long M": "Richard Long",
    "Richard Long N": "Richard Long",
    "Richard Long O": "Richard Long",
    "Richard Long D": "Richard Long",
    "Richard Long L": "Richard Long",
    "Richard Long I": "Richard Long",
    "Richard Long P": "Richard Long",
    "Richard Long E": "Richard Long",
    "Richard Long H": "Richard Long",
    "Richard Long K": "Richard Long",
    "Richard Long G": "Richard Long",
    "Richard Long R": "Richard Long",
    "Richard Long U": "Richard Long",
    "Richard Long V": "Richard Long",
    "Richard Long Y": "Richard Long",
    "Richard Long J": "Richard Long",
    "Richard Long Q": "Richard Long",
    "Richard Long X": "Richard Long",
    "Richard Long Z": "Richard Long",
    "Hilla Cooling": "Hilla Becher",
    "Anne Geene Book": "Anne Geene",
    "Anne Geene Cactus": "Anne Geene",
    "Anne Geene Dandelion": "Anne Geene",
    "Anne Geene Artichoke": "Anne Geene",
    "Anne Geene Game": "Anne Geene",
    "Anne Geene Biology": "Anne Geene",
    "Anne Geene Botanical": "Anne Geene",
    "Anne Geene Collection": "Anne Geene",
    "Anne Geene Cow": "Anne Geene",
    "Anne Geene Flower": "Anne Geene",
    "Anne Geene Grass": "Anne Geene",
    "Anne Geene Hooked": "Anne Geene",
    "Anne Geene Apple": "Anne Geene",
    "Abramovic Ulay": "Marina Abramović / ULAY",
    "Marina Abramovic": "Marina Abramović",
    "Marina Abramovic Relation": "Marina Abramović / ULAY",
    "Jean Marc": "Jean-Marc Bustamante",
    "Jean-marc Bustamante": "Jean-Marc Bustamante",
    "Art Oriente": "Art Orienté Objet",
    "Lon Robbe I": "Lon Robbe",
    "J C": "",  # probably bad extraction
    "Rob Sweere S": "Rob Sweere",
    "Jeff Wall S": "Jeff Wall",
    "Jeff Wall M": "Jeff Wall",
    "Jeff Wall C": "Jeff Wall",
    "Jeff Wall A": "Jeff Wall",
    "Jeff Wall D": "Jeff Wall",
    "Jeff Wall W": "Jeff Wall",
    "Roger Cutforth B": "Roger Cutforth",
    "Gerard Byrne A": "Gerard Byrne",
    "Willie Doherty O": "Willie Doherty",
    "Willie Doherty N": "Willie Doherty",
    "Willie Doherty S": "Willie Doherty",
    "Hamish Fulton A": "Hamish Fulton",
    "Hamish Fulton K": "Hamish Fulton",
    "Hamish Fulton S": "Hamish Fulton",
    "Hamish Fulton C": "Hamish Fulton",
    "Hamish Fulton T": "Hamish Fulton",
    "Hamish Fulton L": "Hamish Fulton",
    "Hamish Fulton M": "Hamish Fulton",
    "Hamish Fulton O": "Hamish Fulton",
    "Hamish Fulton F": "Hamish Fulton",
    "Hamish Fulton E": "Hamish Fulton",
    "Hamish Fulton H": "Hamish Fulton",
    "Hamish Fulton N": "Hamish Fulton",
    "Hamish Fulton R": "Hamish Fulton",
    "Hamish Fulton W": "Hamish Fulton",
    "Lucas Lenglet D": "Lucas Lenglet",
    "Sjoerd Buisman T": "Sjoerd Buisman",
    "Peter Struycken C": "Peter Struycken",
    "Gerard Van": "Gerard van Honthorst",
    "Jenny Holzer U": "Jenny Holzer",
    "Jenny Holzer F": "Jenny Holzer",
    "Jenny Holzer S": "Jenny Holzer",
    "Jenny Holzer A": "Jenny Holzer",
    "Jenny Holzer T": "Jenny Holzer",
    "Jenny Holzer W": "Jenny Holzer",
    "Jenny Holzer I": "Jenny Holzer",
    "Jenny Holzer E": "Jenny Holzer",
    "Jenny Holzer C": "Jenny Holzer",
    "Jenny Holzer L": "Jenny Holzer",
    "Jenny Holzer B": "Jenny Holzer",
    "Jenny Holzer H": "Jenny Holzer",
    "Jenny Holzer M": "Jenny Holzer",
    "Jenny Holzer N": "Jenny Holzer",
    "Jenny Holzer O": "Jenny Holzer",
    "Jenny Holzer P": "Jenny Holzer",
    "Jenny Holzer D": "Jenny Holzer",
    "Jenny Holzer G": "Jenny Holzer",
    "Jenny Holzer K": "Jenny Holzer",
    "Jenny Holzer R": "Jenny Holzer",
    "Jenny Holzer V": "Jenny Holzer",
    "Jenny Holzer X": "Jenny Holzer",
    "Jenny Holzer Y": "Jenny Holzer",
    "Jenny Holzer Z": "Jenny Holzer",
    "Jenny Holzer J": "Jenny Holzer",
    "Jenny Holzer Q": "Jenny Holzer",
}

# Regex pattern: "FirstName LastName SingleLetter" → "FirstName LastName"
TRAILING_SINGLE_LETTER = re.compile(r'^(.+) [A-Z]$')

def fix_artist(artist):
    """Fix a potentially bad artist name."""
    if not artist:
        return artist
    
    # Direct match in corrections
    if artist in ARTIST_CORRECTIONS:
        return ARTIST_CORRECTIONS[artist]
    
    # Check if it starts with any key (handles partial matches)
    for bad, good in ARTIST_CORRECTIONS.items():
        if artist.startswith(bad) and len(artist) > len(bad):
            # This was a truncated match
            return good if good else ""
    
    # Generic fix: "FirstName LastName SingleLetter" → "FirstName LastName"
    # Only if 3 words where last is single uppercase letter
    parts = artist.split()
    if len(parts) == 3 and len(parts[2]) == 1 and parts[2].isupper():
        return f"{parts[0]} {parts[1]}"
    
    return artist

def process_file(filename):
    with open(filename) as f:
        data = json.load(f)
    
    changed = 0
    cleared = 0
    no_artist = 0
    
    for item in data['items']:
        original = item.get('artist', '')
        
        if not original:
            no_artist += 1
            continue
        
        fixed = fix_artist(original)
        
        if fixed != original:
            if fixed == "":
                # Only clear if it was a bad extraction (country name)
                del item['artist']
                cleared += 1
            else:
                item['artist'] = fixed
            changed += 1
    
    print(f"\n{filename.split('/')[-1]}:")
    print(f"  Changed: {changed}, Cleared: {cleared}, Still no artist: {no_artist}")
    
    # Write back
    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

# Also do a final audit of what's left
def audit_file(filename):
    with open(filename) as f:
        data = json.load(f)
    items = data['items']
    no_artist = [x for x in items if not x.get('artist')]
    print(f"\nAudit {filename.split('/')[-1]}: {len(items)} total, {len(no_artist)} without artist")
    if no_artist[:5]:
        print("  Sample missing:", [x.get('id', '?')[:50] for x in no_artist[:5]])

files = [
    'public/data/kroller-muller-paintings.json',
    'public/data/kroller-muller-photography.json',
    'public/data/kroller-muller-film-video.json',
]

print("=== Phase 1: Fix bad artist names ===")
for f in files:
    process_file(f)

print("\n=== Phase 2: Audit remaining gaps ===")
for f in files:
    audit_file(f)
