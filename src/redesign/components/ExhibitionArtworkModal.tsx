import { useEffect, useId, useRef } from "react";
import { Link } from "react-router-dom";
import type { ExhibitionModalWorks } from "../data";
import { buildPreviewPath, type PreviewConcept } from "../model";
import { formatDateRange } from "../concepts/shared";
import PreviewMedia from "./PreviewMedia";

type ExhibitionArtworkModalProps = {
  concept?: PreviewConcept;
  modalData: ExhibitionModalWorks;
  onClose: () => void;
  recordPath?: (exhibitionId: string) => string;
  showRecordLink?: boolean;
  workPath?: (artworkId: string) => string;
};

export default function ExhibitionArtworkModal({
  concept,
  modalData,
  onClose,
  recordPath,
  showRecordLink = true,
  workPath,
}: ExhibitionArtworkModalProps) {
  const { exhibition, works, source } = modalData;
  const titleId = useId();
  const descriptionId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const backdrop = dialogRef.current?.parentElement;
    const backgroundElements = backdrop?.parentElement
      ? Array.from(backdrop.parentElement.children).filter(
        (element): element is HTMLElement => element instanceof HTMLElement && element !== backdrop,
      )
      : [];
    const backgroundState = backgroundElements.map((element) => ({
      element,
      inert: element.inert,
      ariaHidden: element.getAttribute("aria-hidden"),
    }));

    backgroundElements.forEach((element) => {
      element.inert = true;
      element.setAttribute("aria-hidden", "true");
    });
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), [tabindex]:not([tabindex='-1'])"),
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      backgroundState.forEach(({ element, inert, ariaHidden }) => {
        element.inert = inert;
        if (ariaHidden === null) element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden", ariaHidden);
      });
      if (previousFocus?.isConnected) previousFocus.focus();
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const workLabel = `${works.length} ${works.length === 1 ? "work" : "works"}`;
  const sourceCopy = source === "exhibition"
    ? `${workLabel} linked directly to this exhibition.`
    : source === "museum"
      ? `No works are linked directly in the current record. Showing ${workLabel} from ${exhibition.museumName}.`
      : "No artwork records are linked to this exhibition or museum yet.";
  const getRecordPath = (id: string) => recordPath?.(id) || buildPreviewPath(concept || "hybrid", "exhibition", id);
  const getWorkPath = (id: string) => workPath?.(id) || buildPreviewPath(concept || "hybrid", "work", id);

  return (
    <div className={`rd rd--${concept || "dark"} rd-exhibition-modal-backdrop`}>
      <section
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="rd-exhibition-modal"
        ref={dialogRef}
        role="dialog"
      >
        <header className="rd-modal-bar">
          <span>COLLY exhibition archive</span>
          <button ref={closeRef} type="button" onClick={onClose}>Close</button>
        </header>
        <div className="rd-modal-intro">
          <div className="rd-modal-cover">
            <PreviewMedia
              src={exhibition.image}
              alt={exhibition.title}
              fallbackLabel={exhibition.title}
              loading="eager"
            />
          </div>
          <div className="rd-modal-copy">
            <span>{exhibition.museumName}</span>
            <h2 id={titleId}>{exhibition.title}</h2>
            <p id={descriptionId}>{exhibition.description || "The current record includes visit and collection information."}</p>
            <dl>
              <div><dt>Dates</dt><dd>{formatDateRange(exhibition.startDate, exhibition.endDate)}</dd></div>
              <div><dt>Status</dt><dd>{exhibition.status}</dd></div>
              <div><dt>Place</dt><dd>{exhibition.location}</dd></div>
            </dl>
            {showRecordLink ? (
              <Link className="rd-modal-record-link" to={getRecordPath(exhibition.id)}>
                Open full exhibition record
              </Link>
            ) : null}
          </div>
        </div>
        <div className="rd-modal-works-head">
          <div>
            <span>{source === "museum" ? "Museum collection context" : "Exhibition works"}</span>
            <h3>Works in this archive</h3>
          </div>
          <p>{sourceCopy}</p>
        </div>
        {works.length ? (
          <div className="rd-modal-work-grid">
            {works.map((work) => (
              <Link key={`${work.exhibitionId}-${work.id}`} to={getWorkPath(work.id)}>
                <PreviewMedia src={work.image} alt={work.title} fallbackLabel={work.title} loading="lazy" />
                <span>{work.artist}</span>
                <strong>{work.title}</strong>
                <small>{work.year || "Date unknown"}</small>
              </Link>
            ))}
          </div>
        ) : (
          <div className="rd-modal-empty" role="status">
            <strong>Artwork records are not connected yet.</strong>
            <p>The exhibition metadata remains available in this read-only preview.</p>
          </div>
        )}
      </section>
    </div>
  );
}
