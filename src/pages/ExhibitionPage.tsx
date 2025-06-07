import React from "react";
import { useParams } from "react-router-dom";
import type { Exhibition } from "../types/Exhibition";

type ExhibitionPageProps = {
  exhibitions: Exhibition[];
};

export default function ExhibitionPage({ exhibitions }: ExhibitionPageProps) {
  const { id } = useParams();
  const exhibition = exhibitions.find((e) => e.id === id);

  if (!exhibition) {
    return <div>전시관을 찾을 수 없습니다.</div>;
  }

  return (
    <div style={{ padding: "20px" }}>
      <h1>{exhibition.name}</h1>
      <p>위치: {exhibition.location}</p>
      <p>설명: {exhibition.description}</p>
    </div>
  );
}