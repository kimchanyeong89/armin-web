import re

with open('src/components/DrawingGlobe.tsx', 'r') as f:
    text = f.read()

# Finding the section to remove:
# from: {/* ── Navigator (top-right) ── */}
# to the end of {/* ── Search Results Dropdown ── */} div

start_marker = "{/* ── Navigator (top-right) ── */}"
end_marker = "{/* ── Filter / Stats Panel (bottom-left) ── */}"

if start_marker in text and end_marker in text:
    start_idx = text.find(start_marker)
    end_idx = text.find(end_marker)
    
    new_text = text[:start_idx] + "\n        " + text[end_idx:]
    with open('src/components/DrawingGlobe.tsx', 'w') as f:
        f.write(new_text)
    print("Removed Navigator from DrawingGlobe.tsx")
else:
    print("Could not find markers.")
