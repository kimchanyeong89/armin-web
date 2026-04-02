with open("scripts/run_siglip_fast.py", "r", encoding="utf-8") as f:
    text = f.read()

# Make sure the Cloudflare upload check is at the same level as the GPU logic, not inside it!
# Also make sure after the leftover `if gpu_buffer:` block we call flush_upload_batch if len >= BATCH_SIZE.

import re
text = re.sub(
    r"(\s+)if len\(upload_batch\) >= BATCH_SIZE:\s*flush_upload_batch\(upload_batch, state, file_lock, processed_ids_set\)",
    r"\n\1if len(upload_batch) >= BATCH_SIZE:\n\1    flush_upload_batch(upload_batch, state, file_lock, processed_ids_set)\n",
    text
)

# And we also need to dedent the upload_batch check!
# Wait, actually it's easier to just paste the loop directly over.
