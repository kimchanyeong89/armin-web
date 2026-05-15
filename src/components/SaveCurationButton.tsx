// SaveCurationButton — full-width CTA placed at the end of a weekly/special
// curation. Reads/writes via useSavedCurations so the storage layer stays
// orthogonal to the UI.

import { useState } from 'react';
import { Bookmark, BookmarkCheck } from 'lucide-react';
import type { WeeklyPublishedFile } from '../types/weekly';
import {
  saveCuration,
  unsaveCuration,
  useIsCurationSaved,
} from '../hooks/useSavedCurations';
import { auth } from '../firebase';

interface SaveCurationButtonProps {
  file: WeeklyPublishedFile;
  langKo: boolean;
}

export default function SaveCurationButton({ file, langKo }: SaveCurationButtonProps) {
  const { saved, loading: savedLoading } = useIsCurationSaved(file.id);
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    if (busy) return;
    // Auth gate. Match the pattern used elsewhere — dispatch the request-login
    // event, which the mobile container handles. On web this is a no-op,
    // so we also write attempt → setDoc will fail with permission-denied,
    // which we catch silently below.
    const user = auth.currentUser;
    if (!user) {
      window.dispatchEvent(new CustomEvent('auth:request-login'));
      return;
    }
    setBusy(true);
    try {
      if (saved) await unsaveCuration(file.id);
      else await saveCuration(file);
    } catch {
      // Silent — Firestore permission errors etc. The optimistic UI will
      // revert on the next snapshot if the write actually failed.
    } finally {
      setBusy(false);
    }
  };

  const accent = '#CCFF00';
  const isSaved = saved;
  const disabled = busy || savedLoading;

  const label = isSaved
    ? langKo ? '저장됨 · Saved' : 'Saved · 저장됨'
    : langKo ? '큐레이션 저장 · Save this collection' : 'Save this collection · 큐레이션 저장';

  return (
    <div
      style={{
        maxWidth: 1080,
        margin: '0 auto',
        padding: '48px clamp(20px,4vw,56px) 32px',
      }}
    >
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          width: '100%',
          padding: '20px 28px',
          border: `1px solid ${isSaved ? accent : 'rgba(244,241,234,0.20)'}`,
          background: isSaved ? accent : 'transparent',
          color: isSaved ? '#0c0c0a' : 'rgba(244,241,234,0.92)',
          fontFamily: "'Space Mono', monospace",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          cursor: disabled ? 'wait' : 'pointer',
          opacity: disabled ? 0.6 : 1,
          transition: 'background 160ms ease, color 160ms ease, border-color 160ms ease',
        }}
        aria-pressed={isSaved}
        aria-label={label}
      >
        {isSaved
          ? <BookmarkCheck size={16} strokeWidth={2.2} />
          : <Bookmark size={16} strokeWidth={2.2} />}
        <span>{label}</span>
      </button>
    </div>
  );
}
