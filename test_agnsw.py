import json

manifest = json.load(open('public/data/search-manifest.json'))
agnsw = []

for chunk_file in manifest['chunks']:
    data = json.load(open(f'public/data/{chunk_file}'))
    artworks = data[0] if isinstance(data[0], list) else data
    for art in artworks:
        if art.get('e') == 'agnsw-collection':
            agnsw.append(art)
            if len(agnsw) >= 5:
                break
    if len(agnsw) >= 5: break

if len(agnsw) == 0:
    print("NO AGNSW found")
else:
    for art in agnsw:
        print(art.get('id'), art.get('i'))

