const fs = require('fs');
const content = fs.readFileSync('src/components/GlobalNav.tsx', 'utf8');

let newContent = content.replace(
    /width: \(isSearchExpanded && !isMenuOpen\) \? 'min\(420px, calc\(100vw \- 180px\)\)' : '50px',/g,
    "width: isMenuOpen ? '0px' : (isSearchExpanded ? 'min(400px, calc(100vw - 140px))' : '48px'),"
);

// We need to make sure the inner global search bar behaves properly.
newContent = newContent.replace(
    /<GlobalSearchBar inlineMode \{\.\.\.searchProps\} isDark=\{true\} drawingSkin=\{true\} \/>/g,
    '<div style={{ width: "100%", height: "100%", pointerEvents: isMenuOpen ? "none" : "auto", opacity: isMenuOpen ? 0 : 1, transition: "opacity 0.2s" }}><GlobalSearchBar inlineMode {...searchProps} isDark={true} drawingSkin={true} forceWidth="100%" /></div>'
);

fs.writeFileSync('src/components/GlobalNav.tsx', newContent);
console.log('patched GlobalNav width');
