
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getOptimizedImageUrl } from '../utils/imageProxy';
import { prettifyArtistName } from '../utils/canonicalArtist';

interface SlideshowProps {
    artworks: any[];
    onClose: () => void;
}

type Orientation = 'landscape' | 'portrait' | 'all';

const Slideshow: React.FC<SlideshowProps> = ({ artworks, onClose }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [playMode, setPlayMode] = useState<'sequential' | 'random'>('random');
    const [orientationFilter, setOrientationFilter] = useState<Orientation>('all');

    // Default duration: 1 minute (60000ms)
    const [duration, setDuration] = useState(60000);

    const [filteredArtworks, setFilteredArtworks] = useState<any[]>([]);
    const [showControls, setShowControls] = useState(true);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Filter artworks based on orientation preference and playMode
    useEffect(() => {
        let newList = [...artworks];
        if (playMode === 'random') {
            newList = newList.sort(() => Math.random() - 0.5);
        }
        setFilteredArtworks(newList);
        setCurrentIndex(0);
    }, [artworks, playMode]);

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            containerRef.current?.requestFullscreen().catch(err => {
                console.error(`Error attempting to enable fullscreen: ${err.message}`);
            });
            setIsFullscreen(true);
        } else {
            document.exitFullscreen();
            setIsFullscreen(false);
        }
    };

    const nextSlide = useCallback(() => {
        setCurrentIndex((prev) => (prev + 1) % filteredArtworks.length);
    }, [filteredArtworks.length]);

    const prevSlide = useCallback(() => {
        setCurrentIndex((prev) => (prev - 1 + filteredArtworks.length) % filteredArtworks.length);
    }, [filteredArtworks.length]);

    // Autoplay
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isPlaying) {
            interval = setInterval(nextSlide, duration);
        }
        return () => clearInterval(interval);
    }, [isPlaying, nextSlide, duration]);

    // Hide controls on inactivity
    const handleMouseMove = () => {
        setShowControls(true);
        if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
        controlsTimeoutRef.current = setTimeout(() => {
            if (isPlaying) setShowControls(false);
        }, 3000);
    };

    useEffect(() => {
        if (isPlaying) {
            handleMouseMove();
        } else {
            setShowControls(true);
            if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
        }
        return () => {
            if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
        };
    }, [isPlaying]);


    // Image loading and aspect ratio check
    // We need to skip images that don't match the orientation filter
    // This is tricky because we might not know the aspect ratio until load.
    // We will check the current image. If it loads and is wrong orientation, we auto-skip.

    const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
        const img = e.currentTarget;
        const isLandscape = img.naturalWidth >= img.naturalHeight;
        const isPortrait = !isLandscape;

        if (orientationFilter === 'landscape' && !isLandscape) {
            // Skip to next immediately if playing, or just show it if paused? 
            // Better to skip.
            console.log("Skipping portrait image in landscape mode");
            if (filteredArtworks.length > 1) nextSlide();
        } else if (orientationFilter === 'portrait' && !isPortrait) {
            console.log("Skipping landscape image in portrait mode");
            if (filteredArtworks.length > 1) nextSlide();
        }
    };

    const currentArtwork = filteredArtworks[currentIndex];

    if (!currentArtwork) return null;

    return (
        <div
            ref={containerRef}
            style={{
                position: 'fixed',
                top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: '#000',
                zIndex: 9999,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: showControls ? 'default' : 'none'
            }}
            onMouseMove={handleMouseMove}
        >
            {/* Background/Current Image */}
            <div style={{ width: '100%', height: '100%', position: 'relative' }}>
                <img
                    key={currentArtwork.id || currentIndex} // Key ensures remount on change for animation
                    src={getOptimizedImageUrl(currentArtwork.image, 2048)} // High quality
                    alt={currentArtwork.title}
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                        animation: 'fadeIn 1s ease-in-out'
                    }}
                    onLoad={handleImageLoad}
                />
            </div>

            {/* Info Overlay */}
            <div style={{
                position: 'absolute',
                bottom: 40,
                left: 40,
                color: 'white',
                opacity: showControls ? 1 : 0,
                transition: 'opacity 0.5s ease',
                textShadow: '0 2px 4px rgba(0,0,0,0.8)',
                maxWidth: '80%'
            }}>
                <h2 style={{ fontSize: '2rem', margin: '0 0 10px 0', fontWeight: 300 }}>{currentArtwork.title}</h2>
                <p style={{ fontSize: '1.2rem', margin: 0, opacity: 0.8 }}>{prettifyArtistName(currentArtwork.artist)}</p>
                <p style={{ fontSize: '0.9rem', margin: '5px 0 0 0', opacity: 0.6 }}>{currentArtwork.year}</p>
            </div>

            {/* Controls Overlay */}
            <div style={{
                position: 'absolute',
                top: 20,
                right: 20,
                display: 'flex',
                gap: 15,
                opacity: showControls ? 1 : 0,
                transition: 'opacity 0.3s ease',
                background: 'rgba(0,0,0,0.5)',
                padding: '10px 20px',
                borderRadius: 30,
                backdropFilter: 'blur(10px)'
            }}>
                {/* Duration Selector */}
                <select
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                    style={{
                        background: 'transparent',
                        color: 'white',
                        border: '1px solid rgba(255,255,255,0.3)',
                        borderRadius: 5,
                        padding: '5px',
                        fontSize: 14
                    }}
                >
                    <option value={10000}>10s</option>
                    <option value={30000}>30s</option>
                    <option value={60000}>1m</option>
                    <option value={180000}>3m</option>
                    <option value={300000}>5m</option>
                    <option value={1800000}>30m</option>
                </select>

                {/* Orientation Selector */}
                <select
                    value={orientationFilter}
                    onChange={(e) => setOrientationFilter(e.target.value as Orientation)}
                    style={{
                        background: 'transparent',
                        color: 'white',
                        border: '1px solid rgba(255,255,255,0.3)',
                        borderRadius: 5,
                        padding: '5px',
                        fontSize: 14
                    }}
                >
                    <option value="all">All Orientations</option>
                    <option value="landscape">Landscape Only</option>
                    <option value="portrait">Portrait Only</option>
                </select>

                {/* Play Mode Selector */}
                <select
                    value={playMode}
                    onChange={(e) => setPlayMode(e.target.value as 'sequential' | 'random')}
                    style={{
                        background: 'transparent',
                        color: 'white',
                        border: '1px solid rgba(255,255,255,0.3)',
                        borderRadius: 5,
                        padding: '5px',
                        fontSize: 14
                    }}
                >
                    <option value="sequential">Sequential</option>
                    <option value="random">Random</option>
                </select>

                {/* Play/Pause */}
                <button onClick={() => setIsPlaying(!isPlaying)} style={btnStyle}>
                    {isPlaying ? '⏸ Pause' : '▶ Play'}
                </button>

                {/* Fullscreen */}
                <button onClick={toggleFullscreen} style={btnStyle}>
                    {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                </button>

                {/* Close */}
                <button onClick={onClose} style={{ ...btnStyle, color: '#ff6b6b' }}>
                    ✕ Close
                </button>
            </div>

            {/* Navigation Arrows (Visible on hover) */}
            <button
                onClick={prevSlide}
                style={{
                    position: 'absolute',
                    left: 20,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    color: 'white',
                    fontSize: '3rem',
                    opacity: showControls ? 0.7 : 0,
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                }}
            >
                ‹
            </button>
            <button
                onClick={nextSlide}
                style={{
                    position: 'absolute',
                    right: 20,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    color: 'white',
                    fontSize: '3rem',
                    opacity: showControls ? 0.7 : 0,
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                }}
            >
                ›
            </button>

            <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(1.02); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
        </div>
    );
};

const btnStyle = {
    background: 'transparent',
    border: 'none',
    color: 'white',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 600
};

export default Slideshow;
