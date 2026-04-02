import re

with open('src/components/ExhibitionModal.tsx', 'r') as f:
    text = f.read()

# Remove duplicate "sculptures"
text = re.sub(r'(\s*"sculptures": "Sculpture",\n)+', r'\n    "sculptures": "Sculpture",\n', text)
text = re.sub(r'(\s*"photography": "Photography",\n)+', r'\n    "photography": "Photography",\n', text)
text = re.sub(r'(\s*"posters": "Posters",\n)+', r'\n    "posters": "Posters",\n', text)

with open('src/components/ExhibitionModal.tsx', 'w') as f:
    f.write(text)

with open('src/components/InteractiveGlobeMap/InteractiveGlobeRealModal.tsx', 'r') as f:
    text2 = f.read()

text2 = re.sub(r"(\s*'egyptian-museum-cairo-collection': '/data/egyptian-museum-cairo-collection\.json',\n)+", r"\n          'egyptian-museum-cairo-collection': '/data/egyptian-museum-cairo-collection.json',\n", text2)
text2 = re.sub(r"(\s*'conde-paintings': '/data/musee-conde-collection\.json',\n)+", r"\n          'conde-paintings': '/data/musee-conde-collection.json',\n", text2)

wimport re

with open('src/componeiv
with opp/InteractiveGlobeRealModal.tsx', 'w') as f:
    f.write(text2
# Remove duplicates text !")
