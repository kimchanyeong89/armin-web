const fs = require('fs');
let code = fs.readFileSync('src/components/GlobalSearchBar.tsx', 'utf8');

if (!code.includes('onExpandChange?.(isExpanded)')) {
    code = code.replace(/const \[isExpanded, setIsExpanded\] = useState\(false\);/, 
        "const [isExpanded, setIsExpanded] = useState(false);\n    useEffect(() => { onExpandChange?.(isExpanded); }, [isExpanded, onExpandChange]);"
    );
    fs.writeFileSync('src/components/GlobalSearchBar.tsx', code);
    console.log('Added useEffect for onExpandChange');
}
