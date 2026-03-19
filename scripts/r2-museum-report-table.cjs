const fs = require('fs');
const path = require('path');
const { exhibitions } = require('../src/data/exhibitions.js');

const DATA_DIR = path.join(__dirname, '../public/data');

const report = [];

let totalItemsOverall = 0;
let totalR2Overall = 0;
let totalMissingOverall = 0;

for (const ex of exhibitions) {
    const country = ex.country || 'Unknown';
    const museumName = ex.name;

    for (const key of ['permanentExhibitions', 'temporaryExhibitions', 'pastExhibitions']) {
        if (!ex[key]) continue;
        for (const show of ex[key]) {
            const exhibitionId = show.id;
            const filename = show.collectionFile || `${show.id}.json`;
            const filePath = path.join(DATA_DIR, filename);
            
            let itemsCount = 0;
            let r2Count = 0;

            if (fs.existsSync(filePath)) {
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
                        if (typeof obj === 'string' && (obj.includes('r2.dev') || obj.includes('r2.cloudflarestorage') || obj.includes('pub-08d4dcbf45444caebd2ce34f248bb0ec.r2.build'))) return true;
                        return false;
                    };

                    for (const item of dataArr) {
                        let isR2 = hasR2(item.image) || hasR2(item.imageUrl) || hasR2(item.thumbnail) || hasR2(item.representativeImage) || hasR2(item.imageLink) || hasR2(item.img) || hasR2(item.iiifUrl);
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

                } catch (e) {
                    console.warn('Could not parse ' + filename);
                }
            } else {
                itemsCount = 0;
            }

            totalItemsOverall += itemsCount;
            totalR2Overall += r2Count;
            totalMissingOverall += (itemsCount - r2Count);

            report.push({
                museum: museumName,
                country: country,
                id: exhibitionId,
                file: filename,
                itemsCount,
                r2Count,
                key: key // e.g. permanentExhibitions
            });
        }
    }
}

// Sort by Museum Name then by ID
report.sort((a, b) => a.museum.localeCompare(b.museum) || a.id.localeCompare(b.id));

let md = `# R2 마이그레이션 심층 현황 (Table Format)\n\n`;
md += `총 누적 수집 표기 수: **${totalItemsOverall.toLocaleString()}개**\n`;
md += `R2 스토리지 연결(변환) 개수: **${totalR2Overall.toLocaleString()}개** (변환율: ${((totalR2Overall/totalItemsOverall)*100).toFixed(1)}%)\n`;
md += `미변환 개수 (이미지 없음/대기중): **${totalMissingOverall.toLocaleString()}개**\n\n`;

md += `| 미술관 (Museum) | 국가 (Country) | 전시 ID / 파일명 | 모달 표시 (실제 아이템 수) | R2 저장 완료 수 | 상태 (Status) |\n`;
md += `|---|---|---|---|---|---|\n`;

for (const row of report) {
    let status = '❌ 수집/변환 안됨';
    if (row.itemsCount > 0 && row.r2Count >= row.itemsCount * 0.95) status = '✅ 정상/완료';
    else if (row.itemsCount > 0 && row.r2Count > 0) status = '🔄 진행중 / 부분완료';
    else if (row.itemsCount === 0) status = '⚠️ 파일/데이터없음';
    else if (row.itemsCount > 0 && row.r2Count === 0) status = '🟠 미변환/에러';

    const exhibitionType = row.key === 'permanentExhibitions' ? '영구' : '특별/과거';
    // Match exactly the nice look of the report-zero-items-fix.md:
    md += `| **${row.museum}** | ${row.country} | \`${row.id}\`<br>\`${row.file}\` | **${row.itemsCount.toLocaleString()}** | **${row.r2Count.toLocaleString()}** | ${status} |\n`;
}

fs.writeFileSync(path.join(__dirname, '../museum_r2_status_v4.md'), md);
console.log('Report generated successfully at museum_r2_status_v4.md');
