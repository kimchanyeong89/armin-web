import sys

def patch():
    with open('src/components/GlobalSearchBar.tsx', 'r') as f:
        code = f.read()

    # Fix background color
    code = code.replace(
        "background: (isDrawingSkin && inlineMode) ? (isExpanded ? 'transparent' : '#e8fb36') :",
        "background: (isDrawingSkin && inlineMode) ? (isExpanded ? 'transparent' : '#111111') :"
    )

    # Fix stroke color
    code = code.replace(
        'stroke={isDrawingSkin ? "#111" : (inlineMode && !isExpanded ? "#1a1918" : "#c9a55a")}',
        'stroke={isDrawingSkin ? (isExpanded ? "#111" : "#FFFFFF") : (inlineMode && !isExpanded ? "#1a1918" : "#c9a55a")}'
    )

    with open('src/components/GlobalSearchBar.tsx', 'w') as f:
        f.write(code)

patch()
