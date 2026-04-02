import json
from pathlib import Path

def update_dashboard():
    state = json.loads(Path('siglip_state.json').read_text())
    
    total_target = sum(v for v in state.get('museum_counts', {}).values())
    total_processed = sum(v for v in state.get('museum_processed', {}).values())
    overall_progress = (total_processed / total_target * 100) if total_target > 0 else 0
    
    lines = [
        f"# ✨ SigLIP Vectorize 임베딩 진행 현황",
        f"",
        f"**🏆 전체 진행률**: {total_processed:,} / {total_target:,} ({overall_progress:.1f}%)"
    ]
    
    stats = state.get("stats", {})
    success = stats.get("total_success", 0)
    failed = stats.get("total_failed", 0)
    upserted = stats.get("total_upserted", 0)
    
    lines.extend([
        f"- **성공 (MPS)**: {success:,}",
        f"- **실패**: {failed:,}",
        f"- **Cloudflare 업로드 (Upsert)**: {upserted:,}",
        f"",
        f"---",
        f"### 🏛 전시별 상세 진행 현황",
        f""
    ])
    
    museum_counts = state.get('museum_counts', {})
    museum_processed = state.get('museum_processed', {})
    
    table_lines = [
        "| 전시 식별자(e_id) | 진행 현황 | 목표 수량 | 처리 수량 | 진행률 |",
        "| --- | --- | --- | --- | --- |"
    ]
    
    # 목표와 처리 중 하나라도 있는 항목 종합
    all_eids = set(museum_counts.keys()) | set(museum_processed.keys())
    
    # None 제거
    all_eids = [k for k in all_eids if k is not None]
    
    sorted_eids = sorted(list(all_eids), key=lambda x: museum_processed.get(x, 0) / museum_counts.get(x, 1) if museum_counts.get(x, 1) > 0 else 0, reverse=True)

    for e_id in sorted_eids:
        target = museum_counts.get(e_id, 0)
        processed = museum_processed.get(e_id, 0)
        progress = (processed / target * 100) if target > 0 else (100 if processed > 0 else 0)
        
        # ProgressBar
        bars = int(progress / 5)
        if bars > 20: bars = 20
        bar_str = "🟩" * bars + "⚪" * (20 - bars)
        status = "✅ 완료" if progress >= 100 else f"🔄 {progress:.1f}%"
        if processed == 0: status = "⏳ 대기중"
        
        table_lines.append(f"| `{e_id}` | {bar_str} {status} | {target:,} | {processed:,} | {progress:.1f}% |")

    lines.extend(table_lines)
    Path('EMBEDDING_PROGRESS.md').write_text("\n".join(lines))
    print("Dashboard Refreshed")

update_dashboard()
