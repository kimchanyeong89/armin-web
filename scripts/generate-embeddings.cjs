/**
 * 시맨틱 검색을 위한 이미지 임베딩 생성 스크립트 (Jina AI CLIP v2)
 * 
 * 사용법: node scripts/generate-embeddings.cjs
 */

const fs = require('fs');
const path = require('path');

const WORKER_URL = 'https://armin-semantic-search.armin-art.workers.dev';
const BATCH_SIZE = 5; // 안전하게 5개씩 (Jina API에 한 번에 보낼 이미지 수)
const DELAY_MS = 2000; // 배치 간 대기 시간 (rate limiting 방지)

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendBatch(images) {
    const response = await fetch(`${WORKER_URL}/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images }),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Worker error: ${response.status} - ${text}`);
    }

    return response.json();
}

async function main() {
    console.log('🎨 시맨틱 검색 임베딩 생성 (Jina AI CLIP v2)');
    console.log('==========================================\n');

    // 검색 매니페스트 읽기
    const manifestPath = path.join(__dirname, '../public/data/search-manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    console.log(`📊 총 작품 수: ${manifest.c.toLocaleString()}`);
    console.log(`📦 청크 수: ${manifest.chunks.length}\n`);

    // 진행 상황 저장/복원
    const progressPath = path.join(__dirname, '../.embedding-progress.json');
    let progress = { processedChunks: [], processedCount: 0, failedCount: 0, lastIndex: 0 };

    if (fs.existsSync(progressPath)) {
        progress = JSON.parse(fs.readFileSync(progressPath, 'utf-8'));
        console.log(`📌 이전 진행 상황 복원: ${progress.processedCount.toLocaleString()}개 처리됨\n`);
    }

    const totalStats = { success: 0, failed: 0, errors: [] };

    for (let chunkIdx = 0; chunkIdx < manifest.chunks.length; chunkIdx++) {
        const chunkFile = manifest.chunks[chunkIdx];

        if (progress.processedChunks.includes(chunkFile)) {
            console.log(`⏭️  ${chunkFile} - 이미 처리됨, 건너뜀`);
            continue;
        }

        console.log(`\n📖 ${chunkFile} 처리 중...`);

        const chunkPath = path.join(__dirname, '../public/data', chunkFile);
        const chunkData = JSON.parse(fs.readFileSync(chunkPath, 'utf-8'));

        // 플랫 배열로 변환
        const artworks = Array.isArray(chunkData[0]) ? chunkData.flat() : chunkData;
        console.log(`   ${artworks.length.toLocaleString()}개 작품`);

        // 이 청크에서 시작할 인덱스
        const startIdx = (progress.lastChunk === chunkFile && progress.lastIndex) ? progress.lastIndex : 0;

        // 배치로 처리
        for (let i = startIdx; i < artworks.length; i += BATCH_SIZE) {
            const batch = artworks.slice(i, i + BATCH_SIZE);

            // 이미지 데이터 준비
            const images = batch
                .filter(art => art.i) // 이미지 URL이 있는 것만
                .map(art => ({
                    id: art.id || `${art.e}-${art.n}`.replace(/[^a-zA-Z0-9-]/g, '_').substring(0, 64),
                    url: art.i,
                    name: art.n || '',
                    artist: art.a || '',
                    museum: art.m || '',
                }));

            if (images.length === 0) continue;

            try {
                const result = await sendBatch(images);
                totalStats.success += result.success;
                totalStats.failed += result.failed;

                if (result.errors && result.errors.length > 0) {
                    totalStats.errors.push(...result.errors);
                }

                // 진행률 표시
                const processed = i + batch.length;
                const percent = ((processed / artworks.length) * 100).toFixed(1);
                const globalProcessed = progress.processedCount + processed;
                const globalPercent = ((globalProcessed / manifest.c) * 100).toFixed(2);

                process.stdout.write(`\r   청크 진행: ${processed.toLocaleString()}/${artworks.length.toLocaleString()} (${percent}%) | 전체: ${globalProcessed.toLocaleString()}/${manifest.c.toLocaleString()} (${globalPercent}%) | 성공: ${totalStats.success}, 실패: ${totalStats.failed}`);

                // 진행 상황 저장 (10배치마다)
                if ((i / BATCH_SIZE) % 10 === 0) {
                    progress.lastChunk = chunkFile;
                    progress.lastIndex = i;
                    fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2));
                }

                await sleep(DELAY_MS);

            } catch (error) {
                console.error(`\n   ❌ 배치 오류: ${error.message}`);
                totalStats.failed += images.length;
                totalStats.errors.push(error.message);

                // 더 긴 대기 후 재시도
                await sleep(5000);
            }
        }

        // 청크 완료 표시
        console.log(`\n   ✅ ${chunkFile} 완료`);

        // 진행 상황 저장
        progress.processedChunks.push(chunkFile);
        progress.processedCount += artworks.length;
        progress.lastIndex = 0;
        fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2));
    }

    console.log('\n\n==========================================');
    console.log('🎉 임베딩 생성 완료!');
    console.log(`   ✅ 성공: ${totalStats.success.toLocaleString()}`);
    console.log(`   ❌ 실패: ${totalStats.failed.toLocaleString()}`);

    if (totalStats.errors.length > 0) {
        console.log(`\n📋 오류 목록 (처음 10개):`);
        totalStats.errors.slice(0, 10).forEach(e => console.log(`   - ${e}`));
    }

    // 완료 시 진행 파일 삭제
    if (totalStats.failed === 0) {
        fs.unlinkSync(progressPath);
        console.log('\n✨ 모든 작업 완료!');
    } else {
        console.log('\n⚠️  일부 실패가 있습니다. 스크립트를 다시 실행하면 실패한 것만 재처리합니다.');
    }
}

main().catch(console.error);
