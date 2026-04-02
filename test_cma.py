import json
from pathlib import Path

manifest = json.loads(Path("public/data/search-manifest.json").read_text())
cma_total = 0
for chunk in manifest.get("chunks", []):
    data = json.loads((Path("public/data") / chunk).read_text())
    arts = data[0] if isinstance(data[0], list) else data
    for art in arts:
        if art.get("e") == "cma-collection":
            cma_total += 1
            
print(f"cma-collection from manifest: {cma_total}")

successes = 0
for line in open("embedding_results/siglip_embeddings.jsonl"):
    if '"e": "cma-collection"' in line:
        successes += 1
print(f"cma-collection occurrences in siglip_embeddings.jsonl: {successes}")
