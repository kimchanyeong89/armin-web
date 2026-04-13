import type { AppLanguage } from "../contexts/LanguageContext";

type ExhibitionLike = Record<string, any>;

function pickFirst(...values: Array<unknown>): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export function getExhibitionDisplayTitle(exhibition: ExhibitionLike, language: AppLanguage): string {
  if (language === "en") {
    return pickFirst(
      exhibition.title_en,
      exhibition.titleEn,
      exhibition.name_en,
      exhibition.nameEn,
      exhibition.title,
      exhibition.name,
    );
  }

  return pickFirst(
    exhibition.title_ko,
    exhibition.titleKo,
    exhibition.name_ko,
    exhibition.nameKo,
    exhibition.title,
    exhibition.name,
  );
}

export function getExhibitionDisplayDescription(exhibition: ExhibitionLike, language: AppLanguage): string {
  if (language === "en") {
    return pickFirst(
      exhibition.description_en,
      exhibition.descriptionEn,
      exhibition.desc_en,
      exhibition.descEn,
      exhibition.description,
      exhibition.desc,
    );
  }

  return pickFirst(
    exhibition.description_ko,
    exhibition.descriptionKo,
    exhibition.desc_ko,
    exhibition.descKo,
    exhibition.description,
    exhibition.desc,
  );
}

export function getExhibitionTypeLabel(type: string, language: AppLanguage): string {
  const lowered = String(type || "").toLowerCase();
  if (language === "ko") {
    if (lowered === "permanent") return "상설";
    if (lowered === "current") return "진행";
    if (lowered === "upcoming") return "예정";
    if (lowered === "past") return "종료";
    return "전시";
  }

  if (lowered === "permanent") return "Permanent";
  if (lowered === "current") return "Current";
  if (lowered === "upcoming") return "Upcoming";
  if (lowered === "past") return "Past";
  return "Exhibition";
}
