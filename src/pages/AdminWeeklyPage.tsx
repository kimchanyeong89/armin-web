// Weekly Curation Admin — review proposal cards for the current week and
// generate publish commands (clipboard). Mirrors the static-JSON workflow:
// the browser never writes files; instead it copies the exact
// `npm run weekly:publish ...` invocation that the editor pastes into a
// terminal.
//
// Auth: admin email whitelist (same pattern as AdminPage.tsx). Non-admins
// are redirected to `/`.

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { GlobalNav } from '../components/GlobalNav';
import type {
  WeeklyProposalFile,
  WeeklyCard,
  WeeklyPublishedFile,
  PersonaId,
} from '../types/weekly';
import { isoWeek } from '../lib/iso-week';
import { useIsAdmin, addAdminEmail, removeAdminEmail, BOOTSTRAP_ADMINS } from '../lib/admin';

// ── Week index ────────────────────────────────────────────────────────────
// V1: hardcoded. TODO: have generator script emit
// `public/data/weekly-proposals-index.json` listing weeks.
const KNOWN_WEEKS: string[] = ['2026-W20'];

// ── Design tokens — match WeeklyCurationTab.tsx ──────────────────────────
const COLOR_BG = '#0a0a0a';
const COLOR_SURFACE = '#161616';
const COLOR_SURFACE_2 = '#1f1f1f';
const COLOR_BORDER = 'rgba(244,241,234,0.10)';
const COLOR_BORDER_STRONG = 'rgba(244,241,234,0.22)';
const COLOR_FG = '#f4f1ea';
const COLOR_FG_MED = 'rgba(244,241,234,0.78)';
const COLOR_FG_LOW = 'rgba(244,241,234,0.55)';
const COLOR_FG_FAINT = 'rgba(244,241,234,0.36)';
const COLOR_ACCENT = '#D4A547';
const COLOR_ACCENT_NEON = '#D4A547';

const LABEL: React.CSSProperties = {
  fontFamily: "'Space Mono', monospace",
  fontWeight: 700,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.12em',
};
const BODY: React.CSSProperties = {
  fontFamily: "'Inter', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif",
  fontWeight: 400,
};
const HEADING: React.CSSProperties = {
  fontFamily: "'Inter', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif",
  fontWeight: 700,
};

// ── Persona name lookup ───────────────────────────────────────────────────
const PERSONA_NAMES: Record<PersonaId, string> = {
  'yuna-choi': 'Yuna Choi',
  'marco-rinaldi': 'Marco Rinaldi',
  'anika-voss': 'Anika Voss',
};

// ── Toast ─────────────────────────────────────────────────────────────────
function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const id = window.setTimeout(() => setMsg(null), 2400);
    return () => window.clearTimeout(id);
  }, [msg]);
  return { msg, show: setMsg };
}

// ── Per-card component ────────────────────────────────────────────────────
function WeeklyProposalCardView({
  card,
  week,
  isPublished,
  onCopy,
}: {
  card: WeeklyCard;
  week: string;
  isPublished: boolean;
  onCopy: (text: string, label: string) => void;
}) {
  const [showSpecialForm, setShowSpecialForm] = useState(false);
  const defaultSlug = useMemo(() => {
    const tail = card.id.split('__').pop() ?? card.id;
    return tail.slice(0, 60);
  }, [card.id]);
  const [slug, setSlug] = useState(defaultSlug);
  const [rawOpen, setRawOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const hero = card.works.find((w) => w.role === 'hero') ?? card.works[0];
  const heroUrl = hero?.image_url;

  const publishWeekly = () => {
    const cmd = `npm run weekly:publish -- --week ${week} --card ${card.id}`;
    onCopy(cmd, 'Publish-as-Weekly command');
  };
  const publishSpecial = () => {
    const safeSlug = slug.trim() || defaultSlug;
    const cmd = `npm run weekly:publish -- --week ${week} --card ${card.id} --type special --slug ${safeSlug}`;
    onCopy(cmd, 'Publish-as-Special command');
    setShowSpecialForm(false);
  };

  const titleMissing = !card.title_en && !card.title_ko;
  const introMissing = !card.intro_en && !card.intro_ko;
  const introPreview = (card.intro_en || card.intro_ko || '').slice(0, 200);

  return (
    <div
      style={{
        background: COLOR_SURFACE,
        border: `1px solid ${isPublished ? COLOR_ACCENT : COLOR_BORDER}`,
        padding: 20,
        display: 'grid',
        gridTemplateColumns: '180px 1fr',
        gap: 20,
        position: 'relative',
      }}
    >
      {/* Hero thumbnail */}
      <div
        style={{
          width: 180,
          height: 180,
          background: COLOR_SURFACE_2,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {heroUrl ? (
          <img
            src={heroUrl}
            alt=""
            loading="lazy"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
            }}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              ...LABEL,
              fontSize: 10,
              color: COLOR_FG_FAINT,
            }}
          >
            (no image)
          </div>
        )}
      </div>

      {/* Card details */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
        {/* Top row: score chip + persona/lens */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span
            style={{
              ...LABEL,
              fontSize: 10,
              padding: '4px 8px',
              background: COLOR_ACCENT,
              color: '#000',
            }}
          >
            SCORE {card.score.toFixed(2)}
          </span>
          {isPublished && (
            <span
              style={{
                ...LABEL,
                fontSize: 10,
                padding: '4px 8px',
                background: COLOR_ACCENT_NEON,
                color: '#000',
              }}
            >
              PUBLISHED
            </span>
          )}
          <span style={{ ...LABEL, fontSize: 10, color: COLOR_FG_MED }}>
            {PERSONA_NAMES[card.persona_id]} · {card.lens}
          </span>
          <span style={{ ...LABEL, fontSize: 9, color: COLOR_FG_FAINT }}>
            {card.trigger.type}: {card.trigger.value}
          </span>
        </div>

        {/* Title */}
        <div>
          <div
            style={{
              ...HEADING,
              fontSize: 18,
              color: titleMissing ? COLOR_FG_FAINT : COLOR_FG,
              fontStyle: titleMissing ? 'italic' : 'normal',
              lineHeight: 1.25,
            }}
          >
            {titleMissing ? '(empty — needs writing)' : card.title_en || '(en missing)'}
          </div>
          {!titleMissing && card.title_ko && (
            <div
              style={{
                ...BODY,
                fontSize: 13,
                color: COLOR_FG_LOW,
                marginTop: 2,
              }}
            >
              {card.title_ko}
            </div>
          )}
        </div>

        {/* Intro preview */}
        <div
          style={{
            ...BODY,
            fontSize: 12,
            color: introMissing ? COLOR_FG_FAINT : COLOR_FG_MED,
            fontStyle: introMissing ? 'italic' : 'normal',
            lineHeight: 1.55,
          }}
        >
          {introMissing
            ? '(empty — needs writing)'
            : introPreview + ((card.intro_en || card.intro_ko || '').length > 200 ? '…' : '')}
        </div>

        {/* Works row */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
          {card.works.map((w) => (
            <div
              key={w.position}
              title={`${w.position}. ${w.artist} — ${w.title}`}
              style={{
                width: 56,
                height: 56,
                flexShrink: 0,
                background: COLOR_SURFACE_2,
                overflow: 'hidden',
                position: 'relative',
                border: w.role === 'hero' ? `1px solid ${COLOR_ACCENT}` : `1px solid ${COLOR_BORDER}`,
              }}
            >
              {w.image_url ? (
                <img
                  src={w.image_url}
                  alt=""
                  loading="lazy"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block',
                  }}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : null}
              <span
                style={{
                  position: 'absolute',
                  top: 2,
                  left: 3,
                  ...LABEL,
                  fontSize: 8,
                  color: COLOR_FG,
                  textShadow: '0 0 2px rgba(0,0,0,0.8)',
                }}
              >
                {w.position}
              </span>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
          <button
            onClick={() => setPreviewOpen((v) => !v)}
            style={{
              ...LABEL,
              fontSize: 10,
              padding: '8px 12px',
              background: previewOpen ? COLOR_ACCENT : 'transparent',
              color: previewOpen ? '#000' : COLOR_FG,
              border: previewOpen ? 'none' : `1px solid ${COLOR_ACCENT}`,
              cursor: 'pointer',
            }}
          >
            {previewOpen ? 'Hide preview ▴' : 'Preview ▾'}
          </button>
          <button
            onClick={publishWeekly}
            style={{
              ...LABEL,
              fontSize: 10,
              padding: '8px 12px',
              background: 'transparent',
              color: COLOR_FG,
              border: `1px solid ${COLOR_BORDER_STRONG}`,
              cursor: 'pointer',
            }}
          >
            Publish as Weekly
          </button>
          <button
            onClick={() => setShowSpecialForm((v) => !v)}
            style={{
              ...LABEL,
              fontSize: 10,
              padding: '8px 12px',
              background: 'transparent',
              color: COLOR_FG,
              border: `1px solid ${COLOR_BORDER_STRONG}`,
              cursor: 'pointer',
            }}
          >
            Publish as Special {showSpecialForm ? '▲' : '▾'}
          </button>
          <button
            onClick={() => setRawOpen((v) => !v)}
            style={{
              ...LABEL,
              fontSize: 10,
              padding: '8px 12px',
              background: 'transparent',
              color: COLOR_FG_MED,
              border: `1px solid ${COLOR_BORDER}`,
              cursor: 'pointer',
            }}
          >
            {rawOpen ? 'Hide raw JSON' : 'View raw'}
          </button>
        </div>

        {/* Special slug form */}
        {showSpecialForm && (
          <div
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              marginTop: 6,
              padding: 10,
              background: COLOR_SURFACE_2,
              border: `1px solid ${COLOR_BORDER}`,
            }}
          >
            <label style={{ ...LABEL, fontSize: 9, color: COLOR_FG_LOW }}>SLUG</label>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              style={{
                ...BODY,
                fontSize: 12,
                padding: '6px 8px',
                background: COLOR_BG,
                color: COLOR_FG,
                border: `1px solid ${COLOR_BORDER}`,
                flex: 1,
                fontFamily: "'Space Mono', monospace",
              }}
            />
            <button
              onClick={publishSpecial}
              style={{
                ...LABEL,
                fontSize: 10,
                padding: '6px 12px',
                background: COLOR_ACCENT,
                color: '#000',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Copy command
            </button>
          </div>
        )}

        {/* Inline preview — iframe of /ai?preview=<id>&week=<week> so the
            candidate renders pixel-identical to a published weekly, in place. */}
        {previewOpen && (
          <div
            style={{
              marginTop: 8,
              border: `1px solid ${COLOR_ACCENT}`,
              background: COLOR_BG,
            }}
          >
            <iframe
              src={`/ai?preview=${encodeURIComponent(card.id)}&week=${encodeURIComponent(week)}`}
              title={`Preview · ${card.id}`}
              style={{
                width: '100%',
                height: 'min(80vh, 1100px)',
                border: 'none',
                display: 'block',
                background: COLOR_BG,
              }}
            />
          </div>
        )}

        {/* Raw JSON */}
        {rawOpen && (
          <pre
            style={{
              marginTop: 4,
              padding: 12,
              background: COLOR_BG,
              border: `1px solid ${COLOR_BORDER}`,
              color: COLOR_FG_MED,
              fontSize: 11,
              fontFamily: "'Space Mono', monospace",
              overflowX: 'auto',
              maxHeight: 360,
              whiteSpace: 'pre',
            }}
          >
            {JSON.stringify(card, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

// ── Admin management panel ────────────────────────────────────────────────
// Lists current admins; bootstrap admins can add new emails or remove
// non-bootstrap ones. Bootstrap admins themselves are shown but not removable.
function AdminListPanel({
  allAdmins,
  isBootstrap,
  onToast,
}: {
  allAdmins: string[];
  isBootstrap: boolean;
  onToast: (msg: string) => void;
}) {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const bootstrapSet = useMemo(
    () => new Set(BOOTSTRAP_ADMINS.map((e) => e.toLowerCase())),
    [],
  );

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || busy) return;
    setBusy(true);
    try {
      await addAdminEmail(input);
      onToast(`Added admin: ${input.trim().toLowerCase()}`);
      setInput('');
    } catch (err) {
      onToast(`Failed to add: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (email: string) => {
    if (!window.confirm(`Remove admin: ${email}?`)) return;
    setBusy(true);
    try {
      await removeAdminEmail(email);
      onToast(`Removed admin: ${email}`);
    } catch (err) {
      onToast(`Failed to remove: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        marginTop: 48,
        padding: 24,
        background: COLOR_SURFACE,
        border: `1px solid ${COLOR_BORDER}`,
      }}
    >
      <div style={{ ...LABEL, fontSize: 10, color: COLOR_ACCENT, marginBottom: 6 }}>
        Admin management
      </div>
      <h2 style={{ ...HEADING, fontSize: 18, margin: '0 0 4px', color: COLOR_FG }}>
        Who can access /admin/weekly
      </h2>
      <div style={{ ...BODY, fontSize: 12, color: COLOR_FG_LOW, marginBottom: 18, lineHeight: 1.5 }}>
        Bootstrap admins (hardcoded) cannot be removed. Other admins can be
        added or removed only by bootstrap admins. New admins can use the
        dashboards but cannot grant admin to anyone else.
      </div>

      {/* List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
        {allAdmins.map((email) => {
          const lower = email.toLowerCase();
          const isBoot = bootstrapSet.has(lower);
          return (
            <div
              key={email}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 14px',
                background: COLOR_SURFACE_2,
                border: `1px solid ${COLOR_BORDER}`,
              }}
            >
              <span style={{ ...BODY, fontSize: 13, color: COLOR_FG, flex: 1 }}>{email}</span>
              {isBoot ? (
                <span style={{ ...LABEL, fontSize: 9, color: COLOR_ACCENT }}>BOOTSTRAP</span>
              ) : (
                <button
                  type="button"
                  disabled={!isBootstrap || busy}
                  onClick={() => handleRemove(email)}
                  style={{
                    ...LABEL,
                    fontSize: 9,
                    padding: '6px 10px',
                    background: 'transparent',
                    color: isBootstrap ? COLOR_FG_MED : COLOR_FG_FAINT,
                    border: `1px solid ${COLOR_BORDER_STRONG}`,
                    cursor: isBootstrap && !busy ? 'pointer' : 'not-allowed',
                  }}
                >
                  Remove
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Add form */}
      {isBootstrap ? (
        <form onSubmit={handleAdd} style={{ display: 'flex', gap: 8 }}>
          <input
            type="email"
            placeholder="new-admin@example.com"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={busy}
            style={{
              ...BODY,
              fontSize: 13,
              flex: 1,
              padding: '10px 12px',
              background: COLOR_SURFACE_2,
              color: COLOR_FG,
              border: `1px solid ${COLOR_BORDER_STRONG}`,
              outline: 'none',
            }}
          />
          <button
            type="submit"
            disabled={!input.trim() || busy}
            style={{
              ...LABEL,
              fontSize: 10,
              padding: '10px 16px',
              background: input.trim() && !busy ? COLOR_ACCENT_NEON : COLOR_FG_FAINT,
              color: '#000',
              border: 'none',
              cursor: input.trim() && !busy ? 'pointer' : 'not-allowed',
            }}
          >
            {busy ? 'Adding…' : 'Add admin'}
          </button>
        </form>
      ) : (
        <div style={{ ...BODY, fontSize: 12, color: COLOR_FG_FAINT, fontStyle: 'italic' }}>
          Only bootstrap admins can add or remove admins. Ask a bootstrap admin
          ({BOOTSTRAP_ADMINS.join(', ')}) if you need to grant access.
        </div>
      )}
    </div>
  );
}

// ── Page component ────────────────────────────────────────────────────────
const AdminWeeklyPage: React.FC = () => {
  const navigate = useNavigate();
  const { isAdmin, loading: authLoading, isBootstrap, allAdmins } = useIsAdmin();

  const [week, setWeek] = useState<string>(() => {
    // Prefer current ISO week if a proposal for it exists; else first known.
    const current = isoWeek(new Date());
    return KNOWN_WEEKS.includes(current) ? current : KNOWN_WEEKS[0] ?? current;
  });
  const [proposal, setProposal] = useState<WeeklyProposalFile | null>(null);
  const [published, setPublished] = useState<WeeklyPublishedFile | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  const toast = useToast();

  // Redirect non-admins once auth has resolved.
  useEffect(() => {
    if (!authLoading && !isAdmin) {
      navigate('/', { replace: true });
    }
  }, [authLoading, isAdmin, navigate]);

  // Load proposal + published for the selected week
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    setDataLoading(true);
    setDataError(null);
    setProposal(null);
    setPublished(null);

    (async () => {
      try {
        const [propRes, pubRes] = await Promise.all([
          fetch(`/data/weekly-proposals/${week}.json`),
          fetch(`/data/weekly-curations/${week}.json`),
        ]);
        if (cancelled) return;
        if (propRes.ok) {
          setProposal((await propRes.json()) as WeeklyProposalFile);
        } else {
          setDataError(`No proposal file for ${week} (HTTP ${propRes.status})`);
        }
        if (pubRes.ok) {
          setPublished((await pubRes.json()) as WeeklyPublishedFile);
        } else {
          setPublished(null);
        }
      } catch (err) {
        if (!cancelled) setDataError(String(err));
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAdmin, week]);

  const handleCopy = useCallback(
    (text: string, label: string) => {
      navigator.clipboard
        .writeText(text)
        .then(() => toast.show(`Copied: ${label}. Paste into terminal.`))
        .catch(() => toast.show(`Copy failed. Command:\n${text}`));
    },
    [toast],
  );

  if (authLoading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
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

  if (!isAdmin) {
    // Will redirect; render nothing.
    return null;
  }

  return (
    // App.tsx pins its root with `overflow: hidden`, so this page needs its
    // own scroll container — otherwise content past the viewport (cards 4+)
    // is silently clipped.
    <div
      style={{
        position: 'absolute',
        inset: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
        background: COLOR_BG,
        color: COLOR_FG,
        paddingBottom: 100,
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {/* Global nav */}
      <div
        style={{
          position: 'fixed',
          top: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10001,
        }}
      >
        <GlobalNav isAdmin={isAdmin} />
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '88px 24px 24px' }}>
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div
            style={{
              ...LABEL,
              fontSize: 10,
              color: COLOR_ACCENT,
              marginBottom: 8,
            }}
          >
            Weekly Curation Admin
          </div>
          <h1 style={{ ...HEADING, fontSize: 28, margin: 0, color: COLOR_FG }}>
            Proposal review
          </h1>
          <div
            style={{
              ...BODY,
              fontSize: 13,
              color: COLOR_FG_LOW,
              marginTop: 6,
              lineHeight: 1.55,
              maxWidth: 680,
            }}
          >
            Review this week's proposal candidates. Choose one to publish as the Weekly curation,
            or promote others to the Special series. Publishing happens via terminal — the buttons
            below copy the exact <code style={{ color: COLOR_FG_MED }}>npm run weekly:publish</code>{' '}
            invocation to your clipboard. Edit the proposal JSON in your editor first if you want
            to tweak the title or intro before publishing.
          </div>
        </div>

        {/* Controls row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            flexWrap: 'wrap',
            paddingBottom: 18,
            marginBottom: 20,
            borderBottom: `1px solid ${COLOR_BORDER}`,
          }}
        >
          <label style={{ ...LABEL, fontSize: 10, color: COLOR_FG_LOW }}>WEEK</label>
          <select
            value={week}
            onChange={(e) => setWeek(e.target.value)}
            style={{
              ...BODY,
              fontFamily: "'Space Mono', monospace",
              fontSize: 12,
              padding: '8px 12px',
              background: COLOR_SURFACE,
              color: COLOR_FG,
              border: `1px solid ${COLOR_BORDER_STRONG}`,
            }}
          >
            {KNOWN_WEEKS.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ ...LABEL, fontSize: 10, color: COLOR_FG_LOW }}>STATUS:</span>
            {published ? (
              <span style={{ ...BODY, fontSize: 12, color: COLOR_ACCENT_NEON }}>
                Published · {published.title_en}
              </span>
            ) : (
              <span style={{ ...BODY, fontSize: 12, color: COLOR_FG_FAINT, fontStyle: 'italic' }}>
                Not yet published
              </span>
            )}
          </div>
        </div>

        {/* Content */}
        {dataLoading && (
          <div style={{ ...BODY, fontSize: 13, color: COLOR_FG_LOW, padding: 24 }}>
            Loading proposals…
          </div>
        )}
        {dataError && !dataLoading && (
          <div
            style={{
              ...BODY,
              fontSize: 12,
              padding: 18,
              background: COLOR_SURFACE,
              border: `1px solid ${COLOR_BORDER}`,
              color: COLOR_FG_MED,
            }}
          >
            {dataError}
            <div style={{ marginTop: 10, color: COLOR_FG_FAINT, fontSize: 11 }}>
              Run <code style={{ color: COLOR_FG_MED }}>npm run weekly:generate</code> to create
              proposals for this week.
            </div>
          </div>
        )}

        {!dataLoading && !dataError && proposal && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ ...LABEL, fontSize: 10, color: COLOR_FG_FAINT }}>
              {proposal.cards.length} candidate{proposal.cards.length === 1 ? '' : 's'} · generated{' '}
              {proposal.generated_at}
            </div>
            {proposal.cards.map((card) => (
              <WeeklyProposalCardView
                key={card.id}
                card={card}
                week={week}
                isPublished={published?.id === card.id}
                onCopy={handleCopy}
              />
            ))}
          </div>
        )}

        {/* Admin management — only bootstrap admins can write the list. */}
        <AdminListPanel
          allAdmins={allAdmins}
          isBootstrap={isBootstrap}
          onToast={(m) => toast.show(m)}
        />
      </div>

      {/* Toast */}
      {toast.msg && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '12px 18px',
            background: COLOR_FG,
            color: '#000',
            ...LABEL,
            fontSize: 11,
            zIndex: 20000,
            maxWidth: '90vw',
            whiteSpace: 'pre-wrap',
          }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
};

export default AdminWeeklyPage;
