import re
import sys

def modify():
    path = 'src/components/DrawingGlobe.tsx'
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    new_content = content.replace(
        '<svg viewBox="0 0 800 800" style={{ width: \'100%\', height: \'100%\', overflow: \'visible\' }}>',
        '<svg viewBox="0 0 800 800" preserveAspectRatio="xMidYMid meet" style={{ width: \'100%\', height: \'100%\', overflow: \'hidden\' }}>'
    )

    with open(path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Replaced!")

modify()
