const fs = require('fs');
let content = fs.readFileSync('src/components/GlobalSearchBar.tsx', 'utf8');

content = content.replace(
    /export default function GlobalSearchBar\(\{ (.*?) \}: GlobalSearchBarProps\) \{/,
    'export default function GlobalSearchBar({ forceWidth, $1 }: GlobalSearchBarProps) {'
);

fs.writeFileSync('src/components/GlobalSearchBar.tsx', content);
