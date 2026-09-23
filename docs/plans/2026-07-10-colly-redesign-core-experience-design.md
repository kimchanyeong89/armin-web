# COLLY redesign core experience restoration

## Goal

Restore the product-defining globe and exhibition artwork experience inside the isolated `/redesign` study without writing to production data or importing account-dependent behavior.

## Chosen direction

Build a shared read-only world canvas and exhibition archive modal from the normalized preview data. The production globe and modal remain untouched because they also own authentication, likes, collection loading, and production routing. A static map was rejected because it would not restore the exploratory behavior.

## Experience

- Every concept home page includes the same interactive globe with its own visual treatment.
- The globe plots every museum with valid coordinates from the current dataset.
- Dragging rotates the globe; controls zoom and reset the view.
- Selecting a museum reveals its real location, counts, and exhibitions.
- Exhibition links open a URL-addressable modal on top of the current preview page.
- The modal shows exhibition metadata and all directly linked works.
- If no works are linked directly, the modal clearly labels and shows real works from the same museum. If none exist, it presents an honest empty state.
- Artwork links continue to the matching read-only work detail page.

## Data and safety

`createPreviewData()` remains the only normalization boundary. The new UI consumes `PreviewMuseum`, `PreviewExhibition`, and `PreviewArtwork` records and performs no Firebase, authentication, payment, like, or collection writes.

## Components

- `ReadonlyGlobe`: data-driven SVG orthographic globe and museum dock.
- `ExhibitionArtworkModal`: accessible dialog with metadata, artwork grid, and close behavior.
- `buildExhibitionModalPath`: one URL contract for modal deep links.

## Verification

- Unit contracts for modal URLs, geographic filtering, and artwork fallback.
- Static rendering checks for globe and dialog landmarks.
- Browser checks for museum selection, modal open/close, artwork navigation, desktop and mobile overflow, keyboard focus, and reduced motion.

