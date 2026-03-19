import re
import os

try:
    with open('src/data/exhibitions.js', 'r') as f:
        content = f.read()

    with open('src/components/ExhibitionModal.tsx', 'r') as f:
        modal_content = f.read()

    # Regex to capture id and collectionFile in the same object block roughly
    # We look for 'id:', quote, value, quote... capture... 'collectionFile:', quote, value, quote
    # This assumes id comes before collectionFile
    pattern = re.compile(r'id:\s*["\']([^"\']+)["\'].*?collectionFile:\s*["\']([^"\']+)["\']', re.DOTALL)
    
    # We might miss cases where collectionFile comes first, but conventionally id is first.
    matches = pattern.findall(content)
    
    print(f"Found {len(matches)} exhibition entries.")

    missing_files = []
    unmatched_ids = []
    public_files = set(os.listdir('public/data'))

    for ex_id, ex_file in matches:
        # Check file existence
        if ex_file not in public_files:
            missing_files.append((ex_id, ex_file))
        
        # Check modal logic presence
        if f"'{ex_id}'" not in modal_content and f'"{ex_id}"' not in modal_content:
             unmatched_ids.append(ex_id)

    print("\n--- Missing JSON Files ---")
    if not missing_files:
        print("None.")
    for mid, mfile in missing_files:
        print(f"{mid} -> {mfile}")

    print("\n--- IDs Not Found in Modal Logic ---")
    if not unmatched_ids:
        print("None.")
    for uid in unmatched_ids:
        print(uid)

except Exception as e:
    print(f"Error: {e}")
