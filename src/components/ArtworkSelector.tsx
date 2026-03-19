
import React, { useState, useEffect } from 'react';
import { exhibitions } from "../data/exhibitions";

interface ArtworkSelectorProps {
    onSelect: (imageUrl: string) => void;
    selectedImage?: string | null;
}

// Helper to get random artworks
const getRandomArtworks = (count: number) => {
    const allArtworks: any[] = [];
    exhibitions.forEach(museum => {
        if (museum.rooms) {
            Object.values(museum.rooms).forEach((roomItems: any) => {
                allArtworks.push(...roomItems);
            });
        }
        [...(museum.permanentExhibitions || []), ...(museum.temporaryExhibitions || [])].forEach(exhib => {
            if (exhib.artworks) {
                allArtworks.push(...exhib.artworks);
            }
        });
    });
    const shuffled = allArtworks.sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
};

const ArtworkSelector: React.FC<ArtworkSelectorProps> = ({ onSelect, selectedImage }) => {
    const [artworks, setArtworks] = useState<any[]>([]);

    useEffect(() => {
        setArtworks(getRandomArtworks(8));
    }, []);

    const handleShuffle = () => {
        setArtworks(getRandomArtworks(8));
    };

    return (
        <div>
            <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 10,
                width: '100%'
            }}>
                {artworks.map((art, idx) => (
                    <div
                        key={idx}
                        onClick={() => onSelect(art.image)}
                        style={{
                            aspectRatio: "1/1",
                            cursor: "pointer",
                            borderRadius: 8,
                            overflow: "hidden",
                            border: selectedImage === art.image ? "3px solid #000" : "1px solid #eee",
                            position: "relative",
                            transition: 'transform 0.2s',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                        onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                    >
                        <img
                            src={art.image}
                            alt={art.title || "Artwork"}
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                    </div>
                ))}
            </div>
            <button
                type="button"
                onClick={handleShuffle}
                style={{
                    marginTop: 12,
                    padding: "8px 16px",
                    background: "#f0f0f0",
                    color: "#333",
                    border: "none",
                    borderRadius: 20,
                    fontSize: 13,
                    cursor: "pointer",
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    margin: '12px auto'
                }}
            >
                <span>↻</span> 다른 작품 보기
            </button>
        </div>
    );
};

export default ArtworkSelector;
