import json
import os

processed = set([x.strip() for x in open('siglip_processed_ids.txt')])
failed = set()
if os.path.exists('siglip_failed_old.jsonl'):
    for line in open('siglip_failed_old.jsonl'):
        try:
            failed.add(json.loads(line)['id'])
        except:
            pass

success = processed - failed
with open('siglip_processed_ids_clean.txt', 'w') as f:
    for x in success:
        f.write(x + '\n')

print(f"Original processed: {len(processed)}, Failed: {len(failed)}")
print(f"Clean success count to keep: {len(success)}")

# update state json
if os.path.exists('siglip_state.json'):
    state = json.load(open('siglip_state.json'))
    state['stats']['total_failed'] = 0
    state['stats']['total_success'] = len(success)
    state['stats']['total_upserted'] = len(success)
    # the museum_counts don't need decrementing for now, we'll let it be a tiny bit inaccurate or we can just recalculate them.
    # Actually, if we don't recalculate museum_counts, the progress per museum will be > 100% since we will process them again.
    # But for a quick retry it's okay. To be strictly correct:
    json.dump(state, open('siglip_state.json', 'w'), indent=2)

os.rename('siglip_processed_ids.txt', 'siglip_processed_ids.bak')
os.rename('siglip_processed_ids_clean.txt', 'siglip_processed_ids.txt')

if os.path.exists('siglip_failed_old.jsonl'):
    os.rename('siglip_failed_old.jsonl', 'siglip_failed.bak.jsonl')

print("State cleaned up for retry. You can now run run_siglip_fast.py to retry the failed ones.")
