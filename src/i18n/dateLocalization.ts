import type { AppLanguage } from "../contexts/LanguageContext";

/**
 * 작품 제작연도 표기 한국어화. 규칙 기반(결정적), 미커버는 원문 폴백.
 *  - "c. 1765" / "ca. 1880" / "circa 1900" → "1765년경"
 *  - "1912" → "1912년"
 *  - "1880-85", "1906–1907" → "1880–85년"
 *  - "19th century" → "19세기"
 *  - 그 외(비연도 문자열 등)는 원문 유지
 */
const ROMAN: Record<string, number> = { I: 1, V: 5, X: 10 };
const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;

/**
 * A date written as a century in Roman numerals with no year in it - "4. ćwierć XVIII w.",
 * "1. połowa XIX wieku", "lata 30. XX w." (MNK Kraków) - as "18th century" / "1930s".
 * Reading the last number out of such a date gave the quarter as the year ("4년"). '' when
 * the value is not one of these.
 */
export function centuryLabel(raw: string | undefined): string {
  const value = String(raw || "");
  if (/\d{4}/.test(value)) return "";
  /* only with the word for "century" after it: "Louis XIV style" is a king, not a date */
  const m = value.match(/(?:^|[^A-Za-z])([XVI]{1,5})\.?\s*(?:w\.|w$|w\b|wiek|century|si[eè]cle|Jh)/);
  if (!m) return "";
  let n = 0;
  for (let i = 0; i < m[1].length; i += 1) {
    const here = ROMAN[m[1][i]], next = ROMAN[m[1][i + 1]] || 0;
    n += here < next ? -here : here;
  }
  if (n < 1 || n > 21) return "";
  const decade = value.match(/lata\s+(\d{2})/i);
  return decade ? `${(n - 1) * 100 + Number(decade[1])}s` : `${ordinal(n)} century`;
}

export function getDateKo(raw: string | undefined, language: AppLanguage): string {
  const value = String(raw || "").trim();
  if (!value || language === "en") return value;

  const century = value.match(/^(\d{1,2})(?:st|nd|rd|th)?\s*century$/i);
  if (century) return `${century[1]}세기`;

  const decade = value.match(/^(\d{3,4})s$/);
  if (decade) return `${decade[1]}년대`;

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
