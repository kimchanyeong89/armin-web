const fs = require('fs');
const file = 'src/components/GlobalSearchBar.tsx';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
    /export default function GlobalSearchBar\(\{([^\}]+)\}: GlobalSearchBarProps\) \{/,
    (match, p1) => {
        if (!p1.includes('onExpandChange')) {
            return `export default function GlobalSearchBar({${p1}, isDark, skin = "default", onExpandChange}: GlobalSearchBarProps) {`;
        }
        return match;
    }
);

fs.writeFileSync(file, code);
console.log('patched signature!');
