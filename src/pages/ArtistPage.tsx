import { useParams } from "react-router-dom";
import { artists } from "../data/artists";

export default function ArtistPage() {
  const { id } = useParams();
  const artist = artists.find((a) => a.id === id);

  if (!artist) {
    return <div>Artist not found.</div>;
  }

  return (
    <div style={{ padding: "20px" }}>
      <h1>{artist.name}</h1>
  <p>Nationality: {artist.nationality}</p>
  <p>Birth year: {artist.birthYear}</p>
  <p>Description: {artist.description}</p>
    </div>
  );
}