import type { Locale, Translate } from "../locales/locale-catalog.js";
import { createContext } from "react";

export type { Locale } from "../locales/locale-catalog.js";

export type I18n = {
  locale: Locale;
  setLocale: (locale: Locale) => Promise<boolean>;
  tr: Translate;
};

export const I18nContext = createContext<I18n | null>(null);
