#!/usr/bin/env python3
"""
Jina 임베딩 실시간 대시보드 — JINA_EMBED_DASHBOARD.md 를 주기적으로 갱신.

사용:
  arch -arm64 python3 scripts/modal_embed/dashboard.py ap-tyryikaZUsucWrOIGYIBWh &

에디터 (VSCode/Cursor 등) 에서 JINA_EMBED_DASHBOARD.md 열어두면 자동 reload 되며 보임.
"""
import sys
import re
import time
import subprocess
from datetime import datetime, timedelta
from pathlib import Path

REFRESH_SEC = 45
OUT_FILE = Path("JINA_EMBED_DASHBOARD.md")
TOTAL_TARGET = 609_251  # canonical 작품 수 (CORPUS_COUNTS.md 참조)
GPU_PRICE_PER_HOUR = 1.10  # A10G
MAX_CONTAINERS = 6
CREDIT_BUDGET = 30.0  # USD

PROGRESS_RE = re.compile(
    r"\[progress\] batches (\d+)/(\d+) \| ok=([\d,]+) bad=([\d,]+) \| ([\d.]+) imgs/s \| ETA (\d+)min"
)
DONE_RE = re.compile(r"\[done\] ok=([\d,]+) bad=([\d,]+) upsert_fail=(\d+) in (\d+)min")
UPSERT_FAIL_RE = re.compile(r"\[batch \d+\] upsert HTTP (\d+)")


def fetch_logs(app_id: str) -> str:
    """modal app logs 의 최신 출력 가져오기 (시간 제한)."""
    try:
        # logs는 stream이라 한 번에 다 못 받음 — timeout으로 끊고 받은 만큼 사용
        r = subprocess.run(
            ["arch", "-arm64", "python3", "-m", "modal", "app", "logs", app_id],
            capture_output=True, text=True, timeout=20,
        )
        return r.stdout + r.stderr
    except subprocess.TimeoutExpired as e:
        # timeout이어도 받은 만큼은 stdout/stderr에 들어있음
        return (e.stdout or "") + (e.stderr or "")
    except Exception as e:
        return f"<log fetch error: {e}>"


def parse(logs: str):
    """로그에서 최신 progress + done + failure 통계 추출."""
    progress = None
    for m in PROGRESS_RE.finditer(logs):
        progress = m  # last match wins
    done = DONE_RE.search(logs)
    upsert_fails = len(UPSERT_FAIL_RE.findall(logs))
    return progress, done, upsert_fails


def progress_bar(pct: float, width: int = 40) -> str:
    filled = int(pct / 100 * width)
    return "█" * filled + "░" * (width - filled)


def render(app_id: str, progress, done, upsert_fails: int, t_start: float) -> str:
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    elapsed_sec = time.time() - t_start
    elapsed_str = str(timedelta(seconds=int(elapsed_sec)))

    lines = [
        "# Jina CLIP v2 임베딩 — 실시간 대시보드",
        "",
        f"> 마지막 갱신: **{now}**  ·  대시보드 가동 후 경과: {elapsed_str}",
        f"> Modal 앱: [`{app_id}`](https://modal.com/apps/kietzland/main/{app_id})",
        "",
    ]

    if done:
        ok = int(done.group(1).replace(",", ""))
        bad = int(done.group(2).replace(",", ""))
        ufail = int(done.group(3))
        dur_min = int(done.group(4))
        lines += [
            "## ✅ 완료",
            "",
            f"- **성공 ok**: {ok:,}",
            f"- **영구 실패 bad**: {bad:,}  (이미지 404 / 죽은 URL 등)",
            f"- **업서트 실패 (재시도 대상)**: {ufail}",
            f"- **소요 시간**: {dur_min}분",
            "",
            "다음 단계: `worker /search-by-text` 를 새 Jina 인덱스로 스위치 + 검증.",
        ]
        return "\n".join(lines) + "\n"

    if not progress:
        lines += [
            "## ⏳ 워밍업 중",
            "",
            "아직 첫 progress 보고가 나오지 않았어. 컨테이너가 모델 로드 중일 가능성 큼 (~30-60초).",
            "",
            f"upsert 에러 누적: {upsert_fails}",
        ]
        return "\n".join(lines) + "\n"

    batch_now = int(progress.group(1))
    batch_total = int(progress.group(2))
    ok = int(progress.group(3).replace(",", ""))
    bad = int(progress.group(4).replace(",", ""))
    speed = float(progress.group(5))
    eta_min = int(progress.group(6))

    done_this_run = ok + bad
    # 총 진척 (이전 run 32k 포함)
    grand_total_done = 32_010 + done_this_run  # 시작 시 checkpoint
    pct_overall = 100 * grand_total_done / TOTAL_TARGET
    pct_run = 100 * batch_now / batch_total

    # 비용 추정 (지나간 시간 × 컨테이너 수)
    # 작업 시작 시점은 알 수 없으니 batch_now/속도 로 역산
    if speed > 0:
        gpu_seconds_used = done_this_run / speed  # 1 컨테이너 환산
        # 실제로는 다중 컨테이너로 분산 — 총 wall-time이 더 짧음
        # 보수적으로 wall-time = gpu_seconds_used / MAX_CONTAINERS 가정
        wall_hours_est = (gpu_seconds_used / MAX_CONTAINERS) / 3600
        cost_so_far = wall_hours_est * MAX_CONTAINERS * GPU_PRICE_PER_HOUR
        cost_total_est = cost_so_far + (eta_min / 60) * MAX_CONTAINERS * GPU_PRICE_PER_HOUR
    else:
        cost_so_far = cost_total_est = 0

    lines += [
        f"## 진행률: **{pct_overall:.1f}%**  ({grand_total_done:,} / {TOTAL_TARGET:,})",
        "",
        f"```",
        f"전체: [{progress_bar(pct_overall)}] {pct_overall:.1f}%",
        f"이번: [{progress_bar(pct_run)}] {pct_run:.1f}%  ({batch_now:,}/{batch_total:,} batches)",
        f"```",
        "",
        "## 핵심 지표",
        "",
        f"| 항목 | 값 |",
        f"|---|---|",
        f"| 속도 | **{speed:.1f} imgs/sec** |",
        f"| 남은 시간 (Modal 추정) | **{eta_min}분** (~{eta_min/60:.1f}시간) |",
        f"| 성공 (이번 run) | {ok:,} |",
        f"| 실패 (이번 run) | {bad:,}  ({100*bad/max(done_this_run,1):.2f}%) |",
        f"| 업서트 에러 누적 | {upsert_fails} |",
        f"| 예상 총 비용 | **${cost_total_est:.1f}**  / 크레딧 ${CREDIT_BUDGET:.0f} |",
        f"| 카드 위험 | $0  (버짓 $30 cap, 크레딧 안에서 끝) |",
        "",
        "## 컴퓨터 닫아도 되나?",
        "",
        "**된다.** Modal은 클라우드에서 돌고 너 노트북과 무관. modal.com 대시보드에서 폰으로도 봐도 됨.",
        "",
        "## 다음 단계 (자동)",
        "",
        "1. 임베딩 100% 완료 → 위 `## ✅ 완료` 섹션으로 바뀜",
        "2. 검색 정확도 검증 (Jina 텍스트 인코더 셋업 필요)",
        "3. worker `/search-by-text` 를 새 Jina 인덱스로 스위치 + 배포",
        "4. 프론트 검색 한국어 native 작동 확인",
        "",
        f"---",
        f"_갱신 주기: {REFRESH_SEC}초. 멈추려면: 이 스크립트 PID kill._",
    ]
    return "\n".join(lines) + "\n"


def main():
    if len(sys.argv) < 2:
        print("usage: dashboard.py <APP_ID>", file=sys.stderr)
        sys.exit(1)
    app_id = sys.argv[1]
    t_start = time.time()
    print(f"[dashboard] watching {app_id} → {OUT_FILE}")
    while True:
        logs = fetch_logs(app_id)
        progress, done, upsert_fails = parse(logs)
        md = render(app_id, progress, done, upsert_fails, t_start)
        OUT_FILE.write_text(md, encoding="utf-8")
        if done:
            print(f"[dashboard] [done] detected — exiting")
            break
        time.sleep(REFRESH_SEC)


if __name__ == "__main__":
    main()
