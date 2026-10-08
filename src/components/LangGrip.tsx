import { useLanguage } from "../contexts/LanguageContext";
import { useWallHeight } from "../features/wall/wallPull";
import "../features/wall/myWall.css";

/* KO | EN on the tab bar's top edge, at its right: the bar is on every screen - over full-screen
   pages too, where the floating switch at the top right is covered - so the language can be
   changed anywhere without a control laid over the page. The top-right switch stays as well
   (10/8: "둘 다 있게"); both read and set the one language in LanguageContext. Same glass tab as the wall's handle
   (.wall-grip--bar), narrower; one tap turns to the other language. */
const SHAPE = "M0,24 C8,24 13.6,19.2 13.6,12 C13.6,4.8 18.4,0 25.6,0 L62.4,0 C69.6,0 74.4,4.8 74.4,12 C74.4,19.2 80,24 88,24";

export default function LangGrip() {
  const { language, setLanguage } = useLanguage();
  /* the open wall stands on the bar: its own handle is there, and nothing else rides the edge */
  const wallOpen = useWallHeight() > 0;
  if (wallOpen) return null;
  const ko = language === "ko";
  return (
    <button
      type="button"
      className="wall-grip wall-grip--bar lang-grip"
      onClick={() => setLanguage(ko ? "en" : "ko")}
      aria-label={ko ? "언어: 한국어. 누르면 English" : "Language: English. Tap for 한국어"}
      title={ko ? "English로 보기" : "한국어로 보기"}
    >
      <svg className="wall-grip__edge" viewBox="0 0 88 25" preserveAspectRatio="none" aria-hidden="true">
        <path d={SHAPE} />
      </svg>
      <span className={ko ? "is-on" : undefined}>KO</span>
      <em aria-hidden="true" />
      <span className={ko ? undefined : "is-on"}>EN</span>
    </button>
  );
}
