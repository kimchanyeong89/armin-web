const fs = require('fs');
const path = require('path');
const { exhibitions } = require('../src/data/exhibitions.js');

const DATA_DIR = path.join(__dirname, '../public/data');

const report = [];

let totalItemsOverall = 0;
let totalR2Overall = 0;

for (const ex of exhibitions) {
    const continent = ex.country || 'Unknown';
    const filesInExh = new Set();

    // gather files
    for (const key of ['permanentExhibitions', 'temporaryExhibitions', 'pastExhibitions']) {
        if (!ex[key]) continue;
        for (const show of ex[key]) {
            const filename = show.collectionFile || `${show.id}.json`;
            const filePath = path.join(DATA_DIR, filename);
            if (fs.existsSync(filePath)) {
                filesInExh.add(filename);
            }
        }
    }

    if (filesInExh.size === 0) continue;

    for (const filename of filesInExh) {
        const filePath = path.join(DATA_DIR, filename);
        let itemsCount = 0;
        let r2Count = 0;

        try {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            let dataArr = [];
            if (Array.isArray(data)) dataArr = data;
            else if (data.items) dataArr = data.items;
            else if (data.objects) dataArr = data.objects;
            else if (data.artworks) dataArr = data.artworks;
            else if (data.rooms) dataArr = data.rooms.flatMap(room => room.artworks || room.items || []);

            itemsCount = dataArr.length;

            const hasR2 = (obj) => {
                if (!obj) return false;
                if (typeof obj === 'string' && obj.includes('r2.dev')) return true;
                if (typeof obj === 'string' && obj.includes('r2.cloudflarestorage')) return true;
                return false;
            };

            for (const item of dataArr) {
                // check keys according to migrate-all-images-to-r2
                let isR2 = hasR2(item.image) || hasR2(item.imageUrl) || hasR2(item.thumbnail) || hasR2(item.representativeImage);
                if (!isR2 && item.primaryImage && typeof item.primaryImage === 'object') {
                    isR2 = hasR2(item.primaryImage.iiifFull) || hasR2(item.primaryImage.iiifThumbUrl);
                }
                if (!isR2 && item.images && Array.isArray(item.images) && item.images.length > 0) {
                    let checkImg = item.images[0];
                    isR2 = hasR2(checkImg.url) || hasR2(checkImg.iiifurl) || hasR2(checkImg.iiifthumburl) || hasR2(checkImg.image);
                }

                if (isR2) {
                    r2Count++;
                }
            }

        } catch (e) { console.warn('Could not parse ' + filename); }

        totalItemsOverall += itemsCount;
        totalR2Overall += r2Count;

        report.push({
            continent: ex.country || 'Unknown',
            museum: ex.name,
            file: filename,
            itemsCount,
            r2Count
        });
    }
}

// Generate MD
report.sort((a, b) => a.continent.localeCompare(b.continent) || a.museum.localeCompare(b.museum));

let md = `# R2 마이그레이션 현황 대시보드\n\n`;
md += `총 누적 작품 표기 수: **${totalItemsOverall.toLocaleString()}개**\n`;
md += `R2 스토리지 연결(변환) 개수 (추정치): **${totalR2Overall.toLocaleString()}개**\n\n`;
md += `> **안내:** 상태가 \`❌ 대기/에러\`인 항목들은 이미지 링크 형식의 예외나 파싱 오류로 인해 마이그레이션에서 누락되었거나 대기중인 콜렉션들입니다. 이 목록에 따라 V1/V2 재처리가 시급히 들어갑니다.\n\n`;
md += `| 국가 | 미술관 | 전시 데이터 파일 | 전체 작품 수 | R2 적용 된 이미지 수 | 상태 |\n`;
md += `|-----|----------|----------------|-------------:|------------------:|-----|\n`;

for (const row of report) {
    let status = '❌ 대기/에러';
    // Use 95% as complete because some items have no images at all (e.g. books/coins without image URLs)
    if (row.itemsCount > 0 && row.r2Count >= row.itemsCount * 0.95) status = '✅ 완료';
    else if (row.r2Count > 0) status = '🔄 진행중 / 부분완료';
    else if (row.itemsCount === 0) status = '➖ 없음';
    else if (row.itemsCount > 0 && row.r2Count === 0) status = '❌ 대기/에러';

    md += `| ${row.continent} | ${row.museum} | \`${row.file}\` | ${row.itemsCount.toLocaleString()} | ${row.r2Count.toLocaleString()} | ${status} |\n`;
}

fs.writeFileSync('/Users/kietzsche/.gemini/antigravity/brain/45492c53-b0c8-489d-b42b-6de2d097c7f7/museum_r2_status.md', md);
console.log('Report generated successfully at artifacts/museum_r2_status.md');
