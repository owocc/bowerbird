import i18n from "i18next";
import { initReactI18next } from "react-i18next";

/**
 * Every language lives in its own file under `src/messages/`, e.g.
 * `src/messages/en.json`. Dropping a new `<code>.json` file in that directory
 * is all that is needed to register another language; `SUPPORTED_LANGUAGES`
 * and the i18next resources are derived from it automatically.
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

export const SUPPORTED_LANGUAGES = Object.keys(resources);
export type SupportedLanguage = string;

export const DEFAULT_LANGUAGE: SupportedLanguage = "en";

const LANGUAGE_STORAGE_KEY = "bowerbird-language";

function resolveInitialLanguage(): SupportedLanguage {
  if (typeof localStorage === "undefined") return DEFAULT_LANGUAGE;
  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return stored && stored in resources ? stored : DEFAULT_LANGUAGE;
}

i18n.use(initReactI18next).init({
  resources,
  lng: resolveInitialLanguage(),
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

export default i18n;
