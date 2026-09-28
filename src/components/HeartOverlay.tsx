import React from 'react';
import { LikeIcon } from './like/LikeIcon';

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
            <LikeIcon liked={isLiked} size={size} color={color} emptyColor={emptyColor} style={{ filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.3))' }} />
        </div>
    );
};
