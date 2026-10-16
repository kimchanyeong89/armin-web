#!/bin/zsh
# 주간 전시 알림 — launchd(~/Library/LaunchAgents/com.kietzsche.colly-push.plist)가 매시 10분에 부른다.
# 이번 주 주간 전시(weekly_curations/{주차})가 공개돼 있고 아직 안 보냈으면 한 번 보낸다. 보낸 주차는
# Firestore config/push_log 에 적혀, 매시간 돌아도 한 주에 한 번만 간다. 월요일 07:00 에 주차가 넘어가면
# 다음 실행(07:10)에 나가고, 주중에 그 주 전시를 확정하면 한 시간 안에 나간다.
set -u
cd "$(dirname "$0")/../.." || exit 1
DIR="scripts/push/.log"
mkdir -p "$DIR"
[[ -f "$DIR/.gitignore" ]] || print '*' > "$DIR/.gitignore"
# launchd는 로그인 셸을 거치지 않아 nvm이 없다. 설치된 node 중 최신을 잡는다(scripts/exhibitions/daily.sh 와 같다).
NVM_BIN=$(print -r -- $HOME/.nvm/versions/node/*/bin(N/om[1]))
export PATH="${NVM_BIN:+$NVM_BIN:}/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
print -r -- "$(date '+%Y-%m-%d %H:%M:%S') $(npx tsx scripts/push/send.ts weekly --send 2>&1 | grep -v -E 'punycode|trace-deprecation' | tr '\n' ' ')" >> "$DIR/weekly.log"
