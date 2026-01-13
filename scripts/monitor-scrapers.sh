#!/bin/bash

# 스크래퍼 실시간 모니터링 스크립트

cd "$(dirname "$0")/.."

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║          스크래퍼 실시간 수집 현황 모니터링                  ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
echo "업데이트 간격: 5초"
echo "종료: Ctrl+C"
echo ""

# 색상 정의
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

while true; do
  # 화면 지우기
  clear
  
  echo "╔═══════════════════════════════════════════════════════════════╗"
  echo "║          스크래퍼 실시간 수집 현황 모니터링                  ║"
  echo "╚═══════════════════════════════════════════════════════════════╝"
  echo ""
  
  # Van Gogh Museum - progress 파일 우선 확인
  vangogh_progress=$(jq '.artworks | length' downloads/vangogh-museum-progress.json 2>/dev/null || echo "0")
  vangogh_log_count=$(tail -3 downloads/vangogh-console.log 2>/dev/null | grep -oE '\[[0-9]+/[0-9]+\]' | tail -1 | grep -oE '[0-9]+' | head -1 || echo "")
  vangogh_count=$vangogh_progress
  if [ -n "$vangogh_log_count" ] && [ "$vangogh_log_count" -gt "$vangogh_progress" ] 2>/dev/null; then
    vangogh_count=$vangogh_log_count
  fi
  vangogh_running=$(ps aux | grep "scrape-vangogh" | grep -v grep | wc -l | tr -d ' ')
  vangogh_status="${GREEN}실행중${NC}"
  if [ "$vangogh_running" = "0" ]; then
    vangogh_status="${RED}중지됨${NC}"
    # 중지됨이면 최종 파일 확인
    vangogh_count=$(jq '.items | length' public/data/vangogh-museum-collection.json 2>/dev/null || echo "0")
  fi
  printf "${BLUE}Van Gogh Museum:${NC}        %4s개  [%s]\n" "$vangogh_count" "$vangogh_status"
  
  # Mauritshuis - progress 파일 우선 확인
  mauritshuis_progress=$(jq '.artworks | length' downloads/mauritshuis-progress.json 2>/dev/null || echo "0")
  mauritshuis_count=$mauritshuis_progress
  mauritshuis_running=$(ps aux | grep "scrape-mauritshuis" | grep -v grep | wc -l | tr -d ' ')
  mauritshuis_status="${GREEN}실행중${NC}"
  if [ "$mauritshuis_running" = "0" ]; then
    mauritshuis_status="${RED}중지됨${NC}"
    mauritshuis_count=$(jq '.items | length' public/data/mauritshuis-collection.json 2>/dev/null || echo "0")
  fi
  printf "${BLUE}Mauritshuis:${NC}            %4s개  [%s]\n" "$mauritshuis_count" "$mauritshuis_status"
  
  # Stedelijk - progress 파일 우선 확인
  stedelijk_progress=$(jq '.artworks | length' downloads/stedelijk-progress.json 2>/dev/null || echo "0")
  stedelijk_count=$stedelijk_progress
  stedelijk_running=$(ps aux | grep "scrape-stedelijk" | grep -v grep | wc -l | tr -d ' ')
  stedelijk_status="${GREEN}실행중${NC}"
  if [ "$stedelijk_running" = "0" ]; then
    stedelijk_status="${RED}중지됨${NC}"
    stedelijk_count=$(jq '.items | length' public/data/stedelijk-collection.json 2>/dev/null || echo "0")
  fi
  printf "${BLUE}Stedelijk Museum:${NC}       %4s개  [%s]\n" "$stedelijk_count" "$stedelijk_status"
  
  echo ""
  echo "─────────────────────────────────────────────────────────────"
  echo ""
  
  # Kröller-Müller Paintings - progress 파일 우선 확인
  kroller_paintings_progress=$(jq '.artworks | length' downloads/kroller-muller-paintings-progress.json 2>/dev/null || echo "0")
  kroller_paintings_log_count=$(tail -3 downloads/kroller-paintings-console.log 2>/dev/null | grep -oE '\[[0-9]+/[0-9]+\]' | tail -1 | grep -oE '[0-9]+' | head -1 || echo "")
  kroller_paintings_count=$kroller_paintings_progress
  if [ -n "$kroller_paintings_log_count" ] && [ "$kroller_paintings_log_count" -gt "$kroller_paintings_progress" ] 2>/dev/null; then
    kroller_paintings_count=$kroller_paintings_log_count
  fi
  kroller_paintings_running=$(ps aux | grep "scrape-kroller-muller.cjs paintings" | grep -v grep | wc -l | tr -d ' ')
  kroller_paintings_status="${GREEN}실행중${NC}"
  if [ "$kroller_paintings_running" = "0" ]; then
    kroller_paintings_status="${RED}중지됨${NC}"
    kroller_paintings_count=$(jq '.items | length' public/data/kroller-muller-paintings.json 2>/dev/null || echo "0")
  fi
  printf "${BLUE}Kröller-Müller Paintings:${NC} %4s개  [%s]\n" "$kroller_paintings_count" "$kroller_paintings_status"
  
  # Kröller-Müller Film/Video - progress 파일 우선 확인
  kroller_film_progress=$(jq '.artworks | length' downloads/kroller-muller-film-video-progress.json 2>/dev/null || echo "0")
  kroller_film_log_count=$(tail -3 downloads/kroller-film-console.log 2>/dev/null | grep -oE '\[[0-9]+/[0-9]+\]' | tail -1 | grep -oE '[0-9]+' | head -1 || echo "")
  kroller_film_count=$kroller_film_progress
  if [ -n "$kroller_film_log_count" ] && [ "$kroller_film_log_count" -gt "$kroller_film_progress" ] 2>/dev/null; then
    kroller_film_count=$kroller_film_log_count
  fi
  kroller_film_running=$(ps aux | grep "scrape-kroller-muller.cjs film" | grep -v grep | wc -l | tr -d ' ')
  kroller_film_status="${GREEN}실행중${NC}"
  if [ "$kroller_film_running" = "0" ]; then
    kroller_film_status="${RED}중지됨${NC}"
    kroller_film_count=$(jq '.items | length' public/data/kroller-muller-film-video.json 2>/dev/null || echo "0")
  fi
  printf "${BLUE}Kröller-Müller Film/Video:${NC} %4s개  [%s]\n" "$kroller_film_count" "$kroller_film_status"
  
  # Kröller-Müller Photography - progress 파일 우선 확인
  kroller_photo_progress=$(jq '.artworks | length' downloads/kroller-muller-photography-progress.json 2>/dev/null || echo "0")
  kroller_photo_log_count=$(tail -3 downloads/kroller-photography-console.log 2>/dev/null | grep -oE '\[[0-9]+/[0-9]+\]' | tail -1 | grep -oE '[0-9]+' | head -1 || echo "")
  kroller_photo_count=$kroller_photo_progress
  if [ -n "$kroller_photo_log_count" ] && [ "$kroller_photo_log_count" -gt "$kroller_photo_progress" ] 2>/dev/null; then
    kroller_photo_count=$kroller_photo_log_count
  fi
  kroller_photo_running=$(ps aux | grep "scrape-kroller-muller.cjs photography" | grep -v grep | wc -l | tr -d ' ')
  kroller_photo_status="${GREEN}실행중${NC}"
  if [ "$kroller_photo_running" = "0" ]; then
    kroller_photo_status="${RED}중지됨${NC}"
    kroller_photo_count=$(jq '.items | length' public/data/kroller-muller-photography.json 2>/dev/null || echo "0")
  fi
  printf "${BLUE}Kröller-Müller Photography:${NC} %4s개  [%s]\n" "$kroller_photo_count" "$kroller_photo_status"
  
  echo ""
  echo "─────────────────────────────────────────────────────────────"
  echo ""
  
  # 총합
  total=$((vangogh_count + mauritshuis_count + stedelijk_count + kroller_paintings_count + kroller_film_count + kroller_photo_count))
  printf "${YELLOW}총 수집 작품:${NC}            %4s개\n" "$total"
  
  # 실행 중인 스크래퍼 수
  running_count=$(ps aux | grep "scrape-" | grep -v grep | wc -l | tr -d ' ')
  printf "${YELLOW}실행 중인 스크래퍼:${NC}      %4s개\n" "$running_count"
  
  echo ""
  echo "마지막 업데이트: $(date '+%Y-%m-%d %H:%M:%S')"
  echo ""
  echo "종료: Ctrl+C"
  
  sleep 5
done
