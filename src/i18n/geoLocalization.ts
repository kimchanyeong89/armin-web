import type { AppLanguage } from "../contexts/LanguageContext";

const CONTINENT_KO: Record<string, string> = {
  "North America": "북아메리카",
  "South America": "남아메리카",
  Europe: "유럽",
  Africa: "아프리카",
  Asia: "아시아",
  Oceania: "오세아니아",
};

const COUNTRY_KO: Record<string, string> = {
  "United States": "미국",
  "United Kingdom": "영국",
  "South Korea": "대한민국",
  "North Korea": "북한",
  France: "프랑스",
  Germany: "독일",
  Italy: "이탈리아",
  Spain: "스페인",
  Japan: "일본",
  China: "중국",
  Taiwan: "대만",
  "Hong Kong": "홍콩",
  Netherlands: "네덜란드",
  Belgium: "벨기에",
  Austria: "오스트리아",
  Switzerland: "스위스",
  Sweden: "스웨덴",
  Norway: "노르웨이",
  Denmark: "덴마크",
  Finland: "핀란드",
  Portugal: "포르투갈",
  Greece: "그리스",
  Canada: "캐나다",
  Mexico: "멕시코",
  Brazil: "브라질",
  Argentina: "아르헨티나",
  Australia: "호주",
  India: "인도",
  Egypt: "이집트",
  Turkey: "튀르키예",
  Russia: "러시아",
  Ukraine: "우크라이나",
  Poland: "폴란드",
  Czechia: "체코",
  "Czech Republic": "체코",
  Hungary: "헝가리",
  Romania: "루마니아",
  Croatia: "크로아티아",
  Slovenia: "슬로베니아",
  Slovakia: "슬로바키아",
  Serbia: "세르비아",
  Thailand: "태국",
  Singapore: "싱가포르",
  Vietnam: "베트남",
  Indonesia: "인도네시아",
  Malaysia: "말레이시아",
  Philippines: "필리핀",
  "South Africa": "남아프리카공화국",
};

const CITY_KO: Record<string, string> = {
  Seoul: "서울",
  Busan: "부산",
  Daegu: "대구",
  Gwangju: "광주",
  Jeonju: "전주",
  Jeju: "제주",
  Seogwipo: "서귀포",
  Tokyo: "도쿄",
  Osaka: "오사카",
  Kanazawa: "가나자와",
  Kyoto: "교토",
  London: "런던",
  Paris: "파리",
  Berlin: "베를린",
  Munich: "뮌헨",
  Hamburg: "함부르크",
  Vienna: "빈",
  Rome: "로마",
  Milan: "밀라노",
  Venice: "베네치아",
  Florence: "피렌체",
  Barcelona: "바르셀로나",
  Madrid: "마드리드",
  Amsterdam: "암스테르담",
  Zurich: "취리히",
  Brussels: "브뤼셀",
  Prague: "프라하",
  Warsaw: "바르샤바",
  Budapest: "부다페스트",
  Copenhagen: "코펜하겐",
  Helsinki: "헬싱키",
  Stockholm: "스톡홀름",
  Oslo: "오슬로",
  "New York": "뉴욕",
  Chicago: "시카고",
  Boston: "보스턴",
  Philadelphia: "필라델피아",
  Washington: "워싱턴 D.C.",
  "Los Angeles": "로스앤젤레스",
  "San Francisco": "샌프란시스코",
  Houston: "휴스턴",
  Cleveland: "클리블랜드",
  Minneapolis: "미니애폴리스",
  Atlanta: "애틀랜타",
  Detroit: "디트로이트",
  Bentonville: "벤턴빌",
  Montreal: "몬트리올",
  Toronto: "토론토",
  Beijing: "베이징",
  Shanghai: "상하이",
  Shenzhen: "선전",
  Guangzhou: "광저우",
  Nanjing: "난징",
  Hangzhou: "항저우",
  Taipei: "타이베이",
  "Hong Kong": "홍콩",
  Sydney: "시드니",
  "Sao Paulo": "상파울루",
  "São Paulo": "상파울루",
  "Buenos Aires": "부에노스아이레스",
  "Mexico City": "멕시코시티",
};

export function localizeContinentName(name: string, language: AppLanguage): string {
  if (language === "en") return name;
  return CONTINENT_KO[name] || name;
}

export function localizeCountryName(name: string, language: AppLanguage): string {
  if (language === "en") return name;
  return COUNTRY_KO[name] || name;
}

export function localizeCityName(name: string, language: AppLanguage): string {
  if (language === "en") return name;
  return CITY_KO[name] || name;
}

export function localizeGeoLabel(level: string, label: string, language: AppLanguage): string {
  const normalizedLevel = String(level || "").toUpperCase();
  if (normalizedLevel === "CONTINENT") return localizeContinentName(label, language);
  if (normalizedLevel === "COUNTRY") return localizeCountryName(label, language);
  if (normalizedLevel === "CITY") return localizeCityName(label, language);
  return label;
}
