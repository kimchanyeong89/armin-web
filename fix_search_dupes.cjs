const fs = require('fs');
const file = 'src/components/GlobalSearchBar.tsx';
let code = fs.readFileSync(file, 'utf8');

// I might have appended it multiple times.
// Let's replace the whole type GlobalSearchBarProps block cleanly.
code = code.replace(
    /export type GlobalSearchBarProps = \{[\s\S]*?\};\n/g,
    `export type GlobalSearchBarProps = {
    onOpenLightbox: (artwork: SearchableArtwork, openLightbox?: boolean) => void;
    onNavigateToMuseum: (museum: { id: string, name: string }, collectionId?: string, artwork?: SearchableArtwork) => void;
    museums?: Museum[];
    isModalOpen?: boolean;
    initialQuery?: string;
    isMobile?: boolean;
    inlineMode?: boolean;
    isDark?: boolean;
    skin?: "default" | "drawing";
    onExpandChange?: (isExpanded: boolean) => void;
};\n`
);

fs.writeFileSync(file, code);
console.log('cleaned props!');
