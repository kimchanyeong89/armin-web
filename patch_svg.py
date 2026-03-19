import sys

def patch():
    with open('src/components/GlobalSearchBar.tsx', 'r') as f:
        code = f.read()

    old_str = 'stroke={isDrawingSkin ? (isExpanded ? "#111" : "#FFFFFF") : (inlineMode && !isExpanded ? "#1a1918" : "#c9a55a")} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">'
    new_str = 'stroke={isDrawingSkin ? (isExpanded ? "#111" : "#FFFFFF") : (inlineMode && !isExpanded ? "#1a1918" : "#c9a55a")} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transition: isDrawingSkin ? \\'stroke 0.4s\\' : \\'\\' }}>'

    code = code.replace(old_str, new_str)

    with open('src/components/GlobalSearchBar.tsx', 'w') as f:
        f.write(code)

patch()
