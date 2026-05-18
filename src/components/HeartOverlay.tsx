import React from 'react';

interface HeartOverlayProps {
    isLiked: boolean;
    onToggle: (e: React.MouseEvent) => void;
    style?: React.CSSProperties;
    size?: number;
    color?: string;
    emptyColor?: string;
    className?: string; // Add support for className
}

export const HeartOverlay: React.FC<HeartOverlayProps> = ({ isLiked, onToggle, style, size = 24, color = "#D4A547", emptyColor = "#fff", className }) => {
    return (
        <div
            className={`heart-btn ${className || ''}`}
            onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onToggle(e);
            }}
            style={{
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'transform 0.1s',
                position: 'relative',
                zIndex: 2,
                ...style
            }}
            title={isLiked ? "Unlike" : "Like"}
            onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.9)'}
            onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
            <svg width={size} height={size} viewBox="0 0 24 24" fill={isLiked ? color : "none"} stroke={isLiked ? color : emptyColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.3))' }}>
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
        </div>
    );
};
