import fs from 'fs';

let content = fs.readFileSync('src/components/ExhibitionDetails.tsx', 'utf8');

content = `import DrawingExhibitionLayout from './DrawingExhibitionLayout';\n` + content;

content = content.replace(
  "onSelectExhibition: (exhibitionItem: ExhibitionItem) => void;\n}",
  "onSelectExhibition: (exhibitionItem: ExhibitionItem) => void;\n  variant?: 'default' | 'sketch';\n}"
);

content = content.replace(
  /onSelectExhibition\n}: ExhibitionDetailsProps\) {/,
  "onSelectExhibition,\n  variant = 'default'\n}: ExhibitionDetailsProps) {"
);

content = content.replace(
  "  // Split items back into main and minor",
  `  if (variant === 'sketch') {
    return (
      <DrawingExhibitionLayout
        museum={exhibition}
        onClose={onClose}
        onSelectItem={onSelectExhibition}
      />
    );
  }\n\n  // Split items back into main and minor`
);

fs.writeFileSync('src/components/ExhibitionDetails.tsx', content);
