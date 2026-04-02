import json, time, requests, urllib3, os
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
from io import BytesIO
from PIL import Image
import torch
from transformers import AutoProcessor, AutoModel

DATA_DIR = "public/data"
OUTPUT_DIR = "embedding_results"
STATE_FILE = "siglip_state.json"
PROCESSED_FILE = "siglip_processed_ids.txt"
DASHBOARD_FILE = "SigLIP_Dashboard.md"

os.makedirs(OUTPUT_DIR, exist_ok=True)

MODEL_ID = "google/siglip-base-patch16-224"
SAVE_INTERVAL = 10 

def load_state():
    state = { "stats": {"total_success": 0, "total_failed": 0}, "museum_counts": {}, "museum_processed": {} }
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE, "r") as f:
            state = json.load(f)
    processed_set = set()
    if os.path.exists(PROCESSED_FILE):
        with open(PROCESSED_FILE, "r") as f:
            for line in f:
                processed_set.add(line.strip())
    return state, processed_set

def save_state(state):
    with open(STATE_FILE, "w") as f:
        json.dump(state, f)

def render_dashboard(state, current_e=None, status_msg=""):
    md_content = f"# 🎨 SigLIP 자동 임베딩 현황 (Mac 로컬 백그라운드 구동 중)\\n"
    md_content += f"> **마지막 업데이트**: {time.strftime('%Y-%m-%d %H:%M:%S')} \\n"
    if status_msg:
         md_content += f"> **상태**: {status_msg}\\n\\n"
    else:
         md_content += "\\n"
         
    total_imgs = sum(state['museum_counts'].values())
    total_done = sum(state['museum_processed'].values())
    
    if total_imgs > 0:
        total_percent = (total_done / total_imgs) * 100
        md_content += f"### 📊 전체 진행률: {total_percent:.2f}% ({total_done:,} / {total_imgs:,})\\n"
    md_content += f"- **✅ 성공**: {state['stats']['total_success']:,} 건\\n"
    md_content += f"- **❌ 실패**: {state['stats']['total_failed']:,} 건\\n\\n"
    
    if current_e:
        md_content += f"🔥 **현재 자동 처리 중인 영구전시**: `{current_e}`\\n\\n"
        
    md_content += "| 영구전시 ID | 전체 수 | 완료 | 진행률(%) | 상태 |\\n"
    md_content += "|:---|---:|---:|---:|:---:|\\n"
    
    for e_id, total in sorted(state['museum_counts'].items()):
        done = state['museum_processed'].get(e_id, 0)
        percent = (done / total) * 100 if total > 0 else 0
        status_icon = "✅ 완료" if done >= total and total > 0 else "⏳ 대기중"
        if current_e == e_id: status_icon = "🔥 **진행중**"
        elif done > 0 and done < total: status_icon = "⏳ 부분 진행"
        md_content += f"| **{e_id}** | {total:,} | {done:,} | {percent:.1f}% | {status_icon} |\\n"
    
    with open(DASHBOARD_FILE, 'w') as f:
        f.write(md_content)

def main():
    # 0. 초기 안내 대시보드 강제 작성
    with open(DASHBOARD_FILE, 'w') as f:
        f.write("# 🎨 SigLIP 자동 임베딩 준비 중...\\n\\n> 모델 로딩 및 필수 세팅을 위해 1~2분 정도 소요됩니다. 잠시만 기다려주세요!")
        
    # 1. Mac 환경(MPS 가속) 자동 감지
    if torch.backends.mps.is_available():
        device = torch.device("mps")
        print("🚀 Mac MPS (Apple Silicon GPU) 가속이 활성화되었습니다.")
    else:
        device = torch.device("cpu")
        print("⚠️ MPS 우회, CPU로 진행합니다.")

    # 2. 모델 다운로드 및 로드 
    model = AutoModel.from_pretrained(MODEL_ID).to(device)
    processor = AutoProcessor.from_pretrained(MODEL_ID)
    model.eval()

    state, processed_ids_set = load_state()
    manifest_path = os.path.join(DATA_DIR, "search-manifest.json")
    
    if not os.path.exists(manifest_path):
        with open(DASHBOARD_FILE, "w") as f:
            f.write(f"# ❌ 에러 발생\n`{manifest_path}` 파일을 찾을 수 없습니다. 경로를 확인해주세요.")
        return

    # 3. 데이터 파싱
    with open(manifest_path, "r") as f:
        manifest = json.load(f)
    
    grouped_artworks = {}
    for chunk_file in manifest.get("chunks", []):
        chunk_path = os.path.join(DATA_DIR, chunk_file)
        if not os.path.exists(chunk_path): continue
        with open(chunk_path, "r") as f:
            data = json.load(f)
            artworks = data[0] if isinstance(data[0], list) else data
            for art in artworks:
                if not art.get("i"): continue
                e_id = art.get("e", "unknown")
                if e_id not in grouped_artworks: grouped_artworks[e_id] = []
                grouped_artworks[e_id].append(art)
                
    for e_id, arts in grouped_artworks.items():
        state["museum_counts"][e_id] = len(arts)
    
    output_file = os.path.join(OUTPUT_DIR, "siglip_embeddings.jsonl")
    sorted_exhibitions = sorted(grouped_artworks.keys())
    processed_count_since_save = 0
    
    render_dashboard(state, status_msg="데이터 스캔 완료. 임베딩을 본격적으로 시작합니다!")
    
    # 4. 본격적인 처리 시작
    for e_id in sorted_exhibitions:
        arts = grouped_artworks[e_id]
        if state["museum_processed"].get(e_id, 0) >= len(arts): continue
        render_dashboard(state, current_e=e_id, status_msg="이미지 다운로드 및 텐서 변환(Vector) 중...")
        
        for art in arts:
            art_id = art.get("id") or f"{art.get('e','x')}-{art.get('n','x')}"
            img_url = art.get("i")
            if art_id in processed_ids_set: continue
            
            try:
                resp = requests.get(img_url, timeout=10, verify=False, headers={"User-Agent": "Mozilla/5.0"})
                if resp.status_code == 200:
                    image = Image.open(BytesIO(resp.content)).convert("RGB")
                    inputs = processor(images=image, return_tensors="pt").to(device)
                    with torch.no_grad():
                        image_features = model.get_image_features(**inputs)
                    image_features = image_features / image_features.norm(p=2, dim=-1, keepdim=True)
                    vector = image_features[0].cpu().numpy().tolist()
                    
                    result_record = {"id": art_id, "e": e_id, "vector": vector}
                    with open(output_file, "a") as f_out:
                        f_out.write(json.dumps(result_record) + "\n")
                    state["stats"]["total_success"] += 1
                    state["museum_processed"][e_id] = state["museum_processed"].get(e_id, 0) + 1
                else:
                    state["stats"]["total_failed"] += 1
            except:
                state["stats"]["total_failed"] += 1
                
            with open(PROCESSED_FILE, "a") as f:
                f.write(art_id + "\n")
            processed_ids_set.add(art_id)
            
            processed_count_since_save += 1
            if processed_count_since_save >= SAVE_INTERVAL:
                save_state(state)
                render_dashboard(state, current_e=e_id, status_msg="백그라운드에서 실시간으로 안전하게 처리 중입니다 🚀 (Mac MPS 가속 작동중)")
                processed_count_since_save = 0
    
    save_state(state)
    render_dashboard(state, status_msg="🎉 모든 영구전시 65만 개 임베딩 벡터 생성이 완벽히 종료되었습니다!!")
    print("완료!")

if __name__ == "__main__":
    main()
