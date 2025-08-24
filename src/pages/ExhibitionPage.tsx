import { useParams } from "react-router-dom";
import type { Exhibition } from "../types/Exhibition";

type ExhibitionPageProps = {
  exhibitions: Exhibition[];
};

export default function ExhibitionPage({ exhibitions }: ExhibitionPageProps) {
  const { id } = useParams();
  const exhibition = exhibitions.find((e) => e.id === id);

  if (!exhibition) {
    return <div>Museum not found.</div>;
  }

  return (
    <div style={{ padding: "20px" }}>
      <h1>{exhibition.name}</h1>
  <p>Location: {exhibition.location}</p>
  <p>Description: {exhibition.description}</p>
    </div>
  );
}