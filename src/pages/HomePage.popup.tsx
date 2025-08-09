import React from "react";
import type { ExhibitionItem } from "../types/Exhibition";

interface ExhibitionModalProps {
  exhibition: ExhibitionItem;
  onClose: () => void;
  // Add other props if needed
}

const ExhibitionModal = ({ exhibition, onClose }: ExhibitionModalProps) => {
  return (
    <div>
      {/* Modal content here */}
      <button onClick={onClose}>Close</button>
      <h2>{exhibition.title}</h2>
      {/* other exhibition details */}
    </div>
  );
};

export default ExhibitionModal;
