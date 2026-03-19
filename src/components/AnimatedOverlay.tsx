import React, { useEffect, useState } from "react";

interface AnimatedOverlayProps {
    isActive: boolean;
    transformActive: string;
    transformHidden: string;
    zIndex?: number;
    children: React.ReactNode;
}

export const AnimatedOverlay: React.FC<AnimatedOverlayProps> = ({
    isActive,
    transformActive,
    transformHidden,
    zIndex = 10000,
    children
}) => {
    const [shouldRender, setShouldRender] = useState(isActive);
    const [hasMounted, setHasMounted] = useState(isActive);

    useEffect(() => {
        if (isActive) {
            setShouldRender(true);
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    setHasMounted(true);
                });
            });
        } else {
            setHasMounted(false);
            const timer = setTimeout(() => {
                setShouldRender(false);
            }, 600); // 600ms matching transition
            return () => clearTimeout(timer);
        }
    }, [isActive]);

    if (!shouldRender) return null;

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                height: '100dvh', // Use dvh to work well on mobile
                width: '100vw',
                background: '#fff',
                zIndex,
                overflowY: 'auto',
                overflowX: 'hidden',
                transition: 'transform 0.6s cubic-bezier(0.22, 1, 0.36, 1)',
                transform: hasMounted ? transformActive : transformHidden,
            }}
        >
            {/* 
Notice we don't block pointer events when not active because it unmounts,
but while animating out, pointer-events should be none to avoid ghost clicks.
*/}
            <div style={{ width: '100%', height: '100%', pointerEvents: isActive ? 'auto' : 'none' }}>
                {children}
            </div>
        </div>
    );
};
