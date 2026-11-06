import { useContext } from "react";
import { I18nContext } from "../app/i18n-context.js";
import { localeDictionary } from "../locales/locale-catalog.js";

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside I18nProvider");
  return value;
}

export function useMessages<Namespace extends keyof ReturnType<typeof localeDictionary>>(
  namespace: Namespace,
) {
  const { locale } = useI18n();
  return localeDictionary(locale)[namespace];
}
