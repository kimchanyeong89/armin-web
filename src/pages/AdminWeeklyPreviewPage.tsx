// Standalone preview page for a weekly-curation candidate.
//
// Opened from /admin/weekly via the per-card "Preview" button. Mounts
// WeeklyCurationTab with `chromeless={true}` so the AI tab's This Week /
// Archive / Special strip is hidden — the page is dedicated to a single
// candidate. A sticky header sits on top with a "← Back" button that
// returns to the admin proposal review.
//
// Auth: admin only (uses the same useIsAdmin hook as the rest of /admin/*).

import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import WeeklyCurationTab from '../components/WeeklyCurationTab';
import { useIsAdmin } from '../lib/admin';

const COLOR_BG = '#0a0a0a';
const COLOR_FG = '#f4f1ea';
const COLOR_FG_MED = 'rgba(244,241,234,0.78)';
const COLOR_FG_LOW = 'rgba(244,241,234,0.55)';
const COLOR_FG_FAINT = 'rgba(244,241,234,0.36)';
const COLOR_BORDER = 'rgba(244,241,234,0.10)';
const COLOR_ACCENT = '#D4A547';

const LABEL: React.CSSProperties = {
  fontFamily: "'Space Mono', monospace",
  fontWeight: 700,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.12em',
};

const AdminWeeklyPreviewPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAdmin, loading: authLoading } = useIsAdmin();

  // Use the same `?preview=` param the inner WeeklyCurationTab reads, so
  // React Router's useSearchParams hands the same value to both — no
  // history.replaceState dance and no extra re-renders.
  const cardId = searchParams.get('preview') ?? '';
  const week = searchParams.get('week') ?? '';

  useEffect(() => {
    if (!authLoading && !isAdmin) navigate('/', { replace: true });
  }, [authLoading, isAdmin, navigate]);

  if (authLoading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: COLOR_BG,
          color: COLOR_FG_MED,
          ...LABEL,
          fontSize: 11,
        }}
      >
        Loading...
      </div>
    );
  }

  if (!isAdmin) return null;

  if (!cardId || !week) {
    return (
      <div style={{ minHeight: '100vh', background: COLOR_BG, color: COLOR_FG, padding: 24 }}>
        <button
          onClick={() => navigate('/admin/weekly')}
          style={{ ...LABEL, fontSize: 11, background: 'transparent', color: COLOR_FG_MED, border: 'none', cursor: 'pointer' }}
        >
          ← Back
        </button>
        <div style={{ marginTop: 24, color: COLOR_FG_FAINT }}>
          Missing <code>?preview</code> or <code>?week</code>.
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
        background: COLOR_BG,
        color: COLOR_FG,
      }}
    >
      {/* Sticky header with back + identification */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          background: 'rgba(10,10,10,0.92)',
          borderBottom: `1px solid ${COLOR_BORDER}`,
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <button
          onClick={() => navigate('/admin/weekly')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            background: 'transparent',
            border: `1px solid ${COLOR_BORDER}`,
            color: COLOR_FG,
            padding: '8px 14px',
            borderRadius: 999,
            cursor: 'pointer',
            ...LABEL,
            fontSize: 10,
          }}
        >
          <ArrowLeft size={14} />
          Back to admin
        </button>
        <div style={{ ...LABEL, fontSize: 9, color: COLOR_ACCENT }}>
          Preview · {week} · {cardId.split('__').slice(0, 2).join(' × ')}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ ...LABEL, fontSize: 9, color: COLOR_FG_FAINT }}>not yet published</div>
      </div>

      {/* Standalone curation render. chromeless hides the This Week / Archive
          / Special strip; WeeklyCurationTab's own preview deep-link handler
          picks up ?preview / ?week from the URL. */}
      <WeeklyCurationTab
        t={false}
        fg={COLOR_FG}
        fgMed={COLOR_FG_MED}
        fgLow={COLOR_FG_LOW}
        fgFaint={COLOR_FG_FAINT}
        divider={COLOR_BORDER}
        language="ko"
        tr={(copy) => copy.ko}
        chromeless={true}
      />
    </div>
  );
};

export default AdminWeeklyPreviewPage;
