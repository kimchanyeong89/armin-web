import { useLanguage, type AppLanguage } from "../contexts/LanguageContext";

/**
 * KO / EN language switch.
 *
 * Both languages stay on screen so the control says two things at once: which
 * one you are on (full strength) and what tapping gives you (dimmed). Earlier
 * versions failed by showing only one - a lone "EN" cannot express state and
 * destination together - or by filling the active half with gold, which gave a
 * rarely used utility the same weight as the page's real actions.
 *
 * Weight comes from opacity alone: no fill, no border, no accent colour.
 */
const OPTIONS: { code: AppLanguage; label: string }[] = [
  { code: "ko", label: "KO" },
  { code: "en", label: "EN" },
];

export default function LanguageToggle({ light = false }: { light?: boolean }) {
  const { language, setLanguage } = useLanguage();

  const active = light ? "rgba(0,0,0,0.92)" : "rgba(255,255,255,0.95)";
  const idle = light ? "rgba(0,0,0,0.34)" : "rgba(255,255,255,0.36)";
  const divider = light ? "rgba(0,0,0,0.20)" : "rgba(255,255,255,0.22)";

  return (
    <div
      role="group"
      aria-label="Language / 언어"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        fontFamily: 'Hana2, "Apple SD Gothic Neo", sans-serif',
        // Enough separation from a busy map without painting a panel behind it.
        textShadow: light ? "none" : "0 1px 10px rgba(0,0,0,0.75)",
        userSelect: "none",
      }}
    >
      {OPTIONS.map(({ code, label }, index) => {
        const isActive = language === code;
        return (
          <span key={code} style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
            {index > 0 && (
              <span aria-hidden="true" style={{ width: 1, height: 11, background: divider }} />
            )}
            <button
              type="button"
              onClick={() => setLanguage(code)}
              aria-pressed={isActive}
              title={code === "ko" ? "한국어" : "English"}
              style={{
                border: "none",
                background: "transparent",
                padding: "9px 2px",
                cursor: isActive ? "default" : "pointer",
                color: isActive ? active : idle,
                fontSize: 12,
                fontWeight: isActive ? 700 : 500,
                letterSpacing: "0.09em",
                lineHeight: 1,
                WebkitTapHighlightColor: "transparent",
                transition: "color 0.18s ease",
              }}
              onMouseEnter={(event) => {
                if (!isActive) event.currentTarget.style.color = active;
              }}
              onMouseLeave={(event) => {
                if (!isActive) event.currentTarget.style.color = idle;
              }}
            >
              {label}
            </button>
          </span>
        );
      })}
    </div>
  );
}
