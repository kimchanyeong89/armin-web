#!/bin/bash
cd "$(dirname "$0")/.."

# 기존 데이터 삭제
rm -f public/data/vangogh-museum-collection.json public/data/mauritshuis-collection.json public/data/stedelijk-collection.json
rm -f downloads/vangogh-museum-progress.json downloads/mauritshuis-progress.json downloads/stedelijk-progress.json

# 스크래퍼 실행
nohup node scripts/scrape-vangogh-museum-v2.cjs > downloads/vangogh-console.log 2>&1 &
echo $! > downloads/vangogh.pid

nohup node scripts/scrape-mauritshuis-v2.cjs > downloads/mauritshuis-console.log 2>&1 &
echo $! > downloads/mauritshuis.pid

nohup node scripts/scrape-stedelijk-v2.cjs > downloads/stedelijk-console.log 2>&1 &
echo $! > downloads/stedelijk.pid

echo "3개 스크래퍼 시작됨 (PID: $(cat downloads/vangogh.pid), $(cat downloads/mauritshuis.pid), $(cat downloads/stedelijk.pid))"
