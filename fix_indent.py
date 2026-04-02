import re

with open("scripts/run_siglip_fast.py", "r") as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    if 'state["museum_processed"][e_id] =' in line and 'state["museum_processed"].get' in line:
        # replace with exactly same indent as previous line
        if len(new_lines) > 0:
            match = re.match(r"^(\s+)", new_lines[-1])
            if match:
                new_lines.append(match.group(1) + line.lstrip())
                continue
    new_lines.append(line)

with open("scripts/run_siglip_fast.py", "w") as f:
    f.writelines(new_lines)

