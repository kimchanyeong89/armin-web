import re
with open("scripts/run_siglip_fast.py") as f:
    lines = f.readlines()
for i, line in enumerate(lines):
    if "if len(upload_batch) >= BATCH_SIZE" in line:
        print(f"Line {i+1}: {repr(line)}")
    elif "render_dashboard(state" in line:
        print(f"Line {i+1}: {repr(line)}")
