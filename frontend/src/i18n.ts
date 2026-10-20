import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { Events } from "@/lib/host-runtime";
import { GetLanguage, SetLanguage } from "../bindings/bowerbird/core/service";

/**
 * Every language lives in its own file under `src/messages/`, e.g.
 * `src/messages/en.json` and `src/messages/zh.json`.
 */
const messageModules = import.meta.glob<{ default: Record<string, unknown> }>(
  "./messages/*.json",
  { eager: true }
);

const resources: Record<string, { translation: Record<string, unknown> }> = {};

for (const [path, module] of Object.entries(messageModules)) {
  const code = path.match(/\/([^/]+)\.json$/)?.[1];
  if (code) {
    resources[code] = { translation: module.default };
  }
}

if (resources["zh"] && !resources["zh-CN"]) {
  resources["zh-CN"] = resources["zh"];
}

export const SUPPORTED_LANGUAGES = Object.keys(resources);
export type SupportedLanguage = string;
export type LanguagePreference = "system" | "en" | "zh";

export const DEFAULT_LANGUAGE: SupportedLanguage = "en";
export const LANGUAGE_STORAGE_KEY = "bowerbird-language";

export function resolveSystemLanguage(): "zh" | "en" {
  if (typeof navigator !== "undefined") {
    const navLang = (navigator.language || (navigator.languages && navigator.languages[0]) || "").toLowerCase();
    if (navLang.startsWith("zh")) {
      return "zh";
    }
  }
  return "en";
}

export function getLanguagePreference(): LanguagePreference {
  if (typeof localStorage === "undefined") return "system";
  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (stored === "zh" || stored === "zh-CN") return "zh";
  if (stored === "en") return "en";
  return "system";
}

export function resolveActiveLanguage(pref?: LanguagePreference): string {
  const p = pref || getLanguagePreference();
  if (p === "system") {
    return resolveSystemLanguage();
  }
  return p;
}

export async function setLanguagePreference(pref: LanguagePreference) {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, pref);
  }
  const resolved = resolveActiveLanguage(pref);
  await i18n.changeLanguage(resolved);
  try {
    await SetLanguage(pref);
  } catch {}
}

i18n.use(initReactI18next).init({
  resources,
  lng: resolveActiveLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: SUPPORTED_LANGUAGES,
  defaultNS: "translation",
  // Keys are dotted (`sidebar.search`), namespaces are not used separately.
  nsSeparator: false,
  returnNull: false,
  interpolation: {
    escapeValue: false,
  },
});

if (typeof window !== "undefined") {
  // Sync with Go backend on startup
  GetLanguage().then((backendLang) => {
    if (backendLang && (backendLang === "system" || backendLang === "zh" || backendLang === "en")) {
      const currentPref = getLanguagePreference();
      if (backendLang !== currentPref) {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, backendLang);
        i18n.changeLanguage(resolveActiveLanguage(backendLang as LanguagePreference));
      }
    }
  }).catch(() => {});

  // Listen to language-changed events across windows
  try {
    Events.On("language-changed", (event: any) => {
      const next = typeof event === "string" ? event : event?.data;
      if (next === "system" || next === "zh" || next === "en") {
        if (typeof localStorage !== "undefined") {
          localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
        }
        i18n.changeLanguage(resolveActiveLanguage(next as LanguagePreference));
      }
    });
  } catch {}
}

export default i18n;
