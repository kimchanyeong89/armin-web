# 🚀 SigLIP 768D 시맨틱 검색 전환 가이드

> **모델**: `google/siglip-base-patch16-224` (768차원)
> **임베딩 방식**: Google Colab T4 GPU (무료)
> **검색 방식**: 서버사이드 텍스트 인코딩 (브라우저 모델 다운로드 0MB)

---

## 개요: 무엇이 바뀌었나?

| 항목 | 이전 (CLIP 512D) | 지금 (SigLIP 768D) |
|---|---|---|
| 모델 | openai/clip-vit-base-patch32 | google/siglip-base-patch16-224 |
| 차원 | 512D | 768D |
| 텍스트 인코딩 | 브라우저 (50MB 다운로드) | Worker 서버사이드 (0MB) |
| 검색 품질 | ★★★ | ★★★★★ |
| 유저 첫 검색 속도 | ~30초 (모델 다운로드) | 즉시 |

---

## Step 1: Cloudflare Vectorize 새 인덱스 생성

```bash
# 기존 인덱스(512D)와 별도로 768D 인덱스 새로 생성
npx wrangler vectorize create armin-art-search-768 --dimensions=768 --metric=cosine
```

---

## Step 2: HuggingFace Token Worker에 등록

```bash
cd workers/semantic-search

# HF Token 설정 (서버사이드 SigLIP 텍스트 인코딩용)
npx wrangler secret put HF_TOKEN
# 프롬프트에 HuggingFace 토큰 입력 (hf_로 시작하는 토큰)
```

---

## Step 3: Worker 배포

```bash
cd workers/semantic-search
npx wrangler deploy
```

배포 후 상태 확인:
```bash
curl https://armin-semantic-search.armin-art.workers.dev/status
# 예상 응답: {"status":"ok","model":"google/siglip-base-patch16-224","dimensions":768,...}
```

---

## Step 4: Google Colab에서 임베딩 생성

1. Google Colab 열기: https://colab.research.google.com
2. **런타임 유형 변경**: 런타임 → 런타임 유형 변경 → GPU (T4)
3. `scripts/Colab_SigLIP_768_Embedding.ipynb` 노트북 업로드 및 실행
4. **셀 2에서 레포 URL을 실제 URL로 변경**하여 clone

진행 현황은 `EMBEDDING_PROGRESS.md`에서 실시간 확인 가능합니다.

### 예상 소요 시간

| 처리량 | 예상 시간 |
|---|---|
| 이미지당 (다운로드+임베딩) | ~50~80ms |
| 10만개 | ~1.5~2.5시간 |
| 60만개 전체 | ~8~15시간 (세션 나눠서) |

> Colab 무료 티어는 12시간 세션 제한이 있습니다.
> 중단되어도 재실행하면 이어서 처리합니다.

---

## Step 5: Vectorize 업로드

임베딩 생성 완료(또는 중간에도) 후 실행:

```bash
# Colab 셀 4 실행하거나, 로컬에서:
python scripts/upload_to_vectorize.py \
  --jsonl /path/to/siglip_embeddings.jsonl \
  --worker https://armin-semantic-search.armin-art.workers.dev
```

---

## Step 6: 프론트엔드 배포

변경된 파일:
- `src/utils/siglipSearch.ts` (신규 - 서버사이드 검색 유틸)
- `src/components/GlobalSearchBar.tsx` (AI 검색 로직 업데이트)
- `workers/semantic-search/src/index.ts` (서버사이드 텍스트 인코딩 추가)

```bash
# 빌드 및 배포
npm run build
# 배포는 기존 방식대로 진행
```

---

## 진행 현황 확인

`EMBEDDING_PROGRESS.md` 파일을 확인하세요.
스크립트가 자동으로 업데이트합니다.

```
전체 597,171개 중 현재 진행 상황이 표시됩니다.
197개 영구전시별 세부 현황 포함.
```

---

## 문제 해결

### Worker가 "HF_TOKEN not configured" 반환
```bash
npx wrangler secret put HF_TOKEN
```

### 검색 결과가 0개
→ Vectorize에 아직 데이터가 없음. Step 5 업로드 확인.

### Colab 세션 종료됨
→ 셀 3만 다시 실행하세요. 자동으로 이어서 처리합니다.

### 차원 불일치 오류 (dimension mismatch)
→ `wrangler.toml`의 `index_name`이 `armin-art-search-768`인지 확인.
→ Vectorize 인덱스가 768D로 생성되었는지 확인.
