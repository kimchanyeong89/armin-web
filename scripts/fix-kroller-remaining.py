#!/usr/bin/env python3
import json

fixes = {
    "china-ancestor-portrait": {"artist": "Unknown (Chinese)"},
    "china-ancestor-portrait-1": {"artist": "Unknown (Chinese)"},
    "j-c-j-vanderheyden-horizon-painting": {"artist": "J.C.J. Vanderheyden"},
    "j-c-j-vanderheyden-yellow-frame": {"artist": "J.C.J. Vanderheyden"},
    "j-c-fernie-i-called-myself-mollusk-for-the-sake-of-the-game": {"artist": "J.C. Fernie"},
}

files = [
    "public/data/kroller-muller-paintings.json",
    "public/data/kroller-muller-photography.json",
]

for fn in files:
    with open(fn) as f:
        data = json.load(f)
    changed = 0
    for item in data["items"]:
        item_id = item.get("id", "")
        if item_id in fixes:
            for k, v in fixes[item_id].items():
                item[k] = v
            changed += 1
    if changed:
        with open(fn, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"Fixed {changed} in {fn.split('/')[-1]}")

print("Done. Final audit:")
for fn in files + ["public/data/kroller-muller-film-video.json"]:
    with open(fn) as f:
        data = json.load(f)
    items = data["items"]
    no_artist = [x for x in items if not x.get("artist")]
    no_year = [x for x in items if not x.get("year")]
    print(f"  {fn.split('/')[-1]}: {len(items)} items, {len(no_artist)} missing artist, {len(no_year)} missing year")
