import { useLanguage } from "../contexts/LanguageContext";
import { getArtistDisplayName, useArtistI18n } from "../i18n/artistLocalization";

/* An artist's name as the reader's language shows it (Korean spelling in KO, tidied original in EN).
   For any place that prints a name and has no map of its own: <ArtistName name={work.artist} />. */
export function ArtistName({ name }: { name?: string | null }) {
  const { language } = useLanguage();
  const map = useArtistI18n();
  return <>{getArtistDisplayName(name, language, map)}</>;
}
