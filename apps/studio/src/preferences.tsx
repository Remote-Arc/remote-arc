import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
type Locale = "en" | "zh";
type Theme = "light" | "dark";
type Preferences = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  resolvedTheme: Theme;
  setTheme: (theme: Theme) => void;
};
const Context = createContext<Preferences | null>(null);
const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {}
};
export function StudioPreferences({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const requested = new URL(location.href).searchParams.get("lang");
    const saved = read("rearc-studio-locale") || read("remotearc-locale-v2");
    return requested === "en" || requested === "zh"
      ? requested
      : saved === "en" || saved === "zh"
        ? saved
        : /^zh/i.test(navigator.language)
          ? "zh"
          : "en";
  });
  const [resolvedTheme, setThemeState] = useState<Theme>(() => {
    const saved =
      read("rearc-studio-theme") || read("remote-arc-dashboard-theme-v3");
    return saved === "light"
      ? "light"
      : saved === "system" &&
          matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark";
  });
  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  }, [locale]);
  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);
  return (
    <Context.Provider
      value={{
        locale,
        resolvedTheme,
        setLocale(value) {
          setLocaleState(value);
          write("rearc-studio-locale", value);
          const url = new URL(location.href);
          url.searchParams.set("lang", value);
          history.replaceState(null, "", url);
        },
        setTheme(value) {
          setThemeState(value);
          write("rearc-studio-theme", value);
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useStudioPreferences() {
  const value = useContext(Context);
  if (!value) throw Error("Studio preferences unavailable");
  return value;
}
export const useTheme = useStudioPreferences;
export function LanguageSwitcher(_props: {
  compact?: boolean;
  syncUrl?: boolean;
}) {
  const { locale, setLocale } = useStudioPreferences();
  return (
    <div className="languageSwitch">
      <button
        type="button"
        aria-label="Switch website language to English"
        className={locale === "en" ? "active" : ""}
        onClick={() => setLocale("en")}
      >
        EN
      </button>
      <button
        type="button"
        aria-label="切换网站语言为简体中文"
        className={locale === "zh" ? "active" : ""}
        onClick={() => setLocale("zh")}
      >
        中文
      </button>
    </div>
  );
}
