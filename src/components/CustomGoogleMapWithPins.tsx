import { GoogleMap, Marker, useJsApiLoader } from '@react-google-maps/api';
import { exhibitions } from '../data/exhibitions';

const containerStyle = { width: '100%', height: '400px' };
const center = { lat: 37.5665, lng: 126.9780 };

const API_KEY = 'AIzaSyCjXHiVCgUGSDTBnacLnoPldQQt5C5DU4M';
const MAP_ID = '3d00da6d7d9060e41aa19e75';

export default function CustomGoogleMapWithPins() {
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
      zoom={11}
      options={{
        mapId: MAP_ID,
        disableDefaultUI: true,
        zoomControl: true,
      }}
    >
      {exhibitions.map((exhibition: any) => (
        <Marker
          key={exhibition.id}
          position={{ lat: exhibition.latitude, lng: exhibition.longitude }}
          title={exhibition.name}
        />
      ))}
    </GoogleMap>
  );
}
