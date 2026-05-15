// SubscribeModal — paywall checkout sheet for ARMIN Weekly+.
//
// Triggered when a signed-out or non-subscribed user clicks a locked card
// in the Weekly Archive / Special grids. Two CTA paths:
//   1. Not signed in → dispatch 'auth:request-login' (matches App.tsx
//      pattern at line 391) and close.
//   2. Signed in → kick off Toss Payments requestPayment("카드", ...) for
//      ₩4,900 / 1 month. Success URL appends `?type=weekly-subscription`
//      so PaymentSuccessPage can branch (TODO below).
//
// Inline styles only — matches the dark-luxury look of WeeklyCurationTab.

import React, { useEffect } from 'react';
import { loadTossPayments } from '@tosspayments/payment-sdk';
import { Lock, Sparkles, Library, X } from 'lucide-react';
import { auth } from '../firebase';

export interface SubscribeModalProps {
  open: boolean;
  onClose: () => void;
  triggerContext?: 'archive' | 'special';
}

// V1: hardcoded price. Will move to remote config / Firestore once we
// have a real pricing experiment.
const MONTHLY_PRICE_KRW = 4900;

const FG = '#F4F1EA';
const FG_LOW = 'rgba(244,241,234,0.55)';
const FG_FAINT = 'rgba(244,241,234,0.35)';
const ACCENT = '#CCFF00';
const DIVIDER = 'rgba(244,241,234,0.12)';

const LABEL: React.CSSProperties = {
  fontFamily: "'Space Mono', monospace",
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
};

const SerifTitle: React.CSSProperties = {
  fontFamily: "'Cormorant Garamond', 'Noto Serif KR', serif",
  fontWeight: 300,
};

export default function SubscribeModal({ open, onClose, triggerContext = 'archive' }: SubscribeModalProps) {
  // Close on Escape — small affordance, matches other ARMIN modals.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  const handleSubscribe = async () => {
    const user = auth.currentUser;
    if (!user) {
      // Pattern: App.tsx listens for 'auth:request-login' to open the
      // login modal (see App.tsx:392).
      window.dispatchEvent(new CustomEvent('auth:request-login'));
      onClose();
      return;
    }

    try {
      const clientKey = import.meta.env.VITE_TOSS_CLIENT_KEY || 'test_ck_D5GePWvyJnrK0W0k6q8gLzN97Eoq';
      const tossPayments = await loadTossPayments(clientKey);
      const orderId = `armin-weekly-${user.uid}-${Date.now()}`;

      // TODO(payment-success): PaymentSuccessPage.tsx must check
      // `searchParams.get('type') === 'weekly-subscription'` after Toss
      // confirms the charge, then upsert
      //   users/{uid}/private/subscription = {
      //     expires_at: Timestamp(now + 30 days),
      //     plan: 'monthly',
      //   }
      // so useSubscription() flips isSubscriber → true. Until that
      // wiring lands, a paid user will still see locked cards.
      await tossPayments.requestPayment('카드', {
        amount: MONTHLY_PRICE_KRW,
        orderId,
        orderName: 'ARMIN Weekly+ 구독 (1개월)',
        successUrl: `${window.location.origin}/payment/success?type=weekly-subscription`,
        failUrl: `${window.location.origin}/payment/fail`,
      } as any);
    } catch (error) {
      if ((error as any)?.code !== 'USER_CANCEL') {
        // eslint-disable-next-line no-console
        console.error('[SubscribeModal] Toss request failed', error);
      }
    }
  };

  // triggerContext currently only influences the eyebrow line; both
  // grids reveal the same content but the copy nods to where they came
  // from. Useful for analytics later.
  const eyebrowEn = triggerContext === 'special' ? 'Special series · unlock' : 'Archive · unlock';
  const eyebrowKo = triggerContext === 'special' ? '특집 시리즈 · 잠금 해제' : '아카이브 · 잠금 해제';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Subscribe to ARMIN Weekly+"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.85)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#0B0B0B',
          border: `1px solid ${DIVIDER}`,
          width: '100%',
          maxWidth: 480,
          padding: 'clamp(28px, 5vw, 44px)',
          position: 'relative',
          color: FG,
        }}
      >
        {/* Close (X) */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            background: 'transparent',
            border: 'none',
            color: FG_LOW,
            cursor: 'pointer',
            padding: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <X size={18} />
        </button>

        {/* Eyebrow */}
        <div style={{
          ...LABEL,
          fontSize: 10,
          color: ACCENT,
          marginBottom: 18,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <Lock size={11} strokeWidth={1.5} />
          <span>{eyebrowEn}</span>
          <span style={{ color: FG_FAINT }}>·</span>
          <span style={{ color: FG_LOW }}>{eyebrowKo}</span>
        </div>

        {/* Title */}
        <h2 style={{
          ...SerifTitle,
          fontSize: 'clamp(28px, 4.5vw, 36px)',
          lineHeight: 1.1,
          margin: '0 0 8px 0',
          letterSpacing: '-0.01em',
        }}>
          ARMIN Weekly<span style={{ color: ACCENT }}>+</span>
        </h2>
        <p style={{
          ...LABEL,
          fontSize: 10,
          color: FG_LOW,
          margin: '0 0 26px 0',
        }}>
          The full curated archive
        </p>

        {/* Price */}
        <div style={{
          padding: '18px 0',
          borderTop: `1px solid ${DIVIDER}`,
          borderBottom: `1px solid ${DIVIDER}`,
          marginBottom: 24,
          display: 'flex',
          alignItems: 'baseline',
          gap: 8,
        }}>
          <span style={{
            ...SerifTitle,
            fontSize: 40,
            lineHeight: 1,
            letterSpacing: '-0.02em',
          }}>
            ₩{MONTHLY_PRICE_KRW.toLocaleString()}
          </span>
          <span style={{ ...LABEL, fontSize: 11, color: FG_LOW }}>
            / month · 월
          </span>
        </div>

        {/* Benefits */}
        <ul style={{
          listStyle: 'none',
          margin: '0 0 28px 0',
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}>
          <Benefit
            icon={<Library size={16} strokeWidth={1.4} />}
            title="모든 지난 큐레이션 무제한 접근"
            sub="Unlimited access to every past weekly curation"
          />
          <Benefit
            icon={<Sparkles size={16} strokeWidth={1.4} />}
            title="모든 특집 시리즈"
            sub="All Special Series editions, unlocked"
          />
          <Benefit
            icon={<Lock size={16} strokeWidth={1.4} />}
            title="한 큐레이터의 6년치 아카이브, 한 권의 책처럼"
            sub="Six years of one curator's eye, read like a book"
          />
        </ul>

        {/* CTA */}
        <button
          type="button"
          onClick={handleSubscribe}
          style={{
            width: '100%',
            background: ACCENT,
            color: '#0B0B0B',
            border: 'none',
            padding: '16px 20px',
            ...LABEL,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            letterSpacing: '0.18em',
          }}
        >
          구독하기 · Subscribe
        </button>

        {/* Cancel link */}
        <button
          type="button"
          onClick={onClose}
          style={{
            width: '100%',
            background: 'transparent',
            color: FG_LOW,
            border: 'none',
            padding: '14px 0 6px 0',
            ...LABEL,
            fontSize: 10,
            cursor: 'pointer',
          }}
        >
          취소 · Cancel
        </button>

        {/* Footer note */}
        <p style={{
          margin: '14px 0 0 0',
          fontFamily: "'Cormorant Garamond', 'Noto Serif KR', serif",
          fontStyle: 'italic',
          fontSize: 12,
          color: FG_FAINT,
          textAlign: 'center',
          lineHeight: 1.4,
        }}>
          월 자동 갱신 · 언제든 해지 가능
          <br />
          Auto-renews monthly · Cancel anytime
        </p>
      </div>
    </div>
  );
}

// Small internal row for the benefit list. Kept inline (not exported)
// because nothing else needs this layout yet — wait for the third use.
function Benefit({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <li style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <span style={{
        color: ACCENT,
        marginTop: 2,
        flexShrink: 0,
        display: 'inline-flex',
      }}>
        {icon}
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{
          fontFamily: "'Noto Serif KR', 'Cormorant Garamond', serif",
          fontWeight: 400,
          fontSize: 15,
          color: FG,
          lineHeight: 1.4,
        }}>
          {title}
        </span>
        <span style={{
          ...LABEL,
          fontSize: 9.5,
          color: FG_FAINT,
        }}>
          {sub}
        </span>
      </span>
    </li>
  );
}
