const fs = require('fs');

const V5_LOG = '/tmp/r2-france-germany.log';

function extractStatus(logPath) {
    if (!fs.existsSync(logPath)) return { currentFile: '[Not Started]', progressStr: '', success: 0, fail: 0, lastFinished: '' };
    try {
        const content = fs.readFileSync(logPath, 'utf8');
        const lines = content.split(/[\r\n]+/).filter(l => l.trim().length > 0);

        let currentFile = 'Scanning...';
        let progressStr = '';
        let success = 0;
        let fail = 0;
        let lastFinished = '';

        for (const line of lines) {
            if (line.includes('Finished ')) {
                const m = line.match(/Finished (.*\.json)/);
                if (m) lastFinished = m[1];
            }
            if (line.includes('Loading ')) {
                const m = line.match(/Loading (.*\.json)/);
                if (m) currentFile = m[1];
            }
            if (line.includes('Progress:')) {
                const parts = line.split('|');
                for (const p of parts) {
                    if (p.includes('Progress:')) progressStr = p.replace('Progress:', '').trim();
                    else if (p.includes('Success:')) success = parseInt(p.replace('Success:', '').trim()) || 0;
                    else if (p.includes('Fail:')) fail = parseInt(p.replace('Fail:', '').trim()) || 0;
                }
            }
        }

        return { currentFile, progressStr, success, fail, lastFinished };
    } catch (e) {
        return { currentFile: '[Error Reading Log]', progressStr: '', success: 0, fail: 0, lastFinished: '' };
    }
}

function getTotalCompleted(logPath) {
    if (!fs.existsSync(logPath)) return 0;
    const content = fs.readFileSync(logPath, 'utf8');
    const matches = content.match(/Finished .*\.json/g);
    return matches ? matches.length : 0;
}

function clearConsole() {
    process.stdout.write('\x1b[2J\x1b[0f');
}

function render() {
    clearConsole();
    console.log('========================================================================');
    console.log('🚀 R2 CLOUD IMAGE MIGRATION - ACTIVE DASHBOARD 🚀');
    console.log('========================================================================\n');

    // --- V5 (France & Germany Retries) ---
    const TOTAL_V5 = 7;
    const v5Status = extractStatus(V5_LOG);
    const v5Completed = getTotalCompleted(V5_LOG);

    console.log(`[프랑스 & 독일 (V5) 마이그레이션 진행사항]: ${v5Completed} / ${TOTAL_V5} 미술관 완료 (${Math.round((v5Completed / TOTAL_V5) * 100) || 0}%)`);
    console.log(`▶ 현재 작업중인 파일: ${v5Status.currentFile}`);
    if (v5Status.progressStr) {
        console.log(`  목표: ${v5Status.progressStr.split('/')[1]} | 진행: ${v5Status.progressStr} | 성공: ${v5Status.success} | 실패: ${v5Status.fail}`);
    } else {
        console.log(`  이미지 누락 검사 및 R2 스토리지 연결 중...`);
    }
    if (v5Status.lastFinished) console.log(`  최근 완료 항목: ✔ ${v5Status.lastFinished}`);
    console.log('\n------------------------------------------------------------------------\n');

    console.log('========================================================================');

    if (process.argv.includes('--once')) {
        console.log('(Ran once)');
        process.exit(0);
    } else {
        console.log('(대시보드를 종료하려면 Ctrl+C 를 누르세요. 백그라운드 업로드는 계속 진행됩니다.)');
        console.log(`Last updated: ${new Date().toLocaleTimeString()}`);
    }
}

if (!process.argv.includes('--once')) {
    setInterval(render, 2000);
}
render();
