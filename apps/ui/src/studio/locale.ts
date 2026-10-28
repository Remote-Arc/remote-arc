import { useCallback } from "react";
import { useI18n } from "../i18n.js";
import { translateStudio } from "./strings.js";
export function useStudioLocale() {
  const { locale } = useI18n();
  const t = useCallback(
    (message: string, ...values: (string | number)[]) =>
      translateStudio(message, locale, ...values),
    [locale],
  );
  return { locale, t };
}
