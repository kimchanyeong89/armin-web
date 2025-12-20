/**
 * Hayward Gallery 전시 스크래핑 스크립트
 * Source: https://www.newexhibitions.com/archive?year=all&searchAll=hayward
 * 
 * 아카이브 규칙:
 * - 영구전시 제외, 기간전시(temporary)만 수집
 * - 모든 전시에 종료일이 있으므로 temporary로 분류
 */

const fs = require('fs');
const path = require('path');

// 페이지에서 추출한 Hayward Gallery 전시 데이터
// 주소가 "Hayward Gallery London SE1 8XX"인 것만 포함 (다른 갤러리 제외)
const rawExhibitions = [
  // 2025
  { id: "65720", title: "Yoshitomo Nara", endDate: "Aug 31, 2025" },
  { id: "66729", title: "Ghazaleh Avarzamani and Ali Ahadi: Freudian Typo", endDate: "Aug 31, 2025" },
  { id: "64916", title: "Linder: Danger Came Smiling", endDate: "May 5, 2025" },
  { id: "64917", title: "Mickalene Thomas: All About Love", endDate: "May 5, 2025" },
  { id: "64913", title: "Haegue Yang: Leap Year", endDate: "Jan 5, 2025" },
  { id: "64914", title: "Huang Po-Chih: Waves", endDate: "Jan 5, 2025" },
  
  // 2024
  { id: "64275", title: "Tavares Strachan: There Is Light Somewhere", endDate: "Sep 1, 2024" },
  { id: "62951", title: "The Life of Forms", endDate: "May 6, 2024" },
  { id: "62389", title: "Hiroshi Sugimoto", endDate: "Jan 7, 2024" },
  
  // 2023
  { id: "61497", title: "Dear Earth: Art and Hope in a Time of Crisis", endDate: "Sep 3, 2023" },
  { id: "60467", title: "Mike Nelson: Extinction Beckons", endDate: "May 7, 2023" },
  { id: "59920", title: "Strange Clay: Ceramics in Contemporary Art", endDate: "Jan 8, 2023" },
  
  // 2022
  { id: "60035", title: "Koestler Arts: Freedom", endDate: "Dec 18, 2022" },
  { id: "59323", title: "In the Black Fantastic", endDate: "Sep 18, 2022" },
  { id: "58472", title: "Louise Bourgeois: The Woven Child", endDate: "May 15, 2022" },
  { id: "59237", title: "Anthea Hamilton Commission", endDate: "Apr 24, 2022" },
  
  // 2021
  { id: "58251", title: "Mixing It Up: Painting Today", endDate: "Dec 12, 2021" },
  { id: "58252", title: "Gerhard Richter: Drawings, 1999 – 2021", endDate: "Dec 12, 2021" },
  { id: "57642", title: "Matthew Barney: Redoubt", endDate: "Jul 25, 2021" },
  { id: "57643", title: "Igshaan Adams: Kicking Dust", endDate: "Jul 25, 2021" },
  { id: "25037", title: "Winter Light", endDate: "Feb 28, 2021" },
  
  // 2020
  { id: "25038", title: "Among the trees", endDate: "Oct 31, 2020" },
  { id: "25039", title: "Among the Trees", endDate: "May 17, 2020" },
  { id: "25040", title: "Nevin Aladağ: Fanfare", endDate: "Apr 13, 2020" },
  { id: "25041", title: "Joo Yeon Park: Libation", endDate: "Apr 13, 2020" },
  { id: "25042", title: "Bridget Riley", endDate: "Jan 26, 2020" },
  
  // 2019
  { id: "25043", title: "Kiss My Genders", endDate: "Sep 8, 2019" },
  { id: "25045", title: "Kader Attia: The Museum of Emotion", endDate: "May 6, 2019" },
  { id: "25046", title: "diane arbus: in the beginning", endDate: "May 6, 2019" },
  { id: "25044", title: "Aleksandra Mir: Presents the Pre-Presidential Library", endDate: "Feb 7, 2019" },
  { id: "25048", title: "Space Shifters", endDate: "Jan 6, 2019" },
  
  // 2018
  { id: "25047", title: "Emmanuelle Lainé", endDate: "Dec 24, 2018" },
  { id: "25049", title: "DRAG: Self-portraits and Body Politics", endDate: "Oct 14, 2018" },
  { id: "25050", title: "Lee Bul", endDate: "Aug 19, 2018" },
  { id: "25051", title: "Andreas Gursky", endDate: "Apr 22, 2018" },
  
  // 2015
  { id: "25052", title: "Dineo Seshee Bopape", endDate: "Sep 27, 2015" },
  { id: "25055", title: "Carsten Höller: Decision", endDate: "Sep 6, 2015" },
  { id: "25053", title: "Echoes & Reverberations", endDate: "Aug 16, 2015" },
  { id: "25054", title: "Neha Choksi: Minds to lose", endDate: "Jun 14, 2015" },
  { id: "25056", title: "History is Now: 7 artists take on Britain", endDate: "Apr 26, 2015" },
  { id: "25057", title: "MIRRORCITY: London artists on fiction and reality", endDate: "Jan 4, 2015" },
  
  // 2014
  { id: "25058", title: "The Human Factor", endDate: "Sep 7, 2014" },
  { id: "25059", title: "Martin Creed: What's the point of it?", endDate: "Apr 27, 2014" },
  
  // 2013
  { id: "25060", title: "Dayanita Singh: Go Away Closer", endDate: "Dec 15, 2013" },
  { id: "25061", title: "Ana Mendieta: Traces", endDate: "Dec 15, 2013" },
  { id: "25063", title: "The Alternative Guide to the Universe", endDate: "Aug 26, 2013" },
  { id: "25062", title: "Aura Satz: Impulsive Synchronisation", endDate: "May 26, 2013" },
  { id: "25064", title: "Light Show", endDate: "May 6, 2013" },
  
  // 2012
  { id: "25065", title: "Art of Change: New Directions from China", endDate: "Dec 9, 2012" },
  { id: "25067", title: "Invisible Art", endDate: "Aug 5, 2012" },
  { id: "25066", title: "Wide Open School", endDate: "Jul 11, 2012" },
  { id: "25069", title: "JEREMY DELLER: JOY IN PEOPLE", endDate: "May 13, 2012" },
  { id: "25070", title: "DAVID SHRIGLEY: BRAIN ACTIVITY", endDate: "May 13, 2012" },
  { id: "25068", title: "Hayward Project Space: Euan MacDonald", endDate: "Feb 14, 2012" },
  { id: "25072", title: "George Condo: Mental States", endDate: "Jan 8, 2012" },
  { id: "25073", title: "Pipilotti Rist", endDate: "Jan 8, 2012" },
  
  // 2011
  { id: "25076", title: "Tracey Emin: Love is What You Want", endDate: "Aug 29, 2011" },
  { id: "25077", title: "The Royal Family: Hayward Gallery Project Space", endDate: "May 2, 2011" },
  { id: "25078", title: "British Art Show 7: In the Days of the Comet", endDate: "Apr 17, 2011" },
  { id: "25081", title: "Move: Choreographing You", endDate: "Jan 9, 2011" },
  
  // 2010
  { id: "25079", title: "Ron Terada: Who I Think I Am", endDate: "Nov 7, 2010" },
  { id: "25080", title: "Jess Flood-Paddock: Gangsta's Paradise", endDate: "Sep 19, 2010" },
  { id: "25082", title: "CLOSED FOR ESSENTIAL REPAIRS", endDate: "Jun 18, 2010" },
  { id: "25083", title: "Silberkuppe: Rooms Without Walls", endDate: "Jan 20, 2010" },
  { id: "25086", title: "Ed Ruscha: Fifty Years of Painting", endDate: "Jan 10, 2010" },
  
  // 2009
  { id: "25084", title: "Victor Man: If Mind Were All There Was", endDate: "Nov 15, 2009" },
  { id: "25085", title: "Martin Sastre", endDate: "Sep 30, 2009" },
  { id: "25089", title: "Walking in My Mind", endDate: "Sep 6, 2009" },
  { id: "25087", title: "Deceitful Moon", endDate: "Aug 30, 2009" },
  { id: "25088", title: "Matthew Darbyshire: Funhouse", endDate: "Jul 12, 2009" },
  { id: "25090", title: "PaulMart: Beton brut", endDate: "May 31, 2009" },
  { id: "25092", title: "Annette Messager: The Messengers", endDate: "May 25, 2009" },
  { id: "25093", title: "Mark Wallinger Curates: The Russian Linesman", endDate: "May 4, 2009" },
  { id: "25091", title: "Ujino and the Rotators", endDate: "Apr 24, 2009" },
  { id: "25094", title: "Andy Warhol: Other Voices, Other Rooms", endDate: "Jan 18, 2009" },
  
  // 2008
  { id: "25095", title: "Robin Rhode: Who Saw Who", endDate: "Dec 7, 2008" },
  { id: "25096", title: "Psycho Buildings: Artists take on Architecture", endDate: "Aug 25, 2008" },
  { id: "25097", title: "Laughing in a Foreign Language", endDate: "Apr 13, 2008" },
  { id: "25098", title: "alexander rodchenko: revolution in photography", endDate: "Apr 13, 2008" },
  { id: "25099", title: "Klara Liden", endDate: "Jan 17, 2008" },
  
  // 2007
  { id: "25101", title: "the painting of modern life", endDate: "Dec 30, 2007" },
  { id: "25100", title: "kota ezawa: hotel california", endDate: "Nov 18, 2007" },
  { id: "25102", title: "Antony Gormley: Blind Light", endDate: "Aug 19, 2007" },
  
  // 2006
  { id: "25103", title: "How to Improve the World: British Art 1946 - 2006", endDate: "Nov 19, 2006" },
  { id: "25104", title: "Undercover Surrealism", endDate: "Jul 30, 2006" },
  
  // 2005
  { id: "25106", title: "Universal Experience: Art, Life and the Tourist's Eye", endDate: "Dec 11, 2005" },
  { id: "25107", title: "Rebecca Horn: Bodylandscapes", endDate: "Aug 29, 2005" },
  { id: "25108", title: "Africa Remix", endDate: "Apr 17, 2005" },
  
  // 2004
  { id: "25109", title: "saved!", endDate: "Jan 18, 2004" },
  
  // 2003
  { id: "25110", title: "closed for renovation", endDate: "Aug 31, 2003" },
  
  // 2002-2003
  { id: "25111", title: "douglas gordon what have i done", endDate: "Jan 5, 2003" },
  { id: "25112", title: "william eggleston", endDate: "Sep 22, 2002" },
  
  // 추가 전시 (ansel adams 이후)
  { id: "25113", title: "ansel adams at 100", endDate: "Sep 22, 2002" },
  { id: "25114", title: "Gerhard Richter: Forty Years of Painting", endDate: "Sep 22, 2002" },
  { id: "25115", title: "Paris Capital of the Arts 1900-1968", endDate: "Jun 16, 2002" },
  { id: "25116", title: "Moving Targets", endDate: "May 27, 2002" },
  { id: "25117", title: "Give and Take", endDate: "Apr 21, 2002" },
  { id: "25118", title: "Bridget Riley", endDate: "Jan 20, 2002" },
  { id: "25119", title: "Century City: Art and Culture in the Modern Metropolis", endDate: "Feb 29, 2002" },
  { id: "25120", title: "Painting at the Edge of the World", endDate: "Jan 27, 2002" },
  { id: "25121", title: "Here and Now", endDate: "Sep 3, 2001" },
  { id: "25122", title: "Carlo Scarpa", endDate: "Aug 6, 2000" },
];

// 중복 제거 및 필터링
// 1. "CLOSED FOR ESSENTIAL REPAIRS", "closed for renovation" 같은 비전시 항목 제외
// 2. 중복 제거 (Among the Trees가 2번 있음)
const excludeKeywords = ['CLOSED FOR', 'closed for renovation'];

function shouldExclude(title) {
  return excludeKeywords.some(kw => title.toLowerCase().includes(kw.toLowerCase()));
}

// 날짜 파싱 (Ended 형식: "Aug 31, 2025" 또는 "Aug 31")
function parseEndDate(dateStr) {
  // 연도가 없으면 2025로 가정 (올해)
  if (!dateStr.match(/\d{4}/)) {
    dateStr = dateStr + ', 2025';
  }
  const date = new Date(dateStr);
  return date.toISOString().split('T')[0]; // YYYY-MM-DD
}

// 전시 데이터 정제
const filteredExhibitions = rawExhibitions
  .filter(ex => !shouldExclude(ex.title))
  .map(ex => ({
    id: `hayward-${ex.id}`,
    title: ex.title,
    endDate: parseEndDate(ex.endDate),
    sourceUrl: `https://www.newexhibitions.com/e/${ex.id}`,
    venue: "Hayward Gallery",
    location: "London SE1 8XX"
  }));

// 중복 제거 (title 기준, 대소문자 무시)
const seenTitles = new Set();
const uniqueExhibitions = filteredExhibitions.filter(ex => {
  const normalizedTitle = ex.title.toLowerCase().trim();
  if (seenTitles.has(normalizedTitle)) {
    console.log(`중복 제거: ${ex.title}`);
    return false;
  }
  seenTitles.add(normalizedTitle);
  return true;
});

// 날짜순 정렬 (최신순)
uniqueExhibitions.sort((a, b) => new Date(b.endDate) - new Date(a.endDate));

// 결과 생성
const result = {
  museum: "Hayward Gallery",
  museumId: "hayward-gallery",
  scrapedAt: new Date().toISOString(),
  source: "https://www.newexhibitions.com/archive?year=all&searchAll=hayward",
  totalExhibitions: uniqueExhibitions.length,
  note: "All exhibitions are temporary (have end dates). No permanent exhibitions found.",
  temporaryExhibitions: uniqueExhibitions
};

// 저장
const outputPath = path.join(__dirname, '..', 'public', 'data', 'hayward-gallery-exhibitions.json');
fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');

console.log(`\n✅ Hayward Gallery 전시 정보 저장 완료!`);
console.log(`📁 파일: ${outputPath}`);
console.log(`📊 총 ${uniqueExhibitions.length}개 기간전시 수집`);
console.log(`\n📅 전시 기간: ${uniqueExhibitions[uniqueExhibitions.length - 1].endDate} ~ ${uniqueExhibitions[0].endDate}`);
