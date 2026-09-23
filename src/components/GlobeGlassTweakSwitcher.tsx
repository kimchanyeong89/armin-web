import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useLanguage } from "../contexts/LanguageContext";
import {
  GLOBE_GLASS_TWEAKS,
  type GlobeGlassTweakId,
} from "./InteractiveGlobeMap/globeGlassTweaks";
import "./MobileChromeTweakSwitcher.css";

type GlobeGlassTweakSwitcherProps = {
  value: GlobeGlassTweakId;
};

export default function GlobeGlassTweakSwitcher({ value }: GlobeGlassTweakSwitcherProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const currentIndex = GLOBE_GLASS_TWEAKS.findIndex((tweak) => tweak.id === value);

  const applyTweak = (nextTweak: GlobeGlassTweakId) => {
    const params = new URLSearchParams(location.search);
    params.set("glass", nextTweak);
    navigate({
      pathname: location.pathname,
      search: `?${params.toString()}`,
      hash: location.hash,
    }, { replace: true });
  };

  const cycleTweak = (offset: number) => {
    const nextIndex = (currentIndex + offset + GLOBE_GLASS_TWEAKS.length)
      % GLOBE_GLASS_TWEAKS.length;
    applyTweak(GLOBE_GLASS_TWEAKS[nextIndex].id);
  };

  return (
    <aside className="mcts mcts--glass" aria-label="Globe glass tweak selector" data-no-swipe="true">
      <div className="mcts__meta" aria-hidden="true">
        <span>GLASS</span>
        <span>{String(currentIndex + 1).padStart(2, "0")} / {String(GLOBE_GLASS_TWEAKS.length).padStart(2, "0")}</span>
      </div>
      <div className="mcts__controls">
        <button
          className="mcts__step"
          type="button"
          aria-label="Previous glass tweak"
          title={language === "ko" ? "이전 글래스" : "Previous glass"}
          onClick={() => cycleTweak(-1)}
        >
          <ChevronLeft size={16} strokeWidth={1.8} aria-hidden="true" />
        </button>

        <label className="mcts__select-wrap">
          <span className="mcts__sr-only">{language === "ko" ? "글래스 선택" : "Choose glass"}</span>
          <select
            className="mcts__select"
            aria-label="Glass tweak variation"
            value={value}
            onChange={(event) => applyTweak(event.target.value as GlobeGlassTweakId)}
          >
            {GLOBE_GLASS_TWEAKS.map((tweak) => (
              <option key={tweak.id} value={tweak.id}>
                {language === "ko" ? tweak.nameKo : tweak.name}
              </option>
            ))}
          </select>
        </label>

        <button
          className="mcts__step"
          type="button"
          aria-label="Next glass tweak"
          title={language === "ko" ? "다음 글래스" : "Next glass"}
          onClick={() => cycleTweak(1)}
        >
          <ChevronRight size={16} strokeWidth={1.8} aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
