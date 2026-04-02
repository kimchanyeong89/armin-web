import React, { useState, useRef, useEffect } from 'react';
import CommunityList from './CommunityList';
import CommunityDetail from './CommunityDetail';
import CommunityWrite from './CommunityWrite';


interface CommunityPanelProps {
    isOpen: boolean;
    onClose: () => void;
    mapMode?: 'default' | 'drawing' | 'interactive';
    isDark?: boolean; // explicit override; falls back to localStorage if omitted
}

type View = 'list' | 'detail' | 'write';

const CommunityPanel: React.FC<CommunityPanelProps> = ({ isOpen, onClose, mapMode = 'default', isDark: isDarkProp }) => {
    const [view, setView] = useState<View>('list');
    const [selectedPostId, setSelectedPostId] = useState<string | null>(null);

    // Sync dark mode with the global theme (respects light/dark toggle)
    const [isDark, setIsDark] = useState(() => {
        if (isDarkProp !== undefined) return isDarkProp;
        try { return localStorage.getItem('homeTheme') !== 'light'; } catch { return true; }
    });
    useEffect(() => {
        const handle = () => {
            if (isDarkProp !== undefined) return;
            try { setIsDark(localStorage.getItem('homeTheme') !== 'light'); } catch { setIsDark(true); }
        };
        window.addEventListener('theme-changed', handle);
        window.addEventListener('storage', handle);
        return () => { window.removeEventListener('theme-changed', handle); window.removeEventListener('storage', handle); };
    }, [isDarkProp]);
    useEffect(() => { if (isDarkProp !== undefined) setIsDark(isDarkProp); }, [isDarkProp]);

    // Draggable Position State
    const [position, setPosition] = useState<{ top: number, left: number } | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [dockState, setDockState] = useState<'none' | 'left' | 'right' | 'bottom' | 'fullscreen'>('none');
    const [dockPreview, setDockPreview] = useState<'none' | 'left' | 'right' | 'bottom'>('none');

    // We keep track of the preferred free-floating size
    const [panelSize, setPanelSize] = useState<{ width: string, height: string }>({ width: '400px', height: '600px' });
    const [dockedSizes, setDockedSizes] = useState({ left: 400, right: 400, bottom: 400 });
    const [isResizing, setIsResizing] = useState<'top' | 'left' | 'right' | false>(false);

    const dragOffset = useRef<{ x: number, y: number }>({ x: 0, y: 0 });
    const panelRef = useRef<HTMLDivElement>(null);

    const handlePostClick = (postId: string) => {
        setSelectedPostId(postId);
        setView('detail');
    };

    const handleWriteClick = () => {
        setView('write');
    };

    const handleBack = () => {
        setView('list');
        setSelectedPostId(null);
    };

    const handleWriteComplete = () => {
        setView('list');
    };

    // Drag Handlers
    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        // Only allow dragging from header, avoid close button
        if ((e.target as HTMLElement).tagName === 'BUTTON' || (e.target as HTMLElement).closest('button')) return;
        if (dockState === 'fullscreen') return; // Do not drag in fullscreen

        if (panelRef.current) {
            const rect = panelRef.current.getBoundingClientRect();
            // Start drag
            setIsDragging(true);
            dragOffset.current = {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            };
            // Set initial position if not set yet (fetching from current CSS position)
            if (!position) {
                setPosition({ top: rect.top, left: rect.left });
            }
        }
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (isResizing) {
                if (isResizing === 'top' && dockState === 'bottom') {
                    setDockedSizes(prev => ({ ...prev, bottom: Math.max(200, window.innerHeight - e.clientY) }));
                } else if (isResizing === 'right' && dockState === 'left') {
                    setDockedSizes(prev => ({ ...prev, left: Math.max(300, e.clientX) }));
                } else if (isResizing === 'left' && dockState === 'right') {
                    setDockedSizes(prev => ({ ...prev, right: Math.max(300, window.innerWidth - e.clientX) }));
                }
                return;
            }

            if (isDragging) {
                // If it was docked, undock it
                if (dockState !== 'none') {
                    setDockState('none');
                    // Store the current dimensions before undocking so we resume the right size
                    if (panelRef.current) {
                        const rect = panelRef.current.getBoundingClientRect();
                        dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
                    }
                }

                setPosition({
                    top: e.clientY - dragOffset.current.y,
                    left: e.clientX - dragOffset.current.x
                });

                // Check Dock Preview
                const margin = 100; // Increased margin for easier docking
                if (e.clientX < margin) setDockPreview('left');
                else if (e.clientX > window.innerWidth - margin) setDockPreview('right');
                else if (e.clientY > window.innerHeight - margin) setDockPreview('bottom');
                else setDockPreview('none');
            }
        };

        const handleMouseUp = (e: MouseEvent) => {
            if (isResizing) {
                setIsResizing(false);
                return;
            }

            if (isDragging) {
                const margin = 100;
                let finalDock: 'none' | 'left' | 'right' | 'bottom' = 'none';
                if (e.clientX < margin) finalDock = 'left';
                else if (e.clientX > window.innerWidth - margin) finalDock = 'right';
                else if (e.clientY > window.innerHeight - margin) finalDock = 'bottom';

                if (finalDock !== 'none') {
                    setDockState(finalDock);
                } else if (panelRef.current) {
                    // Save the user-resized dimensions so react doesn't reset it
                    const w = panelRef.current.style.width;
                    const h = panelRef.current.style.height;
                    if (w && h) setPanelSize({ width: w, height: h });
                }
                setDockPreview('none');
            }
            setIsDragging(false);
        };

        if (isDragging || isResizing) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, isResizing, dockState]);

    // Constrain position on window resize
    useEffect(() => {
        const handleResize = () => {
            if (position) {
                // Ensure panel stays within viewport
                const panelWidth = Math.min(400, window.innerWidth - 20);
                const panelHeight = window.innerHeight - 20;

                let newLeft = position.left;
                let newTop = position.top;

                if (newLeft + panelWidth > window.innerWidth) {
                    newLeft = window.innerWidth - panelWidth - 10;
                }
                if (newTop + panelHeight > window.innerHeight) {
                    newTop = window.innerHeight - panelHeight - 10;
                }

                // Ensure it doesn't go off-screen top/left
                newLeft = Math.max(10, newLeft);
                newTop = Math.max(10, newTop);

                if (newLeft !== position.left || newTop !== position.top) {
                    setPosition({ top: newTop, left: newLeft });
                }
            }
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [position]);

    // Animation State
    const [styleState, setStyleState] = useState<{
        opacity: number;
        transform: string;
        transformOrigin: string;
        pointerEvents: 'auto' | 'none';
    }>({
        opacity: 0,
        transform: 'scale(0.1)',
        transformOrigin: 'bottom right',
        pointerEvents: 'none'
    });

    // Handle Open/Close Animation
    useEffect(() => {
        if (isOpen) {
            // Opening: "Pop out" from button
            // If panelRef is available, we could calculate precise origin, but "bottom right" (or fixed px from right/bottom) is good enough approximation
            // Since button is fixed at bottom: 24px, right: 24px.
            // However, panel position might be anywhere.
            // To be precise: origin X = (WindowWidth - 49) - PanelLeft
            // Origin Y = (WindowHeight - 49) - PanelTop

            // We need current panel position to set origin.
            // If it's the first render, ref might be null, but we'll try.

            let origin = 'bottom right';
            if (panelRef.current) {
                const rect = panelRef.current.getBoundingClientRect();
                const btnX = window.innerWidth - 49; // Center of button
                const btnY = window.innerHeight - 49;
                const originX = btnX - rect.left;
                const originY = btnY - rect.top;
                origin = `${originX}px ${originY}px`;
            }

            setStyleState({
                opacity: 1,
                transform: 'none', // Removed scale(1) because it breaks CSS resize: both on some browsers
                transformOrigin: origin,
                pointerEvents: 'auto'
            });
        } else {
            // Closing: fade out and shrink but don't animate transform as much
            let origin = 'bottom right';
            if (panelRef.current) {
                const rect = panelRef.current.getBoundingClientRect();
                const btnX = window.innerWidth - 49;
                const btnY = window.innerHeight - 49;
                origin = `${btnX - rect.left}px ${btnY - rect.top}px`;
            }

            setStyleState({
                opacity: 0,
                transform: 'scale(0.95)',
                transformOrigin: origin,
                pointerEvents: 'none'
            });
        }
    }, [isOpen]);

    useEffect(() => {
        if (dockState === 'none' && panelRef.current) {
            panelRef.current.style.width = panelSize.width;
            panelRef.current.style.height = panelSize.height;
        }
    }, [dockState, panelSize]);

    // Ensure we don't return null so state is preserved
    // if (!isOpen) return null; // REMOVED

    return (
        <>
            {mapMode === 'drawing' && (
                <svg width="0" height="0" style={{ position: 'absolute', pointerEvents: 'none' }} aria-hidden="true">
                    <filter id="community-sketch-ui" x="-20%" y="-20%" width="140%" height="140%">
                        <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="3" result="noise" />
                        <feDisplacementMap in="SourceGraphic" in2="noise" scale="2" xChannelSelector="R" yChannelSelector="G" />
                    </filter>
                </svg>
            )}
            {/* Dock Preview Indicator */}
            {dockPreview !== 'none' && (
                <div style={{
                    position: 'fixed',
                    top: dockPreview === 'bottom' ? 'auto' : 0,
                    bottom: 0,
                    left: dockPreview === 'right' ? 'auto' : 0,
                    right: dockPreview === 'left' ? 'auto' : 0,
                    width: dockPreview === 'left' || dockPreview === 'right' ? '400px' : '100%',
                    height: dockPreview === 'bottom' ? '400px' : '100%',
                    background: 'rgba(0,0,0,0.1)',
                    backdropFilter: 'blur(4px)',
                    zIndex: 199999,
                    transition: 'all 0.2s',
                    border: '2px dashed rgba(0,0,0,0.3)',
                    pointerEvents: 'none'
                }} />
            )}

            <div
                ref={panelRef}
                // Stop propagation to prevent map interaction
                onWheel={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                onTouchMove={(e) => e.stopPropagation()}
                style={{
                    position: 'fixed',
                    ...(dockState === 'none' ? {
                        top: position ? position.top : '10px',
                        left: position ? position.left : undefined,
                        right: position ? undefined : '10px',
                        // Width and height are managed via DOM manipulation in useEffect
                        // to prevent React from overwriting native CSS resize actions.
                        maxWidth: 'calc(100vw - 20px)',
                        maxHeight: 'calc(100vh - 20px)',
                        minWidth: '300px',
                        minHeight: '400px',
                        borderRadius: mapMode === 'drawing' ? '0px' : '16px',
                        resize: 'both',
                    } : dockState === 'left' ? {
                        top: 0,
                        left: 0,
                        bottom: 0,
                        width: `${dockedSizes.left}px`,
                        height: '100dvh',
                        borderRadius: 0,
                        resize: 'none',
                    } : dockState === 'right' ? {
                        top: 0,
                        right: 0,
                        bottom: 0,
                        width: `${dockedSizes.right}px`,
                        height: '100dvh',
                        borderRadius: 0,
                    } : dockState === 'fullscreen' ? {
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        width: '100vw',
                        height: '100dvh',
                        borderRadius: 0,
                        resize: 'none',
                    } : /* bottom */ {
                        left: 0,
                        right: 0,
                        bottom: 0,
                        width: '100vw',
                        height: `${dockedSizes.bottom}px`,
                        borderRadius: 0,
                        resize: 'none',
                    }),
                    backgroundColor: mapMode === 'drawing'
                        ? '#FFFFFF'
                        : mapMode === 'interactive'
                        ? (isDark ? 'rgba(8,8,7,0.97)' : 'rgba(252,250,246,0.97)')
                        : '#ffffff',
                    // border 단축키 대신 4면 개별 속성으로 분리 (React 스타일 경고 방지)
                    ...(dockState === 'none' ? {
                        borderTop: mapMode === 'drawing' ? '3px solid #111111'
                            : mapMode === 'interactive' ? (isDark ? '1px solid rgba(201,165,90,0.18)' : '1px solid rgba(0,0,0,0.08)')
                            : '1px solid rgba(0,0,0,0.1)',
                        borderRight: mapMode === 'drawing' ? '3px solid #111111'
                            : mapMode === 'interactive' ? (isDark ? '1px solid rgba(201,165,90,0.18)' : '1px solid rgba(0,0,0,0.08)')
                            : '1px solid rgba(0,0,0,0.1)',
                        borderBottom: mapMode === 'drawing' ? '3px solid #111111'
                            : mapMode === 'interactive' ? (isDark ? '1px solid rgba(201,165,90,0.18)' : '1px solid rgba(0,0,0,0.08)')
                            : '1px solid rgba(0,0,0,0.1)',
                        borderLeft: mapMode === 'drawing' ? '3px solid #111111'
                            : mapMode === 'interactive' ? (isDark ? '1px solid rgba(201,165,90,0.18)' : '1px solid rgba(0,0,0,0.08)')
                            : '1px solid rgba(0,0,0,0.1)',
                    } : dockState === 'left' ? {
                        borderTop: 'none', borderBottom: 'none', borderLeft: 'none',
                        borderRight: '1px solid rgba(0,0,0,0.1)',
                    } : dockState === 'right' ? {
                        borderTop: 'none', borderBottom: 'none', borderRight: 'none',
                        borderLeft: '1px solid rgba(0,0,0,0.1)',
                    } : dockState === 'bottom' ? {
                        borderRight: 'none', borderBottom: 'none', borderLeft: 'none',
                        borderTop: '1px solid rgba(0,0,0,0.1)',
                    } : {
                        borderTop: 'none', borderRight: 'none', borderBottom: 'none', borderLeft: 'none',
                    }),
                    boxShadow: mapMode === 'drawing'
                        ? (dockState === 'none' ? '8px 8px 0 #111111' : 'none')
                        : mapMode === 'interactive'
                        ? (isDark ? '-4px 0 40px rgba(0,0,0,0.6)' : '-4px 0 32px rgba(0,0,0,0.12)')
                        : (dockState === 'none' ? '-4px 0 24px rgba(0,0,0,0.15)' : 'none'),
                    zIndex: 200000,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',

                    // Animation Styles
                    opacity: styleState.opacity,
                    transform: styleState.transform,
                    transformOrigin: styleState.transformOrigin,
                    pointerEvents: styleState.pointerEvents,
                    transition: (isDragging || isResizing) ? 'none' : 'all 0.4s cubic-bezier(0.25, 1, 0.5, 1)',
                    visibility: styleState.opacity === 0 ? 'hidden' : 'visible' // Hide when fully closed
                    ,
                    filter: mapMode === 'drawing' ? 'url(#community-sketch-ui)' : 'none',
                }}
            >
                {/* Custom Resize Handles */}
                {dockState === 'bottom' && (
                    <div
                        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setIsResizing('top'); }}
                        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '8px', cursor: 'ns-resize', zIndex: 100 }}
                    />
                )}
                {dockState === 'left' && (
                    <div
                        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setIsResizing('right'); }}
                        style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: '8px', cursor: 'ew-resize', zIndex: 100 }}
                    />
                )}
                {dockState === 'right' && (
                    <div
                        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setIsResizing('left'); }}
                        style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '8px', cursor: 'ew-resize', zIndex: 100 }}
                    />
                )}
                {/* Panel Header - Draggable Area */}
                <div
                    onMouseDown={handleMouseDown}
                    style={{
                        padding: mapMode === 'drawing' ? '0' : '16px',
                        borderBottom: mapMode === 'drawing'
                            ? 'none'
                            : mapMode === 'interactive'
                            ? (isDark ? '1px solid rgba(201,165,90,0.15)' : '1px solid rgba(0,0,0,0.07)')
                            : '1px solid #eee',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: mapMode === 'drawing'
                            ? '#111111'
                            : mapMode === 'interactive'
                            ? (isDark ? 'rgba(12,12,10,0.98)' : 'rgba(252,250,246,0.98)')
                            : '#fff',
                        zIndex: 10,
                        cursor: (isDragging ? 'grabbing' : (dockState === 'fullscreen' ? 'default' : 'grab')),
                        userSelect: 'none',
                        flexShrink: 0,
                    }}
                >
                    {mapMode === 'drawing' ? (
                        /* Drawing Map Header */
                        <div style={{ display: 'flex', alignItems: 'stretch', width: '100%', borderBottom: '3px solid #111111', background: '#FFFFFF', transform: 'rotate(-0.15deg)' }}>
                            <div style={{
                                background: '#FFFFFF',
                                padding: '14px 18px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                flex: 1,
                            }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#111111" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                                </svg>
                                <span style={{
                                    fontFamily: "'Space Mono', 'Courier New', monospace",
                                    fontSize: 12,
                                    fontWeight: 700,
                                    letterSpacing: '0.16em',
                                    color: '#111111',
                                    textTransform: 'uppercase',
                                }}>
                                    COMMUNITY
                                </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', background: '#FFFFFF', padding: '0 10px', gap: 8, borderLeft: '3px solid #111111' }}>
                                <button
                                    onClick={() => {
                                        if (dockState === 'fullscreen') setDockState('none');
                                        else setDockState('fullscreen');
                                    }}
                                    style={{ background: '#FFFFFF', border: '2px solid #111111', borderRadius: '46% 54% 52% 48% / 44% 56% 49% 51%', width: 34, height: 34, cursor: 'pointer', padding: 0, color: '#111111', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '2px 2px 0 #111111' }}
                                    title={dockState === 'fullscreen' ? "창모드" : "전체화면"}
                                >
                                    {dockState === 'fullscreen' ? (
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" /></svg>
                                    ) : (
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>
                                    )}
                                </button>
                                <button
                                    onClick={onClose}
                                    style={{ background: '#FFFFFF', border: '2px solid #111111', borderRadius: '51% 49% 47% 53% / 49% 53% 47% 51%', width: 34, height: 34, cursor: 'pointer', padding: 0, color: '#111111', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '2px 2px 0 #111111' }}
                                    title="닫기"
                                >
                                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ pointerEvents: 'none' }}>
                                        <line x1="2" y1="2" x2="12" y2="12" stroke="#111111" strokeWidth="2.3" strokeLinecap="round" />
                                        <line x1="12" y1="2" x2="2" y2="12" stroke="#111111" strokeWidth="2.3" strokeLinecap="round" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    ) : mapMode === 'interactive' ? (
                        /* Interactive Map Header */
                        <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{
                                    width: 28, height: 28, borderRadius: '50%',
                                    border: isDark ? '1px solid rgba(201,165,90,0.3)' : '1px solid rgba(0,0,0,0.12)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}>
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                                        stroke={isDark ? 'rgba(201,165,90,0.8)' : 'rgba(0,0,0,0.55)'}
                                        strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                                    </svg>
                                </div>
                                <span style={{
                                    fontFamily: "'Space Grotesk', 'Helvetica Neue', sans-serif",
                                    fontSize: 13, fontWeight: 600, letterSpacing: '0.08em',
                                    color: isDark ? 'rgba(201,165,90,0.85)' : 'rgba(0,0,0,0.7)',
                                    textTransform: 'uppercase',
                                }}>
                                    Community
                                </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <button
                                    onClick={() => {
                                        if (dockState === 'fullscreen') setDockState('none');
                                        else setDockState('fullscreen');
                                    }}
                                    style={{
                                        background: 'none', border: 'none', cursor: 'pointer', padding: '6px',
                                        color: isDark ? 'rgba(201,165,90,0.5)' : 'rgba(0,0,0,0.35)',
                                        display: 'flex', alignItems: 'center', borderRadius: 4
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.color = isDark ? 'rgba(201,165,90,0.9)' : 'rgba(0,0,0,0.75)'}
                                    onMouseLeave={(e) => e.currentTarget.style.color = isDark ? 'rgba(201,165,90,0.5)' : 'rgba(0,0,0,0.35)'}
                                >
                                    {dockState === 'fullscreen' ? (
                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" /></svg>
                                    ) : (
                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>
                                    )}
                                </button>
                                <button
                                    onClick={onClose}
                                    style={{
                                        background: 'none', border: 'none', cursor: 'pointer', padding: '6px',
                                        color: isDark ? 'rgba(201,165,90,0.4)' : 'rgba(0,0,0,0.3)',
                                        display: 'flex', alignItems: 'center', borderRadius: 4, fontSize: 20
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.color = isDark ? 'rgba(201,165,90,0.9)' : 'rgba(0,0,0,0.7)'}
                                    onMouseLeave={(e) => e.currentTarget.style.color = isDark ? 'rgba(201,165,90,0.4)' : 'rgba(0,0,0,0.3)'}
                                >
                                    ×
                                </button>
                            </div>
                        </>
                    ) : (
                        /* Default Header */
                        <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '18px' }}>💬</span>
                                <h2 style={{ fontSize: '18px', fontWeight: '800', margin: 0 }}>Community</h2>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <button
                                    onClick={() => {
                                        if (dockState === 'fullscreen') setDockState('none');
                                        else setDockState('fullscreen');
                                    }}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', color: '#666', display: 'flex', alignItems: 'center', borderRadius: '6px' }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = '#f4f4f5'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                    title={dockState === 'fullscreen' ? "창모드" : "전체화면으로 확장"}
                                >
                                    {dockState === 'fullscreen' ? (
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" /></svg>
                                    ) : (
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>
                                    )}
                                </button>
                                <button
                                    onClick={onClose}
                                    style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', padding: '4px 8px', color: '#333', display: 'flex', alignItems: 'center' }}
                                >
                                    ×
                                </button>
                            </div>
                        </>
                    )}
                </div>

                {/* Panel Content */}
                <div style={{
                    flex: 1, overflow: 'hidden', position: 'relative',
                    background: mapMode === 'interactive'
                        ? (isDark ? 'rgba(8,8,7,0.97)' : 'rgba(252,250,246,0.97)')
                        : mapMode === 'drawing' ? '#FFFFFF' : '#fff',
                    color: mapMode === 'interactive'
                        ? (isDark ? 'rgba(220,210,195,0.9)' : 'rgba(20,18,14,0.88)')
                        : '#111111'
                }}>
                    {view === 'list' && (
                        <div style={{ height: '100%', overflowY: 'auto' }}>
                            <CommunityList
                                onPostClick={handlePostClick}
                                onWriteClick={handleWriteClick}
                                isDark={mapMode === 'interactive' ? isDark : false}
                                isSketch={mapMode === 'drawing'}
                            />
                        </div>
                    )}
                    {view === 'detail' && selectedPostId && (
                        <div style={{ height: '100%', overflowY: 'hidden' }}>
                            <CommunityDetail postId={selectedPostId} onBack={handleBack} />
                        </div>
                    )}
                    {view === 'write' && (
                        <div style={{ height: '100%', overflowY: 'hidden' }}>
                            <CommunityWrite onBack={handleBack} onComplete={handleWriteComplete} />
                        </div>
                    )}
                </div>
            </div>
        </>
    );
};

export default CommunityPanel;
