// SaveCurationButton — full-width CTA placed at the start AND end of a
// weekly/special curation. Reads/writes via useSavedCurations so the storage
// layer stays orthogonal to the UI.

import { useEffect, useState } from 'react';
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
  // Inline sign-in toast. The 'auth:request-login' event is a no-op on web
  // (no global login modal mounted) — without visible feedback the button
  // looked broken. See App.tsx where the handler early-returns when not in
  // the mobile-app container.
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!note) return;
    const id = window.setTimeout(() => setNote(null), 2400);
    return () => window.clearTimeout(id);
  }, [note]);

  const onClick = async () => {
    // Leave the console.debug in place during rollout so the user can confirm
    // in DevTools that the click registers — the original "doesn't respond
    // to clicks" report was actually a silent signed-out no-op.
    // eslint-disable-next-line no-console
    console.debug('[SaveCurationButton] click', {
      id: file.id, signedIn: !!auth.currentUser, busy, saved,
    });
    if (busy) return;
    const user = auth.currentUser;
    if (!user) {
      setNote(langKo ? '로그인하면 저장됩니다 · Sign in to save' : 'Sign in to save · 로그인하면 저장됩니다');
      window.dispatchEvent(new CustomEvent('auth:request-login'));
      return;
    }
    setBusy(true);
    try {
      if (saved) await unsaveCuration(file.id);
      else await saveCuration(file);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[SaveCurationButton] save/unsave failed', err);
    } finally {
      setBusy(false);
    }
  };

  const accent = '#D4A547';
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
        // Make sure nothing in the outer layout accidentally swallows the
        // click — earlier versions had this button visible but unresponsive
        // because the surrounding stacking context was unclear.
        position: 'relative',
        zIndex: 1,
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
          // Belt-and-braces: ensure pointer events always reach this button.
          pointerEvents: 'auto',
        }}
        aria-pressed={isSaved}
        aria-label={label}
      >
        {isSaved
          ? <BookmarkCheck size={16} strokeWidth={2.2} />
          : <Bookmark size={16} strokeWidth={2.2} />}
        <span>{label}</span>
      </button>
      {note && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '12px 18px',
            background: '#F4F1EA',
            color: '#0c0c0a',
            fontFamily: "'Space Mono', monospace",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            zIndex: 20000,
            maxWidth: '90vw',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          {note}
        </div>
      )}
    </div>
  );
}
