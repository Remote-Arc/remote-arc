import type CommonJson from "./en/common.json";
import type WebsiteJson from "./en/website.json";
import type DashboardJson from "./en/dashboard.json";
import type AdminJson from "./en/admin.json";

type Common = typeof CommonJson;
type Website = typeof WebsiteJson;
type Dashboard = typeof DashboardJson;
type Admin = typeof AdminJson;

export type Locale = "en" | "zh";
export type LocaleSurface = "website" | "dashboard" | "admin";
type Pack = "common" | LocaleSurface;
type Messages = Common["messages"] &
  Website["messages"] &
  Dashboard["messages"] &
  Admin["messages"];
export type MessageKey = keyof Messages;
export type MessageValues = Readonly<Record<string, unknown>>;

export interface Translate {
  (key: MessageKey, values?: MessageValues): string;
  (english: string, chinese: string): string;
}

const loaders = {
  en: {
    common: () => import("./en/common.js"),
    website: () => import("./en/website.js"),
    dashboard: () => import("./en/dashboard.js"),
    admin: () => import("./en/admin.js"),
  },
  zh: {
    common: () => import("./zh/common.js"),
    website: () => import("./zh/website.js"),
    dashboard: () => import("./zh/dashboard.js"),
    admin: () => import("./zh/admin.js"),
  },
} satisfies Record<
  Locale,
  {
    common: () => Promise<{ default: Common }>;
    website: () => Promise<{ default: Website }>;
    dashboard: () => Promise<{ default: Dashboard }>;
    admin: () => Promise<{ default: Admin }>;
  }
>;

type LoadedLocale = {
  common?: Common;
  releases?: Readonly<Record<string, { title: string; summary: string }>>;
  messages: Partial<Messages>;
  loaded: Set<Pack>;
  pending: Partial<Record<Pack, Promise<void>>>;
};

const states: Record<Locale, LoadedLocale> = {
  en: { messages: {}, loaded: new Set(), pending: {} },
  zh: { messages: {}, loaded: new Set(), pending: {} },
};

function loadPack(locale: Locale, pack: Pack): Promise<void> {
  const state = states[locale];
  if (state.loaded.has(pack)) return Promise.resolve();
  return (state.pending[pack] ??= loaders[locale][pack]()
    .then(({ default: dictionary }) => {
      if ("access" in dictionary) state.common = dictionary;
      if ("releases" in dictionary) state.releases = dictionary.releases;
      Object.assign(state.messages, dictionary.messages);
      state.loaded.add(pack);
    })
    .finally(() => delete state.pending[pack]));
}

export async function loadLocale(locale: Locale, surface: LocaleSurface | "all") {
  const packs: readonly Pack[] =
    surface === "all" ? ["common", "website", "dashboard", "admin"] : ["common", surface];
  await Promise.all(packs.map((pack) => loadPack(locale, pack)));
}

export function localeDictionary(locale: Locale): Omit<Common, "messages"> {
  const dictionary = states[locale].common;
  if (!dictionary) throw new Error("Locale dictionary not loaded: " + locale);
  return dictionary;
}

export function createTranslator(locale: Locale): Translate {
  const { messages } = states[locale];
  return (keyOrEnglish: string, chineseOrValues?: string | MessageValues) => {
    if (typeof chineseOrValues === "string")
      return locale === "zh" ? chineseOrValues : keyOrEnglish;
    const message = messages[keyOrEnglish as MessageKey];
    if (message === undefined) throw new Error("Unknown message key: " + keyOrEnglish);
    if (!chineseOrValues) return message;
    return message.replace(/\{([a-zA-Z][\w]*)\}/g, (token, name: string) =>
      Object.hasOwn(chineseOrValues, name) ? String(chineseOrValues[name]) : token,
    );
  };
}

export function releaseNotes(locale: Locale, version: string) {
  return states[locale].releases?.[version];
}
