with open("scripts/run_siglip_fast.py", "r", encoding="utf-8") as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    new_lines.append(line)

with open("scripts/run_siglip_fast.py", "w", encoding="utf-8") as f:
    f.writelines(new_lines)
