with open("scripts/run_siglip_fast.py", "r") as f:
    lines = f.readlines()

new_lines = []
skip = False
for line in lines:
    if line.startswith("def render_dashboard"):
        skip = True
        new_lines.append("""def render_dashboard(state, current_e=None, last_error=None):
    from datetime import datetime, timedelta
    
    elapsed = time.time() - START_TIME
    processed_count = state["stats"]["total_success"]
    failed_count = state["stats"]["total_failed"]
    
    speed = processed_count / elapsed if elapsed > 0 else 0
    remains = TOTAL_ARTS - processed_count
    eta_sec = remains / speed if speed > 0 else 0
    eta_str = str(timedelta(seconds=int(eta_sec))) if speed > 0 else "계산중..."

    lines = [
        "# 🎨 SigLIP 임베딩 진행 현황 대시보드 (MacBook Pro 로컬 구동중 - 고속모드)\\n",
        f"> **마지막 업데이트**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        f"> **총 성공률**: **{min((processed_count / TOTAL_ARTS * 100), 100.0):.2f}% ({processed_count:,} / {TOTAL_ARTS:,})**",
        f"> **현재 속도**: {speed:.2f} 개/초 | **예상 남은 시간**: {eta_str}\\n",
        f"- ✅ **성공(초과없는 순수 데이터)**: {processed_count:,} 건",
        f"- ☁️ **Cloudflare 업로드**: {state['stats'].get('total_upserted', 0):,} 건",
        f"- ❌ **실패(배제됨)**: {failed_count:,} 건\\n",
        "💡 **진행률은 100% 완전 성공한 데이터만을 기준으로 계산됩니다.**\\n"
    ]

    if last_error:
        lines.append(f"⚠️ **최근 에러**: `{last_error}`\\n")

    if current_e:
        lines.append(f"🔥 **현재 집중 처리 중인 영구전시**: `{current_e}`\\n")

    lines.append("| 영구전시 ID | 전체 수 | 성공완료 | 에러/제외 | 진행률(%) | 상태 |")
    lines.append("|:---|---:|---:|---:|---:|:---:|")

    for e_id, count in sorted_exhibitions:
        successes = state["museum_processed"].get(e_id, 0)
        fares = state.get("museum_failed", {}).get(e_id, 0)
        
        # Avoid the math overflowing over 100% physically
        percent = min((successes / count) * 100, 100.0) if count > 0 else 0
        
        status = "⏳ 대기중"
            
        # Clear completion criteria
        if percent >= 100.0:
            status = "✅ 완료"
        elif percent > 0:
            status = "🔥 **진행중**" if e_id == current_e else "⏳ 부분 진행"
        elif fares > 0:
            status = "⚠️ 오류발생"
        
        lines.append(f"| **{e_id}** | {count:,} | {successes:,} | {fares:,} | {percent:.1f}% | {status} |")

    with open("EMBEDDING_PROGRESS.md", "w") as f:
        f.write("\\n".join(lines))
""")
        continue
    if skip and line.startswith("def "): # next function
        skip = False
    
    if not skip:
        new_lines.append(line)

with open("scripts/run_siglip_fast.py", "w") as f:
    f.writelines(new_lines)
print("done")
