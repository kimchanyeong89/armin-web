with open("scripts/run_siglip_fast.py", "r") as f:
    lines = f.readlines()

new_lines = []
skip = False
for line in lines:
    if line.startswith("def render_dashboard"):
        skip = True
        new_lines.append("""def render_dashboard(state, current_e=None, last_error=None):
    from datetime import datetime, timedelta
    import os, json
    
    elapsed = time.time() - START_TIME
    processed_count = state["stats"]["total_success"]
    
    failed_file = "siglip_failed.jsonl"
    f_total = 0
    f_404 = 0
    f_waf = 0
    f_net = 0
    f_other = 0
    
    if os.path.exists(failed_file):
        with open(failed_file, "r") as ff:
            for l in ff:
                if not l.strip(): continue
                f_total += 1
                try:
                    err = json.loads(l).get("error", "").lower()
                    if "404" in err or "not found" in err: f_404 += 1
                    elif "403" in err or "cloudflare" in err or "forbidden" in err or "bot" in err: f_waf += 1
                    elif "timeout" in err or "connection" in err or "ssl" in err or "socket" in err: f_net += 1
                    else: f_other += 1
                except:
                    f_other += 1
                    
    sync_file = "sync_progress.txt"
    upserted_count = state["stats"].get("total_upserted", 0)
    if os.path.exists(sync_file):
        try:
            upserted_count = int(open(sync_file).read().strip())
        except: pass

    state["stats"]["total_failed"] = f_total
    TOTAL_ARTS = sum(state.get('museum_counts', {}).values()) or 597859
    
    speed = processed_count / elapsed if elapsed > 0 else 0
    remains = TOTAL_ARTS - processed_count
    eta_sec = remains / speed if speed > 0 else 0
    eta_str = str(timedelta(seconds=int(eta_sec))) if speed > 0 else "계산중..."

    lines = [
        "# 🎨 SigLIP 임베딩 진행 현황 대시보드 (실시간 상황판)\\n",
        f"> **마지막 업데이트**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        f"> **총 데이터 처리 성공률**: **{min((processed_count / TOTAL_ARTS * 100), 100.0):.2f}% ({processed_count:,} / {TOTAL_ARTS:,})**",
        f"> **현재 속도**: {speed:.2f} 개/초 | **예상 남은 시간**: {eta_str}\\n",
        "### 📊 상세 지표 (실시간 반영)",
        f"- ✅ **순수 성공(데이터 확보)**: {processed_count:,} 건",
        f"- ☁️ **Cloudflare 실제 업로드**: {upserted_count:,} 건  *(Sync 백그라운드 구동 중)*",
        f"- ❌ **실패한 데이터 (재시도 중)**: {f_total:,} 건",
        "  - 🚫 **이미지 소실(404 등)**: " + f"{f_404:,}" + " 건 (재시도 불필요 / 배제 대상)",
        "  - 🛡️ **웹 방화벽(WAF/403)**: " + f"{f_waf:,}" + " 건",
        "  - 📡 **네트워크/타임아웃**: " + f"{f_net:,}" + " 건",
        "  - ❓ **기타 요인**: " + f"{f_other:,}" + " 건\\n",
        "💡 *방화벽 및 네트워크 오류는 현재 백그라운드에서 자동 재시도를 반복하여 성공으로 복구 중입니다.*\\n"
    ]

    if last_error:
        lines.append(f"⚠️ **최근 통신 에러 로그**: `{last_error}`\\n")

    if current_e:
        lines.append(f"🔥 **현재 집중 처리 중인 영구전시**: `{current_e}`\\n")

    lines.append("| 영구전시 ID | 전체 수 | 성공완료 | 에러발생 | 진행률(%) | 상태 |")
    lines.append("|:---|---:|---:|---:|---:|:---:|")

    for e_id in sorted_exhibitions:
        count = state.get('museum_counts', {}).get(e_id, 0)
        successes = state["museum_processed"].get(e_id, 0)
        fares = state.get("museum_failed", {}).get(e_id, 0)
        
        percent = min((successes / count) * 100, 100.0) if count > 0 else 0
        
        status = "⏳ 대기중"
        if percent >= 100.0:
            status = "✅ 완료"
        elif percent > 0:
            status = "🔥 **진행중/재시도중**" if e_id == current_e else "⏳ 남은 데이터 대기"
        elif fares > 0:
            status = "⚠️ 오류발생 대기"
        
        lines.append(f"| **{e_id}** | {count:,} | {successes:,} | {fares:,} | {percent:.1f}% | {status} |")

    with open("EMBEDDING_PROGRESS.md", "w") as f_out:
        f_out.write("\\n".join(lines))
""")
        continue
    if skip and line.startswith("def "):
        skip = False
    
    if not skip:
        new_lines.append(line)

with open("scripts/run_siglip_fast.py", "w") as f:
    f.writelines(new_lines)
print("fixed dash")
