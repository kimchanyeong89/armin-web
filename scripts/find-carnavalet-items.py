#!/usr/bin/env python3
"""Find specific carnavalet items by title keywords"""
import json

search_terms = ["Livraison de Voitures", "Le Pont Marie", "Cavaliers et attelages", "Fauret", "Ceria", "Stein Georges"]

for fn in ['public/data/carnavalet-paintings.json', 'public/data/carnavalet-prints.json', 'public/data/carnavalet-collection.json']:
    with open(fn) as f:
        d = json.load(f)
    items = d if isinstance(d, list) else (d.get('objects') or d.get('artworks') or d.get('items') or [])
    print(f"\n{fn.split('/')[-1]} ({len(items)} items):")
    for term in search_terms:
        found = [x for x in items if term.lower() in (x.get('title','') + x.get('artist','')).lower()]
        if found:
            for x in found[:2]:
                img = x.get('image') or x.get('imageUrl') or 'NO IMAGE'
                print(f"  FOUND '{term}': {x.get('title','?')[:60]} | {x.get('artist','')} | img={img[:60] if img != 'NO IMAGE' else 'NO IMAGE'}")
        else:
            print(f"  NOT FOUND: '{term}'")
