const fs = require('fs');

try {
const searchfile = 'src/components/GlobalSearchBar.tsx';
let search = fs.readFileSync(searchfile, 'utf8');
search = search.replace(
    /border: skin === 'drawing' \? \(isAIMode \? '2px solid #111111' : '2px solid #111111'\) : \(isAIMode \? 'none' : \(isDark \? '1px solid #555' : '1px solid #ddd'\)\),\s*background: skin === 'drawing' \? \(isAIMode \? '#111111' : 'transparent'\) : \(isAIMode \? '#e8fb36' : 'transparent'\),\s*color: skin === 'drawing' \? \(isAIMode \? '#FFFFFF' : '#111111'\) : \(isAIMode \? '#000' : '#888'\),\s*borderRadius: skin === 'drawing' \? '999px' : '100px',\s*fontWeight: skin === 'drawing' \? 900 : 800,/g,
    "" 
);
fs.writeFileSync(searchfile, search);
console.log('fixed search');
} catch(e) {}
