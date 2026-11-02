import {
  Outlet,
  ScrollRestoration,
  createRootRoute,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import * as React from "react";
import appCss from "../styles/app.css?url";
import { I18nContext, LOCALE_STORAGE_KEY, MESSAGES, type Locale } from "../lib/i18n";
import { DesktopProvider } from "../lib/desktop-context";
import { ThemeProvider } from "../components/theme-provider";
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
  const [locale, setLocaleState] = React.useState<Locale>("zh");

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const storedLocale = localStorage.getItem(LOCALE_STORAGE_KEY) as Locale | null;
      if (storedLocale === "zh" || storedLocale === "en") {
        setLocaleState(storedLocale);
      }
    }
  }, []);

  const setLocale = (next: Locale) => {
    setLocaleState(next);
    if (typeof window !== "undefined") {
      localStorage.setItem(LOCALE_STORAGE_KEY, next);
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
    <html lang={locale} suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen bg-background text-foreground selection:bg-primary selection:text-primary-foreground antialiased transition-colors duration-200">
        <ThemeProvider defaultTheme="system">
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
        </ThemeProvider>
      </body>
    </html>
  );
}
