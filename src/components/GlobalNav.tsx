import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import BugReportModal from './BugReportModal';
import GlobalSearchBar from './GlobalSearchBar';
import type { SearchableArtwork, Museum } from './GlobalSearchBar';

interface GlobalNavProps {
    isAdmin: boolean;
    isModalOpen?: boolean;
    skin?: 'default' | 'drawing';
    onClose?: () => void;
    searchProps?: {
        onOpenLightbox?: (artwork: SearchableArtwork, openLightbox?: boolean) => void;
        onNavigateToMuseum?: (museum: { id: string, name: string }, collectionId?: string, artwork?: SearchableArtwork) => void;
        museums?: Museum[];
    };
}

export const GlobalNav: React.FC<GlobalNavProps> = ({ isAdmin, isModalOpen, searchProps, skin = 'default' }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const [isBugReportOpen, setIsBugReportOpen] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isSearchExpanded, setIsSearchExpanded] = useState(false);
    const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth <= 768);
    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth <= 768);
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    // Dynamic light/dark mode for the Liquid Glass
    const [isDark, setIsDark] = useState(() => {
        try { return localStorage.getItem('homeTheme') !== 'light'; } catch { return true; }
    });

    useEffect(() => {
        const updateTheme = () => {
            try { setIsDark(localStorage.getItem('homeTheme') !== 'light'); } catch { setIsDark(true); }
        };
        // Listen to native storage events globally
        window.addEventListener('storage', updateTheme);
        window.addEventListener('theme-changed', updateTheme);
        return () => {
            window.removeEventListener('storage', updateTheme);
            window.removeEventListener('theme-changed', updateTheme);
        };
    }, []);

    const currentPath = location.pathname;
    const isDrawingSkin = skin === 'drawing';
    // Ref to always access the current skin value inside effects
    const skinRef = useRef(skin);
    skinRef.current = skin;

    const [position, setPosition] = useState(() => {
        try {
            const saved = localStorage.getItem('globalNavPos_v4');
            if (saved) {
                const pos = JSON.parse(saved);
                // Clamp saved position to reasonable viewport bounds to prevent off-screen drift
                const maxAbsX = typeof window !== 'undefined' ? window.innerWidth * 0.45 : 450;
                const maxY = typeof window !== 'undefined' ? window.innerHeight - 80 : 500;
                // Y is now distance from top (positive = down). Keep in [0, maxY].
                if (Math.abs(pos.x) < maxAbsX && pos.y >= 0 && pos.y <= maxY) {
                    return pos;
                }
                localStorage.removeItem('globalNavPos_v4');
            }
        } catch (e) {
            console.error('Failed to load nav pos', e);
        }
        // Default: top-right corner (x = offset from right anchor, y = top offset)
        return { x: 0, y: 20 };
    });
    const dragRef = useRef<{ startX: number; startY: number; initialX: number; initialY: number; minX: number; maxX: number; minY: number; maxY: number } | null>(null);
    const isDragging = useRef(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging.current || !dragRef.current) return;
            const dx = e.clientX - dragRef.current.startX;
            const dy = e.clientY - dragRef.current.startY;

            // X: moving right = decreasing right-anchor distance (so negative dx increases it)
            let newX = dragRef.current.initialX - dx; // right anchor: drag left increases value
            let newY = dragRef.current.initialY + dy;

            // Limit to screen edges with margin
            newX = Math.max(dragRef.current.minX, Math.min(newX, dragRef.current.maxX));
            newY = Math.max(dragRef.current.minY, Math.min(newY, dragRef.current.maxY));

            setPosition({ x: newX, y: newY });
        };
        const handleMouseUp = () => {
            if (isDragging.current) {
                isDragging.current = false;
                if (wrapperRef.current) {
                    wrapperRef.current.style.cursor = 'grab';
                }
            }
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, []);

    // Save position whenever it changes (after a drag)
    useEffect(() => {
        const timer = setTimeout(() => {
            localStorage.setItem('globalNavPos_v4', JSON.stringify(position));
        }, 300); // slight debounce
        return () => clearTimeout(timer);
    }, [position]);

    // Track when inline search expands so we can close the menu
    useEffect(() => {
        const onSearchOpen = () => {
            setIsMenuOpen(false);
            setIsBugReportOpen(false);
            setIsSearchExpanded(true);
        };
        const onSearchClose = () => {
            setIsSearchExpanded(false);
        };
        window.addEventListener('global-search-expanded', onSearchOpen);
        window.addEventListener('global-search-collapsed', onSearchClose);
        return () => {
            window.removeEventListener('global-search-expanded', onSearchOpen);
            window.removeEventListener('global-search-collapsed', onSearchClose);
        };
    }, []);

    useEffect(() => {
        if (skin === 'drawing') {
            setPosition({ x: 0, y: 0 });
        }
    }, [skin]);

    // Synchronously predict width to clamp bounds before CSS animation handles the expansion.
    // By calculating this during render, width & transform animate on the same frame, fully eliminating jank/bouncing!
    const tempWinW = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const tempWinH = typeof window !== 'undefined' ? window.innerHeight : 800;

    const drawingRightInset = 64;

    const targetWidth = skinRef.current === 'drawing'
        ? (isMenuOpen ? 404 : isSearchExpanded ? 338 : 120)
        : (isSearchExpanded ? Math.min(340, tempWinW - 180) + 70 : isMenuOpen ? 450 : 120); // Reduced width from 420 to 340



    let maxDragX: number, minDragX: number, maxDragY: number, minDragY: number;
    let targetW = Number(targetWidth) || 120;
    
    if (skinRef.current === 'drawing') {
        maxDragX = 0; // can't go right beyond its start position
        minDragX = -(tempWinW - drawingRightInset - targetW - 20);
        maxDragY = tempWinH - 32 - 60 - 20;
        minDragY = 0;
    } else {
        // X: offset from right edge anchor (negative = move left)
        maxDragX = tempWinW - targetW - 20;  // can drag far left
        minDragX = 0;                         // stay within right margin
        // Y: offset from top (0 = hugging top, positive = move down)
        minDragY = 8;
        maxDragY = tempWinH - 80;
    }

    let clampedX = position.x;
    let clampedY = position.y;

    if (!isDragging.current) {
        if (clampedX > maxDragX) clampedX = maxDragX;
        if (clampedX < minDragX) clampedX = minDragX;
        if (clampedY > maxDragY) clampedY = maxDragY;
        if (clampedY < minDragY) clampedY = minDragY;
    }

    // Sync clamped values back into state to keep drag anchors accurate
    useEffect(() => {
        if (!isDragging.current && (position.x !== clampedX || position.y !== clampedY)) {
            setPosition({ x: clampedX, y: clampedY });
        }
    }, [clampedX, clampedY, position.x, position.y]);

    const handleMouseDown = (e: React.MouseEvent) => {
        const target = e.target as HTMLElement;
        // Do not trigger drag on interactive elements
        if (target.tagName.toLowerCase() === 'button' || target.tagName.toLowerCase() === 'input' || target.closest('button')) {
            return;
        }
        // Do not allow drag while search is expanded (nav is centered)
        if (isSearchExpanded) return;

        if (!wrapperRef.current) return;

        dragRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            initialX: clampedX,
            initialY: clampedY,
            minX: minDragX,
            maxX: maxDragX,
            minY: minDragY,
            maxY: maxDragY
        };
        isDragging.current = true;
        wrapperRef.current.style.cursor = 'grabbing';
    };

    // ── Position logic ─────────────────────────────────────────────────────
    // KEY PRINCIPLE: keep top:0 / left:0 constant; drive ALL positions through
    // a single `transform: translate(X, Y)`. CSS can smoothly interpolate one
    // property — switching between `right` and `left` causes an instant jump.
    //
    //  Resting  → translate( 100vw - clampedX - navWidth, clampedY )
    //  Expanded → translate( 50vw  - navWidth/2,          20px      )
    //
    // Because both states are expressed as the same CSS property, the browser
    // produces a perfectly smooth spring animation between them.

    const SPRING = 'transform 0.62s cubic-bezier(0.22, 1, 0.36, 1)';

    let wrapperStyle: React.CSSProperties;

    if (isDrawingSkin) {
        // Drawing skin: keep existing right-anchored approach (no search centering)
        wrapperStyle = {
            position: 'absolute',
            top: 0,
            left: 0,
            bottom: 'auto',
            right: 'auto',
            transform: `translate(calc(100vw - ${drawingRightInset}px - 100%), ${32 + clampedY}px)`,
            display: 'inline-flex',
            flexDirection: 'row',
            pointerEvents: 'auto',
            transition: isDragging.current ? 'none' : SPRING,
            cursor: 'grab',
            zIndex: 100000,
            WebkitUserSelect: 'none',
            userSelect: 'none',
        };
    } else if (isSearchExpanded) {
        // SEARCH OPEN: smoothly animate to top-center via transform only
        wrapperStyle = {
            position: 'absolute',
            top: 0,
            left: 0,
            bottom: 'auto',
            right: 'auto',
            transform: 'translate(calc(50vw - 50%), 20px)',
            display: 'inline-flex',
            flexDirection: 'row',
            pointerEvents: 'auto',
            transition: SPRING,
            cursor: 'default',
            zIndex: 100000,
            WebkitUserSelect: 'none',
            userSelect: 'none',
        };
    } else {
        // RESTING: top-right anchored, draggable
        // clampedX = px from right edge → right edge of nav at (100vw - clampedX)
        wrapperStyle = {
            position: 'absolute',
            top: 0,
            left: 0,
            bottom: 'auto',
            right: 'auto',
            transform: `translate(calc(100vw - ${clampedX}px - 100%), ${clampedY}px)`,
            display: 'inline-flex',
            flexDirection: 'row',
            pointerEvents: 'auto',
            transition: isDragging.current ? 'none' : SPRING,
            cursor: 'grab',
            zIndex: 100000,
            WebkitUserSelect: 'none',
            userSelect: 'none',
        };
    }

    const containerStyle: React.CSSProperties = {
        position: 'relative',
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        padding: '6px',
        zIndex: 100,
        transition: 'all 1.2s cubic-bezier(0.22, 1, 0.36, 1)',
        minHeight: '60px',
    };

    const backgroundStyle: React.CSSProperties = {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        // Liquid glass: very low base opacity so the background bleeds through
        background: isDark
            ? (isModalOpen ? 'rgba(8, 6, 4, 0.18)' : 'rgba(8, 6, 4, 0.08)')
            : (isModalOpen ? 'rgba(255, 255, 255, 0.22)' : 'rgba(255, 255, 255, 0.12)'),
        backdropFilter: isDark
            ? 'blur(48px) saturate(240%) brightness(0.88) contrast(1.04)'
            : 'blur(56px) saturate(220%) brightness(1.45) contrast(0.98)',
        WebkitBackdropFilter: isDark
            ? 'blur(48px) saturate(240%) brightness(0.88) contrast(1.04)'
            : 'blur(56px) saturate(220%) brightness(1.45) contrast(0.98)',
        borderRadius: (isSearchExpanded && skin !== 'drawing') ? '28px 28px 0 0' : '100px',
        // Top highlight edge (liquid glass specular)
        border: isDark
            ? '1px solid rgba(255, 255, 255, 0.11)'
            : '1px solid rgba(255, 255, 255, 0.90)',
        borderTop: isDark
            ? '1px solid rgba(255, 255, 255, 0.18)'
            : '1px solid rgba(255, 255, 255, 1)',
        boxShadow: isDark
            ? '0 4px 32px rgba(0,0,0,0.28), 0 1px 0 rgba(255,255,255,0.08) inset, 0 -1px 0 rgba(0,0,0,0.15) inset'
            : '0 2px 28px rgba(0,0,0,0.05), 0 1px 0 rgba(255,255,255,1) inset, 0 -1px 0 rgba(0,0,0,0.03) inset',
        zIndex: -1,
        pointerEvents: 'none',
        transition: 'background 0.9s ease, box-shadow 0.9s ease, border-color 0.9s ease, backdrop-filter 0.9s ease, border-radius 0.3s ease',
    };

    const getNavItemStyle = (isActive: boolean, isAccent: boolean = false): React.CSSProperties => {
        let bg = 'transparent';
        let color = isDark ? '#d4cfc7' : '#2a2520';
        if (isAccent) {
            bg = isDark ? 'rgba(201,165,90,0.18)' : 'rgba(140,110,40,0.12)';
            color = isDark ? '#c9a55a' : '#a27e36';
        } else if (isActive) {
            bg = isDark ? 'rgba(201,165,90,0.15)' : 'rgba(140,110,40,0.10)';
            color = '#c9a55a';
        }

        return {
            padding: '10px 16px',
            background: bg,
            color: color,
            fontSize: '13px',
            fontWeight: 700,
            letterSpacing: '-0.2px',
            border: 'none',
            borderRadius: '100px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.35s ease, color 0.35s ease, transform 0.1s',
            fontFamily: "'Inter', Arial, Helvetica, sans-serif",
            whiteSpace: 'nowrap',
        };
    };

    if (isDrawingSkin) {
        /*
         * DRAWING SKIN NAV — Design principles:
         *
         * 1. SKETCH FILTER on the WHOLE pill container → all borders/edges look hand-drawn (wobbly)
         * 2. CSS fills for hamburger bars → solid divs survive displacement filter (not SVG strokes)
         * 3. FILLED SVG icons → fill="#111" shapes survive displacement; edges go wobbly = hand-drawn look
         *    (Thin SVG strokes scatter under scale=8 displacement and disappear;
         *     filled shapes stay solid — only edges become wobbly, which is the desired effect)
         */
        const iconBtnStyle = (delay = 0, active = false): React.CSSProperties => ({
            width: 56, height: 56, borderRadius: 12,
            background: active ? 'rgba(17,17,17,0.12)' : 'transparent',
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: isMenuOpen ? 1 : 0,
            transform: isMenuOpen ? 'translateX(0) scale(1)' : 'translateX(-12px) scale(0.85)',
            transition: `opacity 0.32s ease-out ${delay}s, transform 0.32s ease-out ${delay}s, background 0.18s`,
            flexShrink: 0,
            outline: 'none',
            fontFamily: "'Space Mono', 'Courier New', monospace",
        });

        return (
            <div style={{ position: 'absolute', top: '32px', right: '64px', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', zIndex: 100000 }}>
                {/* Single pill — sketch filter applied to the whole container for wobbly line effect */}
                <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '4px 6px',
                    background: '#FFFFFF',
                    border: '3px solid #111111',
                    borderRadius: 9999,
                    boxShadow: '6px 6px 0px 0px rgba(17,17,17,1)',
                    filter: isMobile ? 'none' : 'url(#dg-sketch-ui)',
                    transition: 'width 0.22s linear',
                }}>
                    {/* Search bar — collapses when menu opens */}
                    <div style={{
                        width: isMenuOpen ? '0px' : (isSearchExpanded ? '292px' : '44px'),
                        overflow: isMenuOpen ? 'hidden' : 'visible',
                        transition: 'width 0.22s linear',
                        pointerEvents: 'auto',
                    }}>
                        <div style={{ pointerEvents: isMenuOpen ? 'none' : 'auto', opacity: isMenuOpen ? 0 : 1, transition: 'opacity 0.2s' }}>
                            <GlobalSearchBar inlineMode {...searchProps} isDark={true} drawingSkin={true} forceWidth="100%" />
                        </div>
                    </div>

                    {/* Icon menu — expands when hamburger is pressed */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0,
                        overflow: 'hidden',
                        maxWidth: isMenuOpen ? '420px' : '0px',
                        opacity: isMenuOpen ? 1 : 0,
                        transition: 'max-width 0.22s linear, opacity 0.2s linear',
                    }}>
                        {/* ── ADMIN ── person silhouette + tilted crown */}
                        {isAdmin && (
                            <button title="Admin Profile"
                                onClick={() => { setIsMenuOpen(false); navigate('/admin'); }}
                                style={iconBtnStyle(0)}
                                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(17,17,17,0.1)'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                                onMouseDown={(e) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }}
                            >
                                <svg width="52" height="52" viewBox="0 0 36 36" strokeLinecap="round" strokeLinejoin="round">
                                    {/* Head — filled */}
                                    <circle cx="14" cy="16" r="6" fill="#111"/>
                                    {/* Shoulders — filled */}
                                    <path d="M4 33 C4.5 26 8.5 22 14 22 C19.5 22 23.5 26 24 33Z" fill="#111"/>
                                    {/* Crown — 5-point star, slightly lopsided */}
                                    <path d="M23 4 L24.5 7.5 L28.5 7 L26 10 L27.5 13.5 L23.5 12 L20 14 L21 10.5 L18.5 8 L22.5 7.5 Z" fill="#111"/>
                                </svg>
                            </button>
                        )}

                        {/* ── MY PAGE ── filled heart (나의 것) */}
                        <button title="My Page"
                            onClick={() => { setIsMenuOpen(false); navigate('/mypage'); }}
                            style={iconBtnStyle(0.04)}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(17,17,17,0.1)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                            onMouseDown={(e) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }}
                        >
                            <svg width="52" height="52" viewBox="0 0 36 36">
                                {/* Big filled heart */}
                                <path d="M18 32 C17 31.5 3 23 3 13.5 C3 7.5 7.5 4.5 12 5 C14.5 5.3 16.5 7 18 9 C19.5 7 21.5 5.3 24 5 C28.5 4.5 33 7.5 33 13.5 C33 23 19 31.5 18 32Z" fill="#111"/>
                                {/* Tiny sparkle at top-left — hand-drawn asterisk */}
                                <line x1="7" y1="7.5" x2="7" y2="10.5" stroke="#111" strokeWidth="2.5"/>
                                <line x1="5.5" y1="9" x2="8.5" y2="9" stroke="#111" strokeWidth="2.5"/>
                            </svg>
                        </button>

                        {/* ── COMMUNITY ── filled speech bubble, white dots inside */}
                        <button title="Community"
                            onClick={() => { setIsMenuOpen(false); window.dispatchEvent(new CustomEvent('toggle-community-panel')); }}
                            style={iconBtnStyle(0.08)}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(17,17,17,0.1)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                            onMouseDown={(e) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }}
                        >
                            <svg width="52" height="52" viewBox="0 0 36 36">
                                {/* Filled speech bubble body with pointy tail at bottom-left */}
                                <path d="M3 4 L33 4 C34.5 4 36 5.5 36 7 L36 23 C36 24.5 34.5 26 33 26 L17 26 L11 33 L13 26 L3 26 C1.5 26 0 24.5 0 23 L0 7 C0 5.5 1.5 4 3 4Z" fill="#111"/>
                                {/* Three white dots — talking indicator */}
                                <circle cx="11" cy="15" r="3.5" fill="white"/>
                                <circle cx="18" cy="15" r="3.5" fill="white"/>
                                <circle cx="25" cy="15" r="3.5" fill="white"/>
                            </svg>
                        </button>

                        {/* ── BUG REPORT ── filled beetle, white spots + center line */}
                        <button title="Bug Report"
                            onClick={() => { setIsBugReportOpen(!isBugReportOpen); }}
                            style={iconBtnStyle(0.12, isBugReportOpen)}
                            onMouseEnter={e => { if (!isBugReportOpen) e.currentTarget.style.background = 'rgba(17,17,17,0.1)'; }}
                            onMouseLeave={e => { if (!isBugReportOpen) e.currentTarget.style.background = 'transparent'; }}
                            onMouseDown={(e) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }}
                        >
                            <svg width="52" height="52" viewBox="0 0 36 36" strokeLinecap="round">
                                {/* Filled head */}
                                <circle cx="18" cy="10" r="5.5" fill="#111"/>
                                {/* Filled body */}
                                <path d="M18 14.5 C23.5 14.5 27.5 18.5 27.5 23.5 C27.5 28.5 23.5 32.5 18 32.5 C12.5 32.5 8.5 28.5 8.5 23.5 C8.5 18.5 12.5 14.5 18 14.5Z" fill="#111"/>
                                {/* Center dividing line — white */}
                                <line x1="18" y1="14.5" x2="18" y2="32.5" stroke="white" strokeWidth="2.5"/>
                                {/* White spots */}
                                <circle cx="14" cy="22" r="3.2" fill="white"/>
                                <circle cx="22" cy="22" r="3.2" fill="white"/>
                                {/* Antennae — thick enough to survive filter */}
                                <line x1="15" y1="5.5" x2="11.5" y2="2" stroke="#111" strokeWidth="3"/>
                                <line x1="21" y1="5.5" x2="24.5" y2="2" stroke="#111" strokeWidth="3"/>
                                {/* 6 legs — thick strokes */}
                                <line x1="8.5" y1="19" x2="3" y2="17" stroke="#111" strokeWidth="3"/>
                                <line x1="8.5" y1="23.5" x2="3" y2="23.5" stroke="#111" strokeWidth="3"/>
                                <line x1="8.5" y1="28" x2="3" y2="30" stroke="#111" strokeWidth="3"/>
                                <line x1="27.5" y1="19" x2="33" y2="17" stroke="#111" strokeWidth="3"/>
                                <line x1="27.5" y1="23.5" x2="33" y2="23.5" stroke="#111" strokeWidth="3"/>
                                <line x1="27.5" y1="28" x2="33" y2="30" stroke="#111" strokeWidth="3"/>
                            </svg>
                        </button>
                    </div>

                    {/* ── HAMBURGER / CLOSE ── CSS fills, survive sketch displacement filter */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            const opening = !isMenuOpen;
                            setIsMenuOpen(opening);
                            setIsBugReportOpen(false);
                            if (opening && isSearchExpanded) {
                                window.dispatchEvent(new CustomEvent('global-nav-close-search'));
                            }
                        }}
                        onMouseDown={(e) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }}
                        style={{
                            width: '50px',
                            height: '50px',
                            borderRadius: '50%',
                            background: isMenuOpen ? 'rgba(17,17,17,0.1)' : 'transparent',
                            border: '2px solid #111111',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'background 0.2s ease',
                            flexShrink: 0,
                            outline: 'none',
                        }}
                    >
                        {isMenuOpen ? (
                            /* Close X — two CSS filled bars rotated */
                            <div style={{ position: 'relative', width: 22, height: 22, pointerEvents: 'none' }}>
                                <span style={{ position: 'absolute', top: '50%', left: '50%', width: 22, height: 2.8, background: '#111', borderRadius: 2, transform: 'translate(-50%, -50%) rotate(45deg)', transformOrigin: 'center' }}/>
                                <span style={{ position: 'absolute', top: '50%', left: '50%', width: 22, height: 2.8, background: '#111', borderRadius: 2, transform: 'translate(-50%, -50%) rotate(-45deg)', transformOrigin: 'center' }}/>
                            </div>
                        ) : (
                            /* Hamburger — three solid CSS bars, always visible through any filter */
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', pointerEvents: 'none' }}>
                                <span style={{ display: 'block', width: 22, height: 2.8, background: '#111111', borderRadius: 2 }}/>
                                <span style={{ display: 'block', width: 22, height: 2.8, background: '#111111', borderRadius: 2 }}/>
                                <span style={{ display: 'block', width: 22, height: 2.8, background: '#111111', borderRadius: 2 }}/>
                            </div>
                        )}
                    </button>
                </div>

                {isBugReportOpen && isMenuOpen && (
                    <div style={{ position: 'absolute', top: 'calc(100% + 12px)', right: 0, zIndex: 1000000, pointerEvents: 'auto' }}>
                        <BugReportModal onClose={() => setIsBugReportOpen(false)} />
                    </div>
                )}
            </div>
        );
    }

    return (
        <div id="global-nav-wrapper" ref={wrapperRef} style={wrapperStyle} onMouseDown={handleMouseDown}>
            <div style={containerStyle}>
                <div style={backgroundStyle} />
                <div style={{
                    width: isSearchExpanded ? 'min(340px, calc(100vw - 180px))' : '50px',
                    opacity: 1,
                    overflow: isMenuOpen ? 'hidden' : 'visible',
                    transition: 'width 0.42s cubic-bezier(0.4, 0, 0.2, 1)',
                    pointerEvents: 'auto'
                }}>
                    <GlobalSearchBar inlineMode {...searchProps} isDark={isDark} forceWidth="100%" />
                </div>

                {/* Horizontal Sliding Menu Area */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    overflow: 'hidden',
                    maxWidth: isMenuOpen ? '600px' : '0px',
                    opacity: isMenuOpen ? 1 : 0,
                    transition: 'max-width 0.42s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease',
                }}>
                    {isAdmin && (
                        <button
                            onClick={() => navigate('/admin')}
                            style={{ ...getNavItemStyle(currentPath === '/admin'), transition: 'background 0.35s ease, color 0.35s, transform 1.3s cubic-bezier(0.22, 1, 0.36, 1), opacity 1.0s', transform: isMenuOpen ? 'translateX(0)' : 'translateX(-20px)', opacity: isMenuOpen ? 1 : 0 }}
                            onMouseDown={(e) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }}
                        >
                            ADMIN PROFILE
                        </button>
                    )}
                    <button
                        onClick={() => navigate('/mypage')}
                        style={{ ...getNavItemStyle(currentPath === '/mypage'), transition: 'background 0.35s ease, color 0.35s, transform 1.3s cubic-bezier(0.22, 1, 0.36, 1) 0.06s, opacity 1.0s 0.06s', transform: isMenuOpen ? 'translateX(0)' : 'translateX(-20px)', opacity: isMenuOpen ? 1 : 0 }}
                        onMouseDown={(e) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }}
                    >
                        MY PAGE
                    </button>
                    <button
                        onClick={() => setIsBugReportOpen(!isBugReportOpen)}
                        style={{ ...getNavItemStyle(isBugReportOpen, true), transition: 'background 0.35s ease, color 0.35s, transform 1.3s cubic-bezier(0.22, 1, 0.36, 1) 0.18s, opacity 1.0s 0.18s', transform: isMenuOpen ? 'translateX(0)' : 'translateX(-20px)', opacity: isMenuOpen ? 1 : 0 }}
                        onMouseDown={(e) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }}
                    >
                        BUG REPORT
                    </button>
                </div>

                {/* Hamburger Menu Toggle */}
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        const opening = !isMenuOpen;
                        setIsMenuOpen(opening);
                        setIsBugReportOpen(false);
                        if (opening && isSearchExpanded) {
                            window.dispatchEvent(new CustomEvent('global-nav-close-search'));
                        }
                    }}
                    onMouseDown={(e) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }}
                    style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '48px',
                        background: isMenuOpen
                            ? (isDark ? 'rgba(201,165,90,0.15)' : 'rgba(140,110,40,0.10)')
                            : 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'background 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
                        marginLeft: '2px',
                        flexShrink: 0,
                    }}
                    onMouseEnter={(e) => {
                        if (!isMenuOpen) e.currentTarget.style.background = isDark ? 'rgba(201,165,90,0.08)' : 'rgba(0,0,0,0.05)';
                    }}
                    onMouseLeave={(e) => {
                        if (!isMenuOpen) e.currentTarget.style.background = 'transparent';
                    }}
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={isDark ? '#c9a55a' : '#7a5c1e'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                        style={{ transition: 'transform 0.5s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s' }}
                    >
                        {isMenuOpen ? (
                            <>
                                <line x1="18" y1="6" x2="6" y2="18" stroke={isDark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.7)'}></line>
                                <line x1="6" y1="6" x2="18" y2="18" stroke={isDark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.7)'}></line>
                            </>
                        ) : (
                            <>
                                <line x1="3" y1="12" x2="21" y2="12"></line>
                                <line x1="3" y1="6" x2="21" y2="6"></line>
                                <line x1="3" y1="18" x2="21" y2="18"></line>
                            </>
                        )}
                    </svg>
                </button>
            </div>

            {/* Render Semantic Bug Report dropdown directly aligned under the pill */}
            {isBugReportOpen && isMenuOpen && (
                <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 1000000 }}>
                    <BugReportModal onClose={() => setIsBugReportOpen(false)} />
                </div>
            )}
        </div>
    );
};
