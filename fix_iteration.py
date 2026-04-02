with open("scripts/run_siglip_fast.py", "r") as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    if "for e_id, count in sorted_exhibitions:" in line:
        new_lines.append(line.replace("for e_id, count in sorted_exhibitions:", "for e_id in sorted_exhibitions:"))
        new_lines.append("        count = state.get('museum_counts', {}).get(e_id, 0)\n")
    else:
        new_lines.append(line)

with open("scripts/run_siglip_fast.py", "w") as f:
    f.writelines(new_lines)
print("fixed")
