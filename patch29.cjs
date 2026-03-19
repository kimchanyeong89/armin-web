const fs = require('fs');
let code = fs.readFileSync('src/components/ExhibitionModal.tsx', 'utf8');

code = code.replace(
`interface ExhibitionModalProps {
  exhibition: ExhibitionItem;
  museumName?: string;
  onClose: () => void;
  initialSelectedIndex?: number;
}`,
`interface ExhibitionModalProps {
  exhibition: ExhibitionItem;
  museumName?: string;
  onClose: () => void;
  initialSelectedIndex?: number;
  inline?: boolean;
  variant?: 'sketch' | 'default';
}`
);

code = code.replace(
`const ExhibitionModal: React.FC<ExhibitionModalProps> = ({ exhibition, museumName, onClose, initialSelectedIndex = 0 }) => {`,
`const ExhibitionModal: React.FC<ExhibitionModalProps> = ({ exhibition, museumName, onClose, initialSelectedIndex = 0, inline = false, variant = 'default' }) => {`
);

fs.writeFileSync('src/components/ExhibitionModal.tsx', code);
console.log('patched');
