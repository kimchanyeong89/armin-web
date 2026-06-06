# Corpus Counts — 정확한 수치 (감사 결과 2026-05-23)

내가(Claude) 여러 번 다른 숫자를 말했음 — 사용자가 정당하게 지적함. 정직하게 정리.

## 진실의 단일 출처 (Single Source of Truth)

| 무엇 | 정확한 값 | 출처 |
|---|---|---|
| **고유 작품 수 (canonical)** | **609,251** | `public/data/search-index-part-*.json` 16개 chunk에서 ID dedup |
| Manifest 선언값 | 613,934 | `public/data/search-manifest.json` 의 `c` 필드 |
| Chunk 합계 (raw rows) | 613,934 | 16개 chunk의 row 수 합 |
| 이미지 URL 보유 row | 613,934 | 전부 `i` 필드 있음 |
| **manifest 내 중복 ID** | **4,683** | 같은 ID가 chunk에서 두 번 이상 등장 |
| `siglip_processed_ids.txt` 라인 수 | 661,809 | **처리 시도 카운터** (성공+실패+중복+삭제된 옛 ID 포함) |
| siglip_processed ∩ manifest | 609,246 | manifest 작품 중 SigLIP이 본 적 있는 것 |
| siglip_processed − manifest | 52,563 | manifest에서 삭제된 옛날 ID (재처리 불필요) |
| manifest − siglip_processed | 5 | SigLIP 이후 추가된 신규 작품 |

## 흔한 혼동 정리

- **"660k"**: 틀린 숫자. `siglip_processed_ids.txt` 라인 수에서 따왔는데, 그건 작품 수가 아니라 **처리 시도 누적**. 실제 작품 수의 상한이 아님.
- **"630k"**: 출처 불명, 사용 금지.
- **"614k"**: manifest의 row 수. 중복 4,683 포함이므로 **고유 작품 수는 아님**.
- **"609,251"**: 진짜 고유 작품 수. 모든 임베딩/카운트/예산 계산은 이 값 기준.

## 임베딩 작업 시 주의

1. **인벤토리 dedup 필수**: `inventory.jsonl`을 만들 때 manifest의 중복 4,683을 그대로 가져오면 같은 ID가 두 번 임베딩됨 (낭비). pending 리스트 빌드 시 set으로 dedup.
2. **재처리 대상**: 작업이 다 끝났다 = `processed_ids` 카운트 ≥ 609,251 (실패 포함). 661,809을 목표로 하면 안 됨.
3. **cost 추정**: 609,251 × (1/throughput) × GPU 시간당 가격. 614k나 660k 쓰면 5-8% 부풀려진 추정이 됨.

## 관련 파일 목록 (앞으로 헷갈리지 않게)

### 데이터 소스 (canonical inventory)
- `public/data/search-manifest.json` — 매니페스트 (chunks 리스트 + count `c`)
- `public/data/search-index-part-0.json` ~ `part-15.json` — 16개 chunk, 각 ~40k row
- `public/data/exhibitions.json` — 전시(컬렉션) 메타데이터 (museum, region 등)

### 임베딩 산출물 (SigLIP v1 시절)
- `siglip_processed_ids.txt` — **처리 시도 IDs** (성공+실패+중복+옛 ID). 작품 수 ≠ 라인 수.
- `siglip_state.json` — 진행 상태 (museum별 카운트)
- `siglip_failed*.jsonl` — 실패 로그
- `embedding_results/siglip_embeddings.jsonl` — 실제 벡터 출력 (5.5GB)
- `EMBEDDING_PROGRESS.md` — **부분(targeted) 재임베딩** 진행률. 전체 임베딩 진행률이 아님 (혼동 주의).

### Jina CLIP v2 마이그레이션 (신규)
- `scripts/modal_embed/inventory.jsonl` — Jina용 인벤토리 (manifest에서 빌드, dedup 필요)
- `scripts/modal_embed/modal_app.py` — Modal 임베딩 앱
- Modal Volume `jina-embed-vol`:
  - `/inventory.jsonl` — 업로드된 인벤토리
  - `/processed_ids.txt` — Jina 처리 완료 ID (성공+영구실패)
  - `/failed.jsonl` — 실패 항목 (R2 fallback 재시도 대상)

### Cloudflare Vectorize
- `armin-art-search-768` — SigLIP v1 인덱스 (현재 라이브)
- `armin-art-search-jina-1024` — Jina v2 인덱스 (마이그레이션 중)

## 다음 작업 시 체크리스트

- [ ] 작품 수 인용 시: **609,251** 사용
- [ ] 인벤토리 빌드 시: ID set으로 dedup
- [ ] Modal 비용 추정 시: 609,251 / throughput 기준
- [ ] "660k" / "614k" 같은 숫자는 출처를 명시하지 않는 한 사용하지 말 것
- [ ] 이 문서가 정답 — 새 수치는 여기 먼저 업데이트
