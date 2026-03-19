#!/usr/bin/env python3
"""Test grandpalaisrmn.fr hotlink protection by simulating browser vs no-referer requests"""
import urllib.request, ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

test_url = "https://images.grandpalaisrmn.fr/thumb.php/01827658.jpg?ID=3023280"

PLACEHOLDER_SIZE = 89097  # Known placeholder size from previous session

tests = [
    ("Python/no-referer", {"User-Agent": "Mozilla/5.0 Chrome/120"}),
    ("Python/rmn-referer", {"User-Agent": "Mozilla/5.0 Chrome/120", "Referer": "https://images.grandpalaisrmn.fr/"}),
    ("Python/carnavalet-referer", {"User-Agent": "Mozilla/5.0 Chrome/120", "Referer": "https://www.carnavalet.paris.fr/"}),
    ("Python/armin-referer", {"User-Agent": "Mozilla/5.0 Chrome/120", "Referer": "https://armin.art/"}),
    ("Python/localhost-referer", {"User-Agent": "Mozilla/5.0 Chrome/120", "Referer": "http://localhost:5173/"}),
    ("Python/no-headers", {}),
    ("Python/with-id-3023280", {"User-Agent": "Mozilla/5.0 Chrome/120", "Referer": "https://collections.grandpalaisrmn.fr/"}),
]

for name, headers in tests:
    try:
        req = urllib.request.Request(test_url, headers=headers)
        r = urllib.request.urlopen(req, timeout=10, context=ctx)
        data = r.read()
        is_placeholder = len(data) == PLACEHOLDER_SIZE
        print(f"{name}: {len(data):,} bytes {'*** PLACEHOLDER ***' if is_placeholder else 'OK'}")
    except Exception as e:
        print(f"{name}: ERROR {str(e)[:60]}")
