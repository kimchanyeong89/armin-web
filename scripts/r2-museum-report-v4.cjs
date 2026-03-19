const fs = require('fs');
const path = require('path');
const { exhibitions } = require('../src/data/exhibitions.js');

const DATA_DIR = path.join(__dirname, '../public/data');

const untouchedFiles = new Set();
let totalItems = 0;
let totalR2 = 0;
let totalMissingImgs = 0;

const headers = [
    "미술관 (Museum)", "국가 (Country)", "전시 ID", "매핑된 JSON 파일", "실제 아이템 수", "R2 저장 완료 수", "상태 (Status)"
];
const rows = [];

for (const ex of exhibitions) {
    const continent = ex.country || 'Unknown';
    const mname = ex.name;

    for (const key of ['permanentExhibitions', 'temporaryExhibitions', 'pastExhibitions']) {
        if (!ex[key] || ex[key].length === 0) continue;

        for (const show of ex[key]) {
            const filename = show.collectionFile || `${show.id}.json`;
            const filePath = path.join(DATA_DIR, filename);
            let itemsCount = 0;
            let r2Count = 0;
            let noImgCount = 0;
            let status = '❌ 수집안됨 (파일없음)';

            if (fs.existsSync(filePath)) {
                try {
                    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
                    let dataArr = [];
                    if (Array.isArray(data)) dataArr = data;
                    else if (data.items) dataArr = data.items;
                    else if (data.objects) dataArr = data.objects;
                    else if (data.artworks) dataArr = data.artworks;
                    else if (data.rooms) dataArr = data.rooms.flatMap(room => room.artworks || room.items || []);
                    else if (data.data) dataArr = Array.isArray(data.data) ? data.data : [];

                    itemsCount = dataArr.length;

                    const hasR2 = (obj) => {
                        if (!obj) return false;
                        if (typeof obj === 'string' && (obj.includes('r2.dev') || obj.includes('r2.cloudflarestorage'))) return true;
                        // For relative URLs or known placeholders, we assume they are "migrated" or skipped correctly
                        if (typeof obj === 'string' && (obj.includes('placeholder') || obj.startsWith('/themes/') || !obj.startsWith('http'))) return true;
                        return false;
                    };

                    const hasImage = (item) => {
                        if (item.image || item.imageUrl || item.thumbnail || item.representativeImage || item.imgUrl || item.img || item.iiifUrl) return true;
                        if (item.primaryImage && typeof item.primaryImage === 'object') return true;
                        if (item.images && Array.isArray(item.images) && item.images.length > 0) return true;
                        return false;
                    }

                    for (const item of dataArr) {
                        let isR2 = hasR2(item.image) || hasR2(item.imageUrl) || hasR2(item.thumbnail) || hasR2(item.representativeImage);
                        if (!isR2 && item.primaryImage && typeof item.primaryImage === 'object') {
                            isR2 = hasR2(item.primaryImage.iiifFull) || hasR2(item.primaryImage.iiifThumbUrl) || hasR2(item.primaryImage.image);
                        }
                        if (!isR2 && item.images && Array.isArray(item.images) && item.images.length > 0) {
                            let checkImg = item.images[0];
                            isR2 = hasR2(checkImg.url) || hasR2(checkImg.iiifurl) || hasR2(checkImg.iiifthumburl) || hasR2(checkImg.image);
                        }

                        if (isR2) {
                            r2Count++;
                        } else if (!hasImage(item)) {
                            noImgCount++;
                        }
                    }

                    if (itemsCount > 0 && (r2Count + noImgCount) >= itemsCount * 0.95) status = '✅ 완료(정상표시)';
                    else if (r2Count > 0) status = '🔄 잔여/부분완료';
                    else if (itemsCount === 0) status = '➖ 없음';
                    else if (itemsCount > 0 && r2Count === 0) status = '🟠 변환 안됨 (R2=0)';

                    if (status !== '✅ 완료' && status !== '➖ 없음') {
                        if (itemsCount > noImgCount && r2Count < itemsCount) {
                            untouchedFiles.add(filename);
                        }
                    }

                } catch (e) {
                    status = '💀 파싱 에러 (JSON 손상 또는 메모리)';
                    console.error("Parse Error: ", filename, e.message);
                }
            } else {
                untouchedFiles.add(filename);
            }

            const statusStr = status === '✅ 완료' ? '✅ 완료(정상표시)' : (status === '➖ 없음' ? '⚠️ 파일/데이터없음' : status);

            rows.push([
                `**${mname}**`,
                continent,
                `\`${show.id}\``,
                `\`${filename}\``,
                `**${itemsCount.toLocaleString()}**`,
                `**${r2Count.toLocaleString()}**`,
                statusStr
            ]);

            totalItems += itemsCount;
            totalR2 += r2Count;
            totalMissingImgs += noImgCount;
        }
    }
}

rows.sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]));

let md = `# R2 마이그레이션 현황 대시보드 V4 (완전판)\n\n`;
md += `> 디테일 패널에 등록된 **모든 미술관명 및 영구/기획/과거 전시 파일명** 기준 누락 없이 전수조사된 내역입니다.\n\n`;

md += `| 미술관 (Museum) | 국가 (Country) | 전시 ID | 매핑된 JSON 파일 | 실제 아이템 수 | R2 저장 완료 수 | 상태 (Status) |\n`;
md += `|---|---|---|---|---:|---:|---|\n`;

let csv = `Museum,Country,Exhibition ID,JSON File,Items Count,R2 Ready Count,Status\n`;

for (const row of rows) {
    // Write out Markdown
    md += `| ${row[0]} | ${row[1]} | ${row[2]} | ${row[3]} | ${row[4]} | ${row[5]} | ${row[6]} |\n`;

    // Clean strings for CSV (remove markdown formatting like **, backticks)
    const cleanMuseum = row[0].replace(/\*\*/g, '').replace(/`/g, '');
    const cleanCountry = row[1];
    const cleanId = row[2].replace(/`/g, '');
    const cleanFile = row[3].replace(/`/g, '');
    const cleanItems = row[4].replace(/\*\*/g, '').replace(/,/g, '');
    const cleanR2 = row[5].replace(/\*\*/g, '').replace(/,/g, '');
    const cleanStatus = row[6].replace(/,/g, '');

    csv += `"${cleanMuseum}","${cleanCountry}","${cleanId}","${cleanFile}",${cleanItems},${cleanR2},"${cleanStatus}"\n`;
}

md += `\n**📊 전체 집계 요약:** \n- 대상 수집 작품 수: **${totalItems.toLocaleString()}** 개\n- R2 이관 완료: **${totalR2.toLocaleString()}** 개\n- 원본 이미지 없음: **${totalMissingImgs.toLocaleString()}** 개\n`;

const outPath = path.join(__dirname, '../museum_r2_status_v4.md');
fs.writeFileSync(outPath, md);
fs.writeFileSync(path.join(__dirname, '../museum_r2_status_v4.csv'), csv);
console.log(`Report generated successfully at museum_r2_status_v4.md and museum_r2_status_v4.csv\n`);

const v4Targets = Array.from(untouchedFiles);
console.log(`Found ${v4Targets.length} incomplete files for V4 migration.`);
fs.writeFileSync(path.join(__dirname, 'v4-targets.json'), JSON.stringify(v4Targets, null, 2));
