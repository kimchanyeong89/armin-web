#!/bin/bash

# 네덜란드 미술관 테스트 스크래핑 런처
# 각 미술관을 백그라운드에서 실행

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "═══════════════════════════════════════════════════════════════"
echo "  🏛️  네덜란드 미술관 테스트 스크래핑 시작"
echo "═══════════════════════════════════════════════════════════════"
echo "  각 미술관: 100개 작품 수집"
echo "  시작 시간: $(date '+%Y-%m-%d %H:%M:%S')"
echo "───────────────────────────────────────────────────────────────"
echo ""

# 로그 디렉토리 확인
mkdir -p ../downloads

# 1. Van Gogh Museum
echo "🚀 Van Gogh Museum 스크래퍼 시작 (백그라운드)..."
nohup node scrape-vangogh-museum.cjs > ../downloads/vangogh-museum-console.log 2>&1 &
VANGOGH_PID=$!
echo "  PID: $VANGOGH_PID"
echo ""

# 2. Mauritshuis
echo "🚀 Mauritshuis 스크래퍼 시작 (백그라운드)..."
nohup node scrape-mauritshuis.cjs > ../downloads/mauritshuis-console.log 2>&1 &
MAURITSHUIS_PID=$!
echo "  PID: $MAURITSHUIS_PID"
echo ""

# 3. Stedelijk Museum
echo "🚀 Stedelijk Museum 스크래퍼 시작 (백그라운드)..."
nohup node scrape-stedelijk.cjs > ../downloads/stedelijk-console.log 2>&1 &
STEDELIJK_PID=$!
echo "  PID: $STEDELIJK_PID"
echo ""

# 4. Kröller-Müller Museum - Paintings
echo "🚀 Kröller-Müller Museum (Paintings) 스크래퍼 시작 (백그라운드)..."
nohup node scrape-kroller-muller.cjs paintings > ../downloads/kroller-muller-paintings-console.log 2>&1 &
KROLLER_PAINTINGS_PID=$!
echo "  PID: $KROLLER_PAINTINGS_PID"
echo ""

# 5. Kröller-Müller Museum - Film/Video
echo "🚀 Kröller-Müller Museum (Film/Video) 스크래퍼 시작 (백그라운드)..."
nohup node scrape-kroller-muller.cjs film > ../downloads/kroller-muller-film-console.log 2>&1 &
KROLLER_FILM_PID=$!
echo "  PID: $KROLLER_FILM_PID"
echo ""

# 6. Kröller-Müller Museum - Photography
echo "🚀 Kröller-Müller Museum (Photography) 스크래퍼 시작 (백그라운드)..."
nohup node scrape-kroller-muller.cjs photography > ../downloads/kroller-muller-photography-console.log 2>&1 &
KROLLER_PHOTO_PID=$!
echo "  PID: $KROLLER_PHOTO_PID"
echo ""

# PID 저장
echo "$VANGOGH_PID" > ../downloads/dutch-museums-test.pids
echo "$MAURITSHUIS_PID" >> ../downloads/dutch-museums-test.pids
echo "$STEDELIJK_PID" >> ../downloads/dutch-museums-test.pids
echo "$KROLLER_PAINTINGS_PID" >> ../downloads/dutch-museums-test.pids
echo "$KROLLER_FILM_PID" >> ../downloads/dutch-museums-test.pids
echo "$KROLLER_PHOTO_PID" >> ../downloads/dutch-museums-test.pids

echo "═══════════════════════════════════════════════════════════════"
echo "  ✅ 모든 스크래퍼가 백그라운드에서 실행 중입니다"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "진행 상황 확인:"
echo "  - tail -f ../downloads/*-log.txt"
echo "  - tail -f ../downloads/*-console.log"
echo ""
echo "프로세스 확인:"
echo "  - ps aux | grep scrape-"
echo ""
echo "프로세스 종료:"
echo "  - kill \$(cat ../downloads/dutch-museums-test.pids)"
echo ""
echo "PID 파일: ../downloads/dutch-museums-test.pids"
