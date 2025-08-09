import { GoogleMap, Marker, useJsApiLoader } from '@react-google-maps/api';
import { useRef, useState } from 'react';

import type { Exhibition } from '../types/Exhibition';

const containerStyle = { width: '100vw', height: '100vh' };
const center = { lat: 37.5665, lng: 126.9780 };

// API 키와 새 Map ID를 상수로 선언
const API_KEY = 'AIzaSyCjXHiVCgUGSDTBnacLnoPldQQt5C5DU4M';
const MAP_ID = '3d00da6d7d9060e41aa19e75';  // Armin‑web 지도 ID

type CustomGoogleMapProps = {
  exhibitions: Exhibition[];
  onSelectExhibition?: (exhibition: Exhibition) => void;
};

export default function CustomGoogleMap({ exhibitions, onSelectExhibition }: CustomGoogleMapProps) {
  const mapRef = useRef<any>(null);
  const [zoom, setZoom] = useState(11);
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: API_KEY,
    mapIds: [MAP_ID],
  });

  if (loadError) {
    return <div>Error loading map</div>;
  }
  if (!isLoaded) {
    return <div>Loading...</div>;
  }



  return (
    <GoogleMap
      mapContainerStyle={containerStyle}
      center={center}
      zoom={zoom}
      options={{
        mapId: MAP_ID,
        disableDefaultUI: true,
        zoomControl: true,
      }}
      onLoad={map => {
        mapRef.current = map;
      }}
      onZoomChanged={() => {
        if (mapRef.current) setZoom(mapRef.current.getZoom());
      }}
    >
      {exhibitions && exhibitions.map((exhibition) => {
        // 줌 레벨이 2 이하이면 마커 숨김
        if (zoom <= 2) return null;
        // 실제 핀 이미지의 원본 비율을 확인(예: 48x48, 40x48 등)
        // 상하가 더 길도록 1:2 비율로 조정 (예: 40x80)
        const width = Math.max(12, Math.min(24, zoom * 2));
        const height = Math.round(width * 2); // 1:2 비율
        // scaledSize, origin, anchor는 window.google.maps가 있을 때만 넘김
        if (window.google && window.google.maps) {
          return (
            <Marker
              key={exhibition.id}
              position={{ lat: exhibition.latitude, lng: exhibition.longitude }}
              title={exhibition.name}
              icon={{
                url: "/images/pin.png",
                scaledSize: new window.google.maps.Size(width, height),
                origin: new window.google.maps.Point(0, 0),
                anchor: new window.google.maps.Point(width / 2, height),
              }}
              onClick={() => onSelectExhibition && onSelectExhibition(exhibition)}
            />
          );
        } else {
          // window.google.maps가 없으면 scaledSize 등은 생략
          return (
            <Marker
              key={exhibition.id}
              position={{ lat: exhibition.latitude, lng: exhibition.longitude }}
              title={exhibition.name}
              icon={{ url: "/images/pin.png" }}
              onClick={() => onSelectExhibition && onSelectExhibition(exhibition)}
            />
          );
        }
      })}
    </GoogleMap>
  );
}