import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useLanguage } from "../contexts/LanguageContext";
import {
  MOBILE_CHROME_TWEAKS,
  type MobileChromeTweakId,
} from "./mobileChromeTweaks";
import "./MobileChromeTweakSwitcher.css";

type MobileChromeTweakSwitcherProps = {
  value: MobileChromeTweakId;
};

export default function MobileChromeTweakSwitcher({ value }: MobileChromeTweakSwitcherProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const currentIndex = MOBILE_CHROME_TWEAKS.findIndex((tweak) => tweak.id === value);

  const applyTweak = (nextTweak: MobileChromeTweakId) => {
    const params = new URLSearchParams(location.search);
    params.set("tweak", nextTweak);
    navigate({
      pathname: location.pathname,
      search: `?${params.toString()}`,
      hash: location.hash,
    }, { replace: true });
  };

  const cycleTweak = (offset: number) => {
    const nextIndex = (currentIndex + offset + MOBILE_CHROME_TWEAKS.length)
      % MOBILE_CHROME_TWEAKS.length;
    applyTweak(MOBILE_CHROME_TWEAKS[nextIndex].id);
  };

  return (
    <aside className="mcts" aria-label="Design tweak selector" data-no-swipe="true">
      <div className="mcts__meta" aria-hidden="true">
        <span>TWEAK</span>
        <span>{String(currentIndex + 1).padStart(2, "0")} / {String(MOBILE_CHROME_TWEAKS.length).padStart(2, "0")}</span>
      </div>
      <div className="mcts__controls">
        <button
          className="mcts__step"
          type="button"
          aria-label="Previous tweak"
          title={language === "ko" ? "이전 디자인" : "Previous design"}
          onClick={() => cycleTweak(-1)}
        >
          <ChevronLeft size={16} strokeWidth={1.8} aria-hidden="true" />
        </button>

        <label className="mcts__select-wrap">
          <span className="mcts__sr-only">{language === "ko" ? "디자인 선택" : "Choose design"}</span>
          <select
            className="mcts__select"
            aria-label="Tweak variation"
            value={value}
            onChange={(event) => applyTweak(event.target.value as MobileChromeTweakId)}
          >
            {MOBILE_CHROME_TWEAKS.map((tweak) => (
              <option key={tweak.id} value={tweak.id}>
                {language === "ko" ? tweak.nameKo : tweak.name}
              </option>
            ))}
          </select>
        </label>

        <button
          className="mcts__step"
          type="button"
          aria-label="Next tweak"
          title={language === "ko" ? "다음 디자인" : "Next design"}
          onClick={() => cycleTweak(1)}
        >
          <ChevronRight size={16} strokeWidth={1.8} aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
