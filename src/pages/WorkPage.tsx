import { useParams } from "react-router-dom";
import { works } from "../data/works";
import { artists } from "../data/artists";

export default function WorkPage() {
  const { id } = useParams();
  const work = works.find((w) => w.id === id);

  if (!work) {
    return <div>Artwork not found.</div>;
  }

  const artist = artists.find((a) => a.id === work.artistId);

  return (
    <div style={{ padding: "20px" }}>
      <h1>{work.title}</h1>
  <p>Artist: {artist ? artist.name : "Unknown"}</p>
  <p>Year: {work.year}</p>
  <p>Description: {work.description}</p>
    </div>
  );
}