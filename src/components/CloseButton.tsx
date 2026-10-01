import { useEffect } from "react";
import { X } from "lucide-react";

/**
 * The one way out, the same everywhere: a bare ×, 22px in a 40px target, no
 * ring or box, gold under the pointer.
 * - "screen": a full-screen layer's close. It stands where KO | EN stands
 *   (top right, below the notch), and KO | EN steps aside while it is there,
 *   so the corner never holds two things.
 * - "corner": a card or sheet's close, in the card's own top right corner.
 */
export default function CloseButton({ onClick, label, placement = "screen", light = false, zIndex, className }: {
  onClick: () => void;
  label: string;
  placement?: "screen" | "corner";
  light?: boolean;
  zIndex?: number;
  className?: string;
}) {
  useEffect(() => {
    if (placement !== "screen") return;
    const root = document.documentElement;
    root.dataset.overlayPanel = "1";
    return () => {
      /* another full-screen layer may still be open under this one */
      if (!document.querySelector(".colly-close--screen")) delete root.dataset.overlayPanel;
    };
  }, [placement]);

  return (
    <button
      type="button"
      className={`colly-close colly-close--${placement}${light ? " colly-close--light" : ""}${className ? ` ${className}` : ""}`}
      style={zIndex !== undefined ? { zIndex } : undefined}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      aria-label={label}
      title={label}
    >
      <X size={22} strokeWidth={1.6} aria-hidden="true" />
    </button>
  );
}
