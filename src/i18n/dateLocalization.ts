import type { AppLanguage } from "../contexts/LanguageContext";

/**
 * 작품 제작연도 표기 한국어화. 규칙 기반(결정적), 미커버는 원문 폴백.
 *  - "c. 1765" / "ca. 1880" / "circa 1900" → "1765년경"
 *  - "1912" → "1912년"
 *  - "1880-85", "1906–1907" → "1880–85년"
 *  - "19th century" → "19세기"
 *  - 그 외(비연도 문자열 등)는 원문 유지
 */
export function getDateKo(raw: string | undefined, language: AppLanguage): string {
  const value = String(raw || "").trim();
  if (!value || language === "en") return value;

  const century = value.match(/^(\d{1,2})(?:st|nd|rd|th)?\s*century$/i);
  if (century) return `${century[1]}세기`;

  const circa = value.match(/^(?:c\.?|ca\.?|circa)\s*(.+)$/i);
  if (circa) {
    const inner = circa[1].trim();
    if (/^\d/.test(inner)) return `${inner}년경`;
    return value;
  }

  if (/^\d{1,4}\s*[–-]\s*\d{1,4}$/.test(value) || /^\d{1,4}$/.test(value)) {
    return `${value}년`;
  }

  return value;
}
