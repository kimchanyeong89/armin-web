#!/bin/zsh
# 매일 아침 수도권 미술관 전시 동기화 → 앱이 읽는 전시 목록 올리기 → 취향 데이터 다시 만들기.
# launchd(~/Library/LaunchAgents/com.kietzsche.colly-exhibitions.plist)가 하루 네 번 부르고,
# 그날 한 번 성공하면 나머지는 건너뛴다. 맥이 꺼져 있던 날은 켜진 뒤 첫 차례에 따라잡는다.
#
# 끝난 전시는 여기서 따로 다루지 않는다 — 앱이 날짜를 보고 지난 전시로 옮긴다(src/data/liveExhibitions.ts).
# 기록: scripts/exhibitions/.daily/daily.log, 날마다의 요약: .daily/YYYY-MM-DD.md
set -u
cd "$(dirname "$0")/../.." || exit 1
DIR="scripts/exhibitions/.daily"
mkdir -p "$DIR"
[[ -f "$DIR/.gitignore" ]] || print '*' > "$DIR/.gitignore"
LOG="$DIR/daily.log"
LOCK="$DIR/.lock"
STAMP="$DIR/.stamp"

log() { print -r -- "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG" }

# 락: 살아있는 프로세스가 잡고 있으면 물러난다.
if [[ -f $LOCK ]] && kill -0 "$(cat $LOCK)" 2>/dev/null; then
  log "SKIP 이미 실행 중 (pid $(cat $LOCK))"; exit 0
fi
echo $$ > "$LOCK"
trap 'rm -f "$LOCK"' EXIT

TODAY=$(date '+%Y-%m-%d')
[[ -f $STAMP && "$(cat $STAMP)" == "$TODAY" ]] && { log "SKIP 오늘 이미 갱신됨"; exit 0 }

# launchd는 로그인 셸을 거치지 않아 nvm이 없다. 설치된 node 중 최신을 잡는다.
NVM_BIN=$(print -r -- $HOME/.nvm/versions/node/*/bin(N/om[1]))
export PATH="${NVM_BIN:+$NVM_BIN:}/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
command -v node >/dev/null || { log "FAIL node 없음 (PATH=$PATH)"; exit 1 }
log "START (node $(node -v))"

# 막 깨어난 맥은 네트워크가 늦게 붙는다. 최대 5분 기다리고, 안 되면 도장 없이 끝낸다(다음 차례가 다시 한다).
for i in {1..30}; do
  [[ "$(curl -s -o /dev/null -m 8 -w '%{http_code}' https://www.mmca.go.kr/)" != "000" ]] && break
  (( i == 30 )) && { log "FAIL 네트워크 없음"; exit 1 }
  sleep 10
done

# 병합 로직이 깨진 채로 돌면 데이터 파일이 망가지므로 먼저 점검한다.
if ! node scripts/exhibitions/test.mjs >> "$LOG" 2>&1; then log "FAIL 파이프라인 점검(test.mjs)"; exit 1; fi

if ! node scripts/exhibitions/sync.mjs --summary "$DIR/$TODAY.md" >> "$LOG" 2>&1; then
  log "FAIL 전시 동기화(sync.mjs)"; exit 1
fi
log "OK 전시 동기화"

if ! node scripts/exhibitions/publish-live.mjs >> "$LOG" 2>&1; then
  log "FAIL 전시 목록 올리기(publish-live.mjs)"; exit 1
fi
log "OK 전시 목록 올림"
print -r -- "$TODAY" > "$STAMP"

# 취향 점수는 전시 목록과 따로 간다. 실패해도 목록은 이미 올라갔고, 어제 점수가 그대로 쓰인다.
if node scripts/taste/build-taste-data.mjs >> "$LOG" 2>&1; then
  log "OK 취향 데이터"
else
  log "WARN 취향 데이터 실패 — 어제 점수를 그대로 쓴다"
fi
log "DONE"
