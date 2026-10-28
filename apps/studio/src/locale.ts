import { useCallback } from "react";
import { useStudioPreferences } from "./preferences.js";
import { translateStudio } from "./strings.js";
export function useStudioLocale() {
  const { locale } = useStudioPreferences();
  const t = useCallback(
    (message: string, ...values: (string | number)[]) =>
      translateStudio(message, locale, ...values),
    [locale],
  );
  return { locale, t };
}
