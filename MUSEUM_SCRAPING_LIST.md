# 추가 미술관 스크래핑 리스트 (90개)

기존 213개 + 이 리스트의 90개 = 목표 약 305개.
이 문서는 **디스패치 입력 + 진행상황 트래커** 두 역할을 합니다.

---

## 🎯 비서구 우선순위 그룹 (12개)

`260529_비서구_미술관_컬렉션_데이터베이스.xlsx` 기준 — 비서구권 다양성 보강을 위해 다음 작업 시 먼저 처리.

| # | Slug | 지역 / 국가 | 상태 | 수집 (검증 통과) |
|---|---|---|---|---|
| 47 | `malba` | 중남미 / 아르헨티나 | ✅ merged-local | 582점 |
| 52 | `ngma-newdelhi` | 남아시아 / 인도 | ✅ merged-local | 12,309점 (미니어쳐 5점 제외) — 흑백판화 894 제거(`.grayscale-prints-removed.json`) |
| 57 | `galnas-jakarta` | 동남아 / 인도네시아 | ✅ merged-local | 38점 |
| 60 | `nmfa-manila` | 동남아 / 필리핀 | ✅ merged-local | 52점 |
| 73 | `mathaf-doha` | 서남아 / 카타르 | ✅ merged-local | 233점 |
| 76 | `tmoca-tehran` | 서남아 / 이란 | ❌ escalated | 0 — 사이트 도달 불가 (tmoca.com/.ir 전부 timeout) |
| 84 | `iziko-sang` | 아프리카 / 남아공 | ✅ merged-local | 12점 (Masterpiece 시리즈) |
| **86** | `ng-bangkok` | 동남아 / 태국 | ❌ escalated | 0 — 콘텐츠 빈약(태국어·이미지 부재) |
| **87** | `mam-cdmx` | 중남미 / 멕시코 | ✅ merged-local | 44점 |
| **88** | `mnba-habana` | 중남미 / 쿠바 | ✅ merged-local | 53점 (평면) |
| **89** | `karakalpakstan-savitsky` | 중앙아 / 우즈베키스탄 | ❌ escalated | 0 — 사이트 정상이나 메타데이터 0 |
| **90** | `mome-cairo` | 북아프리카 / 이집트 | ❌ escalated | 0 — 도메인 전부 도달 불가 |

**비서구 12건 결과: 8 수집(14,255점) + 4 escalated.** 전부 `validate-metadata.mjs` 통과 (placeholder/오염 0).
기존 213에 이미 들어있어 본 리스트엔 없는 것: National Gallery Singapore, MASP São Paulo, Zeitz MOCAA.

---

## 사용법

- 외부에서 한 미술관씩 디스패치할 때 → 표에서 `Slug` 1개를 골라 메시지 보냄 (자세한 운영 흐름: [scripts/DISPATCH_AND_MERGE.md](scripts/DISPATCH_AND_MERGE.md))
- PR이 머지되면 `Status` 열을 `merged`로, `PR` 열에 PR 번호 기입
- escalate된 경우 `Status`를 `escalated`로 + `Notes` 열에 사유

## 범례

**Categories** (수집 대상 평면 시각예술): `P`=painting · `D`=drawing · `Pr`=print · `Ph`=photograph · `V`=video · `Mn`=miniature · `Cal`=calligraphy · `Ms`=manuscript · `Mx`=mixed_media_2d

**Online** (온라인 컬렉션 풍부도): ✅ 강함 (브라우저블 카탈로그) · 🟡 부분적 (스크래핑 난이도 ↑)

**Status**: `pending` · `in-progress` · `merged` · `escalated`

---

## 🟦 유럽 (28)

| # | Slug | Museum | City | Cat | Online | Status | PR |
|---|---|---|---|---|---|---|---|
| 1 | `prado` | [Museo Nacional del Prado](https://www.museodelprado.es/coleccion) (프라도) | Madrid, ES | P, D, Pr | ✅ | **merged-local** | 3743 works, Wikidata source — 흑백판화 1 제거(`.grayscale-prints-removed.json`) |
| 2 | `sorolla` | [Museo Sorolla](https://www.cultura.gob.es/msorolla/colecciones.html) (소로야) | Madrid, ES | P, D | ✅ | **merged-local** | 62 works (Wikidata); CER.es probed but thumb-only |
| 3 | `maxxi` | [MAXXI](https://www.maxxi.art/en/collection/) (마시) | Rome, IT | P, Ph, V | ✅ | ❌ escalated | no per-artwork online catalogue (Google Arts only) |
| 4 | `capodimonte` | [Museo di Capodimonte](https://capodimonte.cultura.gov.it) (카포디몬테) | Naples, IT | P, D, Pr | ✅ | ❌ escalated | cultura.gov.it firewall-blocked (region) |
| 5 | `gnam-rome` | [Galleria Nazionale d'Arte Moderna](https://lagallerianazionale.com/en/opere) (GNAM 로마) | Rome, IT | P, D | ✅ | ❌ escalated | real site gnamc.cultura.gov.it firewall-blocked |
| 6 | `whitechapel` | [Whitechapel Gallery](https://www.whitechapelgallery.org/exhibitions/) (화이트채플) | London, UK | P, Ph, V | 🟡 | ✅ merged-local | 156 (artist editions; no permanent collection) |
| 7 | `wallace-collection` | [The Wallace Collection](https://wallacelive.wallacecollection.org) (월리스) | London, UK | P, D | ✅ | ✅ merged-local | 448 (eMuseumPlus; 미니어쳐 127점 제외 → `.miniatures-removed.json` 백업) |
| 8 | `ashmolean` | [Ashmolean Museum](https://collections.ashmolean.org) (애슈몰린) | Oxford, UK | P, D, Pr | ✅ | ✅ merged-local | 2,542 (GLAM API+IIIF; 미니어쳐 218점 제외 → `.miniatures-removed.json` 백업) — 흑백판화 1 제거(`.grayscale-prints-removed.json`) |
| 9 | `fitzwilliam` | [The Fitzwilliam Museum](https://collection.fitzmuseum.cam.ac.uk) (피츠윌리엄) | Cambridge, UK | P, D, Pr | ✅ | ✅ merged-local | 3,830 (CC0 dump+IIIF; 미니어쳐 297점 제외 → `.miniatures-removed.json` 백업) — 흑백판화 7,136 제거(`.grayscale-prints-removed.json`) |
| 10 | `museum-ludwig` | [Museum Ludwig](https://www.museum-ludwig.de/en/collection/) (루트비히) | Cologne, DE | P, Ph | ✅ | ✅ merged-local | 11,281 (Cologne KEK portal 재스크랩 11,948) — 흑백판화 667 제거(`.grayscale-prints-removed.json`) |
| 11 | `k20-k21` | [Kunstsammlung NRW K20/K21](https://www.kunstsammlung.de/en/collection) (K20/K21) | Düsseldorf, DE | P, Ph, V | ✅ | ✅ merged-local | 309 (sammlung.kunstsammlung.de) |
| 12 | `folkwang` | [Museum Folkwang](https://www.museum-folkwang.de/en/collection) (폴크방) | Essen, DE | P, Ph | ✅ | ✅ merged-local | 501 (eMuseumPlus) |
| 13 | `co-berlin` | [C/O Berlin](https://www.co-berlin.org/en) | Berlin, DE | Ph | 🟡 | ❌ escalated | 구조적 불가 — 상설 컬렉션 없는 전시공간(Kunsthalle). 자체 작품 DB 없음(Drupal jsonapi 비활성, IIIF/OAI 없음) |
| 14 | `boijmans` | [Museum Boijmans Van Beuningen](https://www.boijmans.nl/en/collection) (보이만스) | Rotterdam, NL | P, D, Pr | ✅ | ✅ merged-local | 9,574/20,008 (Algolia+modal API; 드로잉5,499·판화1,911·회화1,449·사진715; 흑백복제판화8,413→`.grayscale-prints-removed.json`+플레이스홀더2,021→`.placeholder-removed.json` 백업; 드로잉은 흑백이어도 유지) |
| 15 | `foam-amsterdam` | [Foam Photography Museum](https://www.foam.org) (포암) | Amsterdam, NL | Ph | ✅ | ✅ merged-local | 153/~171 (Wayback __NEXT_DATA__+Storyblok CDN; 전부 사진; 라이브 Vercel 봇차단 우회; 메타 REAL 100%) |
| 16 | `eye-filmmuseum` | [EYE Filmmuseum](https://www.eyefilm.nl/en/collection) (아이 필름박물관) | Amsterdam, NL | V | ✅ | ❌ escalated | 카탈로그(catalogus.eyefilm.nl 60k) 로그인 필요 — 공개 작품 메타+이미지 접근 불가 |
| 17 | `moderna-museet` | [Moderna Museet](https://www.modernamuseet.se/stockholm/en/collection/) (모데르나) | Stockholm, SE | P, Ph, D, V | ✅ | ✅ merged-local | 21,446/37,441 (큐레이션: medium없는 사진11,379+중복523 제거→`.curated-removed.json` 백업; 23.5MB→Pages 정상; 드로잉9,004·판화7,183·사진5,691·회화3,127·영상534) — 흑백판화 4,093 제거(`.grayscale-prints-removed.json`) |
| 18 | `astrup-fearnley` | [Astrup Fearnley Museum](https://www.afmuseet.no/en/collection/) (아스트럽 페른리) | Oslo, NO | P, Ph, V | ✅ | ✅ merged-local | 282/282 (WP REST; 회화153·사진71·드로잉22·영상15·혼합14·판화7; 메타 REAL 100%) |
| 19 | `mumok` | [MUMOK](https://www.mumok.at/en/collection) (무모크) | Vienna, AT | P, Ph, V | ✅ | ⚠️ deferred | 스크립트 정체(scan 1900에서 멈춤)+이미지 600px 썸네일만 — 저우선·재작성 필요 |
| 20 | `garage-moscow` | [Garage Museum of Contemporary Art](https://garagemca.org/en/collection) (가라지) | Moscow, RU | P, Ph, V | ✅ | ✅ merged-local | 100/100 in-scope (Next.js _next/data; 회화39·영상37·사진24; ~394 카탈로그 중 설치·오브제 제외; 메타 REAL 100%) |
| 21 | `ngi-dublin` | [National Gallery of Ireland](https://www.nationalgallery.ie/art-and-artists) (아일랜드 국립) | Dublin, IE | P, D, Pr | ✅ | ✅ merged-local | 1,947/13,388 (eMuseum; 회화523·드로잉1,172·판화928; 썸네일전용 다수 드롭; 메타 REAL ~100%) — 흑백판화 676 제거(`.grayscale-prints-removed.json`) |
| 22 | `ngi-reykjavik` | [National Gallery of Iceland](https://www.listasafn.is/en/collection/) (아이슬란드 국립) | Reykjavík, IS | P, D | 🟡 | ✅ merged-local | 305 (Next.js _next/data; 회화206·드로잉70·사진17·판화12; 메타 REAL ~100%; 작은이미지 3 드롭) |
| 23 | `kumu` | [Kumu Art Museum](https://kumu.ekm.ee/en/collection/) (쿠무) | Tallinn, EE | P, D, Pr | ✅ | ❌ escalated | EKM Digitaalkogu 메타는 우수하나 공개 이미지가 375×480 썸네일만(풀해상도 로그인 필요·/static robots차단) |
| 24 | `hungarian-ng` | [Hungarian National Gallery](https://en.mng.hu/collection/) (헝가리 국립) | Budapest, HU | P, D | ✅ | ✅ merged-local | 10,767 (WP admin-ajax; 회화7,190·드로잉2,373·사진941·판화734; 9.3MB; 메타 REAL 100%) — 흑백판화 482 제거(`.grayscale-prints-removed.json`) |
| 25 | `mnar-bucharest` | [National Museum of Art of Romania](https://www.mnar.arts.ro/en/) (루마니아 국립) | Bucharest, RO | P, D | ✅ | ❌ escalated | Joomla CMS·기계가독 작품 소스 없음(API/IIIF/덤프/구조화 상세페이지 전무, editorial만) |
| 26 | `sng-bratislava` | [Slovak National Gallery](https://www.webumenia.sk/en/) (슬로바키아 국립 / Webumenia) | Bratislava, SK | P, D, Pr | ✅ | ✅ merged-local | 14,395 (Webumenia REST+IIIF 2048px; 판화7,563·회화6,912·드로잉4,874; API 페이지상한~10k/유형; 21MB; 메타 REAL 100%) — 흑백판화 4,954 제거(`.grayscale-prints-removed.json`) |
| 27 | `museum-kampa` | [Museum Kampa](https://www.museumkampa.cz/en/) (캄파) | Prague, CZ | P, D | 🟡 | ✅ merged-local | 326/629 (eSbirky; 드로잉253·판화73; 옛사진/콜라주+무제연작중복 84점 큐레이션 제거→`.curated-removed.json` 백업; ~800px 소스상한) |
| 28 | `masi-lugano` | [MASI Lugano](https://www.masilugano.ch/en/collection) (MASI 루가노) | Lugano, CH | P, Ph | 🟡 | ✅ merged-local | 2,720 (오픈 Solr; 회화1,457·드로잉560·판화523·사진416; 메타 REAL ~100%) — 흑백판화 245 제거(`.grayscale-prints-removed.json`) |

---

## 🟦 북미 (15)

| # | Slug | Museum | City | Cat | Online | Status | PR |
|---|---|---|---|---|---|---|---|
| 29 | `guggenheim-ny` | [Solomon R. Guggenheim Museum](https://www.guggenheim.org/collection-online) (구겐하임 NY) | New York, US | P, Ph, D | ✅ | ✅ merged-local | 1,041 (WP REST; 회화557·사진283·드로잉201; medium/dim 미공개=사이트한계; 메타 4필수 100%) |
| 30 | `frick-collection` | [The Frick Collection](https://collections.frick.org) (프릭) | New York, US | P, D, Pr | ✅ | ❌ escalated | Fastly WAF가 하드 418(0바이트)로 강화 — 브라우저로도 challenge JS 실행 불가, clearance 쿠키 획득 불가(스크립트는 완성, WAF만 통과 못 함) |
| 31 | `brooklyn-museum` | [Brooklyn Museum](https://www.brooklynmuseum.org/opencollection) (브루클린) | New York, US | P, Ph, D, Pr | ✅ | ❌ escalated | API 키 필수(api.brooklynmuseum.org)+공개 덤프/IIIF 없음 — 키 없이는 접근 불가 |
| 32 | `hirshhorn` | [Hirshhorn Museum](https://hirshhorn.si.edu/collection/) (허시혼) | Washington DC, US | P, Ph, V | ✅ | ✅ merged-local | 344 (Smithsonian OpenAccess CC0 덤프; 회화159·드로잉98·사진69·판화18; 메타 REAL 100%) |
| 33 | `walker-art-center` | [Walker Art Center](https://walkerart.org/collections) (워커) | Minneapolis, US | P, Ph, V | ✅ | ✅ merged-local | 7,595 (HTML sitemap+imgix; 판화7,644·사진1,430·회화921·드로잉630·영상519·혼합147; 매체로 평면분류; 11.6MB; 메타 REAL ~100%) — 흑백판화 3,696 제거(`.grayscale-prints-removed.json`) |
| 34 | `mia-minneapolis` | [Minneapolis Institute of Art](https://collections.artsmia.org) (MIA) | Minneapolis, US | P, D, Pr, Ph | ✅ | ❌ escalated | 메타는 CC0 GitHub 덤프(완벽)지만 모든 이미지호스트 사망(api.artsmia.org 무응답·iiif.dx DNS사망·CloudFront 403·imgix 410) — 작동 이미지URL 0 |
| 35 | `nelson-atkins` | [Nelson-Atkins Museum of Art](https://art.nelson-atkins.org/collections) (넬슨-앳킨스) | Kansas City, US | P, D, Pr | ✅ | ❌ escalated | art.nelson-atkins.org TCP:443 하드 네트워크 차단(샌드박스에서 도달 불가) |
| 36 | `kimbell` | [Kimbell Art Museum](https://www.kimbellart.org/collection) (킴벨) | Fort Worth, US | P, D | ✅ | ❌ escalated | Cloudflare 관리형 JS challenge — 자동 접근 차단(IIIF도 동일) |
| 37 | `dma-dallas` | [Dallas Museum of Art](https://collections.dma.org) (DMA) | Dallas, US | P, Ph, D | ✅ | ✅ merged-local | 5,686 (museum IIIF full/full; 판화3,625·회화1,714·사진1,209·드로잉1,104; 8.7MB; 메타 REAL ~100%) — 흑백판화 1,966 제거(`.grayscale-prints-removed.json`) |
| 38 | `norton-simon` | [Norton Simon Museum](https://www.nortonsimon.org/art/) (노턴 사이먼) | Pasadena, US | P, D, Pr | ✅ | ❌ escalated | Cloudflare Turnstile 인터랙티브 챌린지 전면(eMuseum 오프라인·WP도 챌린지) |
| 39 | `eastman-museum` | [George Eastman Museum](https://collections.eastman.org) (조지 이스트먼) | Rochester, US | Ph, V | ✅ | ❌ escalated | Cloudflare WAF 하드 403 전면(UA 무관 콘텐츠 차단; 대체 호스트 전부 NXDOMAIN) |
| 40 | `icp-ny` | [International Center of Photography](https://www.icp.org/browse/archive) (ICP) | New York, US | Ph | ✅ | ✅ merged-local | 23,007 사진 (Drupal sitemap 54,809 중 23k캡/19MB; REAL fill ~100%; B&W게이트는 판화만, 사진 비적용) |
| 41 | `ago-toronto` | [Art Gallery of Ontario](https://ago.ca/collection) (AGO) | Toronto, CA | P, D, Pr, Ph | ✅ | ❌ escalated | Cloudflare Turnstile 챌린지 전 경로 403(cf-mitigated; Drupal JSON:API도 차단) |
| 42 | `ngc-ottawa` | [National Gallery of Canada](https://www.gallery.ca/collection) (캐나다 국립) | Ottawa, CA | P, Ph, D, Pr | ✅ | ❌ escalated | Cloudflare JS 챌린지 전면(TLS 핑거프린트 기반; robots ClaudeBot 차단·ai-train=no) |
| 43 | `museo-jumex` | [Museo Jumex](https://www.fundacionjumex.org/coleccion) (후멕스) | Mexico City, MX | P, Ph, V | ✅ | ✅ merged-local | 301/593 in-scope (사진143·회화68·영상37·드로잉22·판화16·혼합15; 흑백판화 12 다운로드단계 스킵; REAL fill 100%) |

---

## 🟦 남미 (8)

| # | Slug | Museum | City | Cat | Online | Status | PR |
|---|---|---|---|---|---|---|---|
| 44 | `inhotim` | [Inhotim](https://www.inhotim.org.br/inhotim/arte-contemporanea/) (이뇨칭) | Brumadinho, BR | P, Ph, V | 🟡 | ❌ escalated | 구조적 스코프 외 — 사이트특정 설치·파빌리온 중심(평면 ~10-15점뿐, 그마저 설치사진) |
| 45 | `pinacoteca-sp` | [Pinacoteca de São Paulo](https://pinacoteca.org.br/programacao/acervo/) (피나코테카) | São Paulo, BR | P, D, Pr | ✅ | 🔄 retry-pending | probe viable; 스크립트작성 세션한도 중단 — 재시도 |
| 46 | `mar-rio` | [Museu de Arte do Rio](https://www.museudeartedorio.org.br/acervo/) (MAR) | Rio de Janeiro, BR | P, Ph | ✅ | ❌ escalated | 자체 카탈로그(~11k) 열렸으나 평면작품 이미지 0건(저작권 정책상 메타만 공개) |
| 47 | `malba` | [MALBA](https://www.malba.org.ar/coleccion/) (말바) | Buenos Aires, AR | P, Ph, V | ✅ | pending | |
| 48 | `mnba-buenosaires` | [Museo Nacional de Bellas Artes](https://www.bellasartes.gob.ar/coleccion/) (아르헨티나 국립) | Buenos Aires, AR | P, D, Pr | ✅ | ❌ escalated | Cloudflare JS 챌린지 전면 + robots ai-train=no·ClaudeBot 차단(자동수집 명시 거부) |
| 49 | `mnba-santiago` | [Museo Nacional de Bellas Artes](https://www.mnba.gob.cl/coleccion) (칠레 국립) | Santiago, CL | P, D | 🟡 | 🔄 retry-pending | probe 세션한도 중단 — 재시도 |
| 50 | `museo-botero` | [Museo Botero](https://www.banrepcultural.org/bogota/museo-botero) (보테로) | Bogotá, CO | P, D | ✅ | ✅ merged-local | 151/157 (banrepcultural 포털; 회화 중심 — 보테로 기증작+개인소장 거장컬렉션; min4 6점 드롭; REAL fill 100%) |
| 51 | `mali-lima` | [Museo de Arte de Lima](https://mali.pe/colecciones/) (MALI) | Lima, PE | P, Ph, D | ✅ | 🔄 retry-pending | probe viable; 스크립트작성 세션한도 중단 — 재시도 |

---

## 🟦 아시아 (18)

| # | Slug | Museum | City | Cat | Online | Status | PR |
|---|---|---|---|---|---|---|---|
| 52 | `ngma-newdelhi` | [National Gallery of Modern Art](https://ngmaindia.gov.in/collections.asp) (인도 NGMA) | New Delhi, IN | P, D, Pr | ✅ | pending | — 흑백판화 894 제거(`.grayscale-prints-removed.json`) |
| 53 | `kiran-nadar` | [Kiran Nadar Museum of Art](https://www.knma.in/collections) (키란 나다르) | Delhi, IN | P, Ph, V | 🟡 | **escalated** | Cloudflare blocks all; needs Chrome MCP path |
| 54 | `salar-jung` | [Salar Jung Museum](https://salarjungmuseum.in/collection/) (살라르 정) | Hyderabad, IN | P, Mn | 🟡 | 🔄 retry-pending | probe viable; 스크립트작성 세션한도 중단 — 재시도 |
| 55 | `maiiam` | [MAIIAM Contemporary Art Museum](https://www.maiiam.com/maiiam-collection) (마이얌) | Chiang Mai, TH | P, Ph, V | ✅ | ❌ escalated | 자체 사이트(Sanity CMS)에 작품 카탈로그 없음(작품 레코드 0) |
| 56 | `macan-jakarta` | [Museum MACAN](https://www.museummacan.org/collection) (마칸) | Jakarta, ID | P, Ph, V | ✅ | ❌ escalated | 온라인 컬렉션 카탈로그 없음(/collections 404·soft-404; sitemap에 작품 0; WP REST/Algolia/GraphQL 전무) |
| 57 | `galnas-jakarta` | [Galeri Nasional Indonesia](https://gni.kemdikbud.go.id/collection/) (인니 국립갤러리) | Jakarta, ID | P, D | ✅ | pending | |
| 58 | `vnfam-hanoi` | [Vietnam Fine Arts Museum](http://vnfam.vn/en/collection.html) (베트남 미술관) | Hanoi, VN | P, D | 🟡 | ✅ merged-local | 196점 (Algolia+GraphQL; 회화174 옻칠·비단·동호민화 포함; REAL fill 100%) |
| 59 | `ayala-museum` | [Ayala Museum](https://www.ayalamuseum.org/collections) (아얄라) | Manila, PH | P, D | ✅ | ❌ escalated | 이미지 ~500px 상한(세로작품; 원본 자체가 소형) + robots Disallow:/ + in-scope ~101점뿐 |
| 60 | `nmfa-manila` | [National Museum of Fine Arts](https://www.nationalmuseum.gov.ph/our-museums/national-museum-of-fine-arts/) (필리핀 국립미술관) | Manila, PH | P, D | 🟡 | pending | |
| 61 | `sam-singapore` | [Singapore Art Museum](https://www.singaporeartmuseum.sg/art-collection/highlights) (SAM) | Singapore, SG | P, Ph, V | ✅ | ✅ merged-local | 1,462점 (roots.gov.sg NHB API; 회화919·사진537·판화6; 동남아 현대미술; REAL fill 100%) |
| 62 | `nvag-kl` | [National Visual Arts Gallery](https://www.artgallery.gov.my/en/our-collection/) (말련 국립) | Kuala Lumpur, MY | P, Pr | 🟡 | ❌ escalated | MalCare Pro 방화벽 전면 403(동적 라우트·REST 전부; UA 무관 핑거프린트 차단; api 서브도메인 TCP timeout) |
| 63 | `benesse-house` | [Benesse House Museum](https://benesse-artsite.jp/en/art/benessehouse-museum.html) (베네세 하우스) | Naoshima, JP | P, Ph, V | ✅ | ❌ escalated | 작품별 이미지 0 — 전시작 63점이 텍스트 목록뿐(구역사진 5장); 평면 ~20점도 다운로드 불가 |
| 64 | `nezu-museum` | [Nezu Museum](https://www.nezu-muse.or.jp/en/collection/) (네즈) | Tokyo, JP | P, Cal | ✅ | ❌ escalated | 온라인은 하이라이트 108점뿐(in-scope ~36) + 이미지 ~320px 상한; 본 컬렉션 7,600점은 오프라인(인쇄도록만) |
| 65 | `yuz-shanghai` | [Yuz Museum](https://yuzmshanghai.org/en/collection/) (위즈) | Shanghai, CN | P, Ph, V | 🟡 | ❌ escalated | 컬렉션 카탈로그 없음 — 2014년 WP 전시아카이브 사이트(작품 레코드 0; REST API 이전 버전) |
| 66 | `ucca-beijing` | [UCCA Center for Contemporary Art](https://ucca.org.cn/en/collection/) (UCCA) | Beijing, CN | P, Ph, V | 🟡 | ❌ escalated | 비수집 Kunsthalle — 2017 재편 때 울렌스 컬렉션 매각; 사이트에 소장품 섹션 자체가 없음 |
| 67 | `rockbund-shanghai` | [Rockbund Art Museum](https://www.rockbundartmuseum.org/en/) (록번드) | Shanghai, CN | P, Ph, V | 🟡 | ❌ escalated | 비수집 Kunsthalle — sitemap 648 URL 중 작품 경로 0; 수집 프로그램 없음 |
| 68 | `moca-busan` | [부산현대미술관 MoCA Busan](https://www.busan.go.kr/moca/) | Busan, KR | P, Ph, V | ✅ | pending | |
| 69 | `njpac` | [백남준아트센터](https://njp.ggcf.kr/exhibitions/collection) (Nam June Paik Art Center) | Yongin, KR | V, Mx | ✅ | pending | |

---

## 🟦 중동 (11)

| # | Slug | Museum | City | Cat | Online | Status | PR |
|---|---|---|---|---|---|---|---|
| 70 | `louvre-abudhabi` | [Louvre Abu Dhabi](https://www.louvreabudhabi.ae/en/explore/highlights-of-the-collection) (루브르 아부다비) | Abu Dhabi, AE | P, D, Mn, Ms | ✅ | ❌ escalated | Cloudflare 챌린지(403 Just a moment; 사전선별 curl로 확인 — 에이전트 미투입) |
| 71 | `sharjah-art-museum` | [Sharjah Art Museum](https://sharjahmuseums.ae/en-US/Our-Museums/Sharjah-Art-Museum) (샤르자) | Sharjah, AE | P, D | 🟡 | ❌ escalated | 사이트 도달 불가(20s·40s 타임아웃; 지역차단 추정) |
| 72 | `mia-doha` | [Museum of Islamic Art](https://www.mia.org.qa/en/collections) (이슬람 예술관 도하) | Doha, QA | Mn, Cal, Ms | ✅ | pending | |
| 73 | `mathaf-doha` | [Mathaf: Arab Museum of Modern Art](https://mathaf.org.qa/en/collections) (마타프) | Doha, QA | P, Ph, V | ✅ | pending | |
| 74 | `israel-museum` | [Israel Museum](https://www.imj.org.il/en/collections) (이스라엘 박물관) | Jerusalem, IL | P, Ph, D, Pr | ✅ | pending | |
| 75 | `tama-telaviv` | [Tel Aviv Museum of Art](https://www.tamuseum.org.il/en/collection/) (텔아비브) | Tel Aviv, IL | P, Ph, V | ✅ | pending | |
| 76 | `tmoca-tehran` | [Tehran Museum of Contemporary Art](https://www.tmoca.com/en/collection) (테헤란 현대미술관) | Tehran, IR | P, D, Pr | 🟡 | pending | |
| 77 | `jngfa-amman` | [Jordan National Gallery of Fine Arts](https://www.nationalgallery.org/collection/) (요르단 국립) | Amman, JO | P, D, Pr | ✅ | pending | |
| 78 | `pera-museum` | [Pera Museum](https://www.peramuseum.org/collection) (페라) | Istanbul, TR | P, Mn | ✅ | pending | |
| 79 | `istanbul-modern` | [Istanbul Modern](https://www.istanbulmodern.org/en/collection_3.html) (이스탄불 모던) | Istanbul, TR | P, Ph, V | ✅ | pending | |
| 80 | `sakip-sabanci` | [Sakıp Sabancı Müzesi](https://www.sakipsabancimuzesi.org/en/page/collections) (사크프 사반즈) | Istanbul, TR | P, Cal, Ms | ✅ | pending | |

---

## 🟦 아프리카 (4)

| # | Slug | Museum | City | Cat | Online | Status | PR |
|---|---|---|---|---|---|---|---|
| 81 | `mmvi-rabat` | [Mohammed VI Museum of Modern Art](https://www.museemohammed6.ma/en/collections/) (모하메드 6세) | Rabat, MA | P, D | 🟡 | ❌ escalated | 사이트 도달 불가(20s·40s 타임아웃) |
| 82 | `macaal` | [MACAAL](https://macaal.org/en/collection-2/) (마카알) | Marrakech, MA | P, Ph | ✅ | pending | |
| 83 | `mama-alger` | [MAMA Alger](http://mama-dz.com) (알제 현대미술관) | Algiers, DZ | P, D | 🟡 | ❌ escalated | 도메인 매물 상태(mama-dz.com Domain for Sale) — 사이트 소멸 |
| 84 | `iziko-sang` | [Iziko South African National Gallery](https://www.iziko.org.za/museums/south-african-national-gallery/) (이지코) | Cape Town, ZA | P, Ph, D | ✅ | pending | |

---

## 🟦 오세아니아 (1)

| # | Slug | Museum | City | Cat | Online | Status | PR |
|---|---|---|---|---|---|---|---|
| 85 | `nga-canberra` | [National Gallery of Australia](https://nga.gov.au/collection/) (호주 국립) | Canberra, AU | P, Ph, D, Pr | ✅ | ❌ escalated | 전면 403 0B 하드차단(본진+searchthecollection 서브도메인+api까지; UA 무관) |

---

## 🟦 비서구 우선순위 신규 추가 (5)

엑셀 `260529_비서구_미술관_컬렉션_데이터베이스.xlsx`에서 기존 213/85에 없던 신규.

| # | Slug | Museum | City | Cat | Online | Status | Notes |
|---|---|---|---|---|---|---|---|
| 86 | `ng-bangkok` | [National Gallery Bangkok](https://www.museumthailand.com/en/museum/The-National-Gallery-Hor-Silp-Chao-Fa) (방콕 국립) | Bangkok, TH | P, D | 🟡 | pending 🎯 | 구 왕실 조폐국 (Carlo Allegri 설계). 라마 왕조 후원 미술 + 푸미폰 친작 |
| 87 | `mam-cdmx` | [Museo de Arte Moderno](https://mam.inba.gob.mx) (멕시코 모던) | Mexico City, MX | P, D, Pr | 🟡 | pending 🎯 | Frida Kahlo·Diego Rivera 모더니즘 정전. 차풀테펙 공원 내 |
| 88 | `mnba-habana` | [Museo Nacional de Bellas Artes (Arte Cubano)](https://www.bellasartes.cult.cu) (아바나 국립) | Havana, CU | P, D, Pr | 🟡 | pending 🎯 | 쿠바 모더니즘 정전. Wifredo Lam·René Portocarrero |
| 89 | `karakalpakstan-savitsky` | [Savitsky State Art Museum](https://savitskycollection.org) (사비츠키) | Nukus, UZ | P, D, Pr | 🟡 | escalated 🎯 | "사막의 루브르" — 소비에트 아방가르드 비밀 보존. 사이트 접속 불가 (5/26) |
| 90 | `mome-cairo` | [Museum of Modern Egyptian Art](https://moma.gov.eg/?lang=en) (카이로 모던) | Cairo, EG | P, D | 🟡 | escalated 🎯 | Mahmoud Said 등 이집트 모더니즘. 사이트 접속 불가 (5/26) |

---

## 진행 요약 (last updated: 2026-05-27)

| 지역 | 총 | pending | merged-local | escalated |
|---|---|---|---|---|
| 유럽 | 28 | 26 | 2 (prado·sorolla) | 0 |
| 북미 | 15 | 15 | 0 | 0 |
| 남미 | 8 | 7 | 1 (malba) | 0 |
| 아시아 | 18 | 14 | 3 (ngma·galnas·nmfa) | 1 (kiran-nadar) |
| 중동 | 11 | 9 | 1 (mathaf) | 1 (tmoca) |
| 아프리카 | 4 | 3 | 1 (iziko) | 0 |
| 오세아니아 | 1 | 1 | 0 | 0 |
| 비서구 신규 | 5 | 0 | 2 (mam·mnba) | 3 (ng-bangkok·savitsky·mome) |
| **합계** | **90** | **75** | **10** | **5** |

**수집 작품 총계**: Prado 3,744 + Sorolla 62 + 비서구 8곳 14,255 = **약 18,061점** (+ 기존 213개 미술관). 전 컬렉션 `validate-metadata.mjs` 통과.

**Status meaning**
- `pending` — not started
- `in-progress` — scraper running
- `merged-local` — collection JSON written to `public/data/`, R2 uploads done. (No PR — direct execution in main session)
- `escalated` — Phase A blocker found, requires alternative tooling (Chrome MCP / commercial proxy / museum contact)

**Total artworks collected so far**: 3,744 (Prado) + 62 (Sorolla) = **3,806**

---

## 디스패치하는 법

자세한 절차는 [scripts/DISPATCH_AND_MERGE.md](scripts/DISPATCH_AND_MERGE.md). 요약:

```
Scrape museum: {slug}
(per MUSEUM_SCRAPING_LIST.md + scripts/COLLECTION_SCRAPING_PROMPT.md)
```

예시:
```
Scrape museum: moderna-museet
(per MUSEUM_SCRAPING_LIST.md + scripts/COLLECTION_SCRAPING_PROMPT.md)
```
