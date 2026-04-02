with open("scripts/run_siglip_fast.py", "r") as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    if line.startswith("def render_dashboard"):
        new_lines.append(line)
        new_lines.append("    TOTAL_ARTS = sum(state.get('museum_counts', {}).values()) or 597859\n")
    else:
        new_lines.append(line)

with open("scripts/run_siglip_fast.py", "w") as f:
    f.writelines(new_lines)
print("fixed")
