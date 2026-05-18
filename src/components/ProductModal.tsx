import React, { useState, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { loadTossPayments } from '@tosspayments/payment-sdk';
import { Minus, Plus, X } from 'lucide-react';
import type { Artwork } from '../types/Artwork';
import type { RecommendationResponse, RecommendedArtwork } from '../types/Recommendation';
import { getWeservUrl } from '../utils/imageProxy';
import { useCart } from '../contexts/CartContext';
import {
  PRODUCT_TYPES,
  calculateSizesByRatio,
  formatPrice,
  getDynamicSizes,
  getProductTypeById,
  type ProductSizeOption,
} from '../features/cart/productCatalog';

interface ProductModalProps {
  artwork: Artwork;
  relatedArtworks?: Artwork[];
  onSelectArtwork?: (artwork: Artwork) => void;
  onClose: () => void;
}

const WORKER_URL = 'https://armin-semantic-search.armin-art.workers.dev';

type ArtworkWithMeta = Artwork & {
  width?: number;
  height?: number;
  title?: string;
};

type RecommendationItem = Partial<RecommendedArtwork> & {
  i?: string;
  n?: string;
  a?: string;
  y?: string | number;
  imageUrl?: string;
  url?: string;
};

const PAYMENT_METHODS = [
  { id: 'naverpay', name: '네이버페이', short: 'N', color: '#03C75A' },
  { id: 'kakaopay', name: '카카오페이', short: 'K', color: '#FEE500' },
  { id: 'tosspay', name: '토스페이', short: 'T', color: '#0064FF' },
];

export const ProductModal: React.FC<ProductModalProps> = ({ artwork, relatedArtworks = [], onSelectArtwork, onClose }) => {
  const { addItem } = useCart();
  const [selectedType, setSelectedType] = useState(PRODUCT_TYPES[0].id);
  const [selectedSize, setSelectedSize] = useState('M');
  const [selectedPayment, setSelectedPayment] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [sizes, setSizes] = useState<ProductSizeOption[]>(() => getDynamicSizes(artwork as any));
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' ? window.innerWidth < 840 : false);
  const [cartFeedback, setCartFeedback] = useState('');
  const [showPayment, setShowPayment] = useState(false);
  const [isLightTheme, setIsLightTheme] = useState<boolean>(() => {
    try {
      return localStorage.getItem('homeTheme') === 'light';
    } catch {
      return false;
    }
  });
  const [aiRecommendations, setAiRecommendations] = useState<RecommendationItem[]>([]);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 840);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const syncTheme = () => {
      try {
        setIsLightTheme(localStorage.getItem('homeTheme') === 'light');
      } catch {
        setIsLightTheme(false);
      }
    };
    window.addEventListener('storage', syncTheme);
    window.addEventListener('theme-changed', syncTheme);
    return () => {
      window.removeEventListener('storage', syncTheme);
      window.removeEventListener('theme-changed', syncTheme);
    };
  }, []);

  const uniqueRelatedArtworks = useMemo(() => {
    const seen = new Set<string>();
    return (relatedArtworks || []).filter((item) => {
      if (!item || !item.id) return false;
      if (String(item.id) === String(artwork.id)) return false;
      const key = String(item.id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [relatedArtworks, artwork.id]);

  useEffect(() => {
    setSizes(getDynamicSizes(artwork as any));
    setSelectedSize('M');
    setQuantity(1);
    setIsImageLoaded(false);
    setCartFeedback('');
  }, [artwork]);

  useEffect(() => {
    setAiRecommendations([]);
    const fetchAiRecommendations = async () => {
      try {
        const res = await fetch(`${WORKER_URL}/recommend-by-id`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: artwork.id, limit: 8 }),
        });
        if (!res.ok) return;

        const data = (await res.json()) as Partial<RecommendationResponse>;
        if (!Array.isArray(data?.results)) return;

        const seenIds = new Set<string>();
        const seenContent = new Set<string>();
        const normalize = (s: string) => (s || '').toLowerCase().trim();

        if (artwork.id) seenIds.add(String(artwork.id));
        const currentName = normalize(artwork.name || (artwork as ArtworkWithMeta).title || 'Untitled');
        const currentArtist = normalize(artwork.artist || 'Unknown Artist');
        seenContent.add(`${currentName}|${currentArtist}`);

        const uniqueResults: RecommendationItem[] = [];
        data.results.forEach((item) => {
          if (!item) return;
          const itemId = String(item.id || '');
          if (itemId && seenIds.has(itemId)) return;

          const iName = normalize(item.name || item.n || 'Untitled');
          const iArtist = normalize(item.artist || item.a || 'Unknown Artist');
          const contentKey = `${iName}|${iArtist}`;
          if (seenContent.has(contentKey)) return;

          if (itemId) seenIds.add(itemId);
          seenContent.add(contentKey);
          uniqueResults.push(item);
        });

        setAiRecommendations(uniqueResults);
      } catch (error) {
        console.warn('[ProductModal] AI recommendation failed:', error);
      }
    };

    fetchAiRecommendations();
  }, [artwork]);

  const productType = getProductTypeById(selectedType);
  const selectedSizeInfo = sizes.find((size) => size.id === selectedSize) || sizes[1] || sizes[0];
  const totalPrice = Math.round(productType.basePrice * (selectedSizeInfo?.multiplier || 1) * quantity);

  const palette = useMemo(() => {
    if (isLightTheme) {
      return {
        overlay: 'rgba(18,18,18,0.35)',
        panel: 'linear-gradient(170deg, #ffffff 0%, #f4f5f6 100%)',
        panelSolid: '#f7f7f8',
        panelAlt: '#ffffff',
        border: 'rgba(0,0,0,0.09)',
        borderSoft: 'rgba(0,0,0,0.06)',
        text: 'rgba(0,0,0,0.92)',
        textSub: 'rgba(0,0,0,0.64)',
        textMute: 'rgba(0,0,0,0.42)',
        accent: '#8A6B1F',
        accentBg: 'rgba(138,107,31,0.12)',
        accentBorder: 'rgba(138,107,31,0.25)',
        chip: 'rgba(0,0,0,0.04)',
        chipHover: 'rgba(0,0,0,0.07)',
        selectedChip: 'rgba(138,107,31,0.14)',
        selectedSolid: '#1f2a00',
      };
    }

    return {
      overlay: 'rgba(0,0,0,0.72)',
      panel: 'linear-gradient(170deg, #0E0E10 0%, #141418 100%)',
      panelSolid: '#111215',
      panelAlt: '#17181d',
      border: 'rgba(255,255,255,0.10)',
      borderSoft: 'rgba(255,255,255,0.06)',
      text: 'rgba(255,255,255,0.93)',
      textSub: 'rgba(255,255,255,0.72)',
      textMute: 'rgba(255,255,255,0.46)',
      accent: '#C7FF3D',
      accentBg: 'rgba(212,165,71,0.16)',
      accentBorder: 'rgba(212,165,71,0.28)',
      chip: 'rgba(255,255,255,0.08)',
      chipHover: 'rgba(255,255,255,0.12)',
      selectedChip: 'rgba(212,165,71,0.16)',
      selectedSolid: '#E8C56F',
    };
  }, [isLightTheme]);

  const resolvedArtworkImage = useMemo(() => {
    const url = artwork.image;
    if (!url) return '';

    try {
      const parsed = new URL(url);
      if (parsed.hostname === 'wsrv.nl' || parsed.hostname === 'images.weserv.nl') {
        const originalSrc = parsed.searchParams.get('url');
        if (originalSrc) return getWeservUrl(originalSrc, 1200, 92);
      }
    } catch {
      // Ignore URL parsing failures.
    }

    return getWeservUrl(url, 1200, 92);
  }, [artwork.image]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const handlePurchase = async () => {
    if (!showPayment) {
      setShowPayment(true);
      return;
    }
    if (!selectedPayment) {
      alert('결제 수단을 선택해주세요.');
      return;
    }

    try {
      const clientKey = import.meta.env.VITE_TOSS_CLIENT_KEY || 'test_ck_D5GePWvyJnrK0W0k6q8gLzN97Eoq';
      const tossPayments = await loadTossPayments(clientKey);

      const orderId = `order-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      const orderName = `${artwork.name} - ${productType.name} (${selectedSizeInfo?.name}) ${quantity}개`;

      let easyPayProvider = '';
      if (selectedPayment === 'naverpay') easyPayProvider = 'NAVERPAY';
      else if (selectedPayment === 'kakaopay') easyPayProvider = 'KAKAOPAY';
      else if (selectedPayment === 'tosspay') easyPayProvider = 'TOSSPAY';

      await tossPayments.requestPayment('카드', {
        amount: totalPrice,
        orderId,
        orderName,
        successUrl: `${window.location.origin}/payment/success`,
        failUrl: `${window.location.origin}/payment/fail`,
        flowMode: 'DIRECT',
        easyPay: easyPayProvider,
      } as any);
    } catch (error) {
      console.error('[ProductModal] Payment error:', error);
      if ((error as any)?.code !== 'USER_CANCEL') {
        alert(`결제 요청 중 오류가 발생했습니다: ${(error as any)?.message || '알 수 없는 오류'}`);
      }
    }
  };

  const handleAddToCart = () => {
    if (!selectedSizeInfo) return;

    addItem({
      artworkId: String(artwork.id || '').trim() || `${Date.now()}`,
      artworkName: artwork.name || (artwork as any).title || 'Untitled',
      artist: artwork.artist || 'Unknown Artist',
      year: Number(artwork.year) || undefined,
      image: resolvedArtworkImage || artwork.image,
      dimension: artwork.dimension,
      selectedType,
      selectedSizeId: selectedSizeInfo.id,
      quantity,
      sizeOptions: sizes.map((size) => ({ id: size.id, name: size.name, multiplier: size.multiplier })),
    });

    setCartFeedback('장바구니에 담았습니다.');
    window.setTimeout(() => setCartFeedback(''), 1400);
  };

  const renderRecommendationCard = (item: RecommendationItem, source: 'AI' | 'Artist') => {
    const image = item.image || item.i || item.url || item.imageUrl || '';
    const name = item.name || item.n || 'Untitled';
    const artist = item.artist || item.a || 'Unknown Artist';
    const year = item.year || item.y || '';
    if (!image) return null;

    return (
      <button
        key={`${source}-${String(item.id || `${name}-${artist}`)}`}
        type="button"
        onClick={() => {
          if (!onSelectArtwork) return;
          onSelectArtwork({
            ...(item as object),
            image,
            name,
            artist,
            year,
          } as Artwork);
        }}
        style={{
          cursor: 'pointer',
          borderTop: `1px solid ${palette.borderSoft}`,
          borderRight: `1px solid ${palette.borderSoft}`,
          borderBottom: `1px solid ${palette.borderSoft}`,
          borderLeft: `1px solid ${palette.borderSoft}`,
          background: palette.panelAlt,
          borderRadius: 10,
          padding: 8,
          display: 'flex',
          flexDirection: 'column',
          width: isMobile ? 130 : 148,
          minWidth: isMobile ? 130 : 148,
          maxWidth: isMobile ? 130 : 148,
          textAlign: 'left',
          color: palette.text,
          flex: '0 0 auto',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: '100%',
            aspectRatio: '1 / 1',
            borderRadius: 8,
            overflow: 'hidden',
            marginBottom: 7,
            background: palette.chip,
            position: 'relative',
          }}
        >
          <img
            src={getWeservUrl(image, 300, 85)}
            alt={name}
            loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
          <span
            style={{
              position: 'absolute',
              top: 6,
              left: 6,
              padding: '2px 6px',
              borderRadius: 999,
              fontSize: 8,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: source === 'AI' ? palette.accent : palette.textSub,
              background: source === 'AI' ? palette.accentBg : palette.chip,
              borderTop: `1px solid ${source === 'AI' ? palette.accentBorder : palette.borderSoft}`,
              borderRight: `1px solid ${source === 'AI' ? palette.accentBorder : palette.borderSoft}`,
              borderBottom: `1px solid ${source === 'AI' ? palette.accentBorder : palette.borderSoft}`,
              borderLeft: `1px solid ${source === 'AI' ? palette.accentBorder : palette.borderSoft}`,
            }}
          >
            {source}
          </span>
        </div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            lineHeight: 1.35,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            marginBottom: 2,
          }}
        >
          {name}
        </div>
        <div style={{ fontSize: 10, color: palette.textSub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{artist}</div>
        {year ? <div style={{ fontSize: 10, color: palette.textMute, marginTop: 1 }}>{String(year)}</div> : null}
      </button>
    );
  };

  return ReactDOM.createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 290000,
        background: palette.overlay,
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 14,
        animation: 'productFadeIn 0.28s ease-out',
      }}
    >
      <style>{`
        @keyframes productFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes productRiseUp {
          from { transform: translateY(18px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .product-modal-shell {
          animation: productRiseUp 0.34s cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        .product-modal-scroll::-webkit-scrollbar,
        .product-recs-scroll::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .product-modal-scroll::-webkit-scrollbar-track,
        .product-recs-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .product-modal-scroll::-webkit-scrollbar-thumb,
        .product-recs-scroll::-webkit-scrollbar-thumb {
          background: ${isLightTheme ? 'rgba(138,107,31,0.35)' : 'rgba(212,165,71,0.38)'};
          border-radius: 999px;
        }
        .product-modal-scroll::-webkit-scrollbar-thumb:hover,
        .product-recs-scroll::-webkit-scrollbar-thumb:hover {
          background: ${isLightTheme ? 'rgba(138,107,31,0.55)' : 'rgba(212,165,71,0.58)'};
        }
      `}</style>

      <div
        onClick={(event) => event.stopPropagation()}
        className="product-modal-shell product-modal-scroll"
        style={{
          width: '100%',
          maxWidth: 980,
          maxHeight: '92vh',
          overflowY: 'auto',
          background: palette.panel,
          borderRadius: isMobile ? 16 : 22,
          borderTop: `1px solid ${palette.border}`,
          borderRight: `1px solid ${palette.border}`,
          borderBottom: `1px solid ${palette.border}`,
          borderLeft: `1px solid ${palette.border}`,
          boxShadow: isLightTheme ? '0 30px 70px rgba(0,0,0,0.16)' : '0 36px 90px rgba(0,0,0,0.52)',
          position: 'relative',
        }}
      >
        <button
          onClick={onClose}
          title="닫기"
          style={{
            cursor: 'pointer',
            position: 'absolute',
            top: 14,
            right: 14,
            width: 34,
            height: 34,
            borderRadius: 999,
            borderTop: `1px solid ${palette.borderSoft}`,
            borderRight: `1px solid ${palette.borderSoft}`,
            borderBottom: `1px solid ${palette.borderSoft}`,
            borderLeft: `1px solid ${palette.borderSoft}`,
            color: palette.textSub,
            background: palette.chip,
            fontSize: 16,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 3,
          }}
        >
          <X size={16} strokeWidth={2.4} />
        </button>

        <div
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 2,
            padding: isMobile ? '14px 14px 12px' : '16px 20px 14px',
            background: isLightTheme ? 'rgba(252,252,252,0.86)' : 'rgba(12,12,14,0.82)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            borderBottom: `1px solid ${palette.borderSoft}`,
          }}
        >
          <div style={{ fontSize: 9, color: palette.textMute, letterSpacing: '0.16em', textTransform: 'uppercase' }}>Armin Print Lab</div>
          <div style={{ marginTop: 4, marginRight: 40, fontSize: isMobile ? 18 : 22, color: palette.text, lineHeight: 1.2, fontWeight: 700 }}>{artwork.name}</div>
          <div style={{ marginTop: 6, fontSize: 12, color: palette.textSub }}>{artwork.artist}{artwork.year ? ` · ${artwork.year}` : ''}</div>
        </div>

        <div style={{ padding: isMobile ? '14px 14px 18px' : '18px 20px 24px' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'minmax(0,1.05fr) minmax(0,1fr)',
              gap: isMobile ? 14 : 20,
            }}
          >
            <div
              style={{
                borderTop: `1px solid ${palette.borderSoft}`,
                borderRight: `1px solid ${palette.borderSoft}`,
                borderBottom: `1px solid ${palette.borderSoft}`,
                borderLeft: `1px solid ${palette.borderSoft}`,
                borderRadius: 14,
                background: palette.panelSolid,
                padding: isMobile ? 12 : 16,
              }}
            >
              <div
                style={{
                  width: '100%',
                  minHeight: isMobile ? 270 : 360,
                  borderRadius: 10,
                  background: isLightTheme
                    ? 'linear-gradient(160deg, #f1f1f1 0%, #ebebeb 100%)'
                    : 'linear-gradient(160deg, #16171b 0%, #101114 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 14,
                }}
              >
                <div
                  style={{
                    padding: selectedType === 'frame' ? 12 : 0,
                    background: selectedType === 'frame' ? (isLightTheme ? '#F5F5F5' : '#23252b') : 'transparent',
                    borderTop: selectedType === 'frame' ? `1px solid ${palette.border}` : 'none',
                    borderRight: selectedType === 'frame' ? `1px solid ${palette.border}` : 'none',
                    borderBottom: selectedType === 'frame' ? `1px solid ${palette.border}` : 'none',
                    borderLeft: selectedType === 'frame' ? `1px solid ${palette.border}` : 'none',
                    borderRadius: selectedType === 'frame' ? 2 : 0,
                    boxShadow: selectedType === 'frame'
                      ? (isLightTheme ? '0 10px 24px rgba(0,0,0,0.15)' : '0 14px 30px rgba(0,0,0,0.42)')
                      : 'none',
                    transition: 'all 0.28s ease',
                  }}
                >
                  <img
                    onLoad={(event) => {
                      const img = event.currentTarget;
                      if (img.naturalWidth && img.naturalHeight) {
                        const ratio = img.naturalWidth / img.naturalHeight;
                        setSizes(calculateSizesByRatio(ratio));
                      }
                      setIsImageLoaded(true);
                    }}
                    src={resolvedArtworkImage}
                    alt={artwork.name}
                    style={{
                      maxWidth: '100%',
                      maxHeight: isMobile ? 320 : 420,
                      width: 'auto',
                      height: 'auto',
                      objectFit: 'contain',
                      display: 'block',
                      borderRadius: selectedType === 'canvas' ? 4 : 0,
                      boxShadow: selectedType === 'canvas'
                        ? (isLightTheme ? '4px 4px 0 #d9d9d9, 8px 8px 0 #efefef' : '4px 4px 0 #24262c, 8px 8px 0 #1b1d22')
                        : selectedType === 'fabric'
                          ? (isLightTheme ? '0 8px 22px rgba(0,0,0,0.14)' : '0 8px 22px rgba(0,0,0,0.36)')
                          : (isLightTheme ? '0 6px 18px rgba(0,0,0,0.12)' : '0 8px 18px rgba(0,0,0,0.30)'),
                      transform: isImageLoaded ? 'scale(1)' : 'scale(0.97)',
                      opacity: isImageLoaded ? 1 : 0.45,
                      transition: 'all 0.35s ease',
                    }}
                  />
                </div>
              </div>

              <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <span
                  style={{
                    fontSize: 9,
                    color: palette.textSub,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    padding: '4px 9px',
                    borderRadius: 999,
                    background: palette.chip,
                    borderTop: `1px solid ${palette.borderSoft}`,
                    borderRight: `1px solid ${palette.borderSoft}`,
                    borderBottom: `1px solid ${palette.borderSoft}`,
                    borderLeft: `1px solid ${palette.borderSoft}`,
                  }}
                >
                  {productType.nameEn}
                </span>
                <span
                  style={{
                    fontSize: 9,
                    color: palette.textSub,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    padding: '4px 9px',
                    borderRadius: 999,
                    background: palette.chip,
                    borderTop: `1px solid ${palette.borderSoft}`,
                    borderRight: `1px solid ${palette.borderSoft}`,
                    borderBottom: `1px solid ${palette.borderSoft}`,
                    borderLeft: `1px solid ${palette.borderSoft}`,
                  }}
                >
                  {selectedSizeInfo?.name}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <section
                style={{
                  borderTop: `1px solid ${palette.borderSoft}`,
                  borderRight: `1px solid ${palette.borderSoft}`,
                  borderBottom: `1px solid ${palette.borderSoft}`,
                  borderLeft: `1px solid ${palette.borderSoft}`,
                  borderRadius: 14,
                  background: palette.panelSolid,
                  padding: 12,
                }}
              >
                <div style={{ marginBottom: 9, fontSize: 10, color: palette.textMute, letterSpacing: '0.13em', textTransform: 'uppercase' }}>상품 종류</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                  {PRODUCT_TYPES.map((type) => {
                    const isSelected = selectedType === type.id;
                    return (
                      <button
                        key={type.id}
                        type="button"
                        onClick={() => setSelectedType(type.id)}
                        style={{
                          cursor: 'pointer',
                          borderTop: `1px solid ${isSelected ? palette.accentBorder : palette.borderSoft}`,
                          borderRight: `1px solid ${isSelected ? palette.accentBorder : palette.borderSoft}`,
                          borderBottom: `1px solid ${isSelected ? palette.accentBorder : palette.borderSoft}`,
                          borderLeft: `1px solid ${isSelected ? palette.accentBorder : palette.borderSoft}`,
                          borderRadius: 10,
                          padding: '10px 9px',
                          textAlign: 'left',
                          background: isSelected ? palette.selectedChip : palette.chip,
                          color: isSelected ? palette.text : palette.textSub,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                        }}
                      >
                        <div
                          style={{
                            width: 26,
                            height: 26,
                            borderRadius: 8,
                            borderTop: `1px solid ${isSelected ? palette.accentBorder : palette.borderSoft}`,
                            borderRight: `1px solid ${isSelected ? palette.accentBorder : palette.borderSoft}`,
                            borderBottom: `1px solid ${isSelected ? palette.accentBorder : palette.borderSoft}`,
                            borderLeft: `1px solid ${isSelected ? palette.accentBorder : palette.borderSoft}`,
                            background: isSelected ? palette.accentBg : palette.panelAlt,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 10,
                            letterSpacing: '0.04em',
                            color: isSelected ? palette.accent : palette.textSub,
                            flexShrink: 0,
                          }}
                        >
                          {type.marker}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{type.name}</div>
                          <div style={{ fontSize: 10, color: palette.textMute }}>{formatPrice(type.basePrice)}~</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section
                style={{
                  borderTop: `1px solid ${palette.borderSoft}`,
                  borderRight: `1px solid ${palette.borderSoft}`,
                  borderBottom: `1px solid ${palette.borderSoft}`,
                  borderLeft: `1px solid ${palette.borderSoft}`,
                  borderRadius: 14,
                  background: palette.panelSolid,
                  padding: 12,
                }}
              >
                <div style={{ marginBottom: 9, fontSize: 10, color: palette.textMute, letterSpacing: '0.13em', textTransform: 'uppercase' }}>크기</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {sizes.map((size) => {
                    const isSelected = selectedSize === size.id;
                    return (
                      <button
                        key={size.id}
                        type="button"
                        onClick={() => setSelectedSize(size.id)}
                        style={{
                          cursor: 'pointer',
                          borderTop: `1px solid ${isSelected ? palette.accentBorder : palette.borderSoft}`,
                          borderRight: `1px solid ${isSelected ? palette.accentBorder : palette.borderSoft}`,
                          borderBottom: `1px solid ${isSelected ? palette.accentBorder : palette.borderSoft}`,
                          borderLeft: `1px solid ${isSelected ? palette.accentBorder : palette.borderSoft}`,
                          borderRadius: 999,
                          padding: '7px 12px',
                          background: isSelected ? palette.selectedChip : palette.chip,
                          color: isSelected ? palette.text : palette.textSub,
                          fontSize: 11,
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {size.name}
                      </button>
                    );
                  })}
                </div>
              </section>

              <section
                style={{
                  borderTop: `1px solid ${palette.borderSoft}`,
                  borderRight: `1px solid ${palette.borderSoft}`,
                  borderBottom: `1px solid ${palette.borderSoft}`,
                  borderLeft: `1px solid ${palette.borderSoft}`,
                  borderRadius: 14,
                  background: palette.panelSolid,
                  padding: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ marginBottom: 7, fontSize: 10, color: palette.textMute, letterSpacing: '0.13em', textTransform: 'uppercase' }}>수량</div>
                  <div style={{ fontSize: 12, color: palette.textSub }}>총 {quantity}개</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    style={{
                      cursor: 'pointer',
                      width: 32,
                      height: 32,
                      borderRadius: 999,
                      borderTop: `1px solid ${palette.borderSoft}`,
                      borderRight: `1px solid ${palette.borderSoft}`,
                      borderBottom: `1px solid ${palette.borderSoft}`,
                      borderLeft: `1px solid ${palette.borderSoft}`,
                      background: palette.chip,
                      color: palette.text,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 0,
                    }}
                  >
                    <Minus size={14} strokeWidth={2.3} />
                  </button>
                  <div style={{ minWidth: 28, textAlign: 'center', color: palette.text, fontSize: 18, fontWeight: 700 }}>{quantity}</div>
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.min(99, q + 1))}
                    style={{
                      cursor: 'pointer',
                      width: 32,
                      height: 32,
                      borderRadius: 999,
                      borderTop: `1px solid ${palette.borderSoft}`,
                      borderRight: `1px solid ${palette.borderSoft}`,
                      borderBottom: `1px solid ${palette.borderSoft}`,
                      borderLeft: `1px solid ${palette.borderSoft}`,
                      background: palette.chip,
                      color: palette.text,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 0,
                    }}
                  >
                    <Plus size={14} strokeWidth={2.3} />
                  </button>
                </div>
              </section>
              <section
                style={{
                  borderTop: `1px solid ${palette.borderSoft}`,
                  borderRight: `1px solid ${palette.borderSoft}`,
                  borderBottom: `1px solid ${palette.borderSoft}`,
                  borderLeft: `1px solid ${palette.borderSoft}`,
                  borderRadius: 14,
                  background: palette.panelSolid,
                  padding: 14,
                  marginTop: 14,
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <div style={{ fontSize: 11, color: palette.textMute }}>총 결제 금액 <span style={{fontSize: 10, opacity: 0.6}}>(옵션 포함)</span></div>
                    <div style={{ fontSize: 24, color: palette.text, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1 }}>{formatPrice(totalPrice)}</div>
                  </div>
                  {cartFeedback && (
                    <div style={{ fontSize: 11, color: palette.accent, fontWeight: 700, textAlign: 'right' }}>{cartFeedback}</div>
                  )}
                  
                  <div style={{ display: 'flex', gap: 8, width: '100%' }}>
                    <button
                      type="button"
                      onClick={handleAddToCart}
                      style={{
                        flex: 1,
                        cursor: 'pointer',
                        border: `1px solid ${palette.accentBorder}`,
                        borderRadius: 12,
                        padding: '12px 0',
                        background: palette.selectedChip,
                        color: palette.accent,
                        fontSize: 13,
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      장바구니 담기
                    </button>
                    <button
                      type="button"
                      onClick={handlePurchase}
                      style={{
                        flex: showPayment ? 1 : 1.5,
                        cursor: 'pointer',
                        border: `1px solid ${showPayment ? palette.accentBorder : palette.borderSoft}`,
                        borderRadius: 12,
                        padding: '12px 0',
                        background: showPayment
                          ? (isLightTheme ? palette.selectedSolid : palette.accent)
                          : palette.chip,
                        color: showPayment
                          ? (isLightTheme ? '#F3FFD0' : '#121212')
                          : palette.textMute,
                        fontSize: 13,
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      {showPayment ? '결제 진행' : '구매하기'}
                    </button>
                  </div>
                </div>
              </section>

              {showPayment && (
                <section
                  style={{
                    borderTop: `1px solid ${palette.borderSoft}`,
                    borderRight: `1px solid ${palette.borderSoft}`,
                    borderBottom: `1px solid ${palette.borderSoft}`,
                    borderLeft: `1px solid ${palette.borderSoft}`,
                    borderRadius: 14,
                    background: palette.panelSolid,
                    padding: isMobile ? 12 : 14,
                    animation: 'productFadeIn 0.28s ease-out',
                  }}
                >
                  <div style={{ marginBottom: 10, fontSize: 10, color: palette.textMute, letterSpacing: '0.13em', textTransform: 'uppercase' }}>결제 수단</div>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
                    {PAYMENT_METHODS.map((method) => {
                      const isSelected = selectedPayment === method.id;
                      return (
                        <button
                          key={method.id}
                          type="button"
                          onClick={() => setSelectedPayment(method.id)}
                          style={{
                            cursor: 'pointer',
                            borderTop: `1px solid ${isSelected ? palette.accentBorder : palette.borderSoft}`,
                            borderRight: `1px solid ${isSelected ? palette.accentBorder : palette.borderSoft}`,
                            borderBottom: `1px solid ${isSelected ? palette.accentBorder : palette.borderSoft}`,
                            borderLeft: `1px solid ${isSelected ? palette.accentBorder : palette.borderSoft}`,
                            borderRadius: 10,
                            background: isSelected ? palette.selectedChip : palette.panelAlt,
                            color: palette.text,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
                            padding: '10px 8px',
                          }}
                        >
                          <span
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: 7,
                              background: method.color,
                              color: method.id === 'kakaopay' ? '#000' : '#fff',
                              fontSize: 12,
                              fontWeight: 700,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            {method.short}
                          </span>
                          <span style={{ fontSize: 12, fontWeight: 600 }}>{method.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}
            </div>
          </div>

          <section style={{ marginTop: 18 }}>
            <div style={{ marginBottom: 9, fontSize: 10, color: palette.textMute, letterSpacing: '0.13em', textTransform: 'uppercase' }}>실제 상품 사진</div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
              {[1, 2, 3].map((index) => (
                <div
                  key={index}
                  style={{
                    borderRadius: 10,
                    borderTop: `1px dashed ${palette.border}`,
                    borderRight: `1px dashed ${palette.border}`,
                    borderBottom: `1px dashed ${palette.border}`,
                    borderLeft: `1px dashed ${palette.border}`,
                    minHeight: isMobile ? 88 : 102,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    color: palette.textMute,
                    background: palette.chip,
                  }}
                >
                  Sample {index}
                </div>
              ))}
            </div>
          </section>

          {(aiRecommendations.length > 0 || uniqueRelatedArtworks.length > 0) && (
            <section style={{ marginTop: 18 }}>
              <div style={{ marginBottom: 9, fontSize: 10, color: palette.textMute, letterSpacing: '0.13em', textTransform: 'uppercase' }}>추천 작품</div>

              {aiRecommendations.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ marginBottom: 8, fontSize: 11, color: palette.textSub }}>비슷한 분위기 (AI)</div>
                  <div className="product-recs-scroll" style={{ display: 'flex', flexWrap: 'nowrap', gap: 9, overflowX: 'auto', paddingBottom: 8 }}>
                    {aiRecommendations.map((item) => renderRecommendationCard(item, 'AI'))}
                  </div>
                </div>
              )}

              {uniqueRelatedArtworks.length > 0 && (
                <div>
                  <div style={{ marginBottom: 8, fontSize: 11, color: palette.textSub }}>이 작가의 다른 작품</div>
                  <div className="product-recs-scroll" style={{ display: 'flex', flexWrap: 'nowrap', gap: 9, overflowX: 'auto', paddingBottom: 8 }}>
                    {uniqueRelatedArtworks.map((item) => renderRecommendationCard(item, 'Artist'))}
                  </div>
                </div>
              )}
            </section>
          )}


        </div>
      </div>
    </div>,
    document.body
  );
};

export default ProductModal;