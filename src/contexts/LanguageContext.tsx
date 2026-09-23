import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export type AppLanguage = "ko" | "en";

const LANGUAGE_STORAGE_KEY = "armin:language";

type BilingualText = {
  ko: string;
  en: string;
};

type LanguageContextValue = {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
  toggleLanguage: () => void;
  t: (text: BilingualText) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function getInitialLanguage(): AppLanguage {
  if (typeof window === "undefined") return "ko";

  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored === "ko" || stored === "en") return stored;
  } catch {
    // ignore storage access errors
  }

  // COLLY is a Korean-first product: default to Korean and let the toggle
  // (which is what gets stored above) be the only way into English.
  return "ko";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>(getInitialLanguage);

  const setLanguage = useCallback((nextLanguage: AppLanguage) => {
    setLanguageState(nextLanguage);
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
    } catch {
      // ignore storage access errors
    }
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguage(language === "ko" ? "en" : "ko");
  }, [language, setLanguage]);

  const t = useCallback(
    (text: BilingualText) => (language === "ko" ? text.ko : text.en),
    [language],
  );

  const value = useMemo(
    () => ({ language, setLanguage, toggleLanguage, t }),
    [language, setLanguage, toggleLanguage, t],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }
  return context;
}
