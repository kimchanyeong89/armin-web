import re
import os
import sys

print("Starting audit script...", file=sys.stderr)

try:
    with open('src/data/exhibitions.js', 'r') as f:
        content = f.read()
    print(f"Read exhibitions.js: {len(content)} bytes", file=sys.stderr)

    # Simplified regex: iterate line by line or find simple patterns
    # Matches: { ... id: "X", ... collectionFile: "Y" }
    # but strictly catching id and collectionFile regardless of order or intervening chars on same line
    # Regex: id:\s*["']([^"']+)["'].*?collectionFile:\s*["']([^"']+)["']
    
    matches = re.findall(r'id:\s*["\']([^"\']+)["\'].*?collectionFile:\s*["\']([^"\']+)["\']', content)

    print(f"Found {len(matches)} matches via regex.", file=sys.stderr)
    
    # Also verify files
    public_files = set(os.listdir('public/data'))
    
    with open('src/components/ExhibitionModal.tsx', 'r') as f:
        modal_content = f.read()

    missing_files = []
    unmatched_ids = []

    for ex_id, ex_file in matches:
        if ex_file not in public_files:
            missing_files.append((ex_id, ex_file))
        
        # Check if ID is in modal
        if f"'{ex_id}'" not in modal_content and f'"{ex_id}"' not in modal_content:
             unmatched_ids.append(ex_id)

    # Output results to STDOUT
    print("\n=== AUDIT REPORT ===")
    print(f"Total Permanent Exhibitions Checked: {len(matches)}")
    print("\n--- Missing JSON Files ---")
    if not missing_files:
        print("None.")
    else:
        for mid, mfile in missing_files:
            print(f"MISSING: {mid} -> {mfile}")

    print("\n--- IDs Not Found in ExhibitionModal.tsx (Logic Missing) ---")
    if not unmatched_ids:
        print("None.")
    else:
        for uid in unmatched_ids:
            print(f"UNMATCHED: {uid}")

except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
