import React from "react";
import { useParams } from "react-router-dom";
import { artists } from "../data/artists";

export default function ArtistPage() {
  const { id } = useParams();
  const artist = artists.find((a) => a.id === id);

  if (!artist) {
    return <div>작가를 찾을 수 없습니다.</div>;
  }

  return (
    <div style={{ padding: "20px" }}>
      <h1>{artist.name}</h1>
      <p>국적: {artist.nationality}</p>
      <p>생년: {artist.birthYear}</p>
      <p>설명: {artist.description}</p>
    </div>
  );
}