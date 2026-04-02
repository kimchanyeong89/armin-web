import re

def main():
    with open("scripts/run_siglip_fast.py", "r") as f:
        text = f.read()

    # Fix 1: download failure updates museum_processed too
    text = re.sub(
        r'(state\["stats"\]\["total_failed"\] = state\["stats"\].get\("total_failed", 0\) \+ 1\s+last_err_msg = f"다운로드 실패: \{err\}")',
        r'\1\n                state["museum_failed"][e_id] = state["museum_failed"].get(e_id, 0) + 1\n                state["museum_processed"][e_id] = state["museum_processed"].get(e_id, 0) + 1',
        text
    )

    # Fix 2: gpu failure updates museum_processed too
    text = re.sub(
        r'(state\["stats"\]\["total_failed"\] = state\["stats"\].get\("total_failed", 0\) \+ 1\s+with file_lock:)',
        r'\1\n                            state["museum_failed"][e_id] = state["museum_failed"].get(e_id, 0) + 1\n                            state["museum_processed"][e_id] = state["museum_processed"].get(e_id, 0) + 1',
        text
    )

    with open("scripts/run_siglip_fast.py", "w") as f:
        f.write(text)
        
if __name__ == "__main__":
    main()