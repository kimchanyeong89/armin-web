#!/usr/bin/env python3
"""
Replay siglip_upload_retry_missing.jsonl, handling Vectorize's 64-byte
ID cap.

Vectorize rejects an entire `/upsert` batch if any single ID exceeds 64
bytes — so the original retry file ended up with a mix of (1) actually-
long IDs that need shortening and (2) short IDs that were collateral
damage from sharing a batch with a long one.

This script:
  1. Splits retry items into short (≤64 bytes) and long (>64 bytes).
  2. Re-uploads short ones as-is.
  3. For long ones, builds a deterministic shortened ID (first 50 chars
     of original + "-" + first 8 of MD5(original)), writes an entry into
     `public/semantic-id-overrides.json` so the frontend's vector-store
     lookup uses the short ID, and uploads with that short ID.
  4. Anything that still fails after this is logged to
     `siglip_upload_retry_missing.persistent.jsonl` for human inspection.

Re-runs are safe: existing override entries are preserved; the script
only adds/updates entries for items being processed in this run.
"""
import hashlib
import json
import time
from pathlib import Path

import requests

ROOT = Path('/Users/kietzsche/armin-web-main')
SRC = ROOT / 'siglip_upload_retry_missing.jsonl'
OVERRIDES = ROOT / 'public/semantic-id-overrides.json'
PERSISTENT_FAIL = ROOT / 'siglip_upload_retry_missing.persistent.jsonl'

URL = 'https://armin-semantic-search.armin-art.workers.dev/upsert'
BATCH = 50
TIMEOUT = 30
ID_MAX = 64
SHORT_PREFIX = 50  # leaves room for '-' + 8-char hash + safety margin


def short_id(long_id: str) -> str:
    """Deterministic shortening: first SHORT_PREFIX chars + '-' + 8-char md5."""
    h = hashlib.md5(long_id.encode('utf-8')).hexdigest()[:8]
    return f"{long_id[:SHORT_PREFIX]}-{h}"


def upload_chunk(chunk):
    """Single attempt. Returns (ok: bool, error: str|None)."""
    try:
        resp = requests.post(URL, json={'vectors': chunk}, timeout=TIMEOUT)
        if resp.status_code == 200:
            data = resp.json()
            if data.get('success', True):
                return True, None
            return False, data.get('error', 'unknown')
        return False, f"HTTP {resp.status_code}: {resp.text[:120]}"
    except Exception as e:
        return False, str(e)[:120]


def upload_batched(records, label):
    """Batch records and upload; return (ok_count, fail_records)."""
    ok = 0
    failed = []
    for i in range(0, len(records), BATCH):
        chunk = records[i:i+BATCH]
        last_err = None
        for attempt in range(3):
            success, err = upload_chunk(chunk)
            if success:
                ok += len(chunk)
                break
            last_err = err
            time.sleep(2 ** attempt)
        else:
            for r in chunk:
                failed.append({**r, '_error': last_err})
        if (i // BATCH) % 10 == 0:
            print(f'  [{label}] {ok:,} ok, {len(failed):,} fail '
                  f'({i + len(chunk):,}/{len(records):,})', flush=True)
    print(f'  [{label}] complete: ok={ok:,} fail={len(failed):,}')
    return ok, failed


def main():
    print(f'Reading {SRC}…')
    short_records = []
    long_records = []   # records whose id > 64 bytes
    with open(SRC) as f:
        for line in f:
            s = line.strip()
            if not s:
                continue
            try:
                r = json.loads(s)
            except Exception:
                continue
            if not r.get('id') or not r.get('vector'):
                continue
            if len(r['id'].encode('utf-8')) > ID_MAX:
                long_records.append(r)
            else:
                short_records.append(r)
    print(f'  {len(short_records):,} short  |  {len(long_records):,} long')

    # ── 1. Short-ID records: upload directly
    short_payload = [
        {'id': r['id'], 'values': r['vector'],
         'metadata': {'e': r.get('e', '')}}
        for r in short_records
    ]
    print(f'\n► Uploading {len(short_payload):,} short-ID records…')
    short_ok, short_fail = upload_batched(short_payload, 'short')

    # ── 2. Long-ID records: shorten + record override + upload
    print(f'\n► Shortening {len(long_records):,} long-ID records…')
    overrides = {}
    if OVERRIDES.exists():
        try:
            overrides = json.loads(OVERRIDES.read_text())
        except Exception:
            overrides = {}

    long_payload = []
    new_overrides = 0
    for r in long_records:
        original = r['id']
        sid = short_id(original)
        e = r.get('e', '')
        if e:
            overrides.setdefault(e, {})
            if overrides[e].get(original) != sid:
                overrides[e][original] = sid
                new_overrides += 1
        long_payload.append({
            'id': sid,
            'values': r['vector'],
            'metadata': {'e': e, 'long_id': original[:240]},
        })

    if new_overrides:
        OVERRIDES.write_text(json.dumps(overrides, ensure_ascii=False))
        print(f'  Added/updated {new_overrides:,} entries in {OVERRIDES.name}')

    print(f'► Uploading {len(long_payload):,} shortened-ID records…')
    long_ok, long_fail = upload_batched(long_payload, 'long')

    # ── 3. Persistent failures
    persistent = short_fail + long_fail
    if persistent:
        with open(PERSISTENT_FAIL, 'w', encoding='utf-8') as f:
            for rec in persistent:
                f.write(json.dumps(rec, ensure_ascii=False) + '\n')
        print(f'\n⚠️  {len(persistent):,} persistent failures written to '
              f'{PERSISTENT_FAIL.name}')
    else:
        print('\n✨ Zero persistent failures.')
        # Archive the source retry file
        archived = SRC.with_suffix('.replayed.jsonl')
        SRC.rename(archived)
        print(f'   Archived {SRC.name} → {archived.name}')

    print('\n=== Summary ===')
    print(f'  Short-ID:     {short_ok:>5,}/{len(short_records):,} uploaded')
    print(f'  Long-ID:      {long_ok:>5,}/{len(long_records):,} uploaded '
          f'(shortened, override entries written)')
    print(f'  Total:        {short_ok + long_ok:,} uploaded, '
          f'{len(persistent):,} still failing')


if __name__ == '__main__':
    main()
