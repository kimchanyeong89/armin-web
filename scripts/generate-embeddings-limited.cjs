/**
 * 시맨틱 검색을 위한 이미지 임베딩 생성 (제한된 버전 - 10만개)
 * 
 * 사용법: node scripts/generate-embeddings-limited.cjs
 */

const fs = require('fs');
const path = require('path');

const WORKER_URL = 'https://armin-semantic-search.armin-art.workers.dev';
const BATCH_SIZE = 3; // 더 작은 배치
const DELAY_MS = 3000; // 3초 대기
const MAX_IMAGES = 100000; // 10만개 제한

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendBatch(images, retries = 3) {
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
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
        } catch (error) {
            if (attempt === retries - 1) throw error;
            await sleep(3000 * (attempt + 1));
        }
    }
}

async function main() {
    console.log('🎨 시맨틱 검색 임베딩 생성 (10만개 제한)');
    console.log('==========================================\n');

    const manifestPath = path.join(__dirname, '../public/data/search-manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    console.log(`📊 총 작품 수: ${manifest.c.toLocaleString()}`);
    console.log(`🎯 처리 제한: ${MAX_IMAGES.toLocaleString()}개\n`);

    const progressPath = path.join(__dirname, '../.embedding-progress-limited.json');
    let progress = { processedCount: 0, lastChunkIdx: 0, lastItemIdx: 0 };

    if (fs.existsSync(progressPath)) {
        progress = JSON.parse(fs.readFileSync(progressPath, 'utf-8'));
        console.log(`📌 이전 진행 복원: ${progress.processedCount.toLocaleString()}개\n`);
    }

    let totalSuccess = 0;
    let totalFailed = 0;

    for (let chunkIdx = progress.lastChunkIdx; chunkIdx < manifest.chunks.length; chunkIdx++) {
        if (progress.processedCount >= MAX_IMAGES) break;

        const chunkFile = manifest.chunks[chunkIdx];
        console.log(`\n📖 ${chunkFile} 처리 중...`);

        const chunkPath = path.join(__dirname, '../public/data', chunkFile);
        const chunkData = JSON.parse(fs.readFileSync(chunkPath, 'utf-8'));
        const artworks = Array.isArray(chunkData[0]) ? chunkData.flat() : chunkData;

        const startIdx = (chunkIdx === progress.lastChunkIdx) ? progress.lastItemIdx : 0;

        for (let i = startIdx; i < artworks.length; i += BATCH_SIZE) {
            if (progress.processedCount >= MAX_IMAGES) {
                console.log(`\n🎯 ${MAX_IMAGES.toLocaleString()}개 제한 도달!`);
                break;
            }

            const batch = artworks.slice(i, i + BATCH_SIZE);
            const images = batch
                .filter(art => art.i)
                .map(art => ({
                    id: art.id || `${art.e}-${i}`,
                    url: art.i,
                    name: art.n || '',
                    artist: art.a || '',
                    museum: art.m || '',
                }));

            if (images.length === 0) continue;

            try {
                const result = await sendBatch(images);
                totalSuccess += result.success;
                totalFailed += result.failed;
                progress.processedCount += result.success;

                const percent = ((progress.processedCount / MAX_IMAGES) * 100).toFixed(1);
                process.stdout.write(`\r   진행: ${progress.processedCount.toLocaleString()}/${MAX_IMAGES.toLocaleString()} (${percent}%) | 성공: ${totalSuccess}, 실패: ${totalFailed}`);

                // 진행 저장
                progress.lastChunkIdx = chunkIdx;
                progress.lastItemIdx = i + BATCH_SIZE;
                fs.writeFileSync(progressPath, JSON.stringify(progress));

                await sleep(DELAY_MS);
            } catch (error) {
                console.error(`\n   ❌ 오류: ${error.message}`);
                totalFailed += images.length;
                await sleep(5000);
            }
        }

        // 청크 완료
        if (progress.processedCount < MAX_IMAGES) {
            progress.lastItemIdx = 0;
        }
    }

    console.log('\n\n==========================================');
    console.log('🎉 완료!');
    console.log(`   ✅ 성공: ${totalSuccess.toLocaleString()}`);
    console.log(`   ❌ 실패: ${totalFailed.toLocaleString()}`);
    console.log(`   📊 총 처리: ${progress.processedCount.toLocaleString()}개`);
}

main().catch(console.error);
