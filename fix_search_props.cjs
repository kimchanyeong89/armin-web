const fs = require('fs');
let code = fs.readFileSync('src/components/GlobalSearchBar.tsx', 'utf8');

code = code.replace(
    'inlineMode?: boolean;\n};',
    'inlineMode?: boolean;\n    isDark?: boolean;\n    skin?: "default" | "drawing";\n};'
);

code = code.replace(
    'export default function GlobalSearchBar({ onOpenLightbox, onNavigateToMuseum, museums = [], isModalOpen, inlineMode = false }: GlobalSearchBarProps) {',
    'export default function GlobalSearchBar({ onOpenLightbox, onNavigateToMuseum, museums = [], isModalOpen, inlineMode = false, isDark, skin = "default" }: GlobalSearchBarProps) {'
);

fs.writeFileSync('src/components/GlobalSearchBar.tsx', code);
console.log("fixed search types!");
