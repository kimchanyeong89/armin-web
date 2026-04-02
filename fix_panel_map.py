with open('src/components/DrawingGlobe.tsx', 'r') as f:
    text = f.read()

# Replace panelMap style
old_style = "panelMap: { flex: 1.5, minHeight: 250, width: '100%', position: 'relative' as const, borderBottom: '2px solid #111', overflow: 'hidden' },"
new_style = "panelMap: { flex: 'none', height: 340, width: '100%', position: 'relative' as const, borderBottom: '2px solid #111', overflow: 'hidden' },"

if old_style in text:
    text = text.replace(old_style, new_style)
    with open('src/components/DrawingGlobe.tsx', 'w') as f:
        f.write(text)
    print("Style replaced!")
else:
    print("old_style not found!")
