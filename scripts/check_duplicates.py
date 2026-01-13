
import json
from pathlib import Path
from collections import defaultdict

target_names = [
    "Manus Offizin Fritz Voigt",
    "World's Columbian Exposition",
    "World = War + Sex"
]

print(f"🔍 검색 대상: {target_names}\n")

found_items = defaultdict(list)

# 모든 검색 인덱스 파일 스캔
for f in sorted(Path('public/data').glob('search-index-part-*.json')):
    try:
        data = json.loads(f.read_text())
        # 데이터 구조 평탄화
        items = []
        if isinstance(data, list):
            if data and isinstance(data[0], list):
                for sublist in data: items.extend(sublist)
            else:
                items = data
                
        for item in items:
            name = item.get('n', '')
            # 부분 일치 검색 (대소문자 무시)
            for target in target_names:
                if target.lower() in name.lower():
                    found_items[target].append({
                        'file': f.name,
                        'id': item.get('id'),
                        'name': item.get('n'),
                        'museum': item.get('m')
                    })
    except Exception as e:
        print(f"❌ 파일 읽기 오류 {f.name}: {e}")

# 결과 출력
for target, results in found_items.items():
    print(f"📌 '{target}' 검색 결과: {len(results)}건")
    for res in results:
        print(f"   - ID: {res['id']}")
        print(f"     File: {res['file']}")
        print(f"     Museum: {res['museum']}")
    print('-' * 40)
