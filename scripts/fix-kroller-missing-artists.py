#!/usr/bin/env python3
"""
Scrapes Kröller-Müller artwork pages to fill missing artist fields.
Also extracts year from title string (e.g., "Title, 1981" -> year=1981)
"""
import json
import re
import time
import urllib.request
from pathlib import Path

DATA_DIR = Path('public/data')
FILES = [
    'kroller-muller-paintings.json',
    'kroller-muller-photography.json',
    'kroller-muller-film-video.json',
]

def fetch_artist_from_page(url):
    """Fetch an artwork page and extract the artist name."""
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=15) as resp:
            html = resp.read().decode('utf-8', errors='replace')
        # Try class="collection-meta__maker"
        m = re.search(r'class="collection-meta__maker"[^>]*>(.*?)</[a-z]', html, re.DOTALL)
        if m:
            return re.sub(r'<[^>]+>', '', m.group(1)).strip()
        # Try JSON-LD author
        m = re.search(r'"author"\s*:\s*\[\s*{\s*"name"\s*:\s*"([^"]+)"', html)
        if m:
            return m.group(1).strip()
        # Try "maker" span
        m = re.search(r'class="[^"]*maker[^"]*"[^>]*>\s*<(?:a|span)[^>]*>(.*?)</(?:a|span)>', html, re.DOTALL)
        if m:
            return re.sub(r'<[^>]+>', '', m.group(1)).strip()
        return None
    except Exception as e:
        print(f'  Error fetching {url}: {e}')
        return None


def extract_artist_from_slug(slug):
    """Try to extract artist name from the item slug.
    E.g., 'jenny-holzer-untitled-truisms-series' -> 'Jenny Holzer'
    Strategy: take the first 2-3 hyphenated words and title-case them.
    Works well for most Western names but needs validation.
    """
    if not slug:
        return None
    parts = slug.split('-')
    if len(parts) >= 2:
        # Most artists have 2 name parts (first + last)
        # E.g., jenny-holzer, cindy-sherman, richard-long
        # Some have one: hilla, unknown
        # Start with 2 parts and see if it looks like a name
        candidate2 = ' '.join(parts[:2]).title()
        candidate3 = ' '.join(parts[:3]).title()
        # Very basic heuristic: if the 3rd part is also short (<= 4 chars), use 3
        if len(parts) >= 3 and len(parts[2]) <= 4:
            return candidate3
        return candidate2
    return parts[0].title()


def extract_year_from_title(title):
    """Extract year from title like 'Work Title, 1981' or 'Work, 1984-1992'."""
    if not title:
        return None
    m = re.search(r',\s*(?:c\.\s*)?(\d{4})', title)
    if m:
        return int(m.group(1))
    m = re.search(r'\b(\d{4})\b', title)
    if m:
        yr = int(m.group(1))
        if 1400 <= yr <= 2025:
            return yr
    return None


def main():
    for fname in FILES:
        fpath = DATA_DIR / fname
        print(f'\nProcessing {fpath}...')
        with open(fpath) as f:
            data = json.load(f)
        
        items = data.get('items', [])
        changed = 0

        for item in items:
            # Fill missing artist
            if not item.get('artist'):
                # Try slug first
                slug_artist = extract_artist_from_slug(item.get('id', ''))
                if slug_artist:
                    item['artist'] = slug_artist
                    changed += 1
                    print(f'  Set artist from slug: {item["id"]} -> "{slug_artist}"')

            # Fill missing year by parsing title
            if not item.get('year') or item['year'] == 0:
                yr = extract_year_from_title(item.get('title', ''))
                if yr:
                    item['year'] = yr
                    if not item.get('date'):
                        item['date'] = str(yr)
                    changed += 1
                    print(f'  Set year from title: {item["id"]} -> {yr}')

        with open(fpath, 'w') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        print(f'  Done: {changed} items updated in {fname}')


if __name__ == '__main__':
    main()
