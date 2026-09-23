import { useEffect, useMemo, useState, type KeyboardEvent, type PointerEvent } from "react";
import { geoDistance, geoOrthographic, geoPath, type GeoPermissibleObjects } from "d3";
import { Link } from "react-router-dom";
import { getGlobeMuseums, type PreviewData, type PreviewMuseum } from "../data";
import { buildExhibitionModalPath, type PreviewConcept } from "../model";

type ReadonlyGlobeProps = {
  concept?: PreviewConcept;
  data: PreviewData;
  modalPath?: (exhibitionId: string) => string;
  variant?: "section" | "immersive";
};

type DragState = {
  pointerId: number;
  x: number;
  y: number;
  rotation: [number, number];
};

const VIEW_SIZE = 760;
const VIEW_CENTER = VIEW_SIZE / 2;
const EQUATOR_COORDINATES: [number, number][] = Array.from(
  { length: 73 },
  (_, index) => [-180 + index * 5, 0],
);

function formatCoordinates(museum: PreviewMuseum): string {
  const latitude = `${Math.abs(museum.latitude).toFixed(1)}°${museum.latitude >= 0 ? "N" : "S"}`;
  const longitude = `${Math.abs(museum.longitude).toFixed(1)}°${museum.longitude >= 0 ? "E" : "W"}`;
  return `${latitude} ${longitude}`;
}

export default function ReadonlyGlobe({
  concept,
  data,
  modalPath,
  variant = "section",
}: ReadonlyGlobeProps) {
  const museums = useMemo(() => getGlobeMuseums(data), [data]);
  const [land, setLand] = useState<GeoPermissibleObjects | null>(null);
  const [mapError, setMapError] = useState(false);
  const [rotation, setRotation] = useState<[number, number]>([-12, -24]);
  const [zoom, setZoom] = useState(1);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [selectedMuseumId, setSelectedMuseumId] = useState(
    () => (museums.find((museum) => museum.id === data.featuredMuseum.id) || museums[0])?.id || "",
  );

  useEffect(() => {
    const controller = new AbortController();
    fetch("/atlas/world.geojson", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Map request failed with ${response.status}`);
        return response.json();
      })
      .then((world: GeoPermissibleObjects) => setLand(world))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setMapError(true);
      });
    return () => controller.abort();
  }, []);

  const selectedMuseum = museums.find((museum) => museum.id === selectedMuseumId) || museums[0];
  const selectedExhibitions = selectedMuseum
    ? data.exhibitions.filter((exhibition) => exhibition.museumId === selectedMuseum.id)
    : [];
  const selectedMuseumWorks = selectedMuseum
    ? data.artworks.filter((artwork) => artwork.museumId === selectedMuseum.id)
    : [];
  const projection = useMemo(
    () => geoOrthographic()
      .translate([VIEW_CENTER, VIEW_CENTER])
      .scale(330 * zoom)
      .rotate([rotation[0], rotation[1]])
      .clipAngle(90)
      .precision(0.4),
    [rotation, zoom],
  );
  const path = useMemo(() => geoPath(projection), [projection]);
  const spherePath = path({ type: "Sphere" }) || "";
  const landPath = land ? path(land) || "" : "";
  const viewCenter: [number, number] = [-rotation[0], -rotation[1]];
  const labelSuffix = concept || "evolved";
  const Heading = variant === "immersive" ? "h1" : "h2";
  const getExhibitionPath = (exhibitionId: string) =>
    modalPath?.(exhibitionId) || buildExhibitionModalPath(concept || "hybrid", "home", exhibitionId);

  const selectMuseum = (museum: PreviewMuseum) => {
    setSelectedMuseumId(museum.id);
    setRotation([-museum.longitude, -museum.latitude]);
  };
  const selectMuseumFromKeyboard = (
    event: KeyboardEvent<SVGGElement>,
    museum: PreviewMuseum,
  ) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    selectMuseum(museum);
  };
  const startDrag = (event: PointerEvent<SVGSVGElement>) => {
    if ((event.target as Element).closest("[data-globe-marker]")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ pointerId: event.pointerId, x: event.clientX, y: event.clientY, rotation });
  };
  const moveDrag = (event: PointerEvent<SVGSVGElement>) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const nextLatitude = Math.max(-75, Math.min(75, drag.rotation[1] - (event.clientY - drag.y) * 0.24));
    setRotation([
      drag.rotation[0] + (event.clientX - drag.x) * 0.32,
      nextLatitude,
    ]);
  };
  const endDrag = (event: PointerEvent<SVGSVGElement>) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDrag(null);
  };

  return (
    <section className={`rd-globe-section rd-globe-section--${variant}`} aria-labelledby={`rd-globe-title-${labelSuffix}`}>
      <header className="rd-globe-heading">
        <div>
          <span>Live collection geography</span>
          <Heading id={`rd-globe-title-${labelSuffix}`}>The collection has a place.</Heading>
        </div>
        <p>{museums.length} museums plotted from current COLLY coordinates.</p>
      </header>
      <div className="rd-globe-layout">
        <div className="rd-globe-canvas">
          <label className="rd-globe-select">
            <span>Choose museum</span>
            <select
              name="globe-museum"
              value={selectedMuseum?.id || ""}
              onChange={(event) => {
                const museum = museums.find((item) => item.id === event.target.value);
                if (museum) selectMuseum(museum);
              }}
            >
              {museums.map((museum) => (
                <option key={museum.id} value={museum.id}>{museum.name}</option>
              ))}
            </select>
          </label>
          <svg
            aria-label="Interactive museum globe"
            className={drag ? "rd-globe-svg is-dragging" : "rd-globe-svg"}
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            role="group"
            viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`}
          >
            <path className="rd-globe-sphere" d={spherePath} />
            {landPath ? <path className="rd-globe-land" d={landPath} /> : null}
            <path className="rd-globe-equator" d={path({ type: "LineString", coordinates: EQUATOR_COORDINATES }) || ""} />
            {museums.map((museum) => {
              const coordinates: [number, number] = [museum.longitude, museum.latitude];
              if (geoDistance(coordinates, viewCenter) > Math.PI / 2) return null;
              const point = projection(coordinates);
              if (!point) return null;
              const selected = museum.id === selectedMuseum?.id;
              return (
                <g
                  aria-label={`${museum.name}, ${museum.exhibitionCount} exhibition ${museum.exhibitionCount === 1 ? "record" : "records"}`}
                  className={selected ? "rd-globe-marker is-selected" : "rd-globe-marker"}
                  data-globe-marker="true"
                  data-museum-id={museum.id}
                  key={museum.id}
                  onClick={() => selectMuseum(museum)}
                  onKeyDown={(event) => selectMuseumFromKeyboard(event, museum)}
                  role="button"
                  tabIndex={0}
                  transform={`translate(${point[0]} ${point[1]})`}
                >
                  <circle className="rd-globe-marker-hit" r="22" />
                  <circle className="rd-globe-marker-dot" r={selected ? 5.5 : 3.2} />
                </g>
              );
            })}
          </svg>
          <div className="rd-globe-controls" aria-label="Globe controls">
            <button type="button" aria-label="Zoom globe in" onClick={() => setZoom((value) => Math.min(1.35, value + 0.1))}>+</button>
            <button type="button" aria-label="Zoom globe out" onClick={() => setZoom((value) => Math.max(0.78, value - 0.1))}>−</button>
            <button type="button" onClick={() => { setRotation([-12, -24]); setZoom(1); }}>Reset</button>
          </div>
          {!land && !mapError ? <p className="rd-globe-loading" role="status">Loading map…</p> : null}
          {mapError ? <p className="rd-globe-error" role="status">The land outline is unavailable. Museum coordinates remain interactive.</p> : null}
        </div>
        {selectedMuseum ? (
          <aside className="rd-globe-dock" aria-live="polite">
            <span>{formatCoordinates(selectedMuseum)}</span>
            <h3>{selectedMuseum.name}</h3>
            {selectedMuseum.nameKo ? <p className="rd-globe-local-name">{selectedMuseum.nameKo}</p> : null}
            <p>{selectedMuseum.location}</p>
            <dl>
              <div><dt>Exhibitions</dt><dd>{selectedExhibitions.length}</dd></div>
              <div><dt>Works indexed</dt><dd>{selectedMuseumWorks.length}</dd></div>
            </dl>
            <div className="rd-globe-exhibitions">
              {selectedExhibitions.length ? selectedExhibitions.map((exhibition) => (
                <Link
                  key={exhibition.id}
                  to={getExhibitionPath(exhibition.id)}
                >
                  <span>{exhibition.status}</span>
                  <strong>{exhibition.title}</strong>
                  <small>{exhibition.artworks.length} directly linked {exhibition.artworks.length === 1 ? "work" : "works"}</small>
                </Link>
              )) : <p>No exhibition records are linked to this museum.</p>}
            </div>
          </aside>
        ) : null}
      </div>
    </section>
  );
}
