import json

c = 0
for line in open("siglip_failed.jsonl"):
    if "bruecke-museum-collection" in line:
        c += 1
print(f"Bruecke total failures lines: {c}")

with open("data/collections/search-manifest.json", "r") as f:
    man = json.loads(f.read())

br_count = 0
for chunk in man["chunks"]:
    for art in json.loads(open("data/collections/"+chunk).read()):
        if art.get("e") == "bruecke-museum-collection": br_count += 1
print(f"Bruecke total art dict items: {br_count}")
