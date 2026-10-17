import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./messages/en.json";
import zh from "./messages/zh.json";

export function resolveBrowserLanguage(): "zh" | "en" {
  try {
    const chromeLang = typeof chrome !== "undefined" && chrome.i18n?.getUILanguage ? chrome.i18n.getUILanguage() : "";
    const navLang = typeof navigator !== "undefined" ? navigator.language : "";
    const target = (chromeLang || navLang || "").toLowerCase();
    if (target.startsWith("zh")) {
      return "zh";
    }
  } catch {}
  return "en";
}

const resources = {
  en: { translation: en },
  zh: { translation: zh },
  "zh-CN": { translation: zh },
};

i18n.use(initReactI18next).init({
  resources,
  lng: resolveBrowserLanguage(),
  fallbackLng: "en",
  defaultNS: "translation",
  nsSeparator: false,
  returnNull: false,
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
