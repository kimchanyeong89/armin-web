"""
update_progress_md.py
=====================
EMBEDDING_PROGRESS.md를 현재 업로드/retry 진행 상황으로 업데이트.
cron으로 주기적으로 실행하거나 수동 실행.

실행:
  python scripts/update_progress_md.py
"""

import json, os, re, subprocess
from pathlib import Path
from datetime import datetime

PROGRESS_FILE  = Path("upload_stuck_progress.json")
RETRY_PROGRESS = Path("retry_r2_state.json")
MD_FILE        = Path("EMBEDDING_PROGRESS.md")
TOTAL_EMBEDDING= 579234
TOTAL_COLLECTION = 597859

def get_upload_status():
    if not PROGRESS_FILE.exists():
        return {"total": TOTAL_EMBEDDING, "done": 0, "running": False}
    p = json.loads(PROGRESS_FILE.read_text())
    # uploaded_ids는 실제 업로드된 ID set; total은 그 개수
    done = len(p.get("uploaded_ids", [])) or p.get("total", 0)
    try:
        result = subprocess.run(
            ["pgrep", "-f", "upload_stuck_embeddings"],
            capture_output=True, text=True
        )
        running = bool(result.stdout.strip())
    except Exception:
        running = False
    return {"total": TOTAL_EMBEDDING, "done": done, "running": running}

def get_retry_status():
    if not RETRY_PROGRESS.exists():
        return {"done": 0, "success": 0, "failed": 0, "no_r2": 0, "total": 18578, "running": False}
    p = json.loads(RETRY_PROGRESS.read_text())
    success = p.get("success", 0)
    failed  = p.get("failed_again", 0)
    no_r2   = p.get("no_r2_url", 0)
    done    = success + failed + no_r2   # 실제 처리된 총계
    total   = done if done > 0 else 18578  # 완료시 done=total
    try:
        result = subprocess.run(
            ["pgrep", "-f", "retry_failed_r2"],
            capture_output=True, text=True
        )
        running = bool(result.stdout.strip())
    except Exception:
        running = False
    return {"done": done, "success": success, "failed": failed, "no_r2": no_r2, "total": total, "running": running}

def read_upload_log_speed():
    """최근 로그에서 속도 파싱"""
    try:
        log = Path("/tmp/upload_progress.log").read_text(errors="ignore")
        lines = [l for l in log.split("\n") if "/s" in l]
        if lines:
            last = lines[-1]
            m = re.search(r"(\d+\.?\d*)/s", last)
            return float(m.group(1)) if m else 0
    except Exception:
        pass
    return 0

def build_header(upload, retry):
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    u_pct = upload["done"] / upload["total"] * 100 if upload["total"] else 0
    r_pct = retry["done"] / retry["total"] * 100 if retry["total"] else 0
    speed = read_upload_log_speed()
    remaining = (upload["total"] - upload["done"]) / speed / 60 if speed > 0 else 0

    u_status = "🔄 진행 중" if upload["running"] else ("✅ 완료" if upload["done"] >= upload["total"] else "⏸ 일시정지")
    r_status = "🔄 진행 중" if retry["running"] else ("✅ 완료" if retry["done"] >= retry["total"] else "⏸ 일시정지")

    r_pct_success = retry["success"] / retry["total"] * 100 if retry["total"] else 0
    r_pct_failed  = retry["failed"]  / retry["total"] * 100 if retry["total"] else 0
    r_pct_no_r2   = retry["no_r2"]   / retry["total"] * 100 if retry["total"] else 0

    lines = [
        "# 🎨 SigLIP 임베딩 진행 현황 대시보드 (실시간 상황판)",
        "",
        f"> **마지막 업데이트**: {now}",
        f"> **임베딩 총 성공**: **{TOTAL_EMBEDDING:,} / {TOTAL_COLLECTION:,}** ({TOTAL_EMBEDDING/TOTAL_COLLECTION*100:.2f}%)",
        "",
        "---",
        "",
        "## ☁️ Vectorize 업로드 현황",
        "",
        f"| 항목 | 수치 |",
        f"|------|------|",
        f"| **상태** | {u_status} |",
        f"| **업로드 완료** | {upload['done']:,} / {upload['total']:,} ({u_pct:.1f}%) |",
        f"| **남은 항목** | {max(0, upload['total'] - upload['done']):,} |",
        f"| **현재 속도** | {speed:.0f}/s |",
        f"| **예상 잔여** | {remaining:.0f}분 ({remaining/60:.1f}시간) |" if speed > 0 else "| **예상 잔여** | 계산 중... |",
        "",
        "### 진행 바",
        f"`{'█' * int(u_pct/5)}{'░' * (20 - int(u_pct/5))}` {u_pct:.1f}%",
        "",
        "---",
        "",
        "## 🔁 실패 임베딩 R2 재시도 현황",
        "",
        f"| 항목 | 수치 |",
        f"|------|------|",
        f"| **상태** | {r_status} |",
        f"| **전체 대상** | {retry['total']:,}개 (실패 임베딩 총계) |",
        f"| **✅ 재임베딩 성공** | {retry['success']:,}개 ({r_pct_success:.1f}%) |",
        f"| **❌ 재임베딩 실패** | {retry['failed']:,}개 ({r_pct_failed:.1f}%) |",
        f"| **⏭️ R2 URL 없음 (스킵)** | {retry['no_r2']:,}개 ({r_pct_no_r2:.1f}%) — 진짜 이미지 없음 |",
        f"| **처리 완료** | {retry['done']:,} / {retry['total']:,} ({r_pct:.1f}%) |",
        f"| **남은 항목** | {max(0, retry['total'] - retry['done']):,} |",
        "",
        "### 재시도 진행 바",
        f"`{'█' * int(r_pct/5)}{'░' * (20 - int(r_pct/5))}` {r_pct:.1f}%",
        "",
        "---",
        "",
        "## 📈 전체 현황 요약",
        "",
        f"| 단계 | 완료 | 전체 | % |",
        f"|------|------|------|---|",
        f"| 임베딩 생성 | {TOTAL_EMBEDDING:,} | {TOTAL_COLLECTION:,} | {TOTAL_EMBEDDING/TOTAL_COLLECTION*100:.1f}% |",
        f"| Vectorize 업로드 | {upload['done']:,} | {upload['total']:,} | {u_pct:.1f}% |",
        f"| R2 재시도 ✅ 성공 | {retry['success']:,} | {retry['total']:,} | {r_pct_success:.1f}% |",
        f"| R2 재시도 ❌ 실패 | {retry['failed']:,} | {retry['total']:,} | {r_pct_failed:.1f}% |",
        f"| R2 재시도 ⏭️ 스킵 | {retry['no_r2']:,} | {retry['total']:,} | {r_pct_no_r2:.1f}% |",
        "",
        "---",
        "",
    ]
    return "\n".join(lines)

def main():
    upload = get_upload_status()
    retry  = get_retry_status()
    header = build_header(upload, retry)

    # 기존 파일에서 컬렉션별 테이블 부분 보존
    existing = MD_FILE.read_text(encoding="utf-8") if MD_FILE.exists() else ""
    # 컬렉션 테이블은 "| 영구전시 ID" 이후 부분 보존
    table_start = existing.find("| 영구전시 ID")
    if table_start > 0:
        table_part = "\n## 📋 컬렉션별 상세 현황\n\n" + existing[table_start:]
    else:
        table_part = ""

    MD_FILE.write_text(header + table_part, encoding="utf-8")
    print(f"✅ {MD_FILE} 업데이트 완료")
    print(f"   업로드: {upload['done']:,}/{upload['total']:,} ({upload['done']/upload['total']*100:.1f}%)")
    print(f"   상태: {'진행중' if upload['running'] else '정지'}")

if __name__ == "__main__":
    main()
