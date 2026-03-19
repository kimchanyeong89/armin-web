const fs=require('fs');let c=fs.readFileSync('src/components/ExhibitionDetails.tsx','utf8');c=c.replace(/onSelectExhibition: \(exhibitionItem: ExhibitionItem\) => void;
\}/,'onSelectExhibition: (exhibitionItem: ExhibitionItem) => void;
  variant?: \'default\' | \'sketch\';
}');c=c.replace(/exhibition,
\s*onClose,
\s*isOpen,
\s*onSelectExhibition
\}: ExhibitionDetailsProps\) \{/s,'exhibition,
  onClose,
  isOpen,
  onSelectExhibition,
  variant=\'default\'
}: ExhibitionDetailsProps) {');c=c.replace('  // Split items back into main and minor',"  if (variant==='sketch') { return <DrawingExhibitionLayout museum={exhibition} onClose={onClose} onSelectItem={onSelectExhibition} />; }

  // Split items back into main and minor");c="import DrawingExhibitionLayout from './DrawingExhibitionLayout';
"+c;fs.writeFileSync('src/components/ExhibitionDetails.tsx',c);
