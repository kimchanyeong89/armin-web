const fs = require('fs');
const file = 'src/components/GlobalNav.tsx';
let txt = fs.readFileSync(file, 'utf8');

if (!txt.includes('const [isMobile, setIsMobile] = useState')) {
    txt = txt.replace('const [isSearchExpanded, setIsSearchExpanded] = useState(false);',
      'const [isSearchExpanded, setIsSearchExpanded] = useState(false);\n    const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth <= 768);\n    useEffect(() => {\n        const handleResize = () => setIsMobile(window.innerWidth <= 768);\n        window.addEventListener("resize", handleResize);\n        return () => window.removeEventListener("resize", handleResize);\n    }, []);'
    );
}

txt = txt.replace(/filter: 'url\(#dg-sketch-ui\)'/g, "filter: isMobile ? 'none' : 'url(#dg-sketch-ui)'");

fs.writeFileSync(file, txt);
console.log('Fixed GlobalNav filter');
