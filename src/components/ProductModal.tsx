import React, { useState, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { loadTossPayments } from '@tosspayments/payment-sdk';
import type { Artwork } from '../types/Artwork';
import { getWeservUrl } from '../utils/imageProxy';

interface ProductModalProps {
    artwork: Artwork;
    relatedArtworks?: Artwork[];
    onSelectArtwork?: (artwork: Artwork) => void;
    onClose: () => void;
}

const WORKER_URL = 'https://armin-semantic-search.armin-art.workers.dev';

// Product types with base prices (KRW)
const PRODUCT_TYPES = [
    { id: 'poster', name: '포스터', nameEn: 'Poster', icon: '🖼️', basePrice: 15000 },
    { id: 'frame', name: '액자', nameEn: 'Framed Print', icon: '🪟', basePrice: 45000 },
    { id: 'canvas', name: '캔버스', nameEn: 'Canvas', icon: '🎨', basePrice: 65000 },
    { id: 'fabric', name: '패브릭 포스터', nameEn: 'Fabric Poster', icon: '🧵', basePrice: 35000 },
];

// Base sizes configuration
const BASE_SIZES = [
    { id: 'S', longEdge: 30, multiplier: 1 },
    { id: 'M', longEdge: 50, multiplier: 1.5 },
    { id: 'L', longEdge: 70, multiplier: 2.2 },
    { id: 'XL', longEdge: 100, multiplier: 3.5 },
    { id: 'XXL', longEdge: 150, multiplier: 5.0 },
];

// Calculate sizes based on aspect ratio
function calculateSizesByRatio(ratio: number) {
    return BASE_SIZES.map(base => {
        let w, h;
        // ratio = Width / Height
        if (ratio >= 1) { // Landscape
            w = base.longEdge;
            h = Math.round(base.longEdge / ratio);
        } else { // Portrait
            h = base.longEdge;
            w = Math.round(base.longEdge * ratio);
        }

        return {
            ...base,
            name: `${base.id} (${w}×${h}cm)`
        };
    });
}

function getDynamicSizes(artwork: Artwork) {
    let ratio = 1.0;

    if ((artwork as any).width && (artwork as any).height) {
        ratio = (artwork as any).width / (artwork as any).height;
    } else if (artwork.dimension) {
        const nums = artwork.dimension.match(/[\d.]+/g)?.map(Number).filter(n => !isNaN(n));
        if (nums && nums.length >= 2) {
            ratio = nums[0] / nums[1];
        }
    }
    return calculateSizesByRatio(ratio);
}


// Payment methods (Korean)
const PAYMENT_METHODS = [
    { id: 'naverpay', name: '네이버페이', icon: '/icons/naverpay.svg', color: '#03C75A' },
    { id: 'kakaopay', name: '카카오페이', icon: '/icons/kakaopay.svg', color: '#FEE500' },
    { id: 'tosspay', name: '토스페이', icon: '/icons/tosspay.svg', color: '#0064FF' },
];

// Format price in Korean Won
const formatPrice = (price: number): string => {
    return new Intl.NumberFormat('ko-KR', {
        style: 'currency',
        currency: 'KRW',
        maximumFractionDigits: 0
    }).format(price);
};

export const ProductModal: React.FC<ProductModalProps> = ({ artwork, onClose, relatedArtworks = [], onSelectArtwork }) => {
    const [selectedType, setSelectedType] = useState(PRODUCT_TYPES[0].id);
    const [selectedSize, setSelectedSize] = useState('M');
    const [selectedPayment, setSelectedPayment] = useState<string | null>(null);
    const [quantity, setQuantity] = useState(1);
    const [isImageLoaded, setIsImageLoaded] = useState(false);
    const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" ? window.innerWidth < 768 : false);

    useEffect(() => {
        const onResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    const uniqueRelatedArtworks = useMemo(() => {
        if (!relatedArtworks) return [];
        const seen = new Set<string>();
        return relatedArtworks.filter(item => {
            if (!item || !item.id) return false;
            if (String(item.id) === String(artwork.id)) return false;
            
            if (seen.has(String(item.id))) return false;
            seen.add(String(item.id));
            return true;
        });
    }, [relatedArtworks, artwork.id]);

    // Dynamic sizes based on artwork dimensions
    // Initial estimation + Update regarding real image ratio
    // Dynamic sizes based on artwork dimensions
    // Initial estimation + Update regarding real image ratio
    const [sizes, setSizes] = useState(() => getDynamicSizes(artwork));
    const [aiRecommendations, setAiRecommendations] = useState<any[]>([]);

    useEffect(() => {
        setSizes(getDynamicSizes(artwork));

        // AI Recommendation Fetch
        setAiRecommendations([]);
        const fetchAiRecommendations = async () => {
            try {
                const res = await fetch(`${WORKER_URL}/recommend-by-id`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: artwork.id, limit: 6 })
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.results && Array.isArray(data.results)) {
                        // Deduplicate results
                        const seenIds = new Set<string>();
                        const seenContent = new Set<string>();

                        // Exclude current artwork
                        if (artwork.id) seenIds.add(artwork.id);

                        // Normalize current artwork fields to exclude it
                        const curArt = artwork as any;
                        const normalize = (s: string) => (s || '').toLowerCase().trim();
                        const cName = normalize(artwork.name || curArt.title || 'Untitled');
                        const cArtist = normalize(artwork.artist || 'Unknown Artist');

                        // Add current artwork content to seen set
                        seenContent.add(`${cName}|${cArtist}`);

                        const uniqueResults: any[] = [];

                        data.results.forEach((item: any) => {
                            if (!item) return;

                            // 1. Check ID
                            if (seenIds.has(item.id)) return;

                            // 2. Check Content (Name + Artist) to avoid duplicates
                            const iName = normalize(item.name || item.n || 'Untitled');
                            const iArtist = normalize(item.artist || item.a || 'Unknown Artist');

                            // Create a content signature
                            const contentKey = `${iName}|${iArtist}`;

                            if (seenContent.has(contentKey)) return;

                            seenIds.add(item.id);
                            seenContent.add(contentKey);
                            uniqueResults.push(item);
                        });

                        setAiRecommendations(uniqueResults);
                    }
                }
            } catch (e) {
                console.warn('AI Recommendation failed:', e);
            }
        };
        fetchAiRecommendations();
    }, [artwork]);

    // Calculate price
    const productType = PRODUCT_TYPES.find(t => t.id === selectedType);
    const size = sizes.find(s => s.id === selectedSize) || sizes[1]; // Default to M or second item
    const basePrice = productType?.basePrice || 15000;
    const multiplier = size?.multiplier || 1;
    const totalPrice = Math.round(basePrice * multiplier * quantity);

    // Close on ESC key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    // Prevent body scroll when modal is open
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = '';
        };
    }, []);

    const handlePurchase = async () => {
        if (!selectedPayment) {
            alert('결제 수단을 선택해주세요.');
            return;
        }

        try {
            // 환경 변수에서 클라이언트 키를 가져오거나 테스트 키 사용
            // 실제 운영 시에는 .env 파일에 VITE_TOSS_CLIENT_KEY=live_ck_... 를 설정하세요.
            const clientKey = import.meta.env.VITE_TOSS_CLIENT_KEY || 'test_ck_D5GePWvyJnrK0W0k6q8gLzN97Eoq';
            const tossPayments = await loadTossPayments(clientKey);

            // 주문 ID 생성 (실제로는 서버에서 생성하거나 UUID 사용 권장)
            const orderId = `order-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const orderName = `${artwork.name} - ${productType?.name} (${size?.name}) ${quantity}개`;

            // 간편결제 제공자 매핑
            let easyPayProvider = '';
            if (selectedPayment === 'naverpay') easyPayProvider = 'NAVERPAY';
            else if (selectedPayment === 'kakaopay') easyPayProvider = 'KAKAOPAY';
            else if (selectedPayment === 'tosspay') easyPayProvider = 'TOSSPAY';

            // 결제 요청 (간편결제 다이렉트 호출)
            await tossPayments.requestPayment('카드', {
                amount: totalPrice,
                orderId: orderId,
                orderName: orderName,
                successUrl: `${window.location.origin}/payment/success`,
                failUrl: `${window.location.origin}/payment/fail`,
                flowMode: 'DIRECT',
                easyPay: easyPayProvider
            } as any);

        } catch (error) {
            console.error('Payment Error:', error);
            // 사용자가 결제창을 닫은 경우 등 에러 처리
            if ((error as any).code === 'USER_CANCEL') {
                // 사용자 취소는 알림 없이 조용히 처리하거나 토스트 메시지
            } else {
                alert(`결제 요청 중 오류가 발생했습니다: ${(error as any).message}`);
            }
        }
    };

    return ReactDOM.createPortal(
        <div
            onClick={onClose}
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 20000,
                background: 'rgba(0, 0, 0, 0.6)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 16,
                animation: 'fadeIn 0.3s ease-out'
            }}
        >
            <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { transform: translateY(40px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .product-modal-content {
          animation: slideUp 0.4s ease-out;
        }
        .product-type-btn {
          transition: all 0.25s ease;
          border: 2px solid #e5e5e5;
        }
        .product-type-btn:hover {
          border-color: #222;
          background: #fafafa;
        }
        .product-type-btn.selected {
          border-color: #222;
          background: #222;
        }
        .product-type-btn.selected .type-name,
        .product-type-btn.selected .type-price {
          color: #fff !important;
        }
        .size-btn {
          transition: all 0.25s ease;
          border: 2px solid #e5e5e5;
        }
        .size-btn:hover {
          border-color: #222;
          background: #f5f5f5;
        }
        .size-btn.selected {
          background: #222;
          color: white;
          border-color: #222;
        }
        .payment-btn {
          transition: all 0.25s ease;
          border: 2px solid #e5e5e5;
        }
        .payment-btn:hover {
          border-color: #222;
        }
        .payment-btn.selected {
          border-color: #222;
          background: #f0f0f0;
        }
        .product-image-container {
          position: relative;
          overflow: hidden;
          border-radius: 12px;
          background: #fff;
          display: 'flex';
          align-items: center;
          justify-content: center;
        }
        .purchase-btn {
          transition: all 0.3s ease;
          position: relative;
          overflow: hidden;
        }
        .purchase-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0,0,0,0.15);
        }
        .purchase-btn:active {
          transform: translateY(0);
        }
        .quantity-btn {
          transition: all 0.15s ease;
        }
        .quantity-btn:hover {
          background: #f0f0f0;
        }
        .quantity-btn:active {
          transform: scale(0.95);
        }
        .product-photos-section {
          border-top: 1px solid #e5e5e5;
          padding-top: 24px;
          margin-top: 24px;
        }
        .product-photo-placeholder {
          aspect-ratio: 4/3;
          background: #f8f8f8;
          border-radius: 8px;
          border: 1px dashed #ddd;
          display: flex;
          align-items: center;
          justify-content: center;
          color: '#999';
          font-size: 13px;
        }
        .scroll-container::-webkit-scrollbar {
          width: 6px;
        }
        .scroll-container::-webkit-scrollbar-track {
          background: #f5f5f5;
          border-radius: 3px;
        }
        .scroll-container::-webkit-scrollbar-thumb {
          background: #ccc;
          border-radius: 3px;
        }
        .scroll-container::-webkit-scrollbar-thumb:hover {
          background: #aaa;
        }
      `}</style>

            <div
                onClick={(e) => e.stopPropagation()}
                className="product-modal-content scroll-container"
                style={{
                    background: '#fff',
                    borderRadius: 16,
                    maxWidth: 900,
                    width: '100%',
                    maxHeight: '90vh',
                    overflowY: 'auto',
                    position: 'relative',
                    boxShadow: '0 24px 48px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)'
                }}
            >
                {/* Close Button */}
                <button
                    onClick={onClose}
                    style={{
                        position: 'absolute',
                        top: 16,
                        right: 16,
                        width: 36,
                        height: 36,
                        borderRadius: '50%',
                        background: '#f5f5f5',
                        border: 'none',
                        color: '#333',
                        fontSize: 18,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 10,
                        transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#e5e5e5'}
                    onMouseLeave={(e) => e.currentTarget.style.background = '#f5f5f5'}
                >
                    ✕
                </button>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {/* Top Section: Image + Info */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: window.innerWidth > 640 ? '1fr 1fr' : '1fr',
                        gap: 32,
                        padding: 32
                    }}>
                        <div className="product-image-container" style={{ width: '100%', minHeight: 300, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <div style={{
                                width: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: 16
                            }}>
                                {/* Simulated frame for framed print */}
                                <div style={{
                                    padding: selectedType === 'frame' ? 12 : 0,
                                    background: selectedType === 'frame' ? '#2a2a2a' : 'transparent',
                                    boxShadow: selectedType === 'frame' ? '0 4px 16px rgba(0,0,0,0.2)' : 'none',
                                    borderRadius: selectedType === 'frame' ? 2 : 0,
                                    transition: 'all 0.3s ease',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    <img
                                        onLoad={(e) => {
                                            const img = e.currentTarget;
                                            if (img.naturalWidth && img.naturalHeight) {
                                                const ratio = img.naturalWidth / img.naturalHeight;
                                                setSizes(calculateSizesByRatio(ratio));
                                            }
                                            // setIsImageLoaded(true); // This is handled by style transition mainly, but logical state update is good too
                                            setIsImageLoaded(true);
                                        }}
                                        src={(() => {
                                            const url = artwork.image;
                                            if (!url) return '';
                                            try {
                                                const u = new URL(url);
                                                if (u.hostname === 'wsrv.nl' || u.hostname === 'images.weserv.nl') {
                                                    // wsrv.nl인 경우 'url' 파라미터가 실제 원본 이미지 주소입니다.
                                                    // 원본 주소만 추출하여 새롭게 옵션을 적용합니다.
                                                    const originalSrc = u.searchParams.get('url');
                                                    if (originalSrc) {
                                                        // 원본 URL에 이미 들어있을 수 있는 크롭 파라미터 등은 weserv가 처리하므로,
                                                        // 여기서는 weserv 옵션만 깨끗하게 새로 줍니다.
                                                        return getWeservUrl(originalSrc, 1200, 90);
                                                    }
                                                }
                                            } catch (e) { }
                                            return getWeservUrl(url, 1200, 90);
                                        })()}
                                        alt={artwork.name}
                                        style={{
                                            maxWidth: '100%',
                                            maxHeight: 360,
                                            width: 'auto',
                                            height: 'auto',
                                            objectFit: 'contain',
                                            display: 'block',
                                            boxShadow: selectedType === 'canvas'
                                                ? '4px 4px 0 #ddd, 8px 8px 0 #eee'
                                                : selectedType === 'fabric'
                                                    ? '0 8px 24px rgba(0,0,0,0.15)'
                                                    : '0 4px 12px rgba(0,0,0,0.1)',
                                            transform: isImageLoaded ? 'scale(1)' : 'scale(0.95)',
                                            opacity: isImageLoaded ? 1 : 0.5,
                                            transition: 'all 0.4s ease'
                                        }}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Product Info */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                            {/* Artwork Info */}
                            <div>
                                <h2 style={{
                                    color: '#111',
                                    fontSize: 22,
                                    fontWeight: 700,
                                    margin: 0,
                                    marginBottom: 8,
                                    lineHeight: 1.3
                                }}>
                                    {artwork.name}
                                </h2>
                                <p style={{
                                    color: '#666',
                                    fontSize: 14,
                                    margin: 0
                                }}>
                                    {artwork.artist}{artwork.year ? ` · ${artwork.year}` : ''}
                                </p>
                            </div>

                            {/* Product Type Selection */}
                            <div>
                                <h3 style={{
                                    color: '#333',
                                    fontSize: 12,
                                    fontWeight: 600,
                                    textTransform: 'uppercase',
                                    letterSpacing: 1,
                                    margin: 0,
                                    marginBottom: 12
                                }}>
                                    상품 종류
                                </h3>
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(2, 1fr)',
                                    gap: 8
                                }}>
                                    {PRODUCT_TYPES.map(type => (
                                        <button
                                            key={type.id}
                                            onClick={() => setSelectedType(type.id)}
                                            className={`product-type-btn ${selectedType === type.id ? 'selected' : ''}`}
                                            style={{
                                                padding: '12px 16px',
                                                background: selectedType === type.id ? '#222' : '#fff',
                                                borderRadius: 8,
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 10
                                            }}
                                        >
                                            <span style={{ fontSize: 20 }}>{type.icon}</span>
                                            <div style={{ textAlign: 'left' }}>
                                                <div className="type-name" style={{ fontWeight: 600, fontSize: 14, color: selectedType === type.id ? '#fff' : '#222' }}>{type.name}</div>
                                                <div className="type-price" style={{ fontSize: 11, color: selectedType === type.id ? 'rgba(255,255,255,0.8)' : '#888' }}>
                                                    {formatPrice(type.basePrice)}~
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Size Selection */}
                            <div>
                                <h3 style={{
                                    color: '#333',
                                    fontSize: 12,
                                    fontWeight: 600,
                                    textTransform: 'uppercase',
                                    letterSpacing: 1,
                                    margin: 0,
                                    marginBottom: 12
                                }}>
                                    크기
                                </h3>
                                <div style={{
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    gap: 8
                                }}>
                                    {sizes.map(sizeItem => (
                                        <button
                                            key={sizeItem.id}
                                            onClick={() => setSelectedSize(sizeItem.id)}
                                            className={`size-btn ${selectedSize === sizeItem.id ? 'selected' : ''}`}
                                            style={{
                                                padding: '10px 16px',
                                                background: selectedSize === sizeItem.id ? '#222' : '#fff',
                                                borderRadius: 24,
                                                cursor: 'pointer',
                                                color: selectedSize === sizeItem.id ? '#fff' : '#333',
                                                fontSize: 13,
                                                fontWeight: 600
                                            }}
                                        >
                                            {sizeItem.name}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Quantity */}
                            <div>
                                <h3 style={{
                                    color: '#333',
                                    fontSize: 12,
                                    fontWeight: 600,
                                    textTransform: 'uppercase',
                                    letterSpacing: 1,
                                    margin: 0,
                                    marginBottom: 12
                                }}>
                                    수량
                                </h3>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 16
                                }}>
                                    <button
                                        onClick={() => setQuantity(q => Math.max(1, q - 1))}
                                        className="quantity-btn"
                                        style={{
                                            width: 36,
                                            height: 36,
                                            borderRadius: '50%',
                                            background: '#f5f5f5',
                                            border: 'none',
                                            color: '#333',
                                            fontSize: 18,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}
                                    >
                                        −
                                    </button>
                                    <span style={{
                                        color: '#111',
                                        fontSize: 18,
                                        fontWeight: 700,
                                        minWidth: 32,
                                        textAlign: 'center'
                                    }}>
                                        {quantity}
                                    </span>
                                    <button
                                        onClick={() => setQuantity(q => Math.min(99, q + 1))}
                                        className="quantity-btn"
                                        style={{
                                            width: 36,
                                            height: 36,
                                            borderRadius: '50%',
                                            background: '#f5f5f5',
                                            border: 'none',
                                            color: '#333',
                                            fontSize: 18,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}
                                    >
                                        +
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Product Photos Section - Placeholder for real photos */}
                    <div className="product-photos-section" style={{ padding: '0 32px 24px' }}>
                        <h3 style={{
                            color: '#333',
                            fontSize: 12,
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                            margin: 0,
                            marginBottom: 16
                        }}>
                            실제 상품 사진
                        </h3>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: window.innerWidth > 640 ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)',
                            gap: 12
                        }}>
                            {[1, 2, 3].map(i => (
                                <div key={i} className="product-photo-placeholder">
                                    <span style={{ color: '#999' }}>📷 상품 사진 {i}</span>
                                </div>
                            ))}
                        </div>
                    </div>


                    {(uniqueRelatedArtworks.length > 0 || aiRecommendations.length > 0) && (
                        <div className="recommendation-section" style={{ padding: isMobile ? '0 16px 24px' : '0 32px 32px' }}>
                            {/* Similar Vibe (AI) */}
                            {aiRecommendations.length > 0 && (
                                <div style={{ marginBottom: 24 }}>
                                    <h3 style={{ color: '#333', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 12px' }}>
                                        비슷한 분위기의 작품 (AI 추천)
                                    </h3>
                                    <div style={{
                                        display: 'flex',
                                        gap: 10,
                                        overflowX: 'auto',
                                        paddingBottom: 8,
                                        WebkitOverflowScrolling: 'touch',
                                        maxWidth: '100%'
                                    }}>
                                        {aiRecommendations.map((item) => (
                                            <div
                                                key={`ai-${item.id}`}
                                                onClick={() => onSelectArtwork && onSelectArtwork({ ...item, image: item.i || item.image || item.url, name: item.n || item.name, artist: item.a || item.artist })}
                                                style={{ minWidth: isMobile ? 100 : 120, width: isMobile ? 100 : 120, cursor: 'pointer' }}
                                            >
                                                <div style={{ width: isMobile ? 100 : 120, height: isMobile ? 100 : 120, background: '#f5f5f5', marginBottom: 8, borderRadius: 4, overflow: 'hidden' }}>
                                                    <img
                                                        src={getWeservUrl(item.image || item.i || item.url, 200, 200)}
                                                        alt={item.name || item.n}
                                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                    />
                                                </div>
                                                <div style={{ fontSize: 11, fontWeight: 600, color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {item.name || item.n}
                                                </div>
                                                <div style={{ fontSize: 10, color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {item.artist || item.a}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Same Artist (Metadata) */}
                            {uniqueRelatedArtworks.length > 0 && (
                                <div>
                                    <h3 style={{ color: '#333', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 12px' }}>
                                        이 작가의 다른 작품
                                    </h3>
                                    <div style={{
                                        display: 'flex',
                                        gap: 10,
                                        overflowX: 'auto',
                                        paddingBottom: 8,
                                        WebkitOverflowScrolling: 'touch',
                                        maxWidth: '100%'
                                    }}>
                                        {uniqueRelatedArtworks.map((item) => (
                                            <div
                                                key={`rel-${item.id}`}
                                                onClick={() => onSelectArtwork && onSelectArtwork(item)}
                                                style={{ minWidth: isMobile ? 100 : 120, width: isMobile ? 100 : 120, cursor: 'pointer' }}
                                            >
                                                <div style={{ width: isMobile ? 100 : 120, height: isMobile ? 100 : 120, background: '#f5f5f5', marginBottom: 8, borderRadius: 4, overflow: 'hidden' }}>
                                                    <img
                                                        src={getWeservUrl(item.image, 200, 200)}
                                                        alt={item.name}
                                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                    />
                                                </div>
                                                <div style={{ fontSize: 11, fontWeight: 600, color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {item.name}
                                                </div>
                                                <div style={{ fontSize: 10, color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {item.year || ''}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Payment Section */}
                    <div style={{
                        background: '#fafafa',
                        padding: 32,
                        borderTop: '1px solid #e5e5e5'
                    }}>
                        <h3 style={{
                            color: '#333',
                            fontSize: 12,
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                            margin: 0,
                            marginBottom: 16
                        }}>
                            결제 수단
                        </h3>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(3, 1fr)',
                            gap: 12,
                            marginBottom: 24
                        }}>
                            {PAYMENT_METHODS.map(method => (
                                <button
                                    key={method.id}
                                    onClick={() => setSelectedPayment(method.id)}
                                    className={`payment-btn ${selectedPayment === method.id ? 'selected' : ''}`}
                                    style={{
                                        padding: 16,
                                        background: '#fff',
                                        borderRadius: 12,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        gap: 8
                                    }}
                                >
                                    <div style={{
                                        width: 40,
                                        height: 40,
                                        borderRadius: 8,
                                        background: method.color,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: 18,
                                        fontWeight: 700,
                                        color: method.id === 'kakaopay' ? '#000' : '#fff'
                                    }}>
                                        {method.id === 'naverpay' ? 'N' : method.id === 'kakaopay' ? 'K' : 'T'}
                                    </div>
                                    <span style={{
                                        color: '#333',
                                        fontSize: 12,
                                        fontWeight: 500
                                    }}>
                                        {method.name}
                                    </span>
                                </button>
                            ))}
                        </div>

                        {/* Purchase Button */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginTop: 16
                        }}>
                            <div>
                                <div style={{
                                    color: '#888',
                                    fontSize: 12,
                                    marginBottom: 4
                                }}>
                                    총 결제 금액
                                </div>
                                <div style={{
                                    color: '#111',
                                    fontSize: 26,
                                    fontWeight: 800,
                                    letterSpacing: -0.5
                                }}>
                                    {formatPrice(totalPrice)}
                                </div>
                            </div>
                            <button
                                onClick={handlePurchase}
                                className="purchase-btn"
                                style={{
                                    background: '#222',
                                    border: 'none',
                                    borderRadius: 12,
                                    padding: '14px 36px',
                                    color: 'white',
                                    fontSize: 15,
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8
                                }}
                            >
                                <span>구매하기</span>
                                <span style={{ fontSize: 16 }}>→</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default ProductModal;
