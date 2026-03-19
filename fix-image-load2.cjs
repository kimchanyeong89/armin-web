const fs = require('fs');
let code = fs.readFileSync('src/components/GlobalSearchBar.tsx', 'utf8');

    code = code.replace(
        /style=\{\{\s*width: '100%', height: 'auto', display: 'block',\s*transition: '([^']+)',\s*transform: hovered \? 'scale\(1\.05\)' : 'scale\(1\)',\s*\}\}/,
        `style={{
                                                                        width: '100%', height: 'auto', display: 'block',
                                                                        transition: '$1, opacity 0.6s ease-out',
                                                                        transform: hovered ? 'scale(1.05)' : 'scale(1)',
                                                                        opacity: 0,
                                                                    }}`
    );
    code = code.replace(
        /loading="lazy"\s*alt=\{art\.name\}\s*referrerPolicy="no-referrer"\s*onError=\{handleImageError\}/,
        `loading="lazy"
                                                                    alt={art.name}
                                                                    referrerPolicy="no-referrer"
                                                                    onLoad={(e) => {
                                                                        (e.target as HTMLImageElement).style.opacity = '1';
                                                                    }}
                                                                    onError={handleImageError}`
    );

fs.writeFileSync('src/components/GlobalSearchBar.tsx', code);
console.log('Fixed image load transition!');