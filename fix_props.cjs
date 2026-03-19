const fs = require('fs');
let file = 'src/components/GlobalSearchBar.tsx';
let txt = fs.readFileSync(file, 'utf8');

txt = txt.replace(
    "export default function GlobalSearchBar({ onOpenLightbox, onNavigateToMuseum, museums = [], isModalOpen, inlineMode = false }: GlobalSearchBarProps)",
    "export default function GlobalSearchBar({ onOpenLightbox, onNavigateToMuseum, museums = [], isModalOpen, inlineMode = false, skin = 'default', onExpandChange }: GlobalSearchBarProps)"
);
fs.writeFileSync(file, txt);
