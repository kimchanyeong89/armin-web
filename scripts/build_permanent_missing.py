#!/usr/bin/env python3
"""
Build the missing-items table.

For each permanent exhibition in src/data/exhibitions.js:
  - Resolve its collection file (collectionFile field, or fall back to {id}.json)
  - Open the JSON and enumerate item IDs (using the same logic as the
    embedding script: native id from item, else `{exh_id}-{idx}`)
  - Cross-reference against siglip_processed_ids.txt (the master list of
    every ID the embedding pipeline has touched, success OR fail)
  - Report total / embedded / missing per collection

Outputs:
  - PERMANENT_MISSING.md (the human-readable table)
  - permanent_missing_pending.jsonl (one record per missing item:
    {id, e: exh_id, i: image_url} — fed straight to the embedding script)
"""
import json, os, re, sys
from pathlib import Path

ROOT = Path('/Users/kietzsche/armin-web-main')
EXH_FILE = ROOT / 'src/data/exhibitions.js'
DATA_DIR = ROOT / 'public/data'
PROCESSED = ROOT / 'siglip_processed_ids.txt'
OVERRIDES = ROOT / 'public/semantic-id-overrides.json'

# ── 1. Load processed IDs (the source of truth)
processed = set()
if PROCESSED.exists():
    with open(PROCESSED) as f:
        for line in f:
            s = line.strip()
            if s:
                processed.add(s)
print(f'Processed IDs in master list: {len(processed):,}')

# ── 2. Parse exhibitions.js for permanent exhibitions
text = EXH_FILE.read_text()

# Strategy: find each permanentExhibitions: [...] block and parse its entries
# Each entry has at minimum {id, name, ...} and optionally collectionFile
# Approach: scan for "permanentExhibitions: [" then bracket-match to find the array

def parse_permanent_blocks(text):
    """Return a list of (museum_id, [exhibition_dicts]) tuples."""
    out = []
    i = 0
    while True:
        idx = text.find('permanentExhibitions:', i)
        if idx < 0:
            break
        # find the museum id (search backwards for `id: "..."`)
        back = text.rfind('id:', max(0, idx - 1500), idx)
        museum_id = ''
        if back >= 0:
            m = re.search(r'id:\s*["\']([^"\']+)["\']', text[back:idx])
            if m:
                museum_id = m.group(1)
        # find the [..] array bounds
        arr_start = text.find('[', idx)
        if arr_start < 0:
            i = idx + 1
            continue
        depth = 0
        j = arr_start
        while j < len(text):
            c = text[j]
            if c == '[':
                depth += 1
            elif c == ']':
                depth -= 1
                if depth == 0:
                    break
            j += 1
        arr_text = text[arr_start:j+1]
        # extract each {...} entry
        entries = []
        k = 0
        while k < len(arr_text):
            obj_start = arr_text.find('{', k)
            if obj_start < 0:
                break
            depth = 0
            m = obj_start
            while m < len(arr_text):
                ch = arr_text[m]
                if ch == '{':
                    depth += 1
                elif ch == '}':
                    depth -= 1
                    if depth == 0:
                        break
                m += 1
            obj_text = arr_text[obj_start:m+1]
            entries.append(obj_text)
            k = m + 1
        out.append((museum_id, entries))
        i = j + 1
    return out

permanent = parse_permanent_blocks(text)

# ── 3. For each permanent exhibition, resolve its collection file
def parse_entry(s):
    eid_m = re.search(r'\bid:\s*["\']([^"\']+)["\']', s)
    cf_m  = re.search(r'collectionFile:\s*["\']([^"\']+)["\']', s)
    name_m = re.search(r'\bname:\s*["\']([^"\']+)["\']', s)
    return {
        'id': eid_m.group(1) if eid_m else '',
        'collectionFile': cf_m.group(1) if cf_m else '',
        'name': name_m.group(1) if name_m else ''
    }

candidates = []  # list of {museum_id, exh_id, name, collectionFile, file_resolved}
for museum_id, entries in permanent:
    for entry in entries:
        e = parse_entry(entry)
        if not e['id']:
            continue
        cfile = e['collectionFile']
        if not cfile:
            # Fallback: {exh_id}.json
            guess = f"{e['id']}.json"
            if (DATA_DIR / guess).exists():
                cfile = guess
        e['file_resolved'] = cfile
        e['museum_id'] = museum_id
        candidates.append(e)

print(f'Permanent exhibitions found: {len(candidates)}')

# ── 4. Load semantic-id overrides
overrides = {}
if OVERRIDES.exists():
    overrides = json.loads(OVERRIDES.read_text())

# ── 5. For each, count items and gap
def extract_items(data):
    if isinstance(data, list):
        return data
    for k in ('artworks', 'objects', 'items', 'results'):
        if k in data and isinstance(data[k], list):
            return data[k]
    return []

def native_id(a):
    return str(
        a.get('id') or a.get('objectNumber') or a.get('registrationNumber') or
        a.get('inventoryNumber') or a.get('accessionNum') or ''
    ).strip()

def image_url(a):
    img = str(
        a.get('image') or a.get('imageUrl') or a.get('img') or
        a.get('i') or a.get('original_image') or ''
    ).strip()
    if not img and isinstance(a.get('primaryImage'), dict):
        iiif = a['primaryImage'].get('iiifUrl') or a['primaryImage'].get('iiifurl', '')
        if iiif and 'nga.gov' in iiif:
            img = iiif.rstrip('/') + '/full/800,/0/default.jpg'
    return img

table = []  # rows for the markdown table
pending_records = []  # for the JSONL output

for c in candidates:
    eid = c['id']
    cf = c['file_resolved']
    if not cf:
        table.append({**c, 'total': 0, 'embedded': 0, 'missing': 0, 'note': 'no collection file'})
        continue
    fpath = DATA_DIR / cf
    if not fpath.exists():
        table.append({**c, 'total': 0, 'embedded': 0, 'missing': 0, 'note': f'missing {cf}'})
        continue
    try:
        data = json.loads(fpath.read_text())
    except Exception as e:
        table.append({**c, 'total': 0, 'embedded': 0, 'missing': 0, 'note': f'parse error: {e}'})
        continue
    items = extract_items(data)
    total = 0
    embedded = 0
    missing_items = []
    exh_overrides = overrides.get(eid, {})
    for idx, a in enumerate(items):
        nid = native_id(a)
        vec_id = exh_overrides.get(nid, nid) if nid else f'{eid}-{idx}'
        if not vec_id:
            continue
        total += 1
        if vec_id in processed:
            embedded += 1
        else:
            img = image_url(a)
            if img:
                missing_items.append({'id': vec_id, 'e': eid, 'i': img})
    table.append({**c, 'total': total, 'embedded': embedded, 'missing': total - embedded,
                  'with_image': len(missing_items), 'note': ''})
    pending_records.extend(missing_items)

# ── 6. Sort by missing count (desc) and write markdown
table.sort(key=lambda r: -r.get('missing', 0))

md_lines = [
    '# Missing Permanent-Exhibition Embeddings',
    '',
    f'Generated by analyzing `siglip_processed_ids.txt` (master, {len(processed):,} IDs) against',
    f'every `permanentExhibitions[]` entry in `src/data/exhibitions.js`.',
    '',
    '## Per-collection breakdown',
    '',
    '| Museum | Exh ID | Collection file | Total | Embedded | Missing | With image | Note |',
    '|---|---|---|---:|---:|---:|---:|---|',
]
total_missing = 0
total_with_image = 0
for r in table:
    total_missing += r.get('missing', 0)
    total_with_image += r.get('with_image', 0)
    md_lines.append(
        f"| `{r['museum_id']}` | `{r['id']}` | `{r['file_resolved'] or '—'}` | "
        f"{r['total']:,} | {r['embedded']:,} | **{r['missing']:,}** | "
        f"{r.get('with_image', 0):,} | {r['note']} |"
    )
md_lines += [
    '',
    f'**Total missing across permanent collections: {total_missing:,}**',
    f'**Of those, {total_with_image:,} have an image URL and are queueable for embedding.**',
    '',
    'The corresponding pending records are written to '
    '`permanent_missing_pending.jsonl` (one JSON object per line: '
    '`{"id": ..., "e": exhibition_id, "i": image_url}`).',
]

(ROOT / 'PERMANENT_MISSING.md').write_text('\n'.join(md_lines))
with open(ROOT / 'permanent_missing_pending.jsonl', 'w') as f:
    for r in pending_records:
        f.write(json.dumps(r, ensure_ascii=False) + '\n')

# Print summary
print()
print('=== TOP 20 MISSING ===')
for r in table[:20]:
    print(f"  {r['id']:35s}  total={r['total']:>6,}  missing={r['missing']:>6,}  ({r.get('note','')})")
print()
print(f'TOTAL MISSING: {total_missing:,}')
print(f'WITH IMAGE (queueable): {total_with_image:,}')
print(f'Wrote: PERMANENT_MISSING.md, permanent_missing_pending.jsonl')
