/**
 * MAD Paris JSON 데이터 작가/날짜 필드 수정 스크립트
 * 기존 데이터에서 artist와 date가 섞인 문제 해결
 */

const fs = require('fs');
const path = require('path');

const INPUT_PATH = path.join(__dirname, '..', 'public', 'data', 'mad-paris-collection.json');
const OUTPUT_PATH = INPUT_PATH; // 덮어쓰기

// 작가 패턴: 괄호 안에 연도(1700-1800) 또는 역할이 있음
const artistPattern = /\(\d{4}[-–]\d{4}\)|\(.*(?:bronzier|fabricant|céramiste|orfèvre|ébéniste|sculpteur|peintre|potier|designer|verrier|horloger|architecte|dessinateur|graveur|tapissier|menuisier|fondeur|ciseleur|manufacturier|joaillier|brodeur|armurier|bijoutier|couturier|modéliste|styliste|manufacture|faïencerie|atelier|maison)\)/i;

// 날짜 패턴
const datePattern = /^\d{4}|^\w+e siècle|^vers\s+\d{4}/i;

function fixArtistDate(obj) {
    const origArtist = obj.artist || '';
    const origDate = obj.date || '';
    
    let newArtist = '';
    let newDate = '';
    
    // 1. 만약 date에 작가 패턴이 있으면, artist와 date를 스왑
    if (artistPattern.test(origDate) && !artistPattern.test(origArtist)) {
        newArtist = origDate;
        newDate = origArtist;
    } 
    // 2. 만약 artist에 날짜 패턴만 있으면 (작가 패턴 없음), 스왑
    else if (datePattern.test(origArtist) && !artistPattern.test(origArtist) && artistPattern.test(origDate)) {
        newArtist = origDate;
        newDate = origArtist;
    }
    // 3. 둘 다 정상이면 그대로
    else {
        newArtist = origArtist;
        newDate = origDate;
    }
    
    return {
        ...obj,
        artist: newArtist,
        date: newDate
    };
}

// 메인
const data = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf8'));

let fixed = 0;
const newObjects = data.objects.map((obj, idx) => {
    const result = fixArtistDate(obj);
    if (result.artist !== obj.artist || result.date !== obj.date) {
        fixed++;
        if (fixed <= 10) {
            console.log(`[${idx + 1}] 수정:`);
            console.log(`  제목: ${obj.title}`);
            console.log(`  원본: artist="${obj.artist}", date="${obj.date}"`);
            console.log(`  수정: artist="${result.artist}", date="${result.date}"`);
        }
    }
    return result;
});

data.objects = newObjects;
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(data, null, 2));

console.log(`\n총 ${fixed}개 수정됨 (전체 ${data.objects.length}개)`);
console.log(`저장: ${OUTPUT_PATH}`);
