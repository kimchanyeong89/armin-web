# 분야별 Top 10 미술관 리스트

각 장르의 세계 Top 10 미술관과 **ARMIN 수집 상태**. 용도: 장르별 커버리지 갭 파악 + 수집 진행 추적.

### ARMIN 열 범례 (상태 = 우리 수집 현황, "미술관에 작품이 있나"가 아니라 "우리가 가져왔나")
- ✅ **보유 N점** — ARMIN에 등록 완료 (우리가 가지고 있음, 사이트에서 볼 수 있음)
- 🔄 **수집중 n/N** — 지금 수집 진행 중 (수집된 수 / 예상 총수; 15분마다 자동 갱신)
- 🔄 **수집예정 ~N** — 소스 확인됨, 수집 대기
- ❌ **수집불가 (사유)** — 미술관 사이트가 막혔거나(Cloudflare·로그인) 온라인 카탈로그/이미지가 없어서 **우리가 못 가져옴** (우리가 안 가진 게 아니라 가져올 방법이 없는 것)
- ⚪ **미시도** — 아직 시도 안 함

조건부합 작품 수(우리 기준 평면작) per-museum 집계는 추후.

마지막 갱신: 2026-06-16 (자동: `scripts/.state/update-genre-status.mjs` + `update-gap-tracker.mjs`)

---

## 🎨 회화 (Painting) — 보유 10/10 ✅ 완벽

| # | 미술관 | 도시 | 국가 | 대륙 | ARMIN |
|---|---|---|---|---|---|
| 1 | Musée du Louvre (루브르) | Paris | France | 유럽 | ✅ `musee-du-louvre` |
| 2 | Museo Nacional del Prado (프라도) | Madrid | Spain | 유럽 | ✅ `prado` |
| 3 | Galleria degli Uffizi (우피치) | Florence | Italy | 유럽 | ✅ `uffizi` |
| 4 | The National Gallery (내셔널 갤러리) | London | UK | 유럽 | ✅ `national-gallery` |
| 5 | Rijksmuseum (레이크스뮤지엄) | Amsterdam | Netherlands | 유럽 | ✅ `rijksmuseum` |
| 6 | The Metropolitan Museum of Art (메트) | New York | USA | 북미 | ✅ `met-ny` |
| 7 | State Hermitage Museum (예르미타시) | St Petersburg | Russia | 유럽 | ✅ `hermitage-museum` |
| 8 | Musée d'Orsay (오르세) | Paris | France | 유럽 | ✅ `musee-dorsay` |
| 9 | Kunsthistorisches Museum (빈 미술사) | Vienna | Austria | 유럽 | ✅ `kunsthistorisches-museum-vienna` |
| 10 | Alte Pinakothek (알테 피나코테크) | Munich | Germany | 유럽 | ✅ `alte-pinakothek` |

## 📷 사진 (Photography) — 보유 7/10

| # | 미술관 | 도시 | 국가 | 대륙 | ARMIN |
|---|---|---|---|---|---|
| 1 | MoMA — Dept. of Photography | New York | USA | 북미 | ✅ `moma-collection` |
| 2 | International Center of Photography (ICP) | New York | USA | 북미 | ✅ `icp-ny` (23,007점) |
| 3 | George Eastman Museum (이스트먼) | Rochester | USA | 북미 | ❌ 수집불가 (Cloudflare 전면차단) |
| 4 | V&A — Photography Centre | London | UK | 유럽 | ✅ `vam` |
| 5 | Centre Pompidou — Cabinet de la photographie | Paris | France | 유럽 | ✅ `centre-pompidou` |
| 6 | Maison Européenne de la Photographie (MEP) | Paris | France | 유럽 | ✅ `maison-europeenne-de-la-photographie` |
| 7 | Foam Photography Museum (포암) | Amsterdam | Netherlands | 유럽 | ✅ `foam-amsterdam` |
| 8 | Fotomuseum Winterthur | Winterthur | Switzerland | 유럽 | ❌ 수집불가 (Cloudflare 챌린지) |
| 9 | Tokyo Photographic Art Museum (도쿄도사진미술관) | Tokyo | Japan | 아시아 | ❌ 수집불가 (Catalogue is excellent and machine-r…) |
| 10 | Getty Museum — Photographs | Los Angeles | USA | 북미 | ✅ `getty` |

## 📺 비디오·미디어아트 (Video & Media Art) — 보유 9/10

| # | 미술관 | 도시 | 국가 | 대륙 | ARMIN |
|---|---|---|---|---|---|
| 1 | 백남준아트센터 (Nam June Paik Art Center) | Yongin | South Korea | 아시아 | ✅ `njpac` |
| 2 | ZKM Center for Art and Media | Karlsruhe | Germany | 유럽 | ✅ 보유 1,990점 |
| 3 | MoMA — Media & Performance | New York | USA | 북미 | ✅ `moma-collection` |
| 4 | Tate Modern | London | UK | 유럽 | ✅ `tate-modern` |
| 5 | Centre Pompidou — Nouveaux Médias | Paris | France | 유럽 | ✅ `centre-pompidou` |
| 6 | Walker Art Center (워커) | Minneapolis | USA | 북미 | ✅ `walker-art-center` |
| 7 | Stedelijk Museum | Amsterdam | Netherlands | 유럽 | ✅ `stedelijk-museum` |
| 8 | 국립현대미술관 (MMCA) | Seoul | South Korea | 아시아 | ✅ `mmca-seoul` |
| 9 | Julia Stoschek Foundation | Düsseldorf/Berlin | Germany | 유럽 | ❌ 수집불가 (Cloudflare 챌린지) |
| 10 | 부산현대미술관 (MoCA Busan) | Busan | South Korea | 아시아 | ✅ `moca-busan` |

## 🎬 영화 (Film) — 보유 3/10 ⚠️ 최대 갭

| # | 미술관 | 도시 | 국가 | 대륙 | ARMIN |
|---|---|---|---|---|---|
| 1 | MoMA — Dept. of Film | New York | USA | 북미 | ✅ `moma-collection` |
| 2 | La Cinémathèque française | Paris | France | 유럽 | ❌ 수집불가 (La Cinematheque francaise has a larg…) |
| 3 | EYE Filmmuseum | Amsterdam | Netherlands | 유럽 | ❌ 수집불가 (카탈로그 로그인 전용) |
| 4 | Academy Museum of Motion Pictures | Los Angeles | USA | 북미 | ✅ 보유 540점 |
| 5 | Museum of the Moving Image (MoMI) | New York | USA | 북미 | ❌ 수집불가 (Cloudflare 차단) |
| 6 | Deutsche Kinemathek | Berlin | Germany | 유럽 | ❌ 수집불가 (Museum's only enumerable machine-rea…) |
| 7 | BFI National Archive | London | UK | 유럽 | ❌ 수집불가 (BFI National Archive's online catalo…) |
| 8 | George Eastman Museum — Moving Image | Rochester | USA | 북미 | ❌ 수집불가 (Cloudflare 전면차단) |
| 9 | 한국영상자료원 (KOFA) | Seoul | South Korea | 아시아 | ❌ 수집불가 (KMDb Open API가 API 키 필수(kmdb.or.kr 또…) |
| 10 | 国立映画アーカイブ (NFAJ) | Tokyo | Japan | 아시아 | ✅ 보유 4,754점 |

## 🪑 제품·산업디자인 (Product & Industrial Design) — 보유 4/10

| # | 미술관 | 도시 | 국가 | 대륙 | ARMIN |
|---|---|---|---|---|---|
| 1 | Vitra Design Museum | Weil am Rhein | Germany | 유럽 | ❌ 수집불가 (Probe technically succeeded (open Gr…) |
| 2 | Design Museum | London | UK | 유럽 | ❌ 수집불가 (No object-level online catalogue exi…) |
| 3 | Cooper Hewitt, Smithsonian Design Museum | New York | USA | 북미 | ❌ 수집불가 (No object-level online catalogue exi…) |
| 4 | Die Neue Sammlung (노이에 잠룽) | Munich | Germany | 유럽 | ✅ `pinakothek-der-moderne` 내 |
| 5 | MoMA — Architecture & Design | New York | USA | 북미 | ✅ `moma-collection` |
| 6 | V&A | London | UK | 유럽 | ✅ `vam` |
| 7 | Musée des Arts Décoratifs (MAD) | Paris | France | 유럽 | ✅ `mad-paris` |
| 8 | Designmuseum Danmark | Copenhagen | Denmark | 유럽 | ❌ 수집불가 (FLAT-art online catalogues are offli…) |
| 9 | Triennale Milano — Museo del Design Italiano | Milan | Italy | 유럽 | ❌ 수집불가 (Triennale Milano runs a dedicated pe…) |
| 10 | MAK — Museum für angewandte Kunst | Vienna | Austria | 유럽 | 🔄 수집예정 (~21,000) |

## ✏️ 판화·드로잉 (Prints & Drawings) — 보유 9/10

| # | 미술관 | 도시 | 국가 | 대륙 | ARMIN |
|---|---|---|---|---|---|
| 1 | Albertina (알베르티나) | Vienna | Austria | 유럽 | ✅ `albertina-museum` |
| 2 | British Museum — Prints & Drawings | London | UK | 유럽 | ✅ `british-museum` |
| 3 | Louvre — Cabinet des dessins | Paris | France | 유럽 | ✅ `musee-du-louvre` |
| 4 | Met — Drawings & Prints | New York | USA | 북미 | ✅ `met-ny` |
| 5 | Morgan Library & Museum | New York | USA | 북미 | ✅ 보유 9,313점 |
| 6 | Kupferstichkabinett (베를린 동판화관) | Berlin | Germany | 유럽 | 🔄 수집예정 (~21,000) |
| 7 | Uffizi — Gabinetto dei Disegni e delle Stampe | Florence | Italy | 유럽 | ✅ `uffizi` |
| 8 | Ashmolean Museum | Oxford | UK | 유럽 | ✅ `ashmolean` |
| 9 | Fitzwilliam Museum | Cambridge | UK | 유럽 | ✅ `fitzwilliam` |
| 10 | Museum Boijmans Van Beuningen | Rotterdam | Netherlands | 유럽 | ✅ `boijmans` |

## 🖼 그래픽디자인·포스터 (Graphic Design & Posters) — 보유 4/10

| # | 미술관 | 도시 | 국가 | 대륙 | ARMIN |
|---|---|---|---|---|---|
| 1 | Stedelijk Museum (그래픽 컬렉션) | Amsterdam | Netherlands | 유럽 | ✅ `stedelijk-museum` |
| 2 | Museum für Gestaltung (취리히 조형미술관) | Zürich | Switzerland | 유럽 | 🔄 수집중 21,321/24,000 |
| 3 | V&A | London | UK | 유럽 | ✅ `vam` |
| 4 | Musée des Arts Décoratifs — 광고·그래픽 | Paris | France | 유럽 | ✅ `mad-paris` |
| 5 | Plakatmuseum Wilanów (빌라누프 포스터) | Warsaw | Poland | 유럽 | 🔄 수집중 652/652 |
| 6 | Poster House | New York | USA | 북미 | 🔄 수집중 7,471/7,400 |
| 7 | Cooper Hewitt | New York | USA | 북미 | 🔄 수집중 7,457/16,000 |
| 8 | Moravská galerie (모라비아 갤러리 — 그래픽 비엔날레) | Brno | Czech Republic | 유럽 | ✅ 보유 21,822점 |
| 9 | ginza graphic gallery (ggg) / DNP | Tokyo | Japan | 아시아 | ❌ 수집불가 (ggg (ginza graphic gallery) is run b…) |
| 10 | MAK Vienna | Vienna | Austria | 유럽 | 🔄 수집예정 (~21,000) |

## 💬 만화·애니메이션 (Comics & Animation) — 보유 0/10 ⚠️ 전 장르 공백

| # | 미술관 | 도시 | 국가 | 대륙 | ARMIN |
|---|---|---|---|---|---|
| 1 | 三鷹の森ジブリ美術館 (지브리 미술관) | Mitaka | Japan | 아시아 | ❌ 수집불가 (No online collection catalogue. Home…) |
| 2 | 京都国際マンガミュージアム (교토 국제만화뮤지엄) | Kyoto | Japan | 아시아 | ❌ 수집불가 (No reachable, in-scope, image-servin…) |
| 3 | Cité de la BD (CIBDI 앙굴렘) | Angoulême | France | 유럽 | 🔄 수집중 2,071/2,450 |
| 4 | Belgian Comic Strip Center (벨기에 만화센터) | Brussels | Belgium | 유럽 | ❌ 수집불가 (Centre belge de la bande dessinee (M…) |
| 5 | Billy Ireland Cartoon Library & Museum | Columbus | USA | 북미 | ❌ 수집불가 (Both candidate sources fail the copy…) |
| 6 | Charles M. Schulz Museum | Santa Rosa | USA | 북미 | ❌ 수집불가 (Charles M. Schulz Museum DOES have a…) |
| 7 | 한국만화박물관 | Bucheon | South Korea | 아시아 | 🔄 수집중 23/25 |
| 8 | 手塚治虫記念館 (데즈카 오사무 기념관) | Takarazuka | Japan | 아시아 | ❌ 수집불가 (403 차단) |
| 9 | Musée Hergé (에르제 미술관) | Louvain-la-Neuve | Belgium | 유럽 | ❌ 수집불가 (Musée Hergé (Louvain-la-Neuve) has N…) |
| 10 | Cartoon Art Museum | San Francisco | USA | 북미 | ❌ 수집불가 (No per-object online collection cata…) |

## 🌐 동시대미술 (Contemporary Art) — 보유 10/10 ✅ 완벽

| # | 미술관 | 도시 | 국가 | 대륙 | ARMIN |
|---|---|---|---|---|---|
| 1 | MoMA | New York | USA | 북미 | ✅ `moma-collection` |
| 2 | Tate Modern | London | UK | 유럽 | ✅ `tate-modern` |
| 3 | Centre Pompidou | Paris | France | 유럽 | ✅ `centre-pompidou` |
| 4 | Solomon R. Guggenheim Museum | New York | USA | 북미 | ✅ `guggenheim-ny` |
| 5 | SFMOMA | San Francisco | USA | 북미 | ✅ `sfmoma` |
| 6 | Stedelijk Museum | Amsterdam | Netherlands | 유럽 | ✅ `stedelijk-museum` |
| 7 | 국립현대미술관 (MMCA) | Seoul | South Korea | 아시아 | ✅ `mmca-seoul` |
| 8 | M+ | Hong Kong | China (HK) | 아시아 | ✅ `mplus` |
| 9 | Museo Reina Sofía | Madrid | Spain | 유럽 | ✅ `museo-reina-sofia` |
| 10 | The Broad | Los Angeles | USA | 북미 | ✅ `thebroad` |

---

## 갭 요약 (다음 수집 타깃)

| 장르 | 보유 | 갭 크기 | 최우선 타깃 (접근성 고려) |
|---|---|---|---|
| 회화 | 10/10 | 없음 | — |
| 동시대미술 | 10/10 | 없음 | — |
| 비디오·미디어 | 8/10 | 작음 | ZKM (자체 온라인 카탈로그 있음) |
| 판화·드로잉 | 8/10 | 작음 | Morgan Library (온라인 카탈로그 우수) |
| 사진 | 7/10 | 작음 | Tokyo Photographic Art Museum, Fotomuseum Winterthur |
| 제품디자인 | 4/10 | 중간 | **Cooper Hewitt (Smithsonian OA CC0 덤프 — hirshhorn과 같은 경로!)**, Vitra |
| 그래픽·포스터 | 3/10 | 중간 | **Museum für Gestaltung Zürich (eMuseum 공개, 포스터 35만)** |
| 영화 | 1/10 | **큼** | Deutsche Kinemathek·KOFA (영화 포스터·스틸 = 평면 수집 가능) |
| 만화·애니 | 0/10 | **전면 공백** | 교토 국제만화뮤지엄, CIBDI 앙굴렘 (원화 디지털 아카이브 보유) |

---

## 🎯 갭 수집 트래커 (2026-06-12 시작 — 저코스트 모드: 동시 2 에이전트)

사전선별(curl, 토큰 0)로 4곳 즉시 escalate. 나머지 30곳 우선순위 큐 (쉬운 소스 먼저).

| Slug | 미술관 | 분야 | 상태 |
|---|---|---|---|
| `cooper-hewitt` | Cooper Hewitt | 디자인 | 🔄 수집중 **5,031**/16,000 |
| `gestaltung-zurich` | Museum für Gestaltung | 포스터 | 🔄 수집중 **21,321**/24,000 |
| `mak-vienna` | MAK | 디자인 | 🔄 스크립트 준비 (예상 21,000) |
| `moravian-gallery` | Moravská galerie | 포스터 | ✅ merged **21,822**점 |
| `kupferstichkabinett` | Kupferstichkabinett (SMB) | 판화드로잉 | 🔄 스크립트 준비 (예상 21,000) |
| `morgan-library` | Morgan Library | 판화드로잉 | ✅ merged **9,313**점 |
| `zkm` | ZKM | 미디어아트 | ✅ merged **1,990**점 |
| `vitra` | Vitra Design Museum | 디자인 | ❌ escalated — Probe technically succeeded (open GraphQL API at collectiononline.design-museum.de/graphql, int |
| `design-museum-london` | Design Museum | 디자인 | ❌ escalated — No object-level online catalogue exists at all. |
| `tokyo-photographic` | 도쿄도사진미술관 | 사진 | ❌ escalated — Catalogue is excellent and machine-readable (46,921 photographs) but image resolution is too sm |
| `cinematheque-fr` | Cinémathèque française | 영화 | ❌ escalated — La Cinematheque francaise has a large flat-art collection (24,108 posters + drawings + ad mater |
| `bfi` | BFI National Archive | 영화 | ❌ escalated — BFI National Archive's online catalogue (collections-search.bfi.org.uk, an Axiell/Adlib 'AIS' p |
| `nfaj` | 国立映画アーカイブ | 영화 | ✅ merged **4,754**점 |
| `kofa` | 한국영상자료원 | 영화 | ❌ escalated — KMDb Open API가 API 키 필수(kmdb.or.kr 또는 data.go.kr 발급) |
| `triennale` | Triennale Milano | 디자인 | ❌ escalated — Triennale Milano runs a dedicated per-object archive platform at archivi.triennale.org (Next.js |
| `designmuseum-dk` | Designmuseum Danmark | 디자인 | ❌ escalated — FLAT-art online catalogues are offline for system migration. |
| `academy-museum` | Academy Museum | 영화 | ✅ merged **540**점 |
| `deutsche-kinemathek` | Deutsche Kinemathek | 영화 | ❌ escalated — Museum's only enumerable machine-readable source is the FlowWorks 'FlowCenter' DAM behind a pro |
| `poster-house` | Poster House | 포스터 | 🔄 스크립트 준비 (예상 7,400) |
| `wilanow-poster` | Plakatmuseum Wilanów | 포스터 | 🔄 스크립트 준비 (예상 652) |
| `ggg-tokyo` | ginza graphic gallery | 포스터 | ❌ escalated — ggg (ginza graphic gallery) is run by the DNP Foundation for Cultural Promotion (dnpfcp.jp |
| `kyoto-manga` | 교토 국제만화뮤지엄 | 만화 | ❌ escalated — No reachable, in-scope, image-serving source on the museum's own infra. |
| `cibdi-angouleme` | CIBDI 앙굴렘 | 만화 | 🔄 수집중 **2,071**/2,450 |
| `belgian-comic` | Comic Art Museum Brussels | 만화 | ❌ escalated — Centre belge de la bande dessinee (Musee de la BD, Brussels |
| `herge` | Musée Hergé | 만화 | ❌ escalated — Musée Hergé (Louvain-la-Neuve) has NO open per-object catalogue and images are copyright-locked |
| `billy-ireland` | Billy Ireland | 만화 | ❌ escalated — Both candidate sources fail the copyright/quality scope. |
| `schulz` | Schulz Museum | 만화 | ❌ escalated — Charles M. |
| `korea-manhwa` | 한국만화박물관 | 만화 | 🔄 수집중 **23**/25 |
| `cartoon-art-sf` | Cartoon Art Museum | 만화 | ❌ escalated — No per-object online collection catalogue exists. |
| `ghibli` | 지브리 미술관 | 애니 | ❌ escalated — No online collection catalogue. |
| `fotomuseum-winterthur` | Fotomuseum Winterthur | 사진 | ❌ escalated — Cloudflare 챌린지 (사전선별) |
| `julia-stoschek` | Julia Stoschek Foundation | 미디어 | ❌ escalated — Cloudflare 챌린지 (사전선별) |
| `momi-ny` | Museum of the Moving Image | 영화 | ❌ escalated — Cloudflare 차단 (사전선별) |
| `tezuka` | 데즈카 오사무 기념관 | 만화 | ❌ escalated — 403 (사전선별) |
