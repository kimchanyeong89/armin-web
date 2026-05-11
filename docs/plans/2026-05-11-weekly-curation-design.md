# Weekly Curation — Design

**Date**: 2026-05-11
**Status**: Approved, ready for implementation planning
**Owner**: niet89

## 1. Goal

Build a weekly online curation feature that appears under the "Weekly" tab of the AI section in the ARMIN app. One curation per ISO-week, shown to all users (not personalized). Each curation is an editorial piece composed of 10–20 artworks selected from ARMIN's existing 303 collection JSONs, framed by a curator persona and a perspective lens, with bilingual title/intro/captions.

Editorial loop is **semi-automatic**: the system produces several candidate curation cards each week; one human editor (currently the project owner) reviews, picks one, edits the text, and publishes.

## 2. Non-goals (V1)

- **Personalization** — every user sees the same weekly curation.
- **Real-time editing by multiple editors** — single-editor workflow.
- **External news ingestion via LLM-generated topical claims** — topical signal comes only from Google Trends KR + Naver DataLab keywords, validated by SigLIP embedding similarity against the collection. The LLM never invents a "this artwork is relevant to current events because…" claim.
- **Heavy image-quality filtering infrastructure** — relies on the editor review step to catch the rare broken image; only minimal sanity check at generation time (URL present + non-empty).

## 3. Architecture overview

Three independent **trigger layers** produce candidate seeds each week. Each (persona × lens) cell tries to find its strongest candidate from those seeds and emits one card, or drops itself if the best candidate falls below a quality threshold.

```
                                    ┌─────────────────────────────────────┐
   trigger seeds ──┐                │           proposal pool             │
                   │                │  (per ISO-week)                     │
  ┌──────────┐     │                │                                     │
  │  L1      │     │   3 personas   │   ┌──┐┌──┐┌──┐                      │
  │ Anniv.   │     │       ×        │   │  ││  ││  │  9 base cells        │
  │ (birth/  │ ────┼──▶  3 lenses   │   └──┘└──┘└──┘  (some may drop)     │
  │ death)   │     │                │   ┌──┐┌──┐┌──┐                      │
  └──────────┘     │                │   │  ││  ││  │                      │
                   │                │   └──┘└──┘└──┘                      │
  ┌──────────┐     │                │   ┌──┐┌──┐┌──┐                      │
  │  L2      │     │                │   │  ││  ││  │                      │
  │ Motif    │ ────┤                │   └──┘└──┘└──┘                      │
  │ calendar │     │                │                                     │
  └──────────┘     │                │   ┌────────┬────────┐               │
                   │                │   │ GT-1   │ GT-2   │  Google       │
  ┌──────────┐     │                │   ├────────┼────────┤               │
  │  L3a     │     │                │   │ ND-1   │ ND-2   │  Naver        │
  │ Google   │ ────┤                │   └────────┴────────┘               │
  │ Trends   │     │                │     trend cards (0–N each)          │
  │ KR       │     │                │                                     │
  └──────────┘     │                └─────────────────────────────────────┘
                   │                                  │
  ┌──────────┐     │                                  ▼
  │  L3b     │     │                ┌─────────────────────────────────────┐
  │ Naver    │ ────┘                │     editor (human) reviews,         │
  │ DataLab  │                      │     picks one, edits text,          │
  └──────────┘                      │     publishes                       │
                                    └─────────────────────────────────────┘
```

Weekly card count: typically **5–15** (base cells often produce 5–8, trends 0–4).

## 4. Trigger layers

### L1 — Anniversary

- **Source**: existing `public/data/artists-dates.json` (already in repo; ~hundreds of artists with `birthDate`/`deathDate` in `YYYY.MM.DD` format).
- **Logic**: for ISO-week W with date range [Mon, Sun], find artists whose `birthDate` MM.DD or `deathDate` MM.DD falls in that range.
- **Fallback**: if zero matches, expand window to ±1 week, then ±2 weeks. If still empty, this layer simply produces no seeds.
- **Pairs naturally with**: 전기형 (one artist deep), 대화형 (two anniversaries the same week).

### L2 — Motif calendar

- **Source**: new file `data/motif-calendar.json`. Static 52-week rotation, designed once and reused yearly. Each week has 1–3 motif keywords (English + Korean).
- **Example**:
  ```
  W18 (early May)  : ["spring rain", "garden in bloom", "renewal"]   / ["봄비", "정원", "다시 피어남"]
  W19 (early-mid May) : ["light in quiet rooms", "windows", "interiority"] / ["조용한 빛", "창", "내면"]
  W45 (early Nov)  : ["portrait", "memory", "ancestors"]              / ["초상", "기억", "선조"]
  ```
- **Logic**: pull this week's motif keywords; embed them via SigLIP text encoder; match against artwork image embeddings; rank.
- **Pairs naturally with**: 테마형 (motif as theme).

### L3a — Google Trends KR

- **Source**: `https://trends.google.co.kr/trends/api/dailytrends?geo=KR` (RSS available). Fetch weekly aggregation, take top ~30 distinct terms.
- **Logic**: for each term, SigLIP-embed and run nearest-neighbor against artwork embeddings. Keep terms whose top-1 artwork match has cosine similarity ≥ `TREND_MATCH_THRESHOLD` (initial value: **0.28**, tunable).
- **Output**: 0–N seeds (typically 0–3). Each seed is `{term, top_artworks[20]}`.

### L3b — Naver DataLab

- **Source**: Naver DataLab top searches (search/shopping insight APIs, requires Naver API client ID + secret in env).
- Same logic as L3a, separate seed pool.
- **Why separate from Google**: Google KR skews toward global/news/tech, Naver toward Korean daily-life/seasonal/entertainment. Mixing them dilutes the editorial signal; keeping them separated lets the editor see two cultural lenses on the week.

### Quality of trend terms

Most trending terms (celebrity gossip, sports results, political names) will not pass the SigLIP threshold and will be silently discarded. This is correct behavior — only terms with genuine art resonance survive.

## 5. Personas & lenses

### Personas

Three personas, defined once in `data/personas/*.json`. Each spec drives **both** selection scoring and writing voice.

| ID | Name | Role | Taste (era / region / theme) | Lens affinity |
|---|---|---|---|---|
| `yuna-choi` | Yuna Choi | Senior Editor, ARMIN | East Asia (KR/JP/CN) + Northern Europe (NL/DK/SE). 1860–1920 + 1990–present. Paper/watercolor/intimate oil. Motifs: light, interior, stillness, letter, window, garden, sleep, domestic. | 전기형 ★★★ / 테마형 ★★★ / 대화형 ★ |
| `marco-rinaldi` | Marco Rinaldi | Curator-at-Large, Classical Wing | Italian + Flemish + Spanish. 1400–1750 strong; reaches 19C academic. Oil panel, fresco, marble, silverpoint. Religious/mythological/history painting, patron politics. | 전기형 ★★★ / 대화형 ★★★ / 테마형 ★★ |
| `anika-voss` | Anika Voss | Independent Critic, Berlin | Modernism + abstraction + postwar Europe + photography + minimalism. 1880–1980 strong; reaches contemporary conceptual. DE/US/FR/USSR/JP (Gutai). Motifs: grid, rupture, city, industry, machine. | 대화형 ★★★ / 테마형 ★★★ / 전기형 ★ |

### Lenses (perspective axes)

| ID | Name | Artists | Works | Selection logic | Natural trigger |
|---|---|---|---|---|---|
| `biographical` | 전기형 | 1 | 10 | One artist's works arranged with early/mid/late spread by `date` field | L1 Anniversary |
| `thematic` | 테마형 | 3–6 | 10–12 | Theme keyword → SigLIP top-K → enforce artist diversity (max 3 per artist) | L2 Motif, L3 Trends |
| `dialogue` | 대화형 | 2 | 10–12 (5+5 or 6+6 alternating) | Two artists/movements; works paired by visual or thematic contrast | L1 double-anniversary, L3 pairable trends |

### Persona-to-lens matrix → cards

A persona's lens affinity is a soft weight in the scoring (not a hard veto), so all 9 (persona × lens) cells are attempted each week. Cells whose best candidate scores below the quality threshold are dropped. **Up to 9 base cards per week; commonly 5–8.**

## 6. Generation pipeline

Runs Sunday 23:00 KST (manual or cron):

1. **Compute ISO-week** (e.g., `2026-W19`).
2. **L1 anniversary lookup** → list of artists.
3. **L2 motif lookup** from `motif-calendar.json`.
4. **L3a Google Trends fetch** → list of (term, top_artworks).
5. **L3b Naver DataLab fetch** → list of (term, top_artworks).
6. **For each (persona × lens) cell**: score candidates from L1+L2, pick best, generate card if score ≥ threshold.
7. **For each trend seed (L3a/L3b)**: assign best-fit persona via taste similarity, attach lens (테마형 default, 대화형 if two pairable terms), generate card.
8. **LLM pass per card** (e.g., Claude Sonnet 4.5): given persona spec + selected artworks + trigger metadata, generate `title_en`, `title_ko`, `intro_en` (~150 words), `intro_ko` (~3–4 sentences gloss), and per-artwork `caption_en` / `caption_ko`.
9. **Write** `data/weekly-proposals/2026-W19.json` containing all cards in the pool.

Generator script: `scripts/weekly/generate-proposals.ts`.

## 7. Publishing & editor workflow (Phase A)

1. Editor opens `data/weekly-proposals/2026-W19.json`.
2. Reviews cards (each card has persona, lens, trigger reason, score, 10–20 works with image thumbnails via `lqip`).
3. Picks one card. Optionally:
   - Edits title / intro / captions in place.
   - Swaps a work (replaces an artwork entry with a different one from the same persona's candidate pool — generator pre-attaches `alternates[]` for this).
   - Removes a broken-image work.
4. Runs `npm run weekly:publish -- --week 2026-W19 --card <cardId>`.
5. Script copies the chosen card (minus alternates) to `public/data/weekly-curations/2026-W19.json`.
6. Editor commits and pushes. Vite build picks it up. ARMIN app's `WeeklyTab.tsx` fetches `/data/weekly-curations/<currentWeek>.json`.

App-side fetch is wrapped in `fetchCurrentCuration()` (in `src/lib/weekly.ts`) so the Phase B swap is a one-line surface change.

## 8. Data schemas

Designed to map 1:1 to D1 tables in Phase B (no field renames at migration time).

### `weekly-proposals/YYYY-Www.json`

```json
{
  "week": "2026-W19",
  "generated_at": "2026-05-10T14:00:00Z",
  "cards": [
    {
      "id": "yuna-choi__biographical__vermeer-1670s",
      "persona_id": "yuna-choi",
      "lens": "biographical",
      "trigger": {
        "type": "anniversary",
        "value": "Johannes Vermeer · death anniversary 1675-12-15",
        "source": "artists-dates.json"
      },
      "score": 0.82,
      "title_en": "Things That Glow in Quiet Rooms",
      "title_ko": "조용한 방에서 빛나는 것들",
      "intro_en": "There is a particular quality of light...",
      "intro_ko": "화가들이 늘 좇아온 빛의 한 결...",
      "subtitle_chip": "빛과 실내",
      "works": [
        {
          "position": 1,
          "role": "hero",
          "artwork_ref": "aic-collection#9",
          "artist": "Johannes Vermeer",
          "title": "Woman Reading a Letter",
          "year": "1663",
          "image_url": "https://pub-396fad1f....r2.dev/.../9-505019c4-imageUrl.webp",
          "source_collection": "aic-collection",
          "source_url": "https://www.artic.edu/artworks/9",
          "lqip": "data:image/gif;base64,...",
          "caption_en": "The first letter...",
          "caption_ko": "첫 번째 편지..."
        }
      ],
      "alternates": [
        { "position": 1, "artwork_ref": "rijksmuseum#sk-c-251", "...": "..." }
      ]
    }
  ]
}
```

### `weekly-curations/YYYY-Www.json` (published)

Same shape as a single `card` from above, minus `alternates[]` and `score`. Plus:

```json
{
  "published_at": "2026-05-11T09:00:00Z",
  "published_by": "niet89"
}
```

### D1 mapping (Phase B preview)

- `weekly_proposals` (week, generated_at, cards JSON or normalized)
- `weekly_cards` (id, week, persona_id, lens, trigger_type, trigger_value, score, title_en, ...)
- `weekly_works` (card_id, position, role, artwork_ref, ...)
- `weekly_published` (week, card_id, published_at, published_by)

Field names match JSON 1:1.

## 9. Phase A → Phase B migration

A is not a throwaway; it locks the schema and the surface contracts so B is a swap, not a rewrite.

### Locked-in contracts from day 1

- **JSON shape == future D1 column names.**
- **Two separate scripts**: `generate-proposals.ts` (writes proposals), `publish-curation.ts` (writes curations). In B, these become endpoints, not new code.
- **`fetchCurrentCuration()`** function in `src/lib/weekly.ts` is the only place the app touches the data surface. Phase A reads `/data/weekly-curations/<week>.json`; Phase B reads `/api/weekly-current`.

### Phase B work, when triggered

1. Create D1 tables matching the JSON schemas above (column names already match).
2. Bulk-insert existing `data/weekly-proposals/*.json` and `public/data/weekly-curations/*.json` into D1.
3. Convert `generate-proposals.ts` into a Cloudflare Worker cron.
4. Build `/admin/weekly` page (Vite route, gated to editor email) with card grid, inline editor, swap-work picker, publish button.
5. Convert `publish-curation.ts` into an admin API endpoint.
6. Flip `fetchCurrentCuration()` to call `/api/weekly-current`.

Expected effort: ~1 week if A has been running clean for 2–4 weeks (which validates the schema).

## 10. Image quality approach

Minimal, relies on editor step:

- **Generator**: requires `imageUrl` present and non-empty. Drops anything else.
- **Editor**: catches genuinely broken images during review (swap or remove).
- **Blocklist**: `data/curation-blocklist.json` for individual `artwork_ref`s that the editor flags repeatedly. Generator reads and excludes. No collection-level allowlist in V1.

Rationale: editor review already exists in the workflow; building heavy filtering upfront duplicates that work.

## 11. File layout

New / modified files:

```
data/
  motif-calendar.json                            (new — 52-week motif rotation)
  personas/
    yuna-choi.json                               (new)
    marco-rinaldi.json                           (new)
    anika-voss.json                              (new)
  curation-blocklist.json                        (new — empty array initially)
  weekly-proposals/
    2026-W19.json                                (generated weekly)

public/data/
  weekly-curations/
    2026-W19.json                                (published weekly)

scripts/weekly/
  generate-proposals.ts                          (new — orchestrator)
  triggers/
    anniversary.ts                               (new)
    motif.ts                                     (new)
    trends-google.ts                             (new)
    trends-naver.ts                              (new)
  selectors/
    persona-scorer.ts                            (new)
    lens-builder.ts                              (new — 전기/테마/대화)
  writer/
    llm-prompt.ts                                (new — composes persona prompt)
  publish-curation.ts                            (new — copies chosen card)

src/
  pages/
    WeeklyTab.tsx                                (new or existing per Figma)
  lib/
    weekly.ts                                    (new — fetchCurrentCuration)
  types/
    weekly.ts                                    (new — TS types matching JSON schema)
```

## 12. Open questions deferred to implementation plan

- **Embedding API surface** — does the existing SigLIP infra expose a text-to-vector API, or only image-to-vector pre-computed? If only the latter, we need a text encoder endpoint.
- **LLM provider & cost** — Claude Sonnet 4.5 vs cheaper; estimated weekly token cost.
- **Cron host** — local Node script (manual `npm run weekly`) for Phase A, then Cloudflare Workers cron for Phase B.
- **Motif calendar content** — drafting 52 weeks of motifs is a one-time content task; can be seeded with ~12 (monthly) and expanded later.
- **Trend threshold tuning** — `0.28` is a guess; needs calibration on 2–3 weeks of real data.

These are deliberately out of scope for this design and belong in the implementation plan.

## 13. Success criteria

- Generator produces a non-empty proposal pool every week (≥3 cards minimum), even on weeks with zero anniversaries.
- Editor can go from "open proposals JSON" to "git push published" in under 30 minutes per week.
- Schema is unchanged between Phase A and Phase B (zero field renames).
- No broken-image curations reach production (editor step catches them).
- After 4 weeks of A, decision criteria for B migration: schema stable, editor wants click-to-publish.
