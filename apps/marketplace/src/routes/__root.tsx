import {
  Outlet,
  ScrollRestoration,
  createRootRoute,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import * as React from "react";
import appCss from "../styles/app.css?url";
import { I18nContext, MESSAGES, type Locale } from "../lib/i18n";
import { DesktopProvider } from "../lib/desktop-context";
import { ThemeContext, type Theme } from "../components/theme-context";
import { Sidebar } from "../components/sidebar";
import { Footer } from "../components/footer";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Apps - Hyakume" },
      {
        name: "description",
        content: "现代化 Web App 精选收录平台。致力于发现优质在线工具与应用。",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/logo.jpeg" },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  const [theme, setThemeState] = React.useState<Theme>("dark");
  const [resolvedTheme, setResolvedTheme] = React.useState<"light" | "dark">("dark");
  const [locale, setLocaleState] = React.useState<Locale>("zh");

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const storedTheme = (localStorage.getItem("hyakume-theme") ||
        localStorage.getItem("bowerbird-web-theme")) as Theme | null;
      if (storedTheme === "light" || storedTheme === "dark" || storedTheme === "system") {
        setThemeState(storedTheme);
      }

      const storedLocale = (localStorage.getItem("hyakume-locale") ||
        localStorage.getItem("bowerbird-web-locale")) as Locale | null;
      if (storedLocale === "zh" || storedLocale === "en") {
        setLocaleState(storedLocale);
      }
    }
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    let effectiveTheme: "light" | "dark" = "dark";
    if (theme === "system") {
      effectiveTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    } else {
      effectiveTheme = theme;
    }

    setResolvedTheme(effectiveTheme);
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(effectiveTheme);
    root.style.colorScheme = effectiveTheme;
  }, [theme]);

  const setTheme = (next: Theme) => {
    setThemeState(next);
    if (typeof window !== "undefined") {
      localStorage.setItem("hyakume-theme", next);
    }
  };

  const setLocale = (next: Locale) => {
    setLocaleState(next);
    if (typeof window !== "undefined") {
      localStorage.setItem("hyakume-locale", next);
    }
  };

  const t = (key: string, params?: Record<string, string | number>): string => {
    const dict = MESSAGES[locale] || MESSAGES.zh;
    let text = dict[key] || MESSAGES.en[key] || key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
      }
    }
    return text;
  };

  return (
    <html lang={locale} className={resolvedTheme === "dark" ? "dark" : ""}>
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen bg-background text-foreground selection:bg-primary selection:text-primary-foreground antialiased transition-colors duration-200">
        <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
          <I18nContext.Provider value={{ locale, setLocale, t }}>
            <DesktopProvider>
              <div className="min-h-screen flex flex-col bg-background text-foreground transition-colors duration-200">
                <div className="flex flex-col md:flex-row flex-1 w-full">
                  <Sidebar />
                  <main className="flex-1 min-w-0 bg-background">
                    <Outlet />
                  </main>
                </div>
                <Footer />
              </div>
              <ScrollRestoration />
              <Scripts />
            </DesktopProvider>
          </I18nContext.Provider>
        </ThemeContext.Provider>
      </body>
    </html>
  );
}
