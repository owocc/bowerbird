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
      { title: "Bowerbird 插件市场 - 官方与社区插件生态" },
      {
        name: "description",
        content: "Bowerbird 官方与社区插件生态。支持富媒体深度预览、元数据透视扩展与一键客户端安装。",
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
      const storedTheme = (localStorage.getItem("bowerbird-web-theme") ||
        localStorage.getItem("hyakume-theme")) as Theme | null;
      if (storedTheme === "light" || storedTheme === "dark" || storedTheme === "system") {
        setThemeState(storedTheme);
      }

      const storedLocale = (localStorage.getItem("bowerbird-web-locale") ||
        localStorage.getItem("hyakume-locale")) as Locale | null;
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
      localStorage.setItem("bowerbird-web-theme", next);
    }
  };

  const setLocale = (next: Locale) => {
    setLocaleState(next);
    if (typeof window !== "undefined") {
      localStorage.setItem("bowerbird-web-locale", next);
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
