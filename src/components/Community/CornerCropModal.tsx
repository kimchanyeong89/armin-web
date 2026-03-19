import React, { useState, useRef, useEffect, useCallback } from 'react';

interface Corner {
    x: number; // fraction 0-1
    y: number; // fraction 0-1
}

interface Props {
    imageUrl: string;
    initialCorners?: Corner[];
    onApply: (corners: { tl: [number, number]; tr: [number, number]; br: [number, number]; bl: [number, number] }) => void;
    onCancel: () => void;
}

const CORNER_LABELS = ['TL', 'TR', 'BR', 'BL'] as const;
const CORNER_COLORS = ['#ff4444', '#44bb44', '#4488ff', '#ffaa00'];

const CornerCropModal: React.FC<Props> = ({ imageUrl, initialCorners, onApply, onCancel }) => {
    const [corners, setCorners] = useState<Corner[]>(
        initialCorners && initialCorners.length === 4
            ? initialCorners
            : [
                { x: 0.1, y: 0.1 }, // TL
                { x: 0.9, y: 0.1 }, // TR
                { x: 0.9, y: 0.9 }, // BR
                { x: 0.1, y: 0.9 }  // BL
            ]
    );

    // Sync corners if initialCorners changes (e.g. re-opening with saved crop)
    useEffect(() => {
        if (initialCorners && initialCorners.length === 4) {
            setCorners(initialCorners);
        }
    }, [initialCorners]);
    const [dragging, setDragging] = useState<number | null>(null);
    const [imgDims, setImgDims] = useState({ w: 0, h: 0, offX: 0, offY: 0 });
    const containerRef = useRef<HTMLDivElement>(null);
    const imgRef = useRef<HTMLImageElement>(null);

    const updateImgDims = useCallback(() => {
        const img = imgRef.current;
        const container = containerRef.current;
        if (!img || !container) return;

        const cr = container.getBoundingClientRect();
        const ir = img.getBoundingClientRect();
        setImgDims({
            w: ir.width,
            h: ir.height,
            offX: ir.left - cr.left,
            offY: ir.top - cr.top,
        });
    }, []);

    useEffect(() => {
        updateImgDims();
        window.addEventListener('resize', updateImgDims);
        return () => window.removeEventListener('resize', updateImgDims);
    }, [updateImgDims]);

    const getFraction = (clientX: number, clientY: number): { x: number; y: number } => {
        const container = containerRef.current;
        if (!container || imgDims.w === 0) return { x: 0.5, y: 0.5 };
        const cr = container.getBoundingClientRect();
        const rx = clientX - cr.left - imgDims.offX;
        const ry = clientY - cr.top - imgDims.offY;
        return {
            x: Math.max(0, Math.min(1, rx / imgDims.w)),
            y: Math.max(0, Math.min(1, ry / imgDims.h)),
        };
    };

    const handlePointerDown = (idx: number) => (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragging(idx);
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (dragging === null) return;
        const frac = getFraction(e.clientX, e.clientY);
        setCorners(prev => prev.map((c, i) => i === dragging ? frac : c));
    };

    const handlePointerUp = () => setDragging(null);

    const handleApply = () => {
        onApply({
            tl: [corners[0].x, corners[0].y],
            tr: [corners[1].x, corners[1].y],
            br: [corners[2].x, corners[2].y],
            bl: [corners[3].x, corners[3].y],
        });
    };

    // Build SVG polygon path
    const polyPath = corners.map((c, i) => {
        const px = imgDims.offX + c.x * imgDims.w;
        const py = imgDims.offY + c.y * imgDims.h;
        return `${i === 0 ? 'M' : 'L'} ${px} ${py}`;
    }).join(' ') + ' Z';

    return (
        <div
            onClick={(e) => e.stopPropagation()}
            style={{
                position: 'fixed', inset: 0, zIndex: 10000,
                background: 'rgba(0,0,0,0.85)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            }}>
            {/* Header */}
            <div style={{
                color: '#fff', fontSize: 14, marginBottom: 12, textAlign: 'center',
                fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
            }}>
                <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>그림 영역 선택</div>
                <div style={{ opacity: 0.7, fontSize: 13 }}>네 꼭짓점을 드래그해서 그림 캔버스의 가장자리에 맞추세요</div>
            </div>

            {/* Image + overlay */}
            <div
                ref={containerRef}
                style={{
                    position: 'relative',
                    maxWidth: 'calc(100vw - 48px)',
                    maxHeight: 'calc(100vh - 160px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    touchAction: 'none',
                    userSelect: 'none',
                }}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
            >
                <img
                    ref={imgRef}
                    src={imageUrl}
                    alt="Crop source"
                    onLoad={updateImgDims}
                    style={{
                        maxWidth: '100%',
                        maxHeight: 'calc(100vh - 160px)',
                        objectFit: 'contain',
                        borderRadius: 4,
                        display: 'block',
                    }}
                    draggable={false}
                />

                {/* SVG Overlay for selection area + dim outside */}
                {imgDims.w > 0 && (
                    <svg
                        style={{ position: 'absolute', inset: 0, pointerEvents: 'none', width: '100%', height: '100%' }}
                        viewBox={`0 0 ${imgDims.w + imgDims.offX * 2} ${imgDims.h + imgDims.offY * 2}`}
                    >
                        {/* Dim everything outside the polygon */}
                        <defs>
                            <mask id="crop-mask">
                                <rect x="0" y="0" width="100%" height="100%" fill="white" />
                                <path d={polyPath} fill="black" />
                            </mask>
                        </defs>
                        <rect x="0" y="0" width="100%" height="100%" fill="rgba(0,0,0,0.5)" mask="url(#crop-mask)" />

                        {/* Selection border */}
                        <path d={polyPath} fill="none" stroke="#fff" strokeWidth="2" strokeDasharray="6 4" />

                        {/* Corner-to-corner lines */}
                        {corners.map((c, i) => {
                            const next = corners[(i + 1) % 4];
                            const x1 = imgDims.offX + c.x * imgDims.w;
                            const y1 = imgDims.offY + c.y * imgDims.h;
                            const x2 = imgDims.offX + next.x * imgDims.w;
                            const y2 = imgDims.offY + next.y * imgDims.h;
                            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={CORNER_COLORS[i]} strokeWidth="2" opacity="0.8" />;
                        })}
                    </svg>
                )}

                {/* Draggable corner handles */}
                {imgDims.w > 0 && corners.map((c, i) => (
                    <div
                        key={i}
                        onPointerDown={handlePointerDown(i)}
                        style={{
                            position: 'absolute',
                            left: imgDims.offX + c.x * imgDims.w - 16,
                            top: imgDims.offY + c.y * imgDims.h - 16,
                            width: 32, height: 32,
                            cursor: 'grab',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            zIndex: 10,
                            touchAction: 'none',
                        }}
                    >
                        {/* Outer ring */}
                        <div style={{
                            width: 24, height: 24,
                            borderRadius: '50%',
                            border: `3px solid ${CORNER_COLORS[i]}`,
                            background: dragging === i ? CORNER_COLORS[i] : 'rgba(0,0,0,0.5)',
                            boxShadow: `0 0 8px ${CORNER_COLORS[i]}80, 0 2px 8px rgba(0,0,0,0.4)`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'background 0.15s',
                        }}>
                            {/* Inner dot */}
                            <div style={{
                                width: 6, height: 6,
                                borderRadius: '50%',
                                background: '#fff',
                            }} />
                        </div>
                        {/* Label */}
                        <span style={{
                            position: 'absolute',
                            top: -18,
                            fontSize: 10,
                            fontWeight: 700,
                            color: CORNER_COLORS[i],
                            fontFamily: 'monospace',
                            textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                        }}>
                            {CORNER_LABELS[i]}
                        </span>
                    </div>
                ))}
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                <button
                    type="button"
                    onClick={onCancel}
                    style={{
                        padding: '10px 24px', borderRadius: 8,
                        border: '1px solid rgba(255,255,255,0.3)',
                        background: 'transparent', color: '#fff',
                        fontSize: 14, cursor: 'pointer',
                        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                    }}
                >
                    취소
                </button>
                <button
                    type="button"
                    onClick={handleApply}
                    style={{
                        padding: '10px 24px', borderRadius: 8,
                        border: 'none',
                        background: 'linear-gradient(135deg, #4488ff, #6644ff)',
                        color: '#fff', fontWeight: 600,
                        fontSize: 14, cursor: 'pointer',
                        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                        boxShadow: '0 2px 12px rgba(68, 136, 255, 0.4)',
                    }}
                >
                    적용
                </button>
            </div>
        </div>
    );
};

export default CornerCropModal;
