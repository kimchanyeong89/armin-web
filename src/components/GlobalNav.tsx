import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LoginButton } from './LoginButton';
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

export const GlobalNav: React.FC<GlobalNavProps> = ({ isAdmin, isModalOpen, searchProps, skin = 'default', onClose }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const [isBugReportOpen, setIsBugReportOpen] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isSearchExpanded, setIsSearchExpanded] = useState(false);

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

    const [position, setPosition] = useState(() => {
        try {
            const saved = localStorage.getItem('globalNavPos');
            if (saved) {
                const pos = JSON.parse(saved);
                // Clamp saved position to reasonable viewport bounds to prevent off-screen drift
                const maxAbsX = typeof window !== 'undefined' ? window.innerWidth * 0.4 : 400;
                const maxAbsY = typeof window !== 'undefined' ? window.innerHeight * 0.4 : 300;
                // Allow positive Y only up to a very small amount (since it goes off the bottom edge)
                if (Math.abs(pos.x) < maxAbsX && pos.y >= -maxAbsY && pos.y <= 24) {
                    return pos;
                }
                // Saved position is out of reasonable range — reset to center
                localStorage.removeItem('globalNavPos');
            }
        } catch (e) {
            console.error('Failed to load nav pos', e);
        }
        return { x: 0, y: 0 };
    });
    const dragRef = useRef<{ startX: number; startY: number; initialX: number; initialY: number; minX: number; maxX: number; minY: number; maxY: number } | null>(null);
    const isDragging = useRef(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging.current || !dragRef.current) return;
            const dx = e.clientX - dragRef.current.startX;
            const dy = e.clientY - dragRef.current.startY;

            let newX = dragRef.current.initialX + dx;
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
            localStorage.setItem('globalNavPos', JSON.stringify(position));
        }, 300); // slight debounce
        return () => clearTimeout(timer);
    }, [position]);

    // Track when inline search expands so we can close the menu
    const preSearchPos = useRef<{ x: number, y: number } | null>(null);
    useEffect(() => {
        const onSearchOpen = () => {
            setIsMenuOpen(false);
            setIsBugReportOpen(false);
            setIsSearchExpanded(true);
            setPosition((prev: { x: number, y: number }) => {
                preSearchPos.current = prev;
                // Move to near the top of the scren
                const targetY = -(window.innerHeight - 150);
                const currentNavHeight = wrapperRef.current?.offsetHeight || 60;
                const minAllowedY = -(window.innerHeight - currentNavHeight - 52);
                return { x: 0, y: Math.max(targetY, minAllowedY) };
            });
        };
        const onSearchClose = () => {
            setIsSearchExpanded(false);
            if (preSearchPos.current) {
                setPosition(preSearchPos.current);
                preSearchPos.current = null;
            }
        };
        window.addEventListener('global-search-expanded', onSearchOpen);
        window.addEventListener('global-search-collapsed', onSearchClose);
        return () => {
            window.removeEventListener('global-search-expanded', onSearchOpen);
            window.removeEventListener('global-search-collapsed', onSearchClose);
        };
    }, []);

    // Dynamically clamp position to window bounds when menu or search expands
    // This shifts the component leftwards smoothly as its width transitions
    useEffect(() => {
        if (!wrapperRef.current) return;

        let frameId: number;
        const start = Date.now();

        const checkBounds = () => {
            if (!wrapperRef.current) return;
            const width = wrapperRef.current.offsetWidth;
            const height = wrapperRef.current.offsetHeight;

            // Parent is at left: 50%, bottom: 32px
            const maxDragX = window.innerWidth / 2 - width / 2 - 20;
            const minDragX = -(window.innerWidth / 2 - width / 2 - 20);

            const maxDragY = 12; // can only go down by 12px before hitting bottom edge (32 - 20)
            const minDragY = -(window.innerHeight - height - 52); // can go up to top edge

            setPosition((prev: { x: number; y: number }) => {
                let newX = prev.x;
                let newY = prev.y;
                let changed = false;

                if (newX > maxDragX) { newX = maxDragX; changed = true; }
                if (newX < minDragX) { newX = minDragX; changed = true; }
                if (newY > maxDragY) { newY = maxDragY; changed = true; }
                if (newY < minDragY) { newY = minDragY; changed = true; }

                return changed ? { x: newX, y: newY } : prev;
            });

            if (Date.now() - start < 600) {
                frameId = requestAnimationFrame(checkBounds);
            }
        };

        frameId = requestAnimationFrame(checkBounds);

        return () => cancelAnimationFrame(frameId);
    }, [isMenuOpen, isSearchExpanded]);

    const handleMouseDown = (e: React.MouseEvent) => {
        const target = e.target as HTMLElement;
        // Do not trigger drag on interactive elements
        if (target.tagName.toLowerCase() === 'button' || target.tagName.toLowerCase() === 'input' || target.closest('button')) {
            return;
        }

        if (!wrapperRef.current) return;
        const rect = wrapperRef.current.getBoundingClientRect();

        // Parent is at left: 50%, bottom: 32px
        const width = rect.width;
        const height = rect.height;

        const maxDragX = window.innerWidth / 2 - width / 2 - 20;
        const minDragX = -(window.innerWidth / 2 - width / 2 - 20);

        const maxDragY = 12;
        const minDragY = -(window.innerHeight - height - 52);

        dragRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            initialX: position.x,
            initialY: position.y,
            minX: minDragX,
            maxX: maxDragX,
            minY: minDragY,
            maxY: maxDragY
        };
        isDragging.current = true;
        wrapperRef.current.style.cursor = 'grabbing';
    };

    const wrapperStyle: React.CSSProperties = {
        position: 'relative',
        display: 'inline-flex',
        flexDirection: 'row',
        transform: `translate(${position.x}px, ${position.y}px)`,
        transition: isDragging.current ? 'none' : 'transform 1.1s cubic-bezier(0.22, 1, 0.36, 1)',
        cursor: 'grab',
        zIndex: 100000,
        WebkitUserSelect: 'none',
        userSelect: 'none'
    };

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
        background: isDark
            ? (isModalOpen ? 'rgba(6, 6, 5, 0.88)' : 'rgba(6, 6, 5, 0.95)')
            : (isModalOpen ? 'rgba(255, 255, 255, 0.75)' : 'rgba(255, 255, 255, 0.88)'),
        backdropFilter: 'blur(40px) saturate(200%)',
        WebkitBackdropFilter: 'blur(40px) saturate(200%)',
        borderRadius: '100px',
        border: isDark ? '1px solid rgba(201, 165, 90, 0.22)' : '1px solid rgba(0, 0, 0, 0.10)',
        boxShadow: isDark
            ? '0 8px 40px rgba(0, 0, 0, 0.7), 0 1px 0 rgba(255,255,255,0.04) inset'
            : '0 8px 32px rgba(0, 0, 0, 0.10), 0 1px 0 rgba(255,255,255,0.6) inset',
        zIndex: -1,
        pointerEvents: 'none',
        transition: 'background 1.1s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 1.1s cubic-bezier(0.22, 1, 0.36, 1), border-color 1.1s cubic-bezier(0.22, 1, 0.36, 1)',
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
        return (
            <div style={{
                position: 'relative',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: 6,
                background: '#FFFFFF',
                border: '2.5px solid #111111',
                borderRadius: 9999,
                boxShadow: '4px 4px 0px 0px rgba(17,17,17,1)',
                filter: 'url(#dg-sketch-ui)',
                zIndex: 100000
            }}>
                <div style={{
                    width: isSearchExpanded ? 'min(420px, calc(100vw - 40px))' : '48px',
                    overflow: 'visible',
                    transition: 'width 0.6s cubic-bezier(0.22, 1, 0.36, 1)'
                }}>
                    <GlobalSearchBar inlineMode {...searchProps} isDark={false} />
                </div>

                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    overflow: 'hidden',
                    maxWidth: isMenuOpen ? 360 : 0,
                    opacity: isMenuOpen ? 1 : 0,
                    transition: 'max-width 0.6s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.35s ease'
                }}>
                    <button
                        onClick={() => { setIsMenuOpen(false); navigate('/mypage?theme=drawing'); }}
                        style={{
                            padding: '10px 14px',
                            border: 'none',
                            borderRadius: 999,
                            background: 'transparent',
                            color: '#111111',
                            fontSize: 12,
                            fontWeight: 800,
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            cursor: 'pointer'
                        }}
                    >
                        My Page
                    </button>
                    <button
                        onClick={() => { setIsMenuOpen(false); navigate('/community?theme=drawing'); }}
                        style={{
                            padding: '10px 14px',
                            border: 'none',
                            borderRadius: 999,
                            background: 'transparent',
                            color: '#111111',
                            fontSize: 12,
                            fontWeight: 800,
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            cursor: 'pointer'
                        }}
                    >
                        Community
                    </button>
                </div>

                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        const opening = !isMenuOpen;
                        setIsMenuOpen(opening);
                        if (opening && isSearchExpanded) {
                            window.dispatchEvent(new CustomEvent('global-nav-close-search'));
                        }
                    }}
                    style={{
                        width: 40,
                        height: 40,
                        borderRadius: 999,
                        border: 'none',
                        background: 'transparent',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer'
                    }}
                >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#111111" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        {isMenuOpen ? (
                            <>
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </>
                        ) : (
                            <>
                                <line x1="4" y1="12" x2="20" y2="12" />
                                <line x1="4" y1="6" x2="20" y2="6" />
                                <line x1="4" y1="18" x2="20" y2="18" />
                            </>
                        )}
                    </svg>
                </button>

                {onClose && (
                    <button
                        onClick={onClose}
                        title="Exit Drawing Map"
                        style={{
                            width: 40,
                            height: 40,
                            borderRadius: 999,
                            border: 'none',
                            background: 'transparent',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer'
                        }}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#111111" strokeWidth="3" strokeLinecap="round">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                )}
            </div>
        );
    }

    return (
        <div id="global-nav-wrapper" ref={wrapperRef} style={wrapperStyle} onMouseDown={handleMouseDown}>
            <div style={containerStyle}>
                <div style={backgroundStyle} />
                {/* Profile Avatar always on Left */}
                <div
                    style={{ display: 'flex', alignItems: 'center', margin: '0 4px', zIndex: 10 }}
                    onMouseDown={(e) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }}
                >
                    <LoginButton />
                </div>

                <div style={{
                    width: isSearchExpanded ? 'min(420px, calc(100vw - 40px))' : '50px',
                    opacity: 1,
                    overflow: 'visible',
                    transition: 'width 1.3s cubic-bezier(0.22, 1, 0.36, 1)',
                    pointerEvents: 'auto'
                }}>
                    <GlobalSearchBar inlineMode {...searchProps} isDark={isDark} />
                </div>

                {/* Horizontal Sliding Menu Area */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    overflow: 'hidden',
                    maxWidth: isMenuOpen ? '600px' : '0px',
                    opacity: isMenuOpen ? 1 : 0,
                    transition: 'max-width 1.3s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.9s cubic-bezier(0.22, 1, 0.36, 1)',
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
                        onClick={() => window.dispatchEvent(new CustomEvent('toggle-community-panel'))}
                        style={{ ...getNavItemStyle(false), transition: 'background 0.35s ease, color 0.35s, transform 1.3s cubic-bezier(0.22, 1, 0.36, 1) 0.12s, opacity 1.0s 0.12s', transform: isMenuOpen ? 'translateX(0)' : 'translateX(-20px)', opacity: isMenuOpen ? 1 : 0 }}
                        onMouseDown={(e) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }}
                    >
                        COMMUNITY
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
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#c9a55a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                        style={{ transition: 'transform 0.5s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s' }}
                    >
                        {isMenuOpen ? (
                            <>
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
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
