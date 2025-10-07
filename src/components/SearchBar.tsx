// src/components/SearchBar.tsx

import React from 'react';

interface SearchBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSearchSubmit?: () => void; // 추가
  sizeScale?: number; // optional scale for sizing (1.0 default)
}

const SearchBar: React.FC<SearchBarProps> = ({
  searchQuery,
  onSearchChange,
  onSearchSubmit,
  sizeScale = 1
}) => {
  const padY = Math.round(18 * sizeScale);
  const padX = Math.round(10 * sizeScale);
  const fontPx = Math.max(10, Math.round(16 * sizeScale));
  const radius = Math.round(8 * sizeScale);
  const [bgColor, setBgColor] = React.useState<string>(() => {
    try {
      return localStorage.getItem('searchBgColor') || '#0A2A43'; // dark navy ocean fallback
    } catch {
      return '#0A2A43';
    }
  });

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && onSearchSubmit) {
      onSearchSubmit();
    }
  };

  return (
    <input
      id="global-search"
      name="global-search"
      type="text"
      value={searchQuery}
      onChange={(e) => onSearchChange(e.target.value)}
      onKeyDown={handleKeyDown}  // 추가
      placeholder="Search for exhibitions, artworks, or artists"
      onContextMenu={async (e) => {
        e.preventDefault();
        try {
          const EyeDropperCtor = (window as any).EyeDropper;
          if (!EyeDropperCtor) return; // silently ignore if unsupported
          const eyeDropper = new EyeDropperCtor();
          const res = await eyeDropper.open();
          if (res && res.sRGBHex) {
            setBgColor(res.sRGBHex);
            try { localStorage.setItem('searchBgColor', res.sRGBHex); } catch {}
          }
        } catch {
          // ignore cancel/errors
        }
      }}
  style={{
        width: '100%',
  padding: `${padY}px ${padX}px`,
  fontSize: `${fontPx}px`,
        fontFamily: "Teletactile, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Helvetica Neue', Arial, sans-serif",
        backgroundColor: bgColor,
        color: '#000',
        border: '1px solid rgba(0,0,0,0.25)',
  borderRadius: `${radius}px`,
        marginBottom: '0'
      }}
    />
  );
};

export default SearchBar;