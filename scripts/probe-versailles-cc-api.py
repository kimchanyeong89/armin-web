#!/usr/bin/env python3
"""
Test if the Versailles CC API can be accessed directly without a browser.
"""
import json
import urllib.request
import urllib.parse
import ssl
import sys

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

BASE_URL = 'https://collections.chateauversailles.fr'

def post_json(url, data):
    payload = json.dumps(data).encode('utf-8')
    req = urllib.request.Request(url, data=payload, method='POST')
    req.add_header('Content-Type', 'application/json')
    req.add_header('Accept', 'application/json, text/javascript, */*; q=0.01')
    req.add_header('X-Requested-With', 'XMLHttpRequest')
    req.add_header('Origin', BASE_URL)
    req.add_header('Referer', f'{BASE_URL}/')
    req.add_header('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
    try:
        with urllib.request.urlopen(req, timeout=30, context=ctx) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        print(f'HTTP Error {e.code}: {e.read()[:200]}')
        return None
    except Exception as e:
        print(f'Error: {e}')
        return None

# First, try to get the home page to fetch any cookies
print("Testing CC API without auth token...")

# Try common search spec formats
# Format 1: Simple searchall
search_spec_1 = {
    "searchall": "*",
    "domaine": "Peintures",
    "sort": "Relevance",
    "showtype": "icons",
    "first": 0,
    "numPerPage": 5
}

# Format 2: Query-based
search_spec_2 = {
    "query": "searchall=*&domain=Peintures&sort=Relevance",
    "first": 0,
    "numPerPage": 5
}

# Format 3: Direct fields
search_spec_3 = {
    "searchall": "*",
    "first": 0,
    "numPerPage": 5,
    "showtype": "icons"
}

for i, spec in enumerate([search_spec_1, search_spec_2, search_spec_3], 1):
    print(f"\n--- Test {i}: {list(spec.keys())} ---")
    result = post_json(f'{BASE_URL}/cc/ccConnector.asmx/search', {
        'authToken': '',
        'searchSpec': spec
    })
    if result:
        print(f'Keys: {list(result.keys())}')
        if 'd' in result:
            inner = result['d']
            if isinstance(inner, str):
                parsed = json.loads(inner)
                print(f'Inner keys: {list(parsed.keys())}')
                if 'resultCount' in parsed:
                    print(f'Total: {parsed["resultCount"]}')
                if 'result' in parsed:
                    print(f'HTML snippet: {parsed["result"][:200]}')
            elif isinstance(inner, dict):
                print(f'Inner keys: {list(inner.keys())}')
    else:
        print('No result')
