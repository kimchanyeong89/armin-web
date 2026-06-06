# Kaggle Notebooks로 잔여 임베딩 처리하기

Modal에서 92.7%까지 처리했고, 남은 **48,965개**를 Kaggle 무료 GPU로 보충.
- 진짜 미처리: 45,605
- 이전 실패 재시도: 3,360 (75%가 timeout/5xx/403 — Kaggle 다른 IP에서 복구 기대)

## 준비물 (이 폴더 안)

| 파일 | 용도 |
|---|---|
| `kaggle_embed_remaining.ipynb` | 노트북 (Kaggle/Colab 양쪽 호환) |
| `remaining.jsonl` | 잔여 45,605개 항목 (8MB) |

## Kaggle 절차 (~30분)

### 1. Kaggle 가입/로그인
https://www.kaggle.com — 구글 계정으로 한 번에 가입 가능. **카드 불필요, 완전 무료**.

### 2. 새 노트북 만들기

1. https://www.kaggle.com/code 이동
2. 우상단 `+ New Notebook` 클릭
3. 빈 노트북 열림

### 3. 우측 패널 `Settings` 설정

| 설정 | 값 |
|---|---|
| **Accelerator** | `GPU T4 x2` (또는 `GPU P100`) |
| **Internet** | **On** ← 매우 중요 (이미지 다운로드 + Worker POST 필요) |
| Language | Python |
| Persistence | (기본값) |

### 4. 노트북 코드 붙여넣기

방법 A — **파일 import (추천)**:
1. 노트북 상단 `File` → `Import Notebook` 
2. 컴퓨터에서 `kaggle_embed_remaining.ipynb` 선택 → 업로드
3. 노트북이 통째로 들어옴

방법 B — 셀별 복붙:
1. `kaggle_embed_remaining.ipynb`를 텍스트 에디터로 열어서 각 셀 내용 복사 → Kaggle 셀에 붙여넣기

### 5. `remaining.jsonl` 업로드

우측 패널 `Input` 섹션:
1. `+ Add Data` 또는 `Upload` 클릭
2. **Dataset name**: `remaining-items` 입력
3. 컴퓨터에서 `remaining.jsonl` 드래그 → 업로드
4. `Create` → 데이터셋 생성됨
5. 노트북 좌측 사이드바에 `/kaggle/input/remaining-items/remaining.jsonl` 경로로 자동 마운트

(노트북 코드가 이 경로 + Colab 경로 + 기타 후보를 자동 탐색하므로 사용자가 경로 신경 쓸 필요 없음)

### 6. 실행

각 셀을 순서대로 `Shift + Enter` 또는 상단의 `Run All`:

| 셀 | 시간 | 내용 |
|---|---|---|
| 1 | ~30초 | pip install (transformers, einops, timm) |
| 2 | 즉시 | remaining.jsonl 경로 자동 탐색 |
| 3 | ~2분 | Jina CLIP v2 모델 다운로드 (~3GB) + GPU 로드 |
| 4 | **~30-50분** | 메인 임베딩 루프. tqdm 진행률 바 + 매 5배치 통계 (실시간) |
| 5 | 즉시 | 검증 (sample ID 1개로 round-trip 확인) |

## 실시간 모니터링

셀 4가 실행되면 두 가지가 동시에 표시돼:

1. **tqdm 진행률 바** (셀 출력 상단 자동 갱신)
   ```
   embedding:  35%|████░░░░| 17234/48965 [12:30<23:00, 23 img/s] ok=16800 bad=434 ufail=0
   ```
2. **매 5배치(~160개)마다 통계 라인** 출력
   ```
   [   5/1530]   23.4 imgs/s | ETA 0:23:00 | ok=152 bad=8
   ```

탭만 열어두면 자동 갱신. 노트북 페이지 닫아도 백그라운드로 계속 실행 — 우상단 `Active sessions` 에서 출력 확인 가능.

별도 셀에 `!nvidia-smi` 실행하면 GPU 사용률도 볼 수 있어.

### 7. 끝나면

셀 5 출력에 `recommend status: 200` + JSON 결과가 나오면 ✅ 성공.

추가로 내(Claude)에게 알려주면:
- 최종 통계 검증 (Vectorize 인덱스 총 개수)
- 노트북 정리 안내
- 다음 단계 (Worker `/search-by-text` 스위치) 진행

---

## Colab로 하고 싶다면

코드는 동일. 차이점:
1. https://colab.research.google.com → 새 노트북
2. `Runtime` → `Change runtime type` → **GPU** (T4 무료)
3. 좌측 `Files` 아이콘 → `remaining.jsonl` 업로드 (`/content/remaining.jsonl`로 들어감)
4. 셀 순서대로 실행

Colab 단점:
- 12시간 세션 (Kaggle도 동일이지만 Kaggle은 detach 가능)
- 가끔 인터넷 끊기는 이슈
- 무료 GPU 할당이 시간대마다 다름

Kaggle이 더 안정적이라 추천.

---

## 비용

**Kaggle/Colab 무료 GPU = $0**. 카드 차감 절대 없음. 가입 시 카드 정보 안 요구.

Modal 작업비 ~$30 (크레딧 안에서 끝남) + Kaggle ~$0 = **총 $0 카드 차감**.

## 트러블슈팅

| 증상 | 원인 / 해결 |
|---|---|
| `remaining.jsonl not found` | Dataset 업로드 안 됐거나 경로 다름. Kaggle 좌측 `Input` 패널 확인 |
| `CUDA out of memory` | `BATCH_SIZE=32` → `16` 으로 줄여서 재실행 |
| 업서트 HTTP 500/502 | Worker 잠시 과부하 — 자동 재시도 안 됨. 셀 4 다시 실행하면 체크포인트로 이어감 |
| GPU 못 받음 | Kaggle은 시간대별 큐가 다름. 30분 대기 후 재시도 또는 P100으로 변경 |
| 노트북 일시정지 | Kaggle은 20분 무활동 시 종료. 페이지 열어두거나 `Save Version` 후 `Run` |
