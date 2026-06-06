#!/usr/bin/env python3
"""
원격 임베딩 모니터 — Cloudflare Vectorize 인덱스의 라이브 카운트만 폴링.
Modal/Kaggle/Colab 어디서 처리하든 동일하게 작동 (vector count는 글로벌).

사용:
  cd /Users/kietzsche/armin-web-main
  arch -arm64 python3 scripts/modal_embed/remote_dashboard.py &
  # 또는 단순히
  python3 scripts/modal_embed/remote_dashboard.py
"""
import time
import json
import urllib.request
from datetime import datetime
from pathlib import Path

STATS_URL = "https://armin-semantic-search.armin-art.workers.dev/jina-stats"
REFRESH_SEC = 60
OUT = Path("JINA_EMBED_DASHBOARD.md")
TARGET = 609_251

# 진척 추적 — 분당 증가량(=실효 속도) 계산
history: list = []  # (timestamp, count)


def fetch_stats():
    """Cloudflare가 Python-urllib User-Agent를 차단하므로 브라우저 UA로 위장."""
    req = urllib.request.Request(
        STATS_URL,
        headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                          "AppleWebKit/537.36 (KHTML, like Gecko) "
                          "Chrome/122.0.0.0 Safari/537.36",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read())
    except Exception as e:
        return {"error": str(e)}


def bar(pct: float, w: int = 40) -> str:
    filled = int(pct / 100 * w)
    return "█" * filled + "░" * (w - filled)


def render(stats: dict) -> str:
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    if "error" in stats:
        return f"# Jina 임베딩 — Vectorize 폴 실패\n\n> {now}\n\n에러: `{stats['error']}`\n"

    count = stats.get("vectorCount", 0)
    pct = stats.get("progressPct", 0)
    proc_dt = stats.get("processedUpToDatetime", "-")

    # 이력 누적
    history.append((time.time(), count))
    # 10분 이전 이력만 유지
    cutoff = time.time() - 600
    while history and history[0][0] < cutoff:
        history.pop(0)

    rate_per_min = 0.0
    if len(history) >= 2:
        t0, c0 = history[0]
        t1, c1 = history[-1]
        dt = (t1 - t0) / 60  # minutes
        if dt > 0:
            rate_per_min = (c1 - c0) / dt

    remaining = TARGET - count
    eta_min = int(remaining / rate_per_min) if rate_per_min > 0 else None
    eta_str = f"~{eta_min}분 ({eta_min/60:.1f}시간)" if eta_min else "계산 중 (변화 없음)"

    is_active = rate_per_min > 0
    status = "🟢 진행 중" if is_active else "🟡 정지 / 무변화"

    lines = [
        "# Jina CLIP v2 임베딩 — 원격 대시보드",
        "",
        f"> 마지막 폴: **{now}**  ·  상태: **{status}**",
        f"> 데이터 소스: [`/jina-stats`]({STATS_URL}) (Vectorize 인덱스 라이브 카운트)",
        "",
        f"## 진행률: **{pct:.2f}%**  ({count:,} / {TARGET:,})",
        "",
        "```",
        f"[{bar(pct)}]  {pct:.2f}%",
        "```",
        "",
        "## 핵심 지표",
        "",
        "| 항목 | 값 |",
        "|---|---|",
        f"| 현재 인덱스 카운트 | **{count:,}** |",
        f"| 목표 (canonical) | {TARGET:,} |",
        f"| 남은 항목 | {remaining:,} |",
        f"| 최근 10분 속도 | **{rate_per_min:.0f} 벡터/분** ({rate_per_min/60:.1f} 벡터/초) |",
        f"| 남은 시간 추정 | {eta_str} |",
        f"| Vectorize 마지막 처리 시각 | `{proc_dt}` |",
        "",
        "## 어디서 처리되든 보임",
        "",
        "이 대시보드는 Cloudflare Vectorize 인덱스의 라이브 카운트를 직접 폴함.",
        "- Modal에서 처리하든",
        "- Kaggle에서 처리하든",
        "- Colab에서 처리하든",
        "벡터가 인덱스에 올라가는 즉시 카운트가 올라감.",
        "",
        f"_갱신 주기: {REFRESH_SEC}초 · 멈추려면: 이 스크립트 PID kill_",
    ]
    return "\n".join(lines) + "\n"


def main():
    print(f"[remote_dashboard] polling {STATS_URL} every {REFRESH_SEC}s → {OUT}")
    while True:
        stats = fetch_stats()
        OUT.write_text(render(stats), encoding="utf-8")
        if stats.get("vectorCount", 0) >= TARGET:
            print("[remote_dashboard] target reached — exiting")
            break
        time.sleep(REFRESH_SEC)


if __name__ == "__main__":
    main()
