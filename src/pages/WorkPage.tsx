import React from "react";
import { useParams } from "react-router-dom";
import { works } from "../data/works";
import { artists } from "../data/artists";

export default function WorkPage() {
  const { id } = useParams();
  const work = works.find((w) => w.id === id);

  if (!work) {
    return <div>작품을 찾을 수 없습니다.</div>;
  }

  const artist = artists.find((a) => a.id === work.artistId);

  return (
    <div style={{ padding: "20px" }}>
      <h1>{work.title}</h1>
      <p>작가: {artist ? artist.name : "알 수 없음"}</p>
      <p>제작 연도: {work.year}</p>
      <p>설명: {work.description}</p>
    </div>
  );
}